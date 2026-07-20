# Server Economy Phase 2 Report

## Delivered

This phase re-audited the first inventory foundation and closed the largest gaps between existing endpoints and the actual game path.

### Shared overworld presence

- Added authenticated `/ws/world` region rooms.
- Same-region players receive username and position snapshots.
- Newer tabs supersede older sockets.
- Sequence, speed, world-bound and edge-transition validation are enforced.
- The server sends an authoritative `welcome` position before gameplay begins.
- Position is persisted independently from writable SaveGame data.
- Per-socket session ownership prevents stale tabs from overwriting a newer position.
- Hidden Dungeon/Black Market sessions reload persisted authority before rejoining the overworld.

### Shared server-authoritative harvesting

- Added canonical deterministic resource IDs for all 121 regions.
- Added land/risk-based resource density profiles.
- Added shared PostgreSQL depletion and respawn state.
- Harvest accepts only `nodeId` and an idempotency key.
- Region, distance, tool, depletion and world-seed validation happen on the server.
- Yield is selected on the server and settled atomically into canonical inventory.
- The client renders and removes the exact canonical nodes used by the backend.
- Resource generation reserves a deterministic safe capital spawn square.

### Inventory path completion

The Phase 1 APIs existed but the game UI still had local mutation paths. This phase connected:

- regular shop purchase;
- crafting;
- weapon equip from Inventory;
- weapon cycling with keyboard/touch controls;
- harvest rewards;
- Dungeon Vault claims.

Each applies a complete canonical inventory snapshot and revision instead of reproducing a result locally.

### Canonical Vault settlement

Vault eligibility, run uniqueness, jackpot reset, claim ledger and inventory award now execute in one serializable transaction. Network retry replays the same inventory receipt. Legacy claims without a canonical receipt are flagged for reconciliation rather than minted again.

### Server-authorized capital return

A server command chooses the capital belonging to the player's current land, persists that destination and reconciles world presence. This fixes the conflict between local respawn teleporting and server-owned movement. The map generator guarantees a walkable, resource-free landing square.

This is explicitly temporary: combat/death is not yet server-owned, so the return command is not proof of death and must eventually require a server-issued death/evacuation ticket.

### Concurrency fixes

- Inventory command receipts are rechecked after the inventory lock.
- Concurrent retries of the same idempotency key cannot mutate twice.
- Harvest replay occurs before live-presence validation.
- Position persistence is session-scoped.
- Authorized relocation cannot be overwritten by a stale close handler.

## Database changes

- `WorldResourceState`
- `PlayerWorldPosition`
- region/respawn indexes
- position session ownership

Migrations:

```text
server/prisma/migrations/20260713120000_shared_world_resources/
server/prisma/migrations/20260713123000_server_world_position/
```

## Verification completed

- 94/94 client tests passed.
- 15/15 client test files passed.
- Client TypeScript and production Vite build passed.
- 40/40 environment-independent server tests passed.
- 10/10 pure server test files passed.
- Server source-only strict TypeScript check passed through a Prisma declaration shim.
- Database-backed tests were added/updated for harvesting, shared depletion, replay, forged IDs, distance checks, capital relocation and canonical Vault settlement.

## Environment limitation

Full Prisma generation, PostgreSQL integration execution and the normal generated-client server build could not be completed in this environment because Prisma engine binaries and a PostgreSQL service were unavailable. The source-only check does not replace generated-client or database verification.

Run in connected CI/development:

```bash
cd server
npm ci
npx prisma generate
npx prisma migrate deploy
npm test
npm run build
```

## Remaining Phase 4 work

The next P0 path is combat, loot and death authority. Enemy death, chest reward, farming, animals, quests/progression, Dungeon completion, Black Market settlement, loot-bag recovery and regional death loss remain client-originated. They cannot feed a token or player marketplace until each becomes server state plus an idempotent command receipt.

See `SERVER_AUTHORITY_AUDIT.md` for the file-level migration list.
