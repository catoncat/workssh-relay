import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TUNNEL_RE = /^[A-Za-z0-9_-]{16,128}$/;

export function expandHome(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

export function assertSecureUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("workerUrl must be a valid URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("workerUrl must use HTTPS");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function validateCommon(config) {
  const normalized = {
    ...config,
    workerUrl: assertSecureUrl(config.workerUrl),
  };
  if (typeof normalized.relayToken !== "string" || normalized.relayToken.length < 32) {
    throw new Error("relayToken must contain at least 32 characters");
  }
  if (!TUNNEL_RE.test(normalized.tunnelId ?? "")) {
    throw new Error("tunnelId must contain 16-128 URL-safe characters");
  }
  if (
    normalized.siteBearerToken !== undefined
    && (
      typeof normalized.siteBearerToken !== "string"
      || normalized.siteBearerToken.length < 32
    )
  ) {
    throw new Error("siteBearerToken must contain at least 32 characters when set");
  }
  return normalized;
}

export function readConfig(file) {
  const resolved = path.resolve(expandHome(file));
  const stat = fs.statSync(resolved);
  if ((stat.mode & 0o077) !== 0) {
    throw new Error(`configuration must not be group/world accessible: ${resolved}`);
  }
  return { path: resolved, value: validateCommon(JSON.parse(fs.readFileSync(resolved, "utf8"))) };
}

export function defaultClientConfigPath() {
  return path.join(os.homedir(), ".config", "workssh", "config.json");
}

export function writePrivateJson(file, value) {
  const resolved = path.resolve(expandHome(file));
  fs.mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(resolved, 0o600);
  return resolved;
}
