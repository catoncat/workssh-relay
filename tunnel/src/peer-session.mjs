export function createPeerSessionController({
  closeLocal,
  openLocal,
  delayMs = 100,
}) {
  let readyTimer = null;

  const cancel = () => {
    if (readyTimer) clearTimeout(readyTimer);
    readyTimer = null;
  };

  const ready = () => {
    // The relay can emit several peer-ready controls while it replaces a
    // stale client. Close the previous SSH stream once, preserve bytes queued
    // by the new client, and open exactly one fresh stream after the burst.
    if (!readyTimer) closeLocal();
    else clearTimeout(readyTimer);
    readyTimer = setTimeout(() => {
      readyTimer = null;
      openLocal();
    }, delayMs);
  };

  const wait = () => {
    cancel();
    closeLocal();
  };

  return { cancel, ready, wait };
}
