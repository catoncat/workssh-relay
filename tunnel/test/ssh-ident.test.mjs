import assert from "node:assert/strict";
import crypto from "node:crypto";
import net from "node:net";
import test from "node:test";
import ssh2 from "ssh2";
import { SSH_IDENT } from "../src/ssh-ident.mjs";

const { Server } = ssh2;

test("ssh2 emits exactly one SSH protocol prefix", async (context) => {
  const { privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const server = new Server({
    hostKeys: [privateKey.export({ format: "pem", type: "pkcs1" })],
    ident: SSH_IDENT,
  });
  context.after(() => server.close());

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const banner = await new Promise((resolve, reject) => {
    const socket = net.createConnection(server.address());
    let received = Buffer.alloc(0);
    socket.once("error", reject);
    socket.on("data", (chunk) => {
      received = Buffer.concat([received, chunk]);
      const newline = received.indexOf(0x0a);
      if (newline < 0) return;
      socket.destroy();
      resolve(received.subarray(0, newline + 1).toString("utf8"));
    });
  });

  assert.equal(banner, "SSH-2.0-WorkSSH\r\n");
});
