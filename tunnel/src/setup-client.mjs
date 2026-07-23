#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultClientConfigPath, writePrivateJson, validateCommon } from "./config.mjs";

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const configPath = writePrivateJson(
  process.env.WORKSSH_CONFIG || defaultClientConfigPath(),
  validateCommon({
    workerUrl: process.env.WORKSSH_WORKER_URL,
    relayToken: process.env.WORKSSH_RELAY_TOKEN,
    tunnelId: process.env.WORKSSH_TUNNEL_ID,
  }),
);
const identityFile = path.resolve(
  (process.env.WORKSSH_IDENTITY_FILE || path.join(os.homedir(), ".ssh", "id_ed25519"))
    .replace(/^~(?=\/)/, os.homedir()),
);
if (!fs.existsSync(identityFile)) {
  throw new Error(`SSH private key not found: ${identityFile}`);
}

const sshDirectory = path.join(os.homedir(), ".ssh");
const sshConfig = path.join(sshDirectory, "config");
fs.mkdirSync(sshDirectory, { recursive: true, mode: 0o700 });
fs.chmodSync(sshDirectory, 0o700);
const begin = "# BEGIN WORKSSH-SANDBOX";
const end = "# END WORKSSH-SANDBOX";
const previous = fs.existsSync(sshConfig) ? fs.readFileSync(sshConfig, "utf8") : "";
if (previous && !fs.existsSync(`${sshConfig}.workssh-backup`)) {
  fs.copyFileSync(sshConfig, `${sshConfig}.workssh-backup`);
}
const withoutBlock = previous.replace(
  new RegExp(`(?:^|\\n)${begin}[\\s\\S]*?${end}(?:\\n|$)`, "g"),
  "\n",
).trimEnd();
const proxyScript = path.join(sourceDirectory, "proxy.mjs");
const block = `${begin}
Host workssh-sandbox
  HostName workssh.invalid
  User root
  Port 22
  IdentityFile "${identityFile}"
  IdentitiesOnly yes
  ProxyCommand node "${proxyScript}" --config "${configPath}"
${end}
`;
fs.writeFileSync(sshConfig, `${withoutBlock}${withoutBlock ? "\n\n" : ""}${block}`, { mode: 0o600 });
fs.chmodSync(sshConfig, 0o600);
console.log("ssh workssh-sandbox");
