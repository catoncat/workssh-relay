#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
state_dir="${WORKSSH_STATE_DIR:-/workspace/workssh-state}"
pid_file="$state_dir/supervisor.pid"
log_file="$state_dir/supervisor.log"
config_file="$state_dir/agent.json"
supervisor_script="$root_dir/tunnel/src/supervisor.mjs"
source "$root_dir/scripts/process-lib.sh"

[[ -f "$config_file" ]] || {
  echo "Missing $config_file; run scripts/install-agent.sh first." >&2
  exit 1
}
mapfile -t running_pids < <(workssh_find_pids "$supervisor_script" "$config_file")
if ((${#running_pids[@]} > 0)); then
  printf '%s\n' "${running_pids[0]}" > "$pid_file"
  chmod 600 "$pid_file"
  if ((${#running_pids[@]} > 1)); then
    echo "Multiple WorkSSH supervisors use this config: ${running_pids[*]}" >&2
    echo "Run scripts/stop-agent.sh before starting another." >&2
    exit 1
  fi
  echo "WorkSSH supervisor is already running (pid ${running_pids[0]})."
  exit 0
fi
rm -f "$pid_file"

nohup node "$supervisor_script" --config "$config_file" \
  >>"$log_file" 2>&1 </dev/null &
supervisor_pid="$!"
printf '%s\n' "$supervisor_pid" > "$pid_file"
chmod 600 "$pid_file" "$log_file"
sleep 1
if ! workssh_pid_matches "$supervisor_pid" "$supervisor_script" "$config_file"; then
  echo "Supervisor exited during startup. Last log lines:" >&2
  tail -n 30 "$log_file" >&2
  exit 1
fi
echo "WorkSSH supervisor started (pid $supervisor_pid)."
echo "Status: $root_dir/scripts/status.sh"
