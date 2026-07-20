# Server-authoritative inventory — Phase 4, step 1

## Status

Implemented as the central backend economy foundation. Regular purchase, crafting, equip, overworld harvesting and Dungeon Vault claims now use it. It intentionally runs beside the legacy SaveGame economy until every faucet and sink is migrated.

The active overworld and Dungeon reward/loss paths now consume this service. Wild-animal hunting and future player-to-player transfer systems remain disabled or unimplemented until their own authoritative services exist.

## Goals

- Give every account one canonical normalized inventory.
- Make all inventory mutations atomic and revisioned.
- Make network retries safe through per-user idempotency keys.
- Prevent duplicate unique equipment, negative balances and stack overflow.
- Establish one internal mutation service for future gathering, loot and quest systems.
- Import an existing Save v2/v3 inventory once, without repeatedly trusting the save blob.

## Database model

### `PlayerInventory`

One row per account:

- `revision`: optimistic concurrency version.
- `progressionLevel`: one-time imported migration value. It must be replaced by server-owned XP/progression before more level-gated recipes are added.
- `equippedWeapon`: canonical equipped weapon ID.
- `hasPet`: canonical companion ownership state.
- `migratedFromSave`: records whether the initial snapshot came from the legacy save.

### `InventoryStack`

Normalized `(userId, itemId, quantity)` stacks. Item IDs are namespaced, for example:

- `currency.crystal`
- `material.wood`
- `weapon.chitin`
- `container.supply_crate`

Database and domain checks reject zero/negative persisted stacks.

### `InventoryCommand`

Append-only command receipt containing:

- per-user idempotency key
- command kind
- SHA-256 request hash
- exact JSON result
- creation time

A safe retry returns the original result. Reusing a key with a different command returns HTTP `409`.

## HTTP API

All routes require account authentication.

```text
GET  /api/inventory
GET  /api/inventory/catalog
POST /api/inventory/craft
POST /api/inventory/purchase
POST /api/inventory/equip
```

Command example:

```json
{
  "recipeId": "craft_wood_club",
  "expectedRevision": 4,
  "idempotencyKey": "craft:7a84e3c1-..."
}
```

Successful commands increment `revision`. A stale `expectedRevision` returns `409` with the current revision.

## Transaction boundary

Each mutation runs in a PostgreSQL `SERIALIZABLE` transaction:

1. Check an existing command receipt.
2. Lock the player's inventory row.
3. Check the expected revision.
4. Validate the command against the server catalog.
5. Apply all costs and outputs in memory.
6. Persist the complete normalized snapshot.
7. Append the command receipt.
8. Commit everything together.

Any failure rolls back costs, outputs, equipment changes and the receipt.

## Catalog ownership

The backend has a canonical item/recipe/shop catalog in:

```text
server/src/economy/catalog.ts
```

A client regression test compares it with `src/config.ts`, preventing silent recipe and price drift while the project transitions toward a shared generated catalog package.

## Migration behavior

The first `GET /api/inventory` for an existing account:

1. Reads its already-persisted SaveGame.
2. Validates and migrates Save v2 to v3 when necessary.
3. Converts legacy player fields into namespaced item stacks.
4. Creates the normalized inventory once.
5. Ignores later SaveGame inventory edits for this canonical table.

This is a one-time compatibility bridge, not a permanent trust path.

## Not public by design

There is no generic public endpoint such as `POST /inventory/grant`. Future rewards must call:

```text
applySystemInventoryDeltas(...)
```

from a server-validated gameplay service. The client may request an action such as harvesting a node, but it may never choose the reward amount.

## Implemented consumers

- Overworld trees, iron, crystals and shrooms settle through this service. See `SERVER_AUTHORITATIVE_HARVESTING.md`.
- Regular purchase, crafting and both inventory/keyboard weapon equip paths use server commands.
- Dungeon enemy/chest/contract rewards, death loss and proof-specific Vault claims settle through canonical inventory commands.
- Fracture/Lost sessions carry a revisioned canonical snapshot, block unrelated mutations, and settle victim/killer deltas through ordered inventory locks and unique death receipts.

The client always projects the complete returned inventory snapshot.

## Next implementation step

Add seamless horizontal routing/coordination for leased active rooms and migrate wild-animal hunting to server-owned instances. Writable SaveGame economic fields remain compatibility-only and are overwritten from canonical rows.
