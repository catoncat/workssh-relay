#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { spawn } = require("node:child_process");
const WebSocket = require("../tunnel/node_modules/ws");

const root = path.resolve(__dirname, "..");
const token = "integration-test-relay-token-000000000000";
const tunnel = "integration-tunnel-0001";
const port = 8787;
const wrangler = path.join(root, "relay", "node_modules", ".bin", "wrangler");
const child = spawn(
  wrangler,
  [
    "dev",
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
    "--var",
    `RELAY_TOKEN:${token}`,
  ],
  {
    cwd: path.join(root, "relay"),
    env: { ...process.env, XDG_CONFIG_HOME: "/tmp/workssh-wrangler-test" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
child.stdout.on("data", (chunk) => { logs += chunk; });
child.stderr.on("data", (chunk) => { logs += chunk; });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForHealth() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null && logs.includes("uv_interface_addresses")) {
      console.log("local relay e2e: skipped (sandbox cannot enumerate network interfaces)");
      return false;
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok && (await response.json()).ok === true) return true;
    } catch {
      // Wrangler is still starting.
    }
    await delay(100);
  }
  throw new Error(`local Worker did not become healthy\n${logs}`);
}

function connect(role, suppliedToken = token) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}/connect?tunnel=${tunnel}&role=${role}`,
      { headers: { "x-relay-token": suppliedToken }, maxPayload: 1_500_000 },
    );
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
    socket.once("unexpected-response", (_request, response) => {
      const error = new Error(`HTTP ${response.statusCode}`);
      error.statusCode = response.statusCode;
      reject(error);
    });
  });
}

function waitFor(socket, predicate, timeout = 5_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("timed out waiting for WebSocket message"));
    }, timeout);
    const onMessage = (data) => {
      const text = data.toString();
      if (!predicate(text)) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(text);
    };
    socket.on("message", onMessage);
  });
}

async function poll(path, options = {}) {
  const response = await fetch(
    `http://127.0.0.1:${port}${path}?tunnel=${tunnel}`,
    {
      ...options,
      headers: {
        "x-relay-token": token,
        ...(options.headers || {}),
      },
    },
  );
  const value = await response.json();
  if (!response.ok) throw new Error(`poll HTTP ${response.status}: ${JSON.stringify(value)}`);
  return value;
}

async function main() {
  if (!(await waitForHealth())) return;
  await assert.rejects(() => connect("client", "wrong-token-value-with-32-characters"), (error) => {
    return error.statusCode === 401;
  });

  const agent = await connect("agent");
  const agentReady = waitFor(agent, (text) => JSON.parse(text).type === "peer-ready");
  const client = await connect("client");
  const clientReady = waitFor(client, (text) => JSON.parse(text).type === "peer-ready");
  await Promise.all([agentReady, clientReady]);

  const forward = crypto.randomBytes(1_000_000);
  const forwardFrame = `d:${forward.toString("base64")}`;
  const receivedForward = waitFor(client, (text) => text.startsWith("d:"));
  agent.send(forwardFrame);
  assert.equal(await receivedForward, forwardFrame);

  const reverse = crypto.randomBytes(65_536);
  const reverseFrame = `d:${reverse.toString("base64")}`;
  const receivedReverse = waitFor(agent, (text) => text.startsWith("d:"));
  client.send(reverseFrame);
  assert.equal(await receivedReverse, reverseFrame);

  agent.close(1000);
  client.close(1000);

  await delay(100);
  const initialPoll = await poll("/poll/recv");
  assert.equal(initialPoll.protocol, 1);
  assert.equal(initialPoll.peerReady, false);

  const polledClient = await connect("client");
  await waitFor(polledClient, (text) => JSON.parse(text).type === "peer-ready");
  const readyPoll = await poll("/poll/recv");
  assert.equal(readyPoll.peerReady, true);

  const polledForward = crypto.randomBytes(65_536);
  const polledForwardFrame = `d:${polledForward.toString("base64")}`;
  const receivedPolledForward = waitFor(polledClient, (text) => text.startsWith("d:"));
  await poll("/poll/send", {
    method: "POST",
    headers: { "content-type": "text/plain; charset=utf-8" },
    body: polledForwardFrame,
  });
  assert.equal(await receivedPolledForward, polledForwardFrame);

  const polledReverse = crypto.randomBytes(65_536);
  const polledReverseFrame = `d:${polledReverse.toString("base64")}`;
  polledClient.send(polledReverseFrame);
  let receivedPolledReverse = null;
  for (let attempt = 0; attempt < 20 && !receivedPolledReverse; attempt += 1) {
    const result = await poll("/poll/recv");
    receivedPolledReverse = result.frames.find((frame) => frame.startsWith("d:")) ?? null;
    if (!receivedPolledReverse) await delay(50);
  }
  assert.equal(receivedPolledReverse, polledReverseFrame);
  polledClient.close(1000);
  console.log("local relay e2e: ok");
}

main()
  .catch((error) => {
    console.error(error.stack || error);
    console.error(logs);
    process.exitCode = 1;
  })
  .finally(() => {
    child.kill("SIGTERM");
  });
