import { DurableObject } from "cloudflare:workers";

interface Env {
  RELAY_TOKEN: string;
  TUNNELS: DurableObjectNamespace<TunnelRoom>;
}

type Role = "agent" | "client";
type Attachment = { role: Role; connectedAt: number };

const PROTOCOL = 1;
const MAX_TEXT_FRAME = 1_500_000;
const TUNNEL_RE = /^[A-Za-z0-9_-]{16,128}$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function sameSecret(candidate: string, expected: string): Promise<boolean> {
  const bytes = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", bytes.encode(candidate)),
    crypto.subtle.digest("SHA-256", bytes.encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

function control(type: string): string {
  return JSON.stringify({ type, protocol: PROTOCOL });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "workssh-relay", protocol: PROTOCOL });
    }

    if (request.method !== "GET" || url.pathname !== "/connect") {
      return json({ ok: false, error: "not_found" }, 404);
    }

    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json({ ok: false, error: "websocket_required" }, 426);
    }

    const suppliedToken = request.headers.get("x-relay-token") ?? "";
    if (!env.RELAY_TOKEN || !(await sameSecret(suppliedToken, env.RELAY_TOKEN))) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    const tunnel = url.searchParams.get("tunnel") ?? "";
    const role = url.searchParams.get("role") ?? "";
    if (!TUNNEL_RE.test(tunnel) || (role !== "agent" && role !== "client")) {
      return json({ ok: false, error: "invalid_parameters" }, 400);
    }

    const room = env.TUNNELS.getByName(tunnel);
    return room.fetch(request);
  },
} satisfies ExportedHandler<Env>;

export class TunnelRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const role = url.searchParams.get("role") as Role;
    if (role !== "agent" && role !== "client") {
      return json({ ok: false, error: "invalid_role" }, 400);
    }

    for (const stale of this.ctx.getWebSockets(role)) {
      try {
        stale.close(4001, "replaced");
      } catch {
        // Already closing.
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.serializeAttachment({
      role,
      connectedAt: Date.now(),
    } satisfies Attachment);
    this.ctx.acceptWebSocket(server, [role]);

    server.send(control("connected"));
    this.announcePairState();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = socket.deserializeAttachment() as Attachment | null;
    if (!attachment || typeof message !== "string" || !message.startsWith("d:")) {
      socket.close(1003, "workssh.v1 text data required");
      return;
    }
    if (message.length > MAX_TEXT_FRAME) {
      socket.close(1009, "frame too large");
      return;
    }

    const targetRole: Role = attachment.role === "agent" ? "client" : "agent";
    const peers = this.ctx.getWebSockets(targetRole);
    if (peers.length === 0) {
      socket.send(control("peer-wait"));
      return;
    }
    for (const peer of peers) {
      try {
        peer.send(message);
      } catch {
        // A concurrent close will be handled by webSocketClose.
      }
    }
  }

  async webSocketClose(
    socket: WebSocket,
    code: number,
    reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    try {
      socket.close(code, reason);
    } catch {
      // Cloudflare may already have completed the close handshake.
    }
    this.announcePairState();
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    try {
      socket.close(1011, "websocket error");
    } catch {
      // Already closed.
    }
    this.announcePairState();
  }

  private announcePairState(): void {
    const agents = this.ctx.getWebSockets("agent");
    const clients = this.ctx.getWebSockets("client");
    const message = control(agents.length > 0 && clients.length > 0 ? "peer-ready" : "peer-wait");
    for (const socket of [...agents, ...clients]) {
      try {
        socket.send(message);
      } catch {
        // Ignore a socket racing with close.
      }
    }
  }
}
