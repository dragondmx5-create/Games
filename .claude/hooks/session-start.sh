#!/bin/bash
# SessionStart hook — makes the repo ready to build/test/lint the moment a
# Claude Code on the web session starts, so the agent never has to install
# dependencies by hand. The remote container is cached after this completes,
# so later sessions reuse the installed node_modules instead of re-downloading.
set -euo pipefail

# Only run in the remote (Claude Code on the web) environment.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

echo "[session-start] installing client dependencies…"
npm install --no-audit --no-fund

echo "[session-start] installing server dependencies…"
npm --prefix server install --no-audit --no-fund

# The Prisma client is only needed for database-backed server work. Generate it
# when the engines are reachable, but never fail the session if they are not —
# client build/tests and the pure server suites do not require it.
echo "[session-start] generating Prisma client (best-effort)…"
npm --prefix server run prisma:generate || \
  echo "[session-start] prisma generate skipped (engines/network unavailable)"

echo "[session-start] environment ready."
