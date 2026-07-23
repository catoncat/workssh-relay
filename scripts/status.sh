#!/usr/bin/env bash
set -uo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
state_dir="${WORKSSH_STATE_DIR:-/workspace/workssh-state}"
pid_file="$state_dir/supervisor.pid"
status_file="$state_dir/status.json"
config_file="$state_dir/agent.json"
supervisor_script="$root_dir/tunnel/src/supervisor.mjs"
agent_script="$root_dir/tunnel/src/agent.mjs"
source "$root_dir/scripts/process-lib.sh"
healthy=0

mapfile -t supervisor_pids < <(workssh_find_pids "$supervisor_script" "$config_file")
if ((${#supervisor_pids[@]} == 1)); then
  echo "supervisor: running (pid ${supervisor_pids[0]})"
elif ((${#supervisor_pids[@]} > 1)); then
  echo "supervisor: conflict (${#supervisor_pids[@]} matching processes: ${supervisor_pids[*]})"
else
  echo "supervisor: stopped"
fi

if [[ -f "$status_file" ]]; then
  status_pid="$(node -e '
    const fs = require("fs");
    try {
      const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      process.stdout.write(String(value.pid ?? ""));
    } catch {}
  ' "$status_file")"
  status_summary="$(node -e '
    const fs = require("fs");
    try {
      const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const age = Math.max(0, Math.round((Date.now() - Date.parse(value.updatedAt)) / 1000));
      process.stdout.write(`${value.state ?? "unknown"}; pid=${value.pid ?? "missing"}; age=${age}s`);
    } catch {
      process.stdout.write("invalid JSON");
    }
  ' "$status_file")"
  if workssh_pid_matches "$status_pid" "$agent_script" "$config_file"; then
    echo "relay status: current ($status_summary)"
    if [[ "$status_summary" == connected* ]]; then
      status_age="$(node -e '
        const fs = require("fs");
        const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
        process.stdout.write(String(Math.max(0, Math.round((Date.now() - Date.parse(value.updatedAt)) / 1000))));
      ' "$status_file")"
      if ((status_age <= 90)) && ((${#supervisor_pids[@]} == 1)); then
        healthy=1
      fi
    fi
  else
    echo "relay status: stale ($status_summary; process identity mismatch)"
  fi
else
  echo "relay status: unavailable"
fi

exit "$((healthy == 1 ? 0 : 1))"
