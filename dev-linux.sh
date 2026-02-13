#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required. Install it with: npm i -g pnpm" >&2
  exit 1
fi

pnpm install
pnpm dev
