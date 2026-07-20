# `inventory/` — canonical inventory

The one authoritative inventory per account. **Every** persistent inventory
mutation in the whole backend flows through here. Direct `InventoryStack` writes
outside migration/test utilities are forbidden.

| File | Responsibility |
|---|---|
| `service.ts` | The single mutation entry point: applies commands inside serializable transactions and returns canonical snapshots. |
| `commands.ts` | Command definitions (add/remove/craft/equip/purchase deltas). |
| `domain.ts` | Pure stack normalization and delta math. |
| `idempotency.ts` | Replayable command receipts for safe retries. |
| `schema.ts` | Zod request schemas. |
| `types.ts` | Shared inventory types + revisions. |
| `routes.ts` | `/api/inventory/*` — snapshot, catalog, craft, purchase, equip. |

## Invariants

- Public clients send action intent + idempotency metadata, never arbitrary
  positive deltas. There is no public grant endpoint.
- Commands carry optimistic revisions; stale commands conflict.
- Entity-locking commands re-read the receipt **after** the lock before
  returning an already-completed semantic conflict.
- See `docs/SERVER_AUTHORITATIVE_INVENTORY.md`.
