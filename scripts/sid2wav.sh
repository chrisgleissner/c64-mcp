#!/usr/bin/env bash
set -euo pipefail
SID="${1:?Usage: sid2wav.sh <file.sid> [out.wav] [ntsc|pal] [limitCycles]}"
OUT="${2:-${SID%.sid}.wav}"
MODE="${3:-ntsc}"
CYCLES="${4:-120000000}"

# Prefer CI-friendly headless execution
XVFB_PREFIX=( )
if [[ "${CI:-false}" == "true" || "${FORCE_XVFB:-0}" == "1" ]]; then
  XVFB_PREFIX=(xvfb-run -a)
fi

exec "${XVFB_PREFIX[@]}" x64sc "-${MODE}" \
  -sounddev wav -soundarg "output=${OUT}" \
  -soundrate 44100 -soundbits 16 -soundvol 100 -limitcycles "${CYCLES}" "${SID}"
