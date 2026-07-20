# Implementation Status

## World and rendering

- Six authored lands across 121 deterministic regions.
- Six capitals and 24 minor/hidden settlements.
- Sanctuary, Frontier, Fracture and Lost Territory definitions.
- Twelve authored Dungeon definitions.
- WebGL2/GLSL main renderer and HTML/CSS UI.
- World map, portal network and The Underway hub.

## Server-authoritative systems

- Account/session security and Cloud Save validation.
- Canonical inventory, item catalog, shop, crafting and equipment.
- Server world position and same-region presence.
- Shared canonical overworld topology and swept rock/brick collision validation.
- Shared resource depletion and harvesting.
- Overworld enemy state, attack validation, loot and progression.
- Player HP, death loss, death tokens, Loot Bags and respawn.
- Shared world chests and Supply Crates.
- Daily quest event ledger and claims.
- Settlement farming and animal production.
- Black Market admission, state and purchases.
- Save canonicalization from database state.
- Production Origin guards and WebSocket rate limits.
- Dungeon run/floor seeds, topology, movement/collision and revisioned command ledger.
- Dungeon enemies, bosses, chests, rewards, floor/boss receipts and exact return.
- Forbidden Key and Anonymous Contract settlement inside Dungeon transactions.
- Proof-specific Vault claims and authoritative Dungeon exit/death settlement.
- Dungeon runs suspend overworld presence; websocket reconnect/rejoin is blocked by the durable run state.
- Fracture/Lost gate admission, durable blocking sessions and leased regional rooms.
- PvP movement/collision/combat, canonical carried inventory, unique death receipts and exact exit/death return.
- PvP sessions suspend overworld authority and lock unrelated inventory mutations.

## Fail-closed compatibility paths

- Legacy client-authored Dungeon saves cannot resume or prove a run.
- Legacy Dungeon bags are stripped and contribute zero Vault value.
- Generated local Dungeon weapon pickups remain disabled.
- Legacy `/ws/redzone` returns `410 Gone`; `RedZonePlayer` is isolated from active gameplay.
- Wild animal hunting remains non-economic until wildlife instances are server-owned.

## Remaining backend milestones

1. Seamless horizontal room routing/coordination for multiple backend processes; leases already reject split ownership.
2. Shared authoritative wildlife hunting/population.
3. PvP assist and long-disconnect forfeiture rules before either becomes reward-bearing.
4. Trading/marketplace after all transfer paths are authoritative.
5. Separate hardened token custody service last.

The two former P0 items—complete overworld collision and Fracture/Lost canonical PvP handoff—are implemented. Remaining room work is scale/operations hardening, not a local gameplay fallback.

## Verification commands

```bash
npm run check:authority
npm test -- --run
npm run build
npm run artifact
npm --prefix server run test:pure
npm --prefix server run typecheck:source
```

Run Prisma generation, migrations, the full server suite and server build in connected CI with PostgreSQL.
