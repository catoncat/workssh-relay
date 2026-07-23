const DATA_PREFIX = "d:";
const MAX_RAW_BYTES = 1_000_000;

export function encodeData(data) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (buffer.length > MAX_RAW_BYTES) {
    throw new RangeError(`data chunk exceeds ${MAX_RAW_BYTES} bytes`);
  }
  return `${DATA_PREFIX}${buffer.toString("base64")}`;
}

export function decodeData(message) {
  const text = Buffer.isBuffer(message) ? message.toString("utf8") : String(message);
  if (!text.startsWith(DATA_PREFIX)) {
    return null;
  }
  const encoded = text.slice(DATA_PREFIX.length);
  if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error("invalid Base64 data frame");
  }
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.length > MAX_RAW_BYTES) {
    throw new RangeError(`decoded frame exceeds ${MAX_RAW_BYTES} bytes`);
  }
  return decoded;
}

export function parseControl(message) {
  const text = Buffer.isBuffer(message) ? message.toString("utf8") : String(message);
  if (text.startsWith(DATA_PREFIX)) {
    return null;
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("invalid relay control frame");
  }
  if (!value || typeof value.type !== "string" || value.protocol !== 1) {
    throw new Error("unsupported relay control frame");
  }
  return value;
}
