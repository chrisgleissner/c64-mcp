#!/usr/bin/env bash
set -euo pipefail

SID="${1:?Usage: sid2wav.sh <file.sid> [out.wav] [ntsc|pal] [limitCycles]}"
OUT="${2:-${SID%.sid}.wav}"
MODE="${3:-ntsc}"
CYCLES="${4:-120000000}"

case "${MODE}" in
  pal|ntsc) ;;
  *)
    echo "Unsupported mode: ${MODE} (expected pal or ntsc)" >&2
    exit 1
    ;;
esac

PAL_CLOCK=985248
NTSC_CLOCK=1022727

if [[ "${CYCLES}" -le 0 ]]; then
  echo "limitCycles must be positive" >&2
  exit 1
fi

if [[ ! -f "${SID}" ]]; then
  echo "SID file not found: ${SID}" >&2
  exit 1
fi

if ! command -v sidplayfp >/dev/null 2>&1; then
  echo "sidplayfp not found; attempting automatic installation" >&2
  if command -v apt-get >/dev/null 2>&1; then
    if command -v sudo >/dev/null 2>&1; then
      sudo -n apt-get update -y || true
      sudo -n apt-get install -y sidplayfp || true
    else
      apt-get update -y || true
      apt-get install -y sidplayfp || true
    fi
  elif command -v brew >/dev/null 2>&1; then
    brew install sidplayfp || true
  elif command -v dnf >/dev/null 2>&1; then
    if command -v sudo >/dev/null 2>&1; then
      sudo -n dnf install -y sidplayfp || true
    else
      dnf install -y sidplayfp || true
    fi
  elif command -v pacman >/dev/null 2>&1; then
    if command -v sudo >/dev/null 2>&1; then
      sudo -n pacman -Sy --noconfirm sidplayfp || true
    else
      pacman -Sy --noconfirm sidplayfp || true
    fi
  elif command -v choco >/dev/null 2>&1; then
    choco install sidplayfp -y || true
  elif command -v winget >/dev/null 2>&1; then
    winget install --id=SIDTools.sidplayfp -e --source winget || true
  else
    echo "Unable to auto-install sidplayfp; please install it manually." >&2
    exit 127
  fi

  if ! command -v sidplayfp >/dev/null 2>&1; then
    echo "sidplayfp is still missing after installation attempt." >&2
    exit 127
  fi
fi

clock=${PAL_CLOCK}
sidplay_opts=( )

if [[ "${MODE}" == "ntsc" ]]; then
  clock=${NTSC_CLOCK}
  sidplay_opts+=(-vn) # NTSC clock
else
  sidplay_opts+=(-vp) # PAL clock
fi

# Convert cycle limit to playback duration in seconds (round up) using Node.js
duration_seconds=$(node -e 'const cycles=Number(process.argv[1]);const clock=Number(process.argv[2]);if(!Number.isFinite(cycles)||!Number.isFinite(clock)||cycles<=0||clock<=0){process.exit(1);}const seconds=Math.max(1, Math.ceil(cycles/clock));process.stdout.write(String(seconds));' "${CYCLES}" "${clock}")

if [[ -z "${duration_seconds}" ]]; then
  echo "Failed to compute playback duration from cycle limit." >&2
  exit 1
fi

sidplay_opts+=(
  -f44100             # 44.1 kHz sample rate
  -p16                # 16-bit signed PCM
  -t"${duration_seconds}"  # playback duration in seconds
  -w"${OUT}"          # output WAV path
)

exec sidplayfp "${sidplay_opts[@]}" "${SID}"
