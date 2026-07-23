#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
state_dir="${WORKSSH_STATE_DIR:-/workspace/workssh-state}"
pid_file="$state_dir/supervisor.pid"
config_file="$state_dir/agent.json"
supervisor_script="$root_dir/tunnel/src/supervisor.mjs"
source "$root_dir/scripts/process-lib.sh"

mapfile -t running_pids < <(workssh_find_pids "$supervisor_script" "$config_file")
if ((${#running_pids[@]} == 0)); then
  rm -f "$pid_file"
  echo "WorkSSH supervisor is not running."
  exit 0
fi

for pid in "${running_pids[@]}"; do
  kill "$pid"
done
for _attempt in {1..25}; do
  remaining=0
  for pid in "${running_pids[@]}"; do
    if workssh_pid_matches "$pid" "$supervisor_script" "$config_file"; then
      remaining=1
    fi
  done
  ((remaining == 0)) && break
  sleep 0.2
done
for pid in "${running_pids[@]}"; do
  if workssh_pid_matches "$pid" "$supervisor_script" "$config_file"; then
    echo "Supervisor $pid did not stop after SIGTERM." >&2
    exit 1
  fi
  echo "Stopped WorkSSH supervisor (pid $pid)."
done
if ((${#running_pids[@]} > 1)); then
  echo "Removed ${#running_pids[@]} conflicting supervisors."
fi
rm -f "$pid_file"
