# `quests/` — verified quests

Quest progress may be emitted **only** by verified gameplay services (kill,
harvest, chest). No public route accepts arbitrary progress increments.

| File | Responsibility |
|---|---|
| `catalog.ts` | Daily quest catalog and cycle keys. |
| `service.ts` | Progress accrual (from verified events), dedup, and atomic claims. |
| `storyDomain.ts` | Story/quest domain rules. |
| `routes.ts` / `schema.ts` | `/api/quests/*` (view + claim) and validation. |

## Invariants

- Gameplay events are deduplicated; claim rewards are atomic and settle through
  `inventory/`.
- Progress increments never originate from a public client route.
- See `docs/SERVER_AUTHORITATIVE_QUESTS.md`.
