#!/usr/bin/env bash
set -euo pipefail

state_dir="${WORKSSH_STATE_DIR:-/workspace/workssh-state}"
pid_file="$state_dir/supervisor.pid"
status_file="$state_dir/status.json"
if [[ -f "$pid_file" ]]; then
  pid="$(tr -cd '0-9' < "$pid_file")"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    echo "supervisor: running (pid $pid)"
  else
    echo "supervisor: stopped (stale pid file)"
  fi
else
  echo "supervisor: stopped"
fi
if [[ -f "$status_file" ]]; then
  echo "relay status:"
  sed -n '1,80p' "$status_file"
else
  echo "relay status: unavailable"
fi
