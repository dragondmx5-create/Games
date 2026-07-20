# UNDRAL Engineering Guide

## Product direction

UNDRAL is an English-only WebGL2 online action-exploration game. Systems and authority boundaries are implemented before final graphics and assets.

The overworld has six lands and 121 deterministic regions. Global overworld layers are forbidden. Floors exist only inside dungeons.

## Core terminology

- Sanctuary: safe, no persistent loss.
- Frontier: conditional danger and limited supply loss.
- Fracture: open PvPvE and partial carried-value loss.
- Lost Territory: full-loot endgame risk.
- The Underway: shared Black Market network.

Do not present these as Albion-style Yellow/Red/Black zones. Color is a warning channel, not the world’s terminology.

## Authority model

The browser renders, predicts non-authoritative visuals and sends intent. It never selects persistent rewards, prices, damage, inventory deltas, progression, death outcomes or completion proof.

Any unported value path must fail closed. Do not retain a local reward fallback “for offline mode”; this is an online game.

## Architecture invariants

1. `src/overworld/registry.ts` is the source of truth for lands, settlements, features and regional identity.
2. `src/overworld/dungeons.ts` owns authored Dungeon metadata, but it is not completion proof.
3. Deterministic geography is not stored as a full map; authored definitions and mutations are persisted separately.
4. Dungeon and Underway transitions preserve exact return region and position.
5. Gameplay authority stays in TypeScript and backend services, never GLSL.
6. The main game scene remains WebGL2. HTML/CSS is appropriate for menus and panels.
7. New user-facing text, identifiers, code comments and documentation must be English.
8. `server/src/economy/catalog.ts` is the backend authority for item IDs, recipes and regular shop offers.
9. Every persistent inventory mutation must pass through `server/src/inventory/service.ts`; direct `InventoryStack` writes outside migration and test utilities are forbidden.
10. Public clients send action intent and idempotency metadata, never arbitrary positive deltas.
11. Entity commands use optimistic inventory revisions and replayable idempotency receipts.
12. Commands that lock an entity row must re-read the receipt after the lock before returning an already-completed semantic conflict.
13. `server/src/world/resourceLayout.ts` owns canonical resource identity. Never accept resource coordinates, kind or yield from a client.
14. Server enemy, chest, farm and settlement-animal identities must be derived from canonical layouts, not browser-provided definitions.
15. `PlayerWorldPosition` and `/ws/world` own overworld position after one-time migration. Economic validators use fresh server presence, not SaveGame coordinates.
16. Socket position persistence remains session-scoped. A superseded tab must never overwrite the active connection.
17. Combat clients send attack intent only. Weapon, range, arc, cooldown, damage, HP, life generation, death and reward are server-owned.
18. Kill rewards, XP and verified quest progress remain in one transaction.
19. Player death, regional loss, Loot Bag creation and death-token issuance remain atomic.
20. Respawn requires a server death token; do not restore a client-requestable free relocation path.
21. Quest progress may be emitted only by verified gameplay services. Never accept arbitrary progress increments from a public route.
22. Shop, craft, equip, harvest, chest, quest, farm, animal, Underway and Vault UI apply returned canonical snapshots rather than reproducing mutations locally.
23. Once canonical database state exists, Cloud Save is a presentation and compatibility cache. It cannot overwrite inventory, equipment, HP, XP, level, death bags or Underway economy.
24. Production unsafe HTTP mutations and WebSocket upgrades must pass the configured Origin guard.
25. WebSockets retain per-connection message-rate limiting.
26. `server/src/dungeon/` owns Dungeon run/floor seeds, topology, movement/collision, enemy/chest state, rewards, floor/boss receipts and exit/death settlement. The client may only render snapshots and submit strict intent.
27. Forbidden Keys, Anonymous Contracts and Vault claims settle only from locked Dungeon rows and unique server proofs. Vault requests identify one exact proof ID; client save layer/seed/mutations are never eligibility.
28. `server/src/world/overworldTopology.ts` is the shared deterministic collision authority. `/ws/world` must sweep every accepted movement against it and region transitions must use matching canonical openings.
29. `server/src/pvp/` owns Fracture/Lost admission, room leases, movement/combat, canonical inventory carry, death receipts and exit/death return. The legacy `/ws/redzone` path must remain retired and fail closed.
30. Active Dungeon or PvP sessions are mutually exclusive and suspend every overworld authority surface. Canonical inventory mutations outside the owning instance must fail closed.
31. Wild animal hunting remains economically disabled until server wildlife instances exist.
32. Do not describe the project as token-ready until horizontal coordination and custody/security/legal work are complete.

## Required verification

Before delivery run:

```bash
npm run check:authority
npm test -- --run
npm run build
npm run artifact
npm --prefix server run test:pure
npm --prefix server run typecheck:source
```

When Prisma engine binaries and an isolated PostgreSQL database are available, also run:

```bash
npm --prefix server run prisma:generate
npm --prefix server test
npm --prefix server run build
```

Do not claim database-backed integration tests passed when the database or generated Prisma client was unavailable.

## Authority references

Read these before changing persistence or adding a reward path:

- `SERVER_AUTHORITY_AUDIT.md`
- `SERVER_AUTHORITY_DUNGEON_REPORT.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/SERVER_AUTHORITATIVE_INVENTORY.md`
- `docs/SERVER_AUTHORITATIVE_HARVESTING.md`
- `docs/SERVER_AUTHORITATIVE_COMBAT.md`
- `docs/SERVER_AUTHORITATIVE_QUESTS.md`
- `docs/SERVER_AUTHORITATIVE_SETTLEMENTS.md`
- `docs/SERVER_AUTHORITATIVE_UNDERWORLD.md`
- `docs/DUNGEON_SYSTEM.md`
