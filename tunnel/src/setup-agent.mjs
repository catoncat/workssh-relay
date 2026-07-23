#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { writePrivateJson, validateCommon } from "./config.mjs";

const stateDirectory = path.resolve(process.env.WORKSSH_STATE_DIR || "/workspace/workssh-state");
const publicKey = process.env.WORKSSH_PUBLIC_KEY
  || (process.env.WORKSSH_PUBLIC_KEY_FILE
    ? fs.readFileSync(path.resolve(process.env.WORKSSH_PUBLIC_KEY_FILE), "utf8").trim()
    : "");
if (!/^(ssh-ed25519|ecdsa-sha2-nistp(256|384|521)|ssh-rsa) [A-Za-z0-9+/=]+(?: .*)?$/.test(publicKey)) {
  throw new Error("set WORKSSH_PUBLIC_KEY or WORKSSH_PUBLIC_KEY_FILE to a valid SSH public key");
}

const common = validateCommon({
  workerUrl: process.env.WORKSSH_WORKER_URL,
  relayToken: process.env.WORKSSH_RELAY_TOKEN,
  tunnelId: process.env.WORKSSH_TUNNEL_ID,
  ...(process.env.WORKSSH_SITE_BEARER_TOKEN
    ? { siteBearerToken: process.env.WORKSSH_SITE_BEARER_TOKEN }
    : {}),
  transport: process.env.WORKSSH_TRANSPORT || "websocket",
});
fs.mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
fs.chmodSync(stateDirectory, 0o700);
const configPath = writePrivateJson(path.join(stateDirectory, "agent.json"), {
  ...common,
  publicKey,
  sshUser: process.env.WORKSSH_SSH_USER || "root",
  sshHost: "127.0.0.1",
  sshPort: 2222,
  hostKeyPath: path.join(stateDirectory, "host_key"),
  statusPath: path.join(stateDirectory, "status.json"),
});
console.log(configPath);
