# `dungeon/` — authoritative dungeon runs

Dungeon gameplay is server-owned end to end. The client may only render
snapshots and submit strict intent. A saved local layer, seed or mutation can
never resume a run, create a reward, or prove completion.

| File | Responsibility |
|---|---|
| `catalog.ts` | The 12 authored dungeon definitions (floors, bosses, tiers). |
| `service.ts` | Run/floor lifecycle: movement, collision, enemies, chests, rewards, receipts, exit/death settlement. Largest dungeon file — a refactor target. |
| `topology.ts` | Per-run/per-floor seeds and canonical topology checksum. |
| `domain.ts` | Pure run/floor rules. |
| `overworldEntrance.ts` | Mapping overworld portals to dungeon entry. |
| `routes.ts` / `schema.ts` | `/api/dungeon/*` and request validation. |

## Invariants

- Backend issues the run seed, per-floor seed and topology checksum; movement,
  collisions, enemy ticks, attacks, HP and cooldowns are validated server-side.
- Each floor gets one unique completion receipt; the final one is a boss receipt.
- Forbidden Keys are consumed atomically at keyed-run start and authorize only
  server-created forbidden chests; Anonymous Contracts settle only from the final
  floor receipt.
- Vault claims consume one exact `DungeonVaultProof` ID via a unique claim receipt.
- Exit, death loss, Loot Bag creation, return position and death token are
  authoritative. See `docs/DUNGEON_SYSTEM.md`.
