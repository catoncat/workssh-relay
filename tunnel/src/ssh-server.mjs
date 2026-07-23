#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import { spawn } from "node:child_process";
import ssh2 from "ssh2";
import { readConfig } from "./config.mjs";
import { SSH_IDENT } from "./ssh-ident.mjs";

const { Server, utils } = ssh2;
const configArgument = process.argv.indexOf("--config");
if (configArgument < 0 || !process.argv[configArgument + 1]) {
  throw new Error("usage: node ssh-server.mjs --config /path/to/agent.json");
}
const { value: config } = readConfig(process.argv[configArgument + 1]);
const allowedKey = utils.parseKey(config.publicKey);
if (allowedKey instanceof Error) throw allowedKey;
const hostKey = fs.readFileSync(config.hostKeyPath);

function keysMatch(context) {
  const publicBlob = allowedKey.getPublicSSH();
  return context.key.algo === allowedKey.type
    && context.key.data.length === publicBlob.length
    && crypto.timingSafeEqual(context.key.data, publicBlob);
}

function authorize(context) {
  if (context.username !== (config.sshUser ?? "root")) {
    context.reject();
    return;
  }
  if (context.method !== "publickey" || !keysMatch(context)) {
    context.reject(["publickey"]);
    return;
  }
  if (!context.signature) {
    context.accept();
    return;
  }
  if (allowedKey.verify(context.blob, context.signature, context.hashAlgo) === true) {
    context.accept();
  } else {
    context.reject(["publickey"]);
  }
}

function bridgeProcess(channel, child) {
  channel.pipe(child.stdin);
  child.stdout.pipe(channel, { end: false });
  child.stderr.pipe(channel.stderr, { end: false });
  channel.on("close", () => child.kill("SIGHUP"));
  child.on("error", (error) => {
    channel.stderr.write(`process error: ${error.message}\n`);
    channel.exit(1);
    channel.end();
  });
  child.on("close", (code, signal) => {
    if (signal) channel.signal(signal);
    channel.exit(code ?? 1);
    channel.end();
  });
}

const server = new Server(
  {
    hostKeys: [hostKey],
    ident: SSH_IDENT,
    algorithms: {
      serverHostKey: ["ssh-ed25519"],
    },
  },
  (client) => {
    client.on("authentication", authorize);
    client.on("ready", () => {
      client.on("tcpip", (_accept, reject) => reject());
      client.on("openssh.streamlocal", (_accept, reject) => reject());
      client.on("session", (accept) => {
        const session = accept();
        let terminal = "xterm-256color";
        session.on("pty", (acceptPty, _rejectPty, info) => {
          terminal = info.term || terminal;
          acceptPty?.();
        });
        session.on("window-change", (acceptChange) => acceptChange?.());
        session.once("shell", (acceptShell) => {
          const channel = acceptShell();
          const child = spawn(
            "/usr/bin/script",
            ["-qfec", "exec /bin/bash -l", "/dev/null"],
            {
              env: { ...process.env, TERM: terminal },
              stdio: ["pipe", "pipe", "pipe"],
            },
          );
          bridgeProcess(channel, child);
        });
        session.once("exec", (acceptExec, rejectExec, info) => {
          if (Buffer.byteLength(info.command, "utf8") > 65_536) {
            rejectExec();
            return;
          }
          const channel = acceptExec();
          const child = spawn("/bin/bash", ["-lc", info.command], {
            env: { ...process.env, TERM: terminal },
            stdio: ["pipe", "pipe", "pipe"],
          });
          bridgeProcess(channel, child);
        });
      });
    });
    client.on("error", (error) => {
      if (error.code !== "ECONNRESET") {
        console.error(`[workssh-sshd] client error: ${error.message}`);
      }
    });
  },
);

server.on("error", (error) => {
  console.error(`[workssh-sshd] server error: ${error.message}`);
  process.exitCode = 1;
});
server.listen(config.sshPort ?? 2222, config.sshHost ?? "127.0.0.1", () => {
  const address = server.address();
  console.error(`[workssh-sshd] listening on ${address.address}:${address.port}`);
});

const stop = () => server.close(() => process.exit(0));
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
