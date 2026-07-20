# `underworld/` — The Underway (Black Market)

The shared Black Market network, reached through land-specific hidden routes.

| File | Responsibility |
|---|---|
| `catalog.ts` | Rotation, prices, reputation requirements and state effects. |
| `service.ts` | Session issuance, rotation, reputation and purchase settlement. |
| `routes.ts` / `schema.ts` | `/api/underworld/*` and validation. |

## Invariants

- Admission requires fresh presence at a valid route; the backend issues a
  short-lived Underway session.
- Rotation, prices, reputation and state effects are server-owned; purchases
  settle through canonical inventory.
- Route, key, contract and protection state cannot be overwritten via Cloud Save.
- See `docs/SERVER_AUTHORITATIVE_UNDERWORLD.md`.
