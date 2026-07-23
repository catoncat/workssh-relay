import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { decodeData, encodeData, parseControl } from "../src/framing.mjs";

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
