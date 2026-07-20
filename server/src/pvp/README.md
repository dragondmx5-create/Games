# `pvp/` — Fracture & Lost Territory

Regional open-world PvPvE. Admission, room leases, movement/combat, canonical
inventory carry, death receipts and return flow are all server-owned. The legacy
`/ws/redzone` path is retired and fails closed (`410 Gone`).

| File | Responsibility |
|---|---|
| `guard.ts` | Gate admission: requires fresh authoritative presence at the exact regional portal. |
| `rooms.ts` | One leased regional room per gate/risk route; split ownership fails closed. |
| `arena.ts` | Arena collision, movement, weapon profile, cooldown, armor, damage, HP. |
| `service.ts` | Death transfer, destruction, Vault share, exit and return settlement. |
| `socket.ts` / `protocol.ts` | Authoritative PvP socket + message shapes. |
| `routes.ts` / `schema.ts` | Admission endpoints and validation. |
| `domain.ts` | Pure admission/settlement rules. |

## Invariants

- The session carries a revisioned snapshot of canonical `PlayerInventory` and
  blocks unrelated inventory mutations while active.
- Death transfer, destruction and the layer-0 Vault share settle atomically with
  one victim receipt.
- Exit requires live room state, the extraction beacon and a stationary interval;
  death return uses the exact server-issued token to a server-selected capital.
