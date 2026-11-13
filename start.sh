#!/usr/bin/env bash
# Build the PWA and serve it to an Android phone over USB (http://localhost:4173 on the phone).
set -euo pipefail
cd "$(dirname "$0")"

pnpm --filter web build
adb reverse tcp:4173 tcp:4173
pnpm --filter web preview
