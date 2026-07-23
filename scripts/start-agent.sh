#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
state_dir="${WORKSSH_STATE_DIR:-/workspace/workssh-state}"
pid_file="$state_dir/supervisor.pid"
log_file="$state_dir/supervisor.log"
config_file="$state_dir/agent.json"

[[ -f "$config_file" ]] || {
  echo "Missing $config_file; run scripts/install-agent.sh first." >&2
  exit 1
}
if [[ -f "$pid_file" ]]; then
  old_pid="$(tr -cd '0-9' < "$pid_file")"
  if [[ -n "$old_pid" ]] && kill -0 "$old_pid" 2>/dev/null; then
    echo "WorkSSH supervisor is already running (pid $old_pid)."
    exit 0
  fi
fi

nohup node "$root_dir/tunnel/src/supervisor.mjs" --config "$config_file" \
  >>"$log_file" 2>&1 </dev/null &
supervisor_pid="$!"
printf '%s\n' "$supervisor_pid" > "$pid_file"
chmod 600 "$pid_file" "$log_file"
sleep 1
if ! kill -0 "$supervisor_pid" 2>/dev/null; then
  echo "Supervisor exited during startup. Last log lines:" >&2
  tail -n 30 "$log_file" >&2
  exit 1
fi
echo "WorkSSH supervisor started (pid $supervisor_pid)."
echo "Status: $root_dir/scripts/status.sh"
