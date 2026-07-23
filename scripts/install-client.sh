#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${WORKSSH_WORKER_URL:?Set WORKSSH_WORKER_URL to your HTTPS relay endpoint URL}"
: "${WORKSSH_RELAY_TOKEN:?Set WORKSSH_RELAY_TOKEN to your relay secret}"
: "${WORKSSH_TUNNEL_ID:?Set WORKSSH_TUNNEL_ID to the sandbox tunnel ID}"
command -v node >/dev/null || { echo "Node.js 20+ is required." >&2; exit 1; }
command -v npm >/dev/null || { echo "npm is required." >&2; exit 1; }
command -v ssh >/dev/null || { echo "OpenSSH is required." >&2; exit 1; }

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if (( node_major < 20 )); then
  echo "Node.js 20+ is required; found $(node --version)." >&2
  exit 1
fi
if [[ -f "$root_dir/tunnel/package-lock.json" ]]; then
  npm --prefix "$root_dir/tunnel" ci --omit=dev
else
  npm --prefix "$root_dir/tunnel" install --omit=dev
fi
node "$root_dir/tunnel/src/setup-client.mjs"

echo
echo "Installation complete. Connect with:"
echo "  ssh workssh-sandbox"
