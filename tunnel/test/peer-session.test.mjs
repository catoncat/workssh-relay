import assert from "node:assert/strict";
import test from "node:test";
import { createPeerSessionController } from "../src/peer-session.mjs";

const pause = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

test("coalesces duplicate peer-ready controls into one fresh SSH stream", async () => {
  let opens = 0;
  let closes = 0;
  const session = createPeerSessionController({
    closeLocal: () => { closes += 1; },
    openLocal: () => { opens += 1; },
    delayMs: 10,
  });

  session.ready();
  session.ready();
  session.ready();
  await pause(30);

  assert.equal(closes, 1);
  assert.equal(opens, 1);
  session.cancel();
});

test("a later peer-ready creates a new stream and peer-wait cancels it", async () => {
  let opens = 0;
  let closes = 0;
  const session = createPeerSessionController({
    closeLocal: () => { closes += 1; },
    openLocal: () => { opens += 1; },
    delayMs: 10,
  });

  session.ready();
  await pause(30);
  session.ready();
  session.wait();
  await pause(30);

  assert.equal(opens, 1);
  assert.equal(closes, 3);
  session.cancel();
});
