# `src/` — client

The browser client: a custom WebGL2 renderer, a vanilla-DOM UI, and the network
clients that talk to the authoritative backend. It renders, predicts
non-authoritative visuals, and sends intent — it never decides persistent value.

## Entry & orchestration

| File | Responsibility |
|---|---|
| `main.ts` | Entry point: imports fonts + styles, runs the boot auth check, wires the title screen and launch flow. |
| `game.ts` | Main orchestration: game loop, intent submission, applying canonical snapshots. Largest client file — a refactor target (see `ARCHITECTURE.md`). |
| `authPanel.ts` | Title-screen account panel (login / register / logout). |

## Rendering & world

| File | Responsibility |
|---|---|
| `render.ts` | Scene renderer: ground, props, entities, HUD overlay, minimap. |
| `sprites.ts` | Procedural sprite art (trees, plants, props, entities). |
| `world.ts` / `config.ts` | Local deterministic world generation and tuning tables. |
| `assets.ts` | Manifest-driven art override loader (`public/assets/manifest.json`, 1 image px = 1 world px). |
| `entities.ts` / `stats.ts` | Local entity models and derived stats. |

Sub-packages: [`rendering/`](rendering/README.md) (WebGL2 pipeline),
[`overworld/`](overworld/README.md) (authored lands), [`ui/`](ui/README.md) (DOM panels).

## Networking & persistence

| File | Responsibility |
|---|---|
| `api.ts` | Authenticated REST client (`/api/...`), refresh handling. |
| `worldPresence.ts` | `/ws/world` presence + movement channel. |
| `redZoneGame.ts` | Fracture/Lost PvP client over the authoritative PvP socket. |
| `serverInventory.ts` | Canonical inventory snapshot application. |
| `save.ts` / `gamePersistence.ts` | Save v3 presentation/cache compatibility. |

## Input & platform

`input.ts` (keyboard), `touch.ts` (mobile), `fullscreen.ts`, `audio.ts`, `tween.ts`.

## Dev-only

`devVisualHarness.ts` renders a local region with no backend — reached at
`?visual-harness` and tree-shaken from production builds.

## Tests

`__tests__/` holds the Vitest client suite (world generation, save
compatibility, economy parity, tween, region, death rules, DOM contract).
