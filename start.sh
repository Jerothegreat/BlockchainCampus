#!/usr/bin/env bash
# Build the PWA and serve it to an Android phone over USB (http://localhost:4173 on the phone).
# The API must be running separately: pnpm dev:api
set -euo pipefail
cd "$(dirname "$0")"

pnpm --filter web build
adb reverse tcp:4173 tcp:4173
adb reverse tcp:3000 tcp:3000  # API
pnpm --filter web preview
