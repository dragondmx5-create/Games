# Server-authoritative harvesting — Phase 4, step 2

## Status

Implemented for overworld trees, iron, crystals and glowshrooms.

The browser no longer chooses a resource reward, depletion state or respawn time. It sends one canonical `nodeId`; the backend derives and validates everything else.

## Canonical layout

`server/src/world/resourceLayout.ts` is imported by both the browser and server. A node ID contains only deterministic identity data:

```text
res1:<worldSeed>:<rx>:<ry>:<kind>:<ordinal>
```

The backend regenerates the region layout from the global world seed and rejects IDs that do not resolve to an authored canonical node. Coordinates and rewards are never accepted from the request.

The generated layout covers all 121 overworld regions and uses each land/risk profile to scale tree, iron, crystal and shroom density.

## Shared mutable state

`WorldResourceState` stores only mutable facts:

- canonical node ID;
- world seed and region;
- resource kind;
- next availability time;
- harvest count;
- last harvesting account.

Rows are created lazily on first harvest. All clients therefore observe the same depletion and respawn state.

## Server-owned position

`PlayerWorldPosition` is the authoritative overworld checkpoint after a one-time migration from Save v3.

The `/ws/world` handshake returns a `welcome` frame containing the server position. The client reconciles to that position before play begins. Subsequent movement is checked for:

- monotonically increasing sequence numbers;
- maximum movement speed;
- valid world bounds;
- adjacent-region transitions through matching border edges.

Every socket claims a random `sessionId`. Position writes use `(userId, sessionId)`, preventing a superseded tab or delayed close handler from overwriting a newer session.

Server-authorized relocation persists the new checkpoint and sends a fresh `welcome` frame. If a player was hidden in a Dungeon/Black Market, the socket reloads that checkpoint before rejoining. Canonical resource placement and map generation reserve the capital landing square.

## Harvest command

```text
POST /api/world/harvest
```

```json
{
  "nodeId": "res1:123:0:0:iron:2",
  "idempotencyKey": "harvest:..."
}
```

The service validates:

1. authentication;
2. canonical node identity and current global world seed;
3. fresh connected world presence;
4. exact region;
5. distance to the server-derived node coordinate;
6. required tool ownership in canonical inventory;
7. shared depletion/respawn state.

It then locks the resource row and inventory row inside a serializable transaction, chooses the yield on the server, records depletion and awards through the canonical inventory command service.

Safe retries return the stored inventory receipt without requiring the player to remain beside the node. Reusing a key for a different command is rejected.

## Browser integration

The generated WebGL2 region now uses the same canonical node layout. On region entry it fetches:

```text
GET /api/world/regions/:rx/:ry/resources
```

Unavailable nodes are hidden until their server respawn time. Successful harvesting applies the complete returned canonical inventory snapshot rather than trusting a local increment.

Regular shop purchase, crafting and weapon equip UI also use their existing server commands and revision checks.

## Current authority boundary

Authoritative now:

- account inventory snapshots;
- regular shop purchases;
- crafting;
- weapon equip;
- overworld tree/iron/crystal/shroom harvesting;
- resource depletion and respawn;
- overworld presence and position checkpointing;
- server-selected capital relocation and safe landing;
- Dungeon Vault claim settlement.

Still client-originated and therefore not token-safe:

- enemy and weapon-pickup rewards;
- ordinary and carried chest contents;
- farm planting/harvest;
- animal collection/hunting rewards;
- quest and level rewards;
- Dungeon completion rewards;
- Black Market purchases/contracts;
- regional death settlement into canonical inventory.

The next backend slice must migrate combat/loot claim state, starting with server-issued enemy instances and one-time loot receipts.
