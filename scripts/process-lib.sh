#!/usr/bin/env bash

workssh_pid_matches() {
  local pid="$1"
  local expected_script="$2"
  local expected_config="$3"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  [[ -r "/proc/$pid/cmdline" ]] || return 1

  local -a arguments=()
  while IFS= read -r -d '' argument; do
    arguments+=("$argument")
  done < "/proc/$pid/cmdline"

  local found_script=1
  local found_config=1
  local index
  for ((index = 0; index < ${#arguments[@]}; index += 1)); do
    if [[ "${arguments[index]}" == "$expected_script" ]]; then
      found_script=0
    fi
    if [[ "${arguments[index]}" == "--config" ]] \
      && ((index + 1 < ${#arguments[@]})) \
      && [[ "${arguments[index + 1]}" == "$expected_config" ]]; then
      found_config=0
    fi
  done
  ((found_script == 0 && found_config == 0))
}

workssh_find_pids() {
  local expected_script="$1"
  local expected_config="$2"
  local process_path
  local pid
  for process_path in /proc/[0-9]*; do
    pid="${process_path##*/}"
    if workssh_pid_matches "$pid" "$expected_script" "$expected_config"; then
      printf '%s\n' "$pid"
    fi
  done
}
