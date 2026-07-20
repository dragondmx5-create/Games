---
name: verify
description: Launch the full UNDRAL stack (Postgres + API + Vite dev) and drive it with Playwright to verify changes at the real surface.
---

# Verifying UNDRAL end-to-end

Accounts are mandatory, so the game cannot even boot without the backend.
The full stack is: Postgres → `server/` API on :8787 → Vite **dev** server
on :5173 (dev mode matters — only the dev server proxies `/api` and `/ws`
same-origin; `vite preview` does not).

## Postgres (no Docker daemon in this environment)

Postgres 16 binaries live at `/usr/lib/postgresql/16/bin`. `initdb` refuses
to run as root — run it via `su postgres`, and use a data dir the postgres
user can traverse (e.g. `/tmp/pgroot`; the session scratchpad's parents are
not traversable by other users):

```bash
PG=/usr/lib/postgresql/16/bin
mkdir -p /tmp/pgroot && chown postgres /tmp/pgroot
su postgres -s /bin/bash -c "$PG/initdb -D /tmp/pgroot/data -U undral --auth=trust"
su postgres -s /bin/bash -c "$PG/pg_ctl -D /tmp/pgroot/data -l /tmp/pgroot/pg.log -o '-p 5432 -k /tmp/pgroot' start"
$PG/psql -h 127.0.0.1 -p 5432 -U undral -d postgres \
  -c "ALTER USER undral WITH PASSWORD 'undral_dev';" \
  -c "CREATE DATABASE undral OWNER undral;" \
  -c "CREATE DATABASE undral_test OWNER undral;"   # undral_test enables server/'s npm test
cd server && DATABASE_URL=postgresql://undral:undral_dev@127.0.0.1:5432/undral npx prisma migrate deploy
# repeat migrate deploy with .../undral_test before running server tests
```

## API + client

`server/.env`: copy `.env.example` values; `DATABASE_URL` as above,
`CORS_ORIGIN=http://localhost:5173`. Then `npm run dev` in `server/`
(tsx watch, :8787) and `npx vite --port 5173` at the repo root, both
backgrounded. Health checks: `curl :8787/api/health` → `{"ok":true}`,
`curl :5173` → 200 (retry once — first curl after backgrounding flakes).

## Driving it

`playwright-core` with `executablePath: '/opt/pw-browsers/chromium'`
(install playwright-core in the scratchpad, not the repo). Flow gotchas:

- Register through the real panel: `#start-btn` (reads LOG IN TO PLAY) →
  `#ath-show-register` → fill `#ath-reg-email/-username/-password` →
  submit → wait for `#ath-username` to include "Logged in" → `#ath-close`
  → `#start-btn` now reads DESCEND/CONTINUE.
- Live game handle: `window.__undral.debug` (`{ world, player, enemies,
  npcs, animals, pet }`, all by reference — mutate to force scenarios).
  Private `Game` fields (e.g. `pickups`) are still reachable at runtime
  via `window.__undral['pickups']`.
- Force a death deterministically: set `player.hp = 1; player.invulnTimer
  = 0`, then teleport `enemies[0]` onto the player with `aggro = true,
  attackTimer = 0, emergeTimer = 0`. Death screen = `#death` gaining the
  `visible` class.
- Red Zone: `#redzone-btn` (hidden until logged in); HUD `#depth` reads
  "RED ZONE — N player(s) online" only while snapshots flow, which makes
  it a good liveness signal. A second page in the same browser context
  reuses the login cookies (same-account takeover scenarios).
- Vault endpoints can be exercised from `page.evaluate` fetch with
  `credentials: 'include'`.
