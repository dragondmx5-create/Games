# `economy/` — catalog & valuation

The backend authority for what items exist and what they are worth.

| File | Responsibility |
|---|---|
| `catalog.ts` | Authoritative item IDs, recipes and regular shop offers. |
| `lootValue.ts` | Canonical loot/value tables used by drop and settlement paths. |

## Invariants

- `catalog.ts` is the source of truth for item identity, recipes and shop
  offers; the client's catalog view is a copy fetched from here.
- Prices and recipe costs are server-owned — the client never computes them.
