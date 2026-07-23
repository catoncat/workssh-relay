import WebSocket from "ws";
import { HttpsProxyAgent } from "https-proxy-agent";

function websocketUrl(workerUrl, tunnelId, role) {
  const url = new URL(workerUrl);
  url.protocol = "wss:";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/connect`;
  url.searchParams.set("tunnel", tunnelId);
  url.searchParams.set("role", role);
  return url.toString();
}

function proxyAgent() {
  const value = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
  if (!value) return undefined;
  if (!/^https?:\/\//i.test(value)) {
    throw new Error("only HTTP(S) proxy URLs are supported");
  }
  return new HttpsProxyAgent(value);
}

export function openRelay({ workerUrl, relayToken, siteBearerToken, tunnelId, role }) {
  return new Promise((resolve, reject) => {
    const headers = { "x-relay-token": relayToken };
    if (siteBearerToken) headers.authorization = `Bearer ${siteBearerToken}`;
    const socket = new WebSocket(websocketUrl(workerUrl, tunnelId, role), {
      headers,
      agent: proxyAgent(),
      handshakeTimeout: 20_000,
      maxPayload: 1_500_000,
      perMessageDeflate: false,
    });

    let settled = false;
    let lastPong = Date.now();
    const heartbeat = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastPong > 90_000) {
        socket.terminate();
        return;
      }
      socket.ping();
    }, 25_000);
    heartbeat.unref();

    socket.on("pong", () => {
      lastPong = Date.now();
    });
    socket.once("open", () => {
      settled = true;
      resolve(socket);
    });
    socket.once("unexpected-response", (_request, response) => {
      clearInterval(heartbeat);
      const error = new Error(`relay rejected WebSocket: HTTP ${response.statusCode}`);
      if (!settled) reject(error);
      else socket.emit("error", error);
    });
    socket.once("error", (error) => {
      if (!settled) reject(error);
    });
    socket.once("close", () => {
      clearInterval(heartbeat);
      if (!settled) reject(new Error("relay closed before WebSocket opened"));
    });
  });
}
