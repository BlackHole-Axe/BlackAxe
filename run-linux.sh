#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required. Install it with: npm i -g pnpm" >&2
  exit 1
fi

echo "[BlackAxe] Installing dependencies..."
pnpm install

# pnpm may block native build scripts by default on some systems.
if pnpm approve-builds >/dev/null 2>&1; then
  echo "[BlackAxe] Approving native build scripts (if prompted)..."
  pnpm approve-builds || true
fi

echo "[BlackAxe] Building (client + server)..."
pnpm build

echo "[BlackAxe] Starting..."
pnpm start
