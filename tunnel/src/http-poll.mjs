import https from "node:https";
import net from "node:net";
import { HttpsProxyAgent } from "https-proxy-agent";
import { decodeData, encodeData } from "./framing.mjs";
import { relayHeaders } from "./relay-socket.mjs";

const MAX_RESPONSE_BYTES = 24_000_000;

function proxyAgent() {
  const value = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
  if (!value) return undefined;
  if (!/^https?:\/\//i.test(value)) {
    throw new Error("only HTTP(S) proxy URLs are supported");
  }
  return new HttpsProxyAgent(value);
}

function pollUrl(workerUrl, tunnelId, path) {
  const url = new URL(workerUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}${path}`;
  url.searchParams.set("tunnel", tunnelId);
  return url;
}

function requestPoll(config, path, method = "GET", body = "") {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(body, "utf8") : null;
    const headers = relayHeaders(config.relayToken, config.siteBearerToken);
    headers.accept = "application/json";
    if (payload) {
      headers["content-type"] = "text/plain; charset=utf-8";
      headers["content-length"] = String(payload.length);
    }
    const request = https.request(
      pollUrl(config.workerUrl, config.tunnelId, path),
      { method, headers, agent: proxyAgent(), timeout: 20_000 },
      (response) => {
        const chunks = [];
        let bytes = 0;
        response.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > MAX_RESPONSE_BYTES) {
            request.destroy(new Error("poll response exceeded limit"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let value;
          try {
            value = JSON.parse(text);
          } catch {
            reject(new Error(`poll endpoint returned HTTP ${response.statusCode} with invalid JSON`));
            return;
          }
          if ((response.statusCode ?? 500) >= 400) {
            reject(new Error(`poll endpoint rejected request: HTTP ${response.statusCode}`));
            return;
          }
          resolve(value);
        });
      },
    );
    request.on("timeout", () => request.destroy(new Error("poll request timed out")));
    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
}

export async function runHttpPollAgent(config, { isStopping, writeStatus }) {
  let local = null;
  let pending = [];
  let pendingBytes = 0;
  let sendChain = Promise.resolve();
  let sendError = null;
  let connected = false;

  const closeLocal = () => {
    if (local) local.destroy();
    local = null;
    pending = [];
    pendingBytes = 0;
  };

  const sendFrame = (frame) => {
    sendChain = sendChain
      .then(() => requestPoll(config, "/poll/send", "POST", frame))
      .catch((error) => {
        sendError = error;
      });
  };

  const openLocal = () => {
    if (local) return;
    local = net.createConnection({
      host: config.sshHost ?? "127.0.0.1",
      port: config.sshPort ?? 2222,
    });
    local.setNoDelay(true);
    local.on("connect", () => {
      for (const chunk of pending) local.write(chunk);
      pending = [];
      pendingBytes = 0;
    });
    local.on("data", (chunk) => sendFrame(encodeData(chunk)));
    local.on("error", (error) => {
      console.error(`[workssh-agent] local SSH error: ${error.message}`);
    });
    local.on("close", () => {
      local = null;
    });
  };

  try {
    while (!isStopping()) {
      if (sendError) throw sendError;
      const response = await requestPoll(config, "/poll/recv");
      if (!connected) {
        connected = true;
        writeStatus("connected");
        console.error("[workssh-agent] HTTP ingress connected");
      }
      if (response.protocol !== 1 || !Array.isArray(response.frames)) {
        throw new Error("poll endpoint returned an incompatible response");
      }
      if (response.peerReady) openLocal();
      else closeLocal();

      for (const frame of response.frames) {
        const data = decodeData(frame);
        if (!data) throw new Error("poll endpoint returned a non-data frame");
        if (local?.readyState === "open") {
          local.write(data);
        } else {
          pendingBytes += data.length;
          if (pendingBytes > 1_000_000) throw new Error("pre-connect buffer exceeded");
          pending.push(data);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, response.frames.length ? 20 : 300));
    }
  } finally {
    closeLocal();
    await sendChain;
  }
}
