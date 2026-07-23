#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"
patterns=(
  '-----BEGIN (OPENSSH|RSA|EC|DSA) PRIVATE KEY-----'
  '(^|[^A-Za-z0-9])(ghp|github_pat|glpat|sk_live|AKIA)[A-Za-z0-9_-]{12,}'
  '/workspace/scratch/[A-Za-z0-9_-]+'
  'x-relay-token[[:space:]]*[:=][[:space:]]*["'"'"'][^$<{][^"'"'"']{15,}'
  'RELAY_TOKEN[[:space:]]*=[[:space:]]*[A-Fa-f0-9]{32,}'
)
failed=0
for pattern in "${patterns[@]}"; do
  if rg -n --hidden \
    --glob '!node_modules/**' \
    --glob '!package-lock.json' \
    --glob '!.git/**' \
    --glob '!scripts/secret-scan.sh' \
    -- "$pattern" .; then
    failed=1
  fi
done
if (( failed )); then
  echo "Potential secret or instance-specific path found." >&2
  exit 1
fi
echo "secret scan: ok"
