import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { decodeData, encodeData, parseControl } from "../src/framing.mjs";
import { relayHeaders } from "../src/relay-socket.mjs";

test("round trips arbitrary bytes", () => {
  for (const size of [0, 1, 255, 65_536, 1_000_000]) {
    const input = crypto.randomBytes(size);
    assert.deepEqual(decodeData(encodeData(input)), input);
  }
});

test("distinguishes control frames", () => {
  assert.equal(decodeData('{"type":"peer-ready","protocol":1}'), null);
  assert.deepEqual(parseControl('{"type":"peer-ready","protocol":1}'), {
    type: "peer-ready",
    protocol: 1,
  });
});

test("rejects malformed and oversized frames", () => {
  assert.throws(() => decodeData("d:not base64"));
  assert.throws(() => encodeData(Buffer.alloc(1_000_001)));
  assert.throws(() => parseControl('{"type":"peer-ready","protocol":2}'));
});

test("adds the Sites bypass header only when configured", () => {
  assert.deepEqual(relayHeaders("relay-secret"), {
    "x-relay-token": "relay-secret",
  });
  assert.deepEqual(relayHeaders("relay-secret", "site-secret"), {
    "x-relay-token": "relay-secret",
    "OAI-Sites-Authorization": "Bearer site-secret",
  });
});
