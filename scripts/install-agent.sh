#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
state_dir="${WORKSSH_STATE_DIR:-/workspace/workssh-state}"

: "${WORKSSH_WORKER_URL:?Set WORKSSH_WORKER_URL to your HTTPS relay endpoint URL}"
: "${WORKSSH_RELAY_TOKEN:?Set WORKSSH_RELAY_TOKEN to your relay secret}"
: "${WORKSSH_TUNNEL_ID:?Set WORKSSH_TUNNEL_ID to a random URL-safe ID}"
if [[ -z "${WORKSSH_PUBLIC_KEY:-}" && -z "${WORKSSH_PUBLIC_KEY_FILE:-}" ]]; then
  echo "Set WORKSSH_PUBLIC_KEY or WORKSSH_PUBLIC_KEY_FILE to an SSH public key." >&2
  exit 1
fi
command -v node >/dev/null || { echo "Node.js 20+ is required." >&2; exit 1; }
command -v npm >/dev/null || { echo "npm is required." >&2; exit 1; }
command -v ssh-keygen >/dev/null || { echo "ssh-keygen is required." >&2; exit 1; }

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if (( node_major < 20 )); then
  echo "Node.js 20+ is required; found $(node --version)." >&2
  exit 1
fi

mkdir -p "$state_dir"
chmod 700 "$state_dir"
if [[ ! -f "$state_dir/host_key" ]]; then
  ssh-keygen -q -t ed25519 -N "" -f "$state_dir/host_key"
fi
chmod 600 "$state_dir/host_key"

if [[ -f "$root_dir/tunnel/package-lock.json" ]]; then
  npm --prefix "$root_dir/tunnel" ci --omit=dev
else
  npm --prefix "$root_dir/tunnel" install --omit=dev
fi
WORKSSH_STATE_DIR="$state_dir" node "$root_dir/tunnel/src/setup-agent.mjs"

echo
echo "Agent configuration installed in $state_dir."
echo "Start it with: $root_dir/scripts/start-agent.sh"
