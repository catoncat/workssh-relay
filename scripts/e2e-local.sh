#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temp_dir="$(mktemp -d)"
server_pid=""
cleanup() {
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; fi
  rm -rf "$temp_dir"
}
trap cleanup EXIT

ssh-keygen -q -t ed25519 -N "" -f "$temp_dir/client_key"
ssh-keygen -q -t ed25519 -N "" -f "$temp_dir/host_key"
public_key="$(tr -d '\n' < "$temp_dir/client_key.pub")"
node -e '
  const fs = require("fs");
  const value = {
    workerUrl: "https://relay.example.invalid",
    relayToken: "test-only-token-with-at-least-32-characters",
    tunnelId: "test-tunnel-identifier-0001",
    publicKey: process.argv[1],
    sshUser: "root",
    sshHost: "127.0.0.1",
    sshPort: 2222,
    hostKeyPath: process.argv[2]
  };
  fs.writeFileSync(process.argv[3], JSON.stringify(value), { mode: 0o600 });
' "$public_key" "$temp_dir/host_key" "$temp_dir/agent.json"

node "$root_dir/tunnel/src/ssh-server.mjs" --config "$temp_dir/agent.json" \
  >"$temp_dir/server.log" 2>&1 &
server_pid="$!"
for _ in $(seq 1 50); do
  if (echo >/dev/tcp/127.0.0.1/2222) 2>/dev/null; then break; fi
  sleep 0.1
done
output="$(
  ssh -p 2222 -i "$temp_dir/client_key" \
    -o IdentitiesOnly=yes \
    -o StrictHostKeyChecking=accept-new \
    -o UserKnownHostsFile="$temp_dir/known_hosts" \
    -o ConnectTimeout=5 \
    root@127.0.0.1 'printf E2E_OK'
)"
[[ "$output" == "E2E_OK" ]] || {
  echo "Local SSH test failed. Server log:" >&2
  sed -n '1,120p' "$temp_dir/server.log" >&2
  exit 1
}
echo "local SSH e2e: ok"
