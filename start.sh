#!/usr/bin/env bash
# Build the PWA and serve it to every Android phone plugged in over USB.
# On each phone, Chrome opens http://localhost:4173/<role> (localhost counts as secure, so Web NFC works).
# Starts the API (pnpm dev:api) in a kitty window if it is not already running.
set -euo pipefail
cd "$(dirname "$0")"

# Which page each phone opens (serial from `adb devices`). Phones not listed open /app to pick a role.
declare -A ROLES=(
  [6t8lbiceaa5t6xsg]=me   # student
  [R5CXA2J6S1N]=pos       # stall
)

mapfile -t PHONES < <(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')
if [ ${#PHONES[@]} -eq 0 ]; then
  echo "No phone found. Plug one in with USB debugging on and accept the prompt, then check: adb devices" >&2
  exit 1
fi

pnpm --filter web build

for serial in "${PHONES[@]}"; do
  adb -s "$serial" reverse tcp:4173 tcp:4173 # the PWA
  adb -s "$serial" reverse tcp:3000 tcp:3000 # the API
  echo "$serial: open http://localhost:4173/${ROLES[$serial]:-app} in Chrome"
done

# The API on port 3000: if it isn't running, open it in its own kitty window (logs stay visible there).
api_up() { curl -s -m 2 -o /dev/null http://localhost:3000/health; }
if ! api_up; then
  if command -v kitty >/dev/null; then
    echo "Starting the API in a new kitty window…"
    setsid -f kitty --title "UMak Pay API :3000" --directory "$PWD" bash -c 'pnpm dev:api; exec bash' >/dev/null 2>&1
    for _ in $(seq 30); do api_up && break; sleep 1; done
    api_up && echo "API is up on port 3000." || echo "Warning: the API didn't answer yet; check its kitty window." >&2
  else
    echo "Warning: the API is not running on port 3000. Start it with: pnpm dev:api" >&2
  fi
fi

pnpm --filter web preview
