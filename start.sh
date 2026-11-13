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

curl -s -m 2 -o /dev/null http://localhost:3000/health || echo "Warning: the API is not running on port 3000. Start it with: pnpm dev:api" >&2

pnpm --filter web preview
