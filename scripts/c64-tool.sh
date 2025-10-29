#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
if command -v bun >/dev/null 2>&1; then
  CLI_CMD=(bun "${REPO_ROOT}/scripts/c64-cli.mjs")
elif [[ -x "${HOME}/.bun/bin/bun" ]]; then
  CLI_CMD=("${HOME}/.bun/bin/bun" "${REPO_ROOT}/scripts/c64-cli.mjs")
else
  CLI_CMD=(node "${REPO_ROOT}/scripts/c64-cli.mjs")
fi

function prompt_path() {
  local prompt="$1"
  local value
  read -r -p "${prompt}: " value
  echo "${value}"
}

function run_cli() {
  echo ""
  "${CLI_CMD[@]}" "$@"
  echo ""
}

function convert_basic() {
  local input output
  input=$(prompt_path "Enter path to BASIC source file")
  output=$(prompt_path "Optional PRG output path (leave blank for default)")
  if [[ -z "${input}" ]]; then
    echo "No input provided."
    return
  fi
  if [[ -n "${output}" ]]; then
    run_cli convert-basic --input "${input}" --output "${output}"
  else
    run_cli convert-basic --input "${input}"
  fi
}

function convert_and_run() {
  local input output
  input=$(prompt_path "Enter path to BASIC source file")
  output=$(prompt_path "Optional PRG output path (leave blank for default)")
  if [[ -z "${input}" ]]; then
    echo "No input provided."
    return
  fi
  if [[ -n "${output}" ]]; then
    run_cli convert-basic --input "${input}" --output "${output}" --run
  else
    run_cli convert-basic --input "${input}" --run
  fi
}

function run_existing_prg() {
  local input
  input=$(prompt_path "Enter path to PRG file")
  if [[ -z "${input}" ]]; then
    echo "No input provided."
    return
  fi
  run_cli run-prg --input "${input}"
}

function main_menu() {
  while true; do
    cat <<'EOF'
========================================
C64 Bridge Utility
  1) Convert BASIC to PRG
  2) Convert BASIC to PRG and run on C64
  3) Run existing PRG on C64
  4) Quit
========================================
EOF
    read -r -p "Select an option: " choice
    case "${choice}" in
      1) convert_basic ;;
      2) convert_and_run ;;
      3) run_existing_prg ;;
      4) exit 0 ;;
      *) echo "Invalid choice: ${choice}" ;;
    esac
  done
}

main_menu
