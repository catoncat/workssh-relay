function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
    },
  });
}

function authorized(request, env) {
  const supplied = request.headers.get("x-relay-token");
  return Boolean(env.RELAY_TOKEN && supplied && supplied === env.RELAY_TOKEN);
}

function upstreamUrl(request, configuredBase) {
  const incoming = new URL(request.url);
  const upstream = new URL(configuredBase);
  if (upstream.protocol !== "https:") {
    throw new Error("UPSTREAM_RELAY_URL must use HTTPS");
  }
  upstream.pathname = `${upstream.pathname.replace(/\/+$/, "")}/connect`;
  upstream.search = incoming.search;
  upstream.hash = "";
  return upstream;
}

async function proxyWebSocket(request, env) {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return json({ error: "Expected a WebSocket upgrade" }, 426);
  }
  if (!authorized(request, env)) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!env.UPSTREAM_RELAY_URL) {
    return json({ error: "Ingress is not configured" }, 503);
  }

  const headers = new Headers(request.headers);
  headers.set("x-relay-token", env.RELAY_TOKEN);
  headers.delete("host");
  headers.delete("authorization");
  headers.delete("cookie");

  return fetch(upstreamUrl(request, env.UPSTREAM_RELAY_URL), {
    method: "GET",
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        service: "workssh-site-ingress",
        protocol: 1,
        upstreamConfigured: Boolean(env.UPSTREAM_RELAY_URL && env.RELAY_TOKEN),
      });
    }

    if (request.method === "GET" && url.pathname === "/connect") {
      try {
        return await proxyWebSocket(request, env);
      } catch (error) {
        console.error("ingress proxy failed", error);
        return json({ error: "Upstream relay unavailable" }, 502);
      }
    }

    return json({ error: "Not found" }, 404);
  },
};
