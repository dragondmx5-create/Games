# UNDRAL

UNDRAL is an English-only WebGL2 online action-exploration prototype built around six connected lands, regional settlements, escalating risk territories, multi-floor dungeons, gathering, combat, crafting, progression and a server-authoritative persistent economy.

Gameplay systems are being completed before final biome art, animation and production assets.

## At a glance

| | |
|---|---|
| **Type** | Server-authoritative online action-exploration game (prototype) |
| **Client** | TypeScript + Vite, a custom WebGL2 renderer (no game engine), vanilla-DOM UI |
| **Server** | Node.js + Express, PostgreSQL + Prisma, WebSocket (`ws`), Zod validation |
| **Scale** | ~30,400 lines of TypeScript (≈15.1k client · 11.5k server · 3.8k tests) plus ~3k CSS/HTML across ~210 modules |
| **Tests** | 133 client tests (Vitest) · 123 pure server tests plus database-backed suites when PostgreSQL/Prisma are available |
| **Runtime deps** | Fully self-hosted — Inter/Sora fonts (`@fontsource`), Lucide icons, `simplex-noise`; no external CDN is contacted at runtime |

## Current world

The overworld is an 11×11 deterministic grid containing 121 regions. One backend-issued world seed gives every player the same geography.

The six authored lands are:

1. **The Witchlands**
2. **Green Land**
3. **Rainforest**
4. **Frostlands**
5. **Sunscorched Desert**
6. **Cinder Coast**

Each land defines a capital, secondary settlements, a hidden Underway route, wildlife, resources, climate, architecture, two dungeons and regional risk routes.

The game uses its own risk terminology instead of treating the world as generic colored zones:

| Tier | Name | Persistent-loss rule |
|---|---|---|
| I | Sanctuary | No loss |
| II | Frontier | Limited supply loss |
| III | Fracture | Open PvPvE and partial carried-value loss |
| IV | Lost Territory | Full-loot endgame rules |

Dungeon floors exist only inside dungeons. The overworld does not use global layers.

## Server-authority rule

The browser is a renderer and intent sender. It must not choose persistent rewards, damage, prices, inventory deltas, progression or death outcomes.

Currently active persistent overworld value paths are backend-owned:

- canonical inventory, equipment and revisions;
- regular shop purchases and crafting;
- shared harvesting, depletion and respawn;
- overworld position, complete generated rock/brick collision and same-region presence;
- enemy identity, HP, attack validation, cooldown, death and respawn;
- loot, XP, levels and verified quest events;
- regional player death, inventory loss, server Loot Bags and respawn tickets;
- shared world chests and Supply Crates;
- daily quest progress and claims;
- farm plots and settlement animal production;
- The Underway admission, rotation, reputation and purchases;
- Cloud Save canonicalization;
- proof-bound Vault settlement;
- authoritative Dungeon runs, topology, movement, collision, enemies, chests, rewards, completion and death/exit settlement;
- Fracture/Lost gate admission, regional PvP rooms, canonical carried inventory, kill/death settlement and return flow.

Every economic mutation passes through the server inventory transaction service with optimistic revisions and idempotency receipts. Entity state and inventory settlement use serializable PostgreSQL transactions where required.

## Authoritative Dungeon boundary

Dungeon gameplay is now server-owned end to end:

- the backend issues the run seed, per-floor seed and canonical topology checksum;
- movement distance, wall collision, enemy ticks, attacks, HP and cooldowns are validated by the backend;
- enemies, bosses and chests are persistent run state, and all rewards settle through canonical inventory commands;
- each floor receives one unique completion receipt, with the final receipt marked as a boss completion;
- Forbidden Dungeon Keys are consumed atomically when a keyed run starts and authorize only server-created forbidden chests;
- Anonymous Contracts settle only from the final floor receipt;
- Vault claims consume one exact `DungeonVaultProof` ID and replay through a unique claim receipt;
- exit, death loss, Loot Bag creation, return position and death token are authoritative.

Legacy client Dungeon saves and bags remain presentation-only and fail closed. A saved local layer, seed or mutation cannot resume a run, create a reward or prove completion.

## Implemented gameplay and world systems

### Mobile rendering and dungeon-art upgrade

- Distance/quality LOD for house interiors, outlines and shadow casters.
- Revision-based world scenery refresh instead of unconditional periodic scene rebuilds.
- Frustum-cullable instanced terrain, water, resources and foliage with recomputed bounds.
- Procedural dungeon entrances, rune pillars, braziers and rubble dressing.
- Six capital settlements use four signature public buildings, a limited market and scattered supporting homes; minor settlements remain smaller and open.


### Six-land overworld

- 121 deterministic regions.
- 30 settlements: six capitals and 24 secondary or hidden settlements.
- Region-to-region walking through matching border gates.
- World map with exploration fog, land identity, risk information and feature markers.
- Capital relocation selected by the backend.
- Land-specific generation tuning, resources, enemies, wildlife and temporary palettes.

### Online presence and movement

- Authenticated `/ws/world` channel.
- Same-region player snapshots.
- Server-owned reconnect position.
- Shared deterministic overworld topology used by both renderer and backend.
- Swept player-radius validation against every generated rock/brick obstacle.
- Sequence, speed, bounds and matching canonical edge-gate checks.
- Invalid legacy checkpoints are relocated to the nearest canonical walkable point.
- Session-scoped writes so a superseded tab cannot overwrite the active session.
- Production WebSocket Origin validation and per-connection token-bucket limits.

The browser may predict movement, but `/ws/world` independently regenerates the same topology and rejects paths crossing solid tiles.

### Authoritative overworld combat

- Deterministic server enemy identities and spawn definitions.
- Attack-intent protocol instead of client damage submission.
- Server weapon, range, arc, cooldown and damage calculation.
- Persistent enemy HP, generation and respawn state.
- One reward receipt per enemy life.
- Atomic loot, XP, level, kill count and quest progress.
- Server-owned player HP, armor reduction, death token and combat cooldown.
- Server Loot Bags with location, expiry and one-time recovery.

### Inventory and economy

- One canonical inventory per account.
- Normalized item stacks.
- Server catalog for items, recipes and regular shop offers.
- Revision conflicts for stale commands.
- Idempotent command receipts for safe retries.
- No public arbitrary grant endpoint.
- One-time import from legacy Save v2/v3 inventory.
- Canonical inventory snapshots returned to the client after mutations.

### Shared resources and containers

- Deterministic resource and chest IDs across all regions.
- Server validation of player region, distance, tool and readiness.
- Shared depletion/open state and server timestamps.
- Server-selected yields and rewards.
- Server-owned Supply Crate consumption and roll.

### Progression, quests and settlement production

- Backend-owned HP, XP and level state.
- Daily quest catalog and cycle keys.
- Quest progress emitted only by verified kill, harvest and chest services.
- Deduplicated gameplay events and atomic claim rewards.
- Deterministic farm plots and settlement animal production points.
- Server clocks for crop growth and animal readiness.

Settlement animal production is authoritative. Wild animal hunting remains disabled economically until wildlife combat instances move to the server.

### Fracture and Lost Territory PvP

- Gate admission requires fresh authoritative presence at the exact regional portal.
- Each gate/risk route maps to one leased regional room; split ownership fails closed.
- The session carries a revisioned snapshot of canonical `PlayerInventory` and blocks unrelated inventory mutations.
- Movement, arena collision, weapon profile, cooldown, armor reduction, damage and HP are server-owned.
- Fracture/Lost death transfer, destruction and the layer-0 Vault share settle atomically with one victim receipt.
- Exit requires a live server room state, the extraction beacon and a stationary interval.
- Death returns require the exact server-issued token and relocate to the server-selected capital.
- `/ws/redzone` is retired with `410 Gone`; the legacy `RedZonePlayer` balance is not a gameplay authority.

### The Underway

The shared Black Market network is reached through land-specific hidden routes.

- Admission requires fresh presence at a valid route.
- The backend issues a short-lived Underway session.
- Rotation, prices, reputation requirements and state effects are server-owned.
- Purchases settle through canonical inventory.
- Route, key, contract and protection state cannot be overwritten through Cloud Save.

### Dungeons

- Twelve authored definitions, two per land.
- Four to six named floors per dungeon.
- Server-issued run and floor seeds, canonical topology and exact return position.
- Server-owned movement/collision, enemies, bosses, chests, HP, cooldowns and rewards.
- Unique floor/boss receipts, proof-specific Vault claims and authoritative death/exit settlement.
- Dungeon-local cities, farms and settlement livestock are excluded.

The browser projects server snapshots and sends intent only. See `docs/DUNGEON_SYSTEM.md`.

### Rendering

- Native WebGL2 main-world renderer.
- GLSL ES 3.00 shaders.
- Texture-array atlas and GPU quad submission.
- Dynamic lights, bloom, fog, color grading, vignette and damage distortion.
- Auto, Low, Medium and High quality modes.
- Portrait/landscape resize and context-loss handling.
- HTML/CSS panels for menus, inventory and the world map.
- Self-hosted UI type (Inter for body, Sora for display) bundled via `@fontsource`, so no external font CDN is requested.
- Owner-side art override: any `public/assets/manifest.json` key (`tree`, `tree.2`, animal walk strips, …) replaces the procedural fallback at 1 image px = 1 world px — see `src/assets.ts`.
- Dev-only renderer harness at `?visual-harness` (tree-shaken from production) renders a local region with no backend, for reviewing terrain and prop art.

## Frontend stack

- TypeScript, bundled with Vite 6
- Custom WebGL2 renderer (`src/rendering/`) — no third-party game engine
- Vanilla-DOM UI (no UI framework); HTML/CSS panels over the WebGL canvas
- `simplex-noise` for terrain fields, `@formkit/auto-animate` for list transitions
- Self-hosted Inter/Sora (`@fontsource`) and Lucide + game-icons.net glyphs
- Vitest for the client test suite

## Backend stack

- Node.js and Express
- PostgreSQL
- Prisma
- WebSocket (`ws`)
- Zod validation
- HTTP-only access and refresh cookies
- Refresh-token rotation
- Helmet, CORS, rate limiting and browser Origin guards
- Serializable transaction services and command receipts

## Controls

| Input | Action |
|---|---|
| WASD / Arrow keys | Move |
| Shift | Run |
| Space | Attack |
| F | Weapon ability |
| E | Interact |
| Q | Switch weapon |
| I | Inventory |
| M | World map |
| Enter | Respawn after server-confirmed death |

Touch controls are enabled on mobile devices.

## Run the client

```bash
npm ci
npm run dev
```

Verification:

```bash
npm run check:authority
npm test -- --run
npm run build
npm run artifact
```

`check:authority` fails if persistent local rewards or direct client inventory increments are reintroduced into the legacy game orchestration path.

## Run the server

```bash
cd server
npm ci
cp ../.env.example .env
npm run prisma:generate
npx prisma migrate deploy
npm test
npm run build
npm run dev
```

Pure backend tests and strict source checking do not require a live database:

```bash
npm run test:pure
npm run typecheck:source
```

Prisma generation requires access to Prisma engine binaries. Database-backed integration tests must run against an isolated PostgreSQL database before deployment.

## Important environment settings

See `.env.example`. Production deployments must configure at least:

- `DATABASE_URL`
- access and refresh-token secrets
- `CORS_ORIGIN`
- cookie security settings

Unsafe browser API mutations and WebSocket upgrades are Origin-checked in production. Internal service endpoints are intentionally separated from browser routes and need stronger service authentication before any token bridge is activated.

## Project structure

```text
src/
├── overworld/              # six lands, zones, dungeons and regional data
├── rendering/              # WebGL2 renderer (core/), shaders/, postprocessing/, quality/
├── ui/                     # DOM shell, panels, icons and economy presentation
├── api.ts                  # authenticated browser API client
├── game.ts                 # client orchestration and intent submission
├── render.ts / sprites.ts  # scene renderer and procedural sprite art
├── world.ts / config.ts    # local world generation and tuning tables
├── assets.ts               # manifest-driven art override loader
├── save.ts                 # Save v3 presentation/cache compatibility
├── devVisualHarness.ts     # backend-free renderer harness (?visual-harness)
├── main.ts                 # entry point (fonts, styles, boot flow)
└── __tests__/              # client regression suite

server/src/
├── auth/                   # accounts, cookies and refresh rotation
├── inventory/              # canonical stacks, commands and transactions
├── economy/                # authoritative catalog
├── world/                  # world seed, position, resources, chests and settlements
├── combat/                 # enemies, attacks, HP, death and Loot Bags
├── quests/                 # verified progress and claims
├── underworld/             # Black Market sessions and settlement
├── dungeon/                # authoritative runs, topology and settlement
├── pvp/                    # regional Fracture/Lost rooms and settlement
├── save/                   # validation and canonicalization
├── vault/                  # guarded loss pool and claim boundary
├── ws/                     # socket protections
└── __tests__/              # pure and database-backed tests
```

## Current authority gaps

The project is not token-ready. Remaining high-priority work:

1. sticky routing or redirect/pub-sub coordination for seamless multi-process active rooms (database leases already prevent split-brain ownership);
2. authoritative wild-animal hunting;
3. separate custody service, signed internal requests, withdrawal controls, monitoring and legal review.

Complete overworld obstacle collision and the Fracture/Lost authoritative handoff are implemented. The remaining scaling item is operational coordination, not a browser-authority fallback.

## Documentation

- [`AGENTS.md`](AGENTS.md) — start-here entry point for AI agents (rules + navigation)
- [`AI_MAP.md`](AI_MAP.md) — generated index of every module and its exports (`npm run ai:map`)
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system map, module diagrams, file-split plan
- [`docs/PROJECT_ISSUES.md`](docs/PROJECT_ISSUES.md) — known problems to fix
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — planned features
- Per-folder `README.md` files under `src/` and `server/src/`
- `SERVER_AUTHORITY_AUDIT.md`
- `SERVER_AUTHORITY_PHASE3_REPORT.md`
- `SERVER_AUTHORITY_DUNGEON_REPORT.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/ONLINE_CRYPTO_ROADMAP.md`
- `docs/SERVER_AUTHORITATIVE_COMBAT.md`
- `docs/SERVER_AUTHORITATIVE_INVENTORY.md`
- `docs/SERVER_AUTHORITATIVE_HARVESTING.md`
- `docs/SERVER_AUTHORITATIVE_QUESTS.md`
- `docs/SERVER_AUTHORITATIVE_SETTLEMENTS.md`
- `docs/SERVER_AUTHORITATIVE_UNDERWORLD.md`
- `docs/DUNGEON_SYSTEM.md`
