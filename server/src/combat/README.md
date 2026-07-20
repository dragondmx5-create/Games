# `combat/` — overworld combat authority

Server-owned overworld combat. Clients send **attack intent only**; weapon,
range, arc, cooldown, damage, HP, death and reward are all server-owned.

| File | Responsibility |
|---|---|
| `catalog.ts` | Enemy stats, aggro/attack ranges, respawn timers, XP and drops. |
| `layout.ts` | Deterministic enemy spawn identities per region. |
| `coordinator.ts` | Ticks enemy state, routes attack intents, broadcasts snapshots. |
| `service.ts` | Damage application, death, and reward settlement. |
| `domain.ts` | Pure combat math (arc/range/damage). |
| `enemyState.ts` | Persistent per-enemy HP / generation / respawn state. |
| `protocol.ts` | Attack-intent + snapshot message shapes. |

## Invariants

- One reward receipt per enemy life; loot + XP + level + kill count + quest
  progress settle in a single transaction (via `inventory/`).
- Player HP, armor reduction, death token and combat cooldown are server-owned.
- Loot Bags have location, expiry and one-time recovery.
- See `docs/SERVER_AUTHORITATIVE_COMBAT.md`.
