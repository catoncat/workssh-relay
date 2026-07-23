#!/usr/bin/env node
import fs from "node:fs";
import net from "node:net";
import { once } from "node:events";
import { decodeData, encodeData, parseControl } from "./framing.mjs";
import { openRelay } from "./relay-socket.mjs";
import { readConfig } from "./config.mjs";

const configArgument = process.argv.indexOf("--config");
if (configArgument < 0 || !process.argv[configArgument + 1]) {
  throw new Error("usage: node agent.mjs --config /path/to/agent.json");
}
const { path: configPath, value: config } = readConfig(process.argv[configArgument + 1]);
const statusPath = config.statusPath;
let stopping = false;

function writeStatus(state, detail = "") {
  if (!statusPath) return;
  fs.writeFileSync(statusPath, `${JSON.stringify({
    state,
    detail,
    pid: process.pid,
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`, { mode: 0o600 });
}

async function send(socket, frame) {
  if (socket.readyState !== 1) return;
  if (socket.bufferedAmount > 4_000_000) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  socket.send(frame);
}

async function runConnection() {
  writeStatus("connecting");
  const relay = await openRelay({ ...config, role: "agent" });
  writeStatus("connected");
  console.error("[workssh-agent] relay connected");

  let local = null;
  let pending = [];
  let pendingBytes = 0;

  const closeLocal = () => {
    if (local) local.destroy();
    local = null;
    pending = [];
    pendingBytes = 0;
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
    local.on("data", (chunk) => {
      void send(relay, encodeData(chunk));
    });
    local.on("error", (error) => {
      console.error(`[workssh-agent] local SSH error: ${error.message}`);
    });
    local.on("close", () => {
      local = null;
    });
  };

  relay.on("message", (raw) => {
    try {
      const data = decodeData(raw);
      if (data) {
        if (local?.readyState === "open") {
          local.write(data);
        } else {
          pendingBytes += data.length;
          if (pendingBytes > 1_000_000) throw new Error("pre-connect buffer exceeded");
          pending.push(data);
        }
        return;
      }
      const message = parseControl(raw);
      if (message.type === "peer-ready") openLocal();
      if (message.type === "peer-wait") closeLocal();
    } catch (error) {
      console.error(`[workssh-agent] protocol error: ${error.message}`);
      relay.close(1002, "protocol error");
    }
  });

  relay.on("error", (error) => {
    console.error(`[workssh-agent] relay error: ${error.message}`);
  });
  await once(relay, "close");
  closeLocal();
  writeStatus("disconnected");
}

const stop = () => {
  stopping = true;
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

let delay = 1_000;
while (!stopping) {
  try {
    await runConnection();
    delay = 1_000;
  } catch (error) {
    writeStatus("error", error.message);
    console.error(`[workssh-agent] ${error.message}`);
  }
  if (!stopping) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 2, 30_000);
  }
}
writeStatus("stopped", `config=${configPath}`);
