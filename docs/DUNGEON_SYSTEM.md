# Dungeon System

## Core rule

Floors exist only inside server-authoritative Dungeon runs. The overworld never increments a local global layer.

## Authority flow

```text
fresh world presence at canonical entrance
→ POST /api/dungeon/start
→ server run/floor seed + checksummed topology v2
→ revisioned movement/attack/chest commands
→ one floor receipt per run/floor
→ advance or authoritative exit
→ final boss receipt / contract settlement / Vault proof
```

`DungeonRun` is the active-run source of truth. `/api/dungeon/active` restores the canonical snapshot after reconnect. Legacy Cloud Save Dungeon state cannot resume or mint value.

## Floor variety and mechanics

Topology v2 derives a theme and mechanic for every floor: crypt spikes, flooded slow water, crystal pulses, foundry vents, frost runes, or thorn blight. Room count, dimensions, floor variants, hazards, entrance, exit, and tiles are included in the canonical checksum.

Hazard placement avoids entrance/exit safety zones and enemy/chest spawn candidates. The client only renders the returned hazards. The server applies movement multipliers and damage. A player who stops sending commands while standing in a damaging hazard does not freeze the effect: the next command catches up every elapsed server cadence up to lethal damage. Leaving danger clears the old cadence.

Enemy pools vary by theme. From deeper floors, deterministic elite enemies may receive `swift`, `armored`, or `venomous` affixes. Speed, cooldown, incoming-damage reduction, outgoing damage, rewards, and XP are calculated server-side. Final bosses are theme-selected and remain receipt-gated.

## Server-owned state and protocol

The service owns run/floor seeds, topology, player position/HP/facing/timers, enemies, bosses, affixes, hazards, chests, rewards, receipts, and return coordinates. The browser sends normalized movement intent, running state, facing, ability choice, chest ID, revision, and idempotency metadata. It cannot submit coordinates, topology, damage, HP, rewards, seeds, hazard results, or completion.

## Receipts and settlement

- `DungeonCommand` replays exact per-user idempotent commands after row locks.
- `DungeonFloorReceipt` is unique per run/floor; the final receipt is a boss receipt.
- Forbidden Keys and Anonymous Contracts settle only inside the locked run transaction.
- Layer milestones create exact `DungeonVaultProof` rows consumed by proof ID.
- Exit, death loss, Loot Bag creation, death token, and return presence are authoritative.

## Fail-closed deployment note

Topology v2 intentionally rejects a stored run whose checksum was created by an older generator. Deployments should drain or administratively close active v1 runs before rollout. The service does not silently reinterpret an old topology under new mechanics.
