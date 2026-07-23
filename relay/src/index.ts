import { DurableObject } from "cloudflare:workers";

interface Env {
  RELAY_TOKEN: string;
  TUNNELS: DurableObjectNamespace<TunnelRoom>;
}

type Role = "agent" | "client";
type Attachment = { role: Role; connectedAt: number };
type PollQueueState = { head: number; tail: number; bytes: number };

const PROTOCOL = 1;
const MAX_TEXT_FRAME = 1_500_000;
const MAX_POLL_QUEUE_BYTES = 4_000_000;
const POLL_AGENT_TTL_MS = 15_000;
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

    const isWebSocket = request.method === "GET" && url.pathname === "/connect";
    const isPoll = (
      (request.method === "GET" && url.pathname === "/poll/recv")
      || (request.method === "POST" && url.pathname === "/poll/send")
    );
    if (!isWebSocket && !isPoll) {
      return json({ ok: false, error: "not_found" }, 404);
    }

    if (isWebSocket && request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json({ ok: false, error: "websocket_required" }, 426);
    }

    const suppliedToken = request.headers.get("x-relay-token") ?? "";
    if (!env.RELAY_TOKEN || !(await sameSecret(suppliedToken, env.RELAY_TOKEN))) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    const tunnel = url.searchParams.get("tunnel") ?? "";
    const role = isPoll ? "agent" : (url.searchParams.get("role") ?? "");
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
    if (url.pathname === "/poll/recv" && request.method === "GET") {
      return this.pollReceive();
    }
    if (url.pathname === "/poll/send" && request.method === "POST") {
      return this.pollSend(request);
    }

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
    await this.announcePairState();

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
    if (peers.length > 0) {
      for (const peer of peers) {
        try {
          peer.send(message);
        } catch {
          // A concurrent close will be handled by webSocketClose.
        }
      }
      return;
    }

    if (targetRole === "agent" && await this.pollAgentPresent()) {
      if (!(await this.enqueueForPollAgent(message))) {
        socket.close(1009, "poll queue exceeded");
      }
      return;
    }

    if (peers.length === 0) {
      socket.send(control("peer-wait"));
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
    await this.announcePairState();
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    try {
      socket.close(1011, "websocket error");
    } catch {
      // Already closed.
    }
    await this.announcePairState();
  }

  private async pollSend(request: Request): Promise<Response> {
    const message = await request.text();
    if (!message.startsWith("d:") || message.length > MAX_TEXT_FRAME) {
      return json({ ok: false, error: "invalid_frame" }, 400);
    }

    await this.touchPollAgent();
    const clients = this.ctx.getWebSockets("client");
    if (clients.length === 0) {
      return json({ ok: true, protocol: PROTOCOL, peerReady: false }, 202);
    }
    for (const client of clients) {
      try {
        client.send(message);
      } catch {
        // A concurrent close will be reflected on the next request.
      }
    }
    return json({ ok: true, protocol: PROTOCOL, peerReady: true }, 202);
  }

  private async pollReceive(): Promise<Response> {
    await this.touchPollAgent();
    const frames = await this.dequeueForPollAgent(16);
    const peerReady = this.ctx.getWebSockets("client").length > 0;
    await this.announcePairState();
    return json({ ok: true, protocol: PROTOCOL, peerReady, frames });
  }

  private async touchPollAgent(): Promise<void> {
    await this.ctx.storage.put("poll-agent-expires-at", Date.now() + POLL_AGENT_TTL_MS);
  }

  private async pollAgentPresent(): Promise<boolean> {
    const expiresAt = await this.ctx.storage.get<number>("poll-agent-expires-at");
    return (expiresAt ?? 0) >= Date.now();
  }

  private async queueState(): Promise<PollQueueState> {
    return (await this.ctx.storage.get<PollQueueState>("poll-queue-state"))
      ?? { head: 0, tail: 0, bytes: 0 };
  }

  private async enqueueForPollAgent(message: string): Promise<boolean> {
    const bytes = new TextEncoder().encode(message).byteLength;
    const state = await this.queueState();
    if (state.bytes + bytes > MAX_POLL_QUEUE_BYTES) return false;
    const sequence = state.tail + 1;
    await this.ctx.storage.put({
      [`poll-frame:${sequence}`]: message,
      "poll-queue-state": {
        head: state.head,
        tail: sequence,
        bytes: state.bytes + bytes,
      } satisfies PollQueueState,
    });
    return true;
  }

  private async dequeueForPollAgent(limit: number): Promise<string[]> {
    const state = await this.queueState();
    const frames: string[] = [];
    let bytes = state.bytes;
    let head = state.head;
    const deleteKeys: string[] = [];
    while (head < state.tail && frames.length < limit) {
      const sequence = head + 1;
      const key = `poll-frame:${sequence}`;
      const frame = await this.ctx.storage.get<string>(key);
      head = sequence;
      deleteKeys.push(key);
      if (frame) {
        frames.push(frame);
        bytes -= new TextEncoder().encode(frame).byteLength;
      }
    }
    if (deleteKeys.length > 0) {
      await this.ctx.storage.delete(deleteKeys);
      await this.ctx.storage.put("poll-queue-state", {
        head,
        tail: state.tail,
        bytes: Math.max(0, bytes),
      } satisfies PollQueueState);
    }
    return frames;
  }

  private async announcePairState(): Promise<void> {
    const agents = this.ctx.getWebSockets("agent");
    const clients = this.ctx.getWebSockets("client");
    const agentPresent = agents.length > 0 || await this.pollAgentPresent();
    const message = control(agentPresent && clients.length > 0 ? "peer-ready" : "peer-wait");
    for (const socket of [...agents, ...clients]) {
      try {
        socket.send(message);
      } catch {
        // Ignore a socket racing with close.
      }
    }
  }
}
