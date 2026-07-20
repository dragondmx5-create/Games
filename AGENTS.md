# AGENTS.md — start here (for AI agents)

This is the entry point for any AI working on UNDRAL. Read this first, then use
the map to find code. Keep changes small, verified, and inside the authority
model below.

## What this project is

UNDRAL is an English-only, **server-authoritative** WebGL2 online
action-exploration game. The browser renders and sends intent; the backend
decides every persistent value. ~33k lines of TypeScript across ~210 modules.

## The one rule that matters most

**The client never decides persistent value.** Rewards, prices, damage, HP, XP,
inventory deltas, progression, death outcomes and completion proof are chosen by
the server only. Any unported value path must **fail closed** — never add a local
reward fallback "for offline mode". This is enforced by `npm run check:authority`.

Full rule set: [`CLAUDE.md`](CLAUDE.md) (the engineering guide — read it before
touching persistence, rewards, or authority boundaries).

## How to navigate (don't read the whole repo)

1. [`AI_MAP.md`](AI_MAP.md) — generated index of every module, its purpose, and
   its exports. **Use this to locate code**, then open only the files you need.
   Regenerate with `npm run ai:map` after adding/moving modules.
2. [`ARCHITECTURE.md`](ARCHITECTURE.md) — system diagrams, the authority
   boundary, client/server module maps, and the plan for splitting large files.
3. Per-folder `README.md` — every major folder under `src/` and `server/src/`
   documents its responsibility and invariants.
4. [`docs/PROJECT_ISSUES.md`](docs/PROJECT_ISSUES.md) — known problems to fix.
   [`docs/ROADMAP.md`](docs/ROADMAP.md) — planned features.

## Where things live (quick jumps)

| Need | Go to |
|---|---|
| Item IDs, recipes, shop offers | `server/src/economy/catalog.ts` |
| All inventory mutation | `server/src/inventory/service.ts` (the only path) |
| Land / region identity | `src/overworld/registry.ts` |
| World data model (types) | `src/world/types.ts` |
| Procedural sprite art | `src/sprites/` (barrel: `src/sprites.ts`) |
| Scene rendering | `src/render.ts`, `src/rendering/` |
| Client orchestration | `src/game.ts` |
| Dungeon runs (authoritative) | `server/src/dungeon/` |
| PvP (Fracture/Lost) | `server/src/pvp/` |
| UI styles | `src/styles/` (barrel: `src/styles.css`) |

## Non-negotiables when editing

- Every persistent inventory mutation goes through `server/src/inventory/service.ts`.
- Canonical identity (resources, enemies, chests, animals) derives from server
  layouts, never from client-provided definitions.
- Gameplay authority stays in TypeScript / backend services, never in GLSL.
- New user-facing text, identifiers, comments and docs are **English**.
- The main game scene is WebGL2; HTML/CSS is for menus/panels only.
- Do not describe the project as "token-ready" (custody/security/legal are open).

## Verify before you finish

Always run (client):

```bash
npm run check:authority
npm test -- --run
npm run build
npm run artifact
```

And (server, from `server/`):

```bash
npm --prefix server run typecheck:source
npm --prefix server run test:pure
```

With a real database + Prisma engines available, also run
`npm --prefix server test` and `npm --prefix server run build`. Do not claim
database-backed tests passed when the DB or generated Prisma client was absent.

## Working style

- Prefer small, reviewable diffs; match the surrounding code's style.
- After adding or moving modules, run `npm run ai:map` so `AI_MAP.md` stays true.
- When a file is large (see `ARCHITECTURE.md §6`), extract cleanly-separable
  pieces (types, pure helpers) rather than restructuring a class blindly.
