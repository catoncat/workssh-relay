#!/usr/bin/env node
import { decodeData, encodeData, parseControl } from "./framing.mjs";
import { openRelay } from "./relay-socket.mjs";
import { defaultClientConfigPath, readConfig } from "./config.mjs";

const configArgument = process.argv.indexOf("--config");
const configFile = configArgument >= 0
  ? process.argv[configArgument + 1]
  : process.env.WORKSSH_CONFIG || defaultClientConfigPath();
const { value: config } = readConfig(configFile);

try {
  const relay = await openRelay({ ...config, role: "client" });
  let ready = false;
  const queued = [];
  let queuedBytes = 0;

  console.error("[workssh] relay connected; waiting for sandbox");
  process.stdin.on("data", (chunk) => {
    if (!ready) {
      queued.push(Buffer.from(chunk));
      queuedBytes += chunk.length;
      if (queuedBytes > 1_000_000) {
        console.error("[workssh] SSH input buffer exceeded");
        process.exitCode = 1;
        relay.close(1009, "input buffer exceeded");
      }
      return;
    }
    relay.send(encodeData(chunk));
  });

  relay.on("message", (raw) => {
    try {
      const data = decodeData(raw);
      if (data) {
        process.stdout.write(data);
        return;
      }
      const message = parseControl(raw);
      if (message.type === "peer-ready" && !ready) {
        ready = true;
        console.error("[workssh] sandbox connected");
        for (const chunk of queued.splice(0)) relay.send(encodeData(chunk));
      }
      if (message.type === "peer-wait" && ready) {
        ready = false;
        console.error("[workssh] sandbox disconnected");
      }
    } catch (error) {
      console.error(`[workssh] protocol error: ${error.message}`);
      relay.close(1002, "protocol error");
    }
  });

  process.stdin.on("end", () => relay.close(1000, "stdin closed"));
  relay.on("error", (error) => console.error(`[workssh] ${error.message}`));
  relay.on("close", (code) => process.exit(code === 1000 ? 0 : 1));
  process.on("SIGTERM", () => relay.close(1000, "terminated"));
  process.on("SIGINT", () => relay.close(1000, "interrupted"));
} catch (error) {
  console.error(`[workssh] ${error.message}`);
  process.exit(1);
}
