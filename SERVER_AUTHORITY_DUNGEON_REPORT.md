# Server-Authoritative Dungeon Report

> Historical milestone report. The overworld-collision and Fracture/Lost P0 items that were still open when this report was written are now closed; see `SERVER_AUTHORITY_AUDIT.md` for the current boundary.

Date: 2026-07-13

## Scope

This milestone replaces the fail-closed local Dungeon preview with a persistent, server-authoritative instance service. The browser is now a renderer and intent sender for Dungeon gameplay; it cannot choose a run seed, floor topology, coordinates, collision result, damage, HP, enemy/chest state, reward, completion, Vault eligibility, death loss or return location.

## Runtime architecture

### Run and floor authority

- `DungeonRun` stores the owner, Dungeon ID, random server run seed, derived floor seed, revision, status, canonical topology JSON, entities, player state and exact return point.
- Only one `active` or `death_pending` run may proceed for a user. Start is serialized on the user row.
- Start retries check the command receipt before presence validation and recheck it after the user lock.
- `/api/dungeon/active` restores the canonical run after reconnect. Legacy Cloud Save Dungeon objects never resume authority or reconstruct local topology.
- After a start commits, the server removes the player from overworld presence. New sockets and `visibility=true` rejoin attempts check the durable run row and remain hidden while a run is `active` or `death_pending`.

### Shared topology and collision

- `server/src/dungeon/topology.ts` deterministically generates each floor from `(runSeed, dungeonId, floor)`.
- The stored topology checksum must match regeneration before a command is accepted.
- Server movement clamps elapsed time against its own clock, normalizes intent and applies circle-vs-tile collision.
- The client builds its render world only through `worldFromDungeonTopology(snapshot.topology)`.

### Overworld entrance contract

- `dungeonOverworldEntrance(worldSeed, dungeonId)` is a pure shared function.
- The client places/carves the portal at that coordinate.
- Start requires fresh server world presence in the authored region and within the authoritative radius.
- Complete overworld obstacle collision was not moved in this milestone. It remains a separate hardening item; Dungeon authority depends on fresh bounded/speed-checked presence at the exact shared entrance, not on a client-reported portal.

## Command protocol

Public command schemas are strict and accept intent only:

- start: Dungeon ID, key-use choice, idempotency key;
- move: run ID, expected revision, movement vector, running, facing, bounded elapsed time;
- attack: run ID, expected revision, ability choice and facing;
- chest: run ID, expected revision and server chest ID;
- complete/advance/exit: run ID, expected revision and idempotency key;
- death: run ID and idempotency key.

Every mutation writes `DungeonCommand` with a request hash and exact result. The unique `(userId, idempotencyKey)` index rejects key reuse with different payloads. Run commands replay before the row lock and again after the lock.

## Combat, enemies and chests

- Enemy definitions, spawn candidates, HP, damage, speed and attack cooldowns come from server catalogs and deterministic spawn state.
- Enemy movement and attacks tick on server movement/attack commands.
- Weapon profile, range, arc, cooldown and damage come from canonical equipped inventory.
- Enemy death reward, inventory credit, XP/level progression and kill count commit in the same serializable transaction.
- Chest distance, type and opened state are server-checked. Chest rewards use canonical inventory commands.
- A forbidden chest exists only for a run whose key was atomically consumed.

## Floor, boss and Underway settlement

- `DungeonFloorReceipt` is unique on `(runId, floor)` and has a globally unique proof hash.
- Completion requires every server enemy dead and the player within the canonical exit radius.
- The final floor receipt is marked `boss = true`.
- Advancement requires both the receipt row and `floorCompleted` run state.
- A Forbidden Dungeon Key is decremented while the start transaction creates the keyed run.
- An Anonymous Contract is decremented, reputation is increased and its reward is credited only while committing the final floor receipt.

## Vault proof

- Floor 1 creates a layer-1 `DungeonVaultProof`; final completion creates a layer-5 proof.
- Proofs are unique on `(runId, layer)` and owned by one user.
- The client submits the exact proof ID, not a floor/layer assertion.
- The Vault service locks that proof, reads its server layer, resets the matching shared Vault, credits canonical inventory, writes a unique `VaultClaim` receipt keyed by proof ID and marks the proof claimed in one serializable transaction.
- A retry of the same proof replays the original claim. An unrelated or other-user proof fails closed. Client save layer/seed/mutations are never read.
- `/api/vault/proofs` lists unclaimed proofs so a lost completion/claim response is recoverable after reconnect; the client settles exact proof IDs sequentially.

## Exit and death

- Exit is accepted only at the canonical entrance, or at the final exit after final completion.
- Exit synchronizes HP, database world position and in-memory presence to the run's exact stored return point.
- Enemy damage can move a run to `death_pending`; only then can death settle.
- Death applies the Lost-tier canonical inventory loss plan, creates at most one server `WorldLootBag`, issues a death token, resets combat progression according to the existing death rule, marks the run dead and restores the return position/presence.
- There is no local or generic client Dungeon death fallback.

## Database migration

Migration `20260713190000_authoritative_dungeon` adds:

- `DungeonRun`;
- `DungeonCommand`;
- `DungeonFloorReceipt`;
- `DungeonVaultProof`;
- foreign keys, lifecycle indexes, lifecycle/layer/HP checks, a partial unique blocking-run index, and uniqueness constraints for commands, receipts and proofs.

## Fail-closed compatibility

- Local Dungeon seed/topology/damage/reward paths are absent from `src/game.ts`.
- Legacy Dungeon saves are discarded when no server run exists and never regenerate a local floor.
- Active Dungeon runs suspend overworld presence, combat and economy capability until authoritative exit/death.
- Legacy local bags are stripped and contribute zero Vault value.
- Local generated weapon pickups remain disabled.
- Missing/corrupt topology, stale revisions, invalid positions, absent proofs and incomplete floors reject instead of guessing.

## CI and tests

`scripts/check-authority-boundary.cjs` now asserts:

- no client-authored Dungeon seed, topology, damage or generic death settlement;
- presence of every authoritative Dungeon client command and pending-proof recovery;
- overworld presence suspension plus durable websocket rejoin blocking;
- server topology/collision/enemy tick/receipt/proof/contract/death invariants;
- strict schemas without seed/damage/reward fields;
- migration tables and unique indexes;
- proof-ID-bound Vault settlement;
- legacy bag and pickup fail-closed behavior.

Verification in this delivery:

- authority boundary check: passed;
- client tests: 95/95 passed across 15 files;
- client TypeScript/Vite build: passed;
- pure server tests: 85/85 passed across 25 files;
- strict server source TypeScript check: passed.

Prisma generation, the generated-client server build and database-backed PostgreSQL integration tests require the Prisma engine binary and an isolated database. The delivery environment could not resolve `binaries.prisma.sh`, so those checks are explicitly deferred to connected CI and are not claimed as passed here. The strict source-only TypeScript check remains green.
