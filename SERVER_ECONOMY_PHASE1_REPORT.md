# Server Economy Phase 4 / Step 1 Report

> Superseded for current status by `SERVER_ECONOMY_PHASE2_REPORT.md` and `SERVER_AUTHORITY_AUDIT.md`. This file is retained as the Phase 1 implementation history.


Date: 2026-07-13

## Delivered

This delivery establishes the transactional server inventory required before shared harvesting, server-issued loot, trading or token value can be safe.

### Database

Added:

- `PlayerInventory`
- `InventoryStack`
- `InventoryCommand`
- migration `20260713090000_server_inventory_foundation`

The migration includes foreign keys, cascade cleanup, indexes and quantity/revision/level checks.

### Inventory domain

Added a namespaced catalog covering:

- currencies and consumables
- raw materials
- eight weapons
- two tools
- three armor items
- Supply Crates
- Cave Pup ownership

Domain validation prevents:

- unknown item IDs
- negative balances
- invalid quantities
- stack overflow
- duplicate unique gear
- equipping an unowned or non-weapon item

### Transaction service

`server/src/inventory/service.ts` provides:

- lazy inventory creation
- one-time Save v2/v3 import
- serializable PostgreSQL command transactions
- optimistic revision checks
- exact result replay for safe retries
- request-hash conflict detection
- atomic craft, purchase and equip operations
- an internal-only system delta primitive for future validated rewards

There is intentionally no public generic item grant route.

### HTTP routes

```text
GET  /api/inventory
GET  /api/inventory/catalog
POST /api/inventory/craft
POST /api/inventory/purchase
POST /api/inventory/equip
```

All routes require the existing secure-cookie authentication flow.

### Client preparation

`src/api.ts` now includes typed bindings for inventory snapshots, catalog retrieval and command submission. They are not yet connected to every gameplay reward because doing so before harvesting/loot validators exist would lose legitimate progress.

A catalog parity test verifies that the current client balance definitions and backend catalog remain aligned.

## Verification performed

### Client

- 88/88 tests passed across 13 test files.
- TypeScript check passed.
- Vite production build passed.

### Server without database

- 28/28 pure tests passed across 6 test files.
- 13 new inventory tests passed:
  - atomic deltas
  - insufficient balance
  - unique ownership
  - stack limits
  - recipe planning
  - level gates
  - shop planning
  - equipment ownership
  - stable command hashes
  - exact retry replay
  - idempotency conflict
  - stale revision rejection
- Server source TypeScript was checked successfully with a temporary Prisma type shim because this environment could not download Prisma engine binaries.

### Included for PostgreSQL environments

`server/src/__tests__/inventory.test.ts` adds database-backed HTTP coverage for:

- authentication
- lazy legacy Save migration
- atomic crafting
- exact idempotent replay
- stale revision rejection
- idempotency payload conflict
- purchase and equip behavior

These tests require:

1. generated Prisma Client;
2. the new migration applied to PostgreSQL;
3. the test database configured.

## Environment limitation

`npx prisma generate` could not run in this container because `binaries.prisma.sh` was unreachable. Consequently the database-backed test suite and real server build could not be executed here. The migration, Prisma schema, routes, service and integration tests are included for execution in a connected development/CI environment.

## Security boundary after this step

The project is **not token-safe yet**.

The normalized inventory is implemented, but the legacy SaveGame economy remains active while these client-originated faucets still exist:

- tree and ore gathering
- enemy drops
- chest rewards
- farming and animal rewards
- quests
- Dungeon rewards
- Black Market rewards
- Vault settlement into the main inventory

The one-time Save import is a migration bridge and must not be treated as proof that old balances were honestly earned.

## Next step

Implement server-authoritative shared harvesting:

1. stable deterministic resource node IDs;
2. persisted depletion and respawn state;
3. region, position, tool and cooldown validation;
4. `POST /api/world/harvest` accepting only action intent;
5. reward settlement through `applySystemInventoryDeltas`;
6. client migration for trees and ore;
7. concurrency and replay tests.
