#!/usr/bin/env bash
# Cloud Agent / local dashboard boot (committed — do not put under .cursor/).
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-43127}"
if curl -sf -o /dev/null "http://127.0.0.1:${PORT}/"; then
  echo "Vite already up on ${PORT}"
  exec sleep infinity
fi
exec npm run dev -- --host 0.0.0.0 --port "${PORT}"
