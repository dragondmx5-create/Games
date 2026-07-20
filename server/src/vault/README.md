# `vault/` — proof-bound Vault claims

The guarded loss pool. Vault claims settle only from locked rows and unique
server proofs.

| File | Responsibility |
|---|---|
| `service.ts` | Claim settlement from a locked proof row via a unique claim receipt. |
| `routes.ts` / `schema.ts` | `/api/vault/*` (view, proofs, claim) and validation. |

## Invariants

- A Vault request identifies **one exact proof ID**; client save layer/seed/
  mutations are never eligibility.
- Forbidden Keys, Anonymous Contracts and Vault claims settle only from locked
  Dungeon/PvP rows and unique proofs.
