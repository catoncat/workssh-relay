#!/usr/bin/env bash
set -euo pipefail

state_dir="${WORKSSH_STATE_DIR:-/workspace/workssh-state}"
pid_file="$state_dir/supervisor.pid"
if [[ ! -f "$pid_file" ]]; then
  echo "WorkSSH supervisor is not running."
  exit 0
fi
pid="$(tr -cd '0-9' < "$pid_file")"
if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
  kill "$pid"
  echo "Stopped WorkSSH supervisor (pid $pid)."
else
  echo "Removed stale supervisor pid file."
fi
rm -f "$pid_file"
