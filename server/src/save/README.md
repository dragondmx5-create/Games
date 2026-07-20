# `save/` — Cloud Save (cache only)

Once canonical database state exists, Cloud Save is a **presentation and
compatibility cache**. It cannot overwrite inventory, equipment, HP, XP, level,
death bags or the Underway economy.

| File | Responsibility |
|---|---|
| `canonicalize.ts` | Reconciles an incoming save against canonical state. |
| `audit.ts` | Records/inspects save reconciliation for debugging. |
| `routes.ts` / `schema.ts` | `/api/save` (GET/PUT, death) and validation. |

## Invariants

- Cloud Save never authors canonical value; it is superseded by database state.
- One-time imports from legacy Save v2/v3 are handled during migration only.
