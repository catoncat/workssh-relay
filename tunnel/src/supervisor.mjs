#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const configArgument = process.argv.indexOf("--config");
if (configArgument < 0 || !process.argv[configArgument + 1]) {
  throw new Error("usage: node supervisor.mjs --config /path/to/agent.json");
}
const config = path.resolve(process.argv[configArgument + 1]);
const children = new Map();
let stopping = false;

function launch(name, script) {
  if (stopping) return;
  const child = spawn(process.execPath, [path.join(sourceDirectory, script), "--config", config], {
    stdio: "inherit",
    env: process.env,
  });
  children.set(name, child);
  console.error(`[workssh-supervisor] started ${name} pid=${child.pid}`);
  child.on("exit", (code, signal) => {
    children.delete(name);
    console.error(`[workssh-supervisor] ${name} exited code=${code} signal=${signal ?? ""}`);
    if (!stopping) setTimeout(() => launch(name, script), 1_000).unref();
  });
}

launch("ssh-server", "ssh-server.mjs");
launch("relay-agent", "agent.mjs");

function stop(signal) {
  if (stopping) return;
  stopping = true;
  for (const child of children.values()) child.kill(signal);
  setTimeout(() => process.exit(0), 3_000).unref();
}
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
