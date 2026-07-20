# Project Issues — things to fix

A living list of known problems, ordered by priority. Fixed items are kept with
a strikethrough for history. This is an engineering backlog, not a promise of
dates.

## P0 — correctness / blocking

- ~~**Login impossible: account panel rendered behind the title screen.** The
  title layer (`z-index: 100`) covered the auth modal (`z-index: 30`), so no
  logged-out player could register or sign in.~~ **Fixed** — `.auth-panel` lifted
  above the title layer.

## P1 — should fix soon

- **Large orchestrators still reduce navigability.** `src/game.ts` (~2.4k),
  `src/render.ts` (~1.9k), `src/world.ts` (~1.1k), `src/api.ts` (~0.9k) and
  `server/src/dungeon/service.ts` (~1.1k) remain the next split targets.
  `sprites.ts` and `styles.css` are already thin re-export/import entrypoints.
- **Placeholder art quality — partially improved.** The PBR generator now uses
  periodic gradient noise with domain warping, runtime materials apply seeded
  UV variants, the layered terrain performs dual-sample anti-tiling, and major
  procedural props have grounded contact shadows. Remaining gap: hero/landmark
  assets are still procedural rather than DCC-authored high-to-low GLB assets,
  and final visual approval still needs representative-device screenshots.
- **Commits are unsigned.** They show as "Unverified" on GitHub. Requires a
  signing key in the commit environment (not code) — configure GPG/SSH signing.

## P2 — polish / hardening

- **Success feedback after register/login is silent** (`#ath-status` stays empty
  on success). Add a confirmation state.
- ~~**Grass↔dirt-road edges are blocky.**~~ **Improved** — the true-3D terrain
  now blends six material layers with height-biased weights and continuous
  domain-warped masks. Local authored path decals/mesh edging can still improve
  landmark areas further.
- ~~**No CI configuration is checked in.**~~ **Fixed** — `.github/workflows/ci.yml`
  runs authority checks, client/server tests, builds and Docker verification.
- ~~**No Node version pin.**~~ **Fixed** — root and server packages now require
  Node 22 and npm 10+.

## P3 — known gaps (tracked, not yet scheduled)

These are the authority/operational gaps from `README.md` and
`SERVER_AUTHORITY_AUDIT.md`, restated here for one place to look:

- **Multi-process room coordination.** Database leases already prevent
  split-brain ownership, but seamless multi-process active rooms need sticky
  routing or a redirect/pub-sub layer.
- **Authoritative wild-animal hunting.** Disabled economically until server
  wildlife combat instances exist.
- **Custody / security / legal for any token work.** Separate custody service,
  signed internal requests, withdrawal controls, monitoring and legal review are
  all prerequisites. The project is **not** token-ready.

## Resolved this cycle

- ~~Client SaveGame could bootstrap canonical inventory/progression/position.~~ Registration now creates canonical starter rows transactionally; public Save routes never import value-bearing state.
- ~~Concurrent first joins could create duplicate PvP/combat rooms.~~ Per-room single-flight creation added.
- ~~WebSockets survived logout/password change/token expiry.~~ Access JWTs are session-bound and sockets are centrally revoked/expired.
- ~~Dungeon movement exhausted the global API limit and filled DungeonCommand.~~ Dedicated limiter, 5 Hz client cadence and transient revision-protected movement added.
- ~~Remote merchant/crafting and Black Market entry.~~ Canonical proximity checks added.
- ~~Slow socket clients and presence broadcast bursts.~~ Backpressure limits and coalesced presence snapshots added.

- ~~Dead `pixiTest.ts` + `pixi.js`/`pixi-filters` (~85 MB) unused dependencies.~~ Removed.
- ~~Orphaned `public/title-grass.png` and `pixi-test.html`.~~ Removed.
- ~~External Google Fonts runtime dependency (failed offline).~~ Self-hosted via `@fontsource`.
- ~~Trees looked to float (manifest PNG trees used the tiny-ellipse shadow).~~ Grounded contact shadow now keyed on prop width.
