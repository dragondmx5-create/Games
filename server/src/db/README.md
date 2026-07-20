# `db/` — transactions

Database transaction helpers on top of Prisma.

| File | Responsibility |
|---|---|
| `transaction.ts` | Runs work inside a serializable PostgreSQL transaction (with retry on serialization failure where required). |

## Invariants

- Entity state and inventory settlement use serializable transactions where
  required, so concurrent commands cannot double-apply.
- The Prisma client itself lives in `server/src/db.ts`.
