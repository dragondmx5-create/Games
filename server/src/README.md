# `server/src/` — authoritative backend

Node.js + Express + PostgreSQL (Prisma) + WebSocket (`ws`). This is where every
persistent value is decided: inventory, prices, damage, HP, XP, progression,
death, and completion proof. The client sends intent; the server settles it.

## Entry

| File | Responsibility |
|---|---|
| `index.ts` | Process entry: build the app, open sockets, start background jobs. |
| `app.ts` | Express app assembly: middleware order, route mounting. |
| `env.ts` | Zod-validated environment configuration. |
| `db.ts` | Prisma client instance. |

## Domains

| Folder | Responsibility | Docs |
|---|---|---|
| [`auth/`](auth/README.md) | Accounts, cookies, JWT, refresh rotation. | |
| [`inventory/`](inventory/README.md) | Canonical stacks, commands, idempotency, transactions. | `docs/SERVER_AUTHORITATIVE_INVENTORY.md` |
| [`economy/`](economy/README.md) | Item / recipe / shop catalog and loot valuation. | |
| [`world/`](world/README.md) | World seed, position, presence, resources, mining, chests, NPCs, settlements, topology. | `docs/SERVER_AUTHORITATIVE_*` |
| [`combat/`](combat/README.md) | Enemies, attack validation, HP, death, Loot Bags. | `docs/SERVER_AUTHORITATIVE_COMBAT.md` |
| [`quests/`](quests/README.md) | Verified quest progress and claims. | `docs/SERVER_AUTHORITATIVE_QUESTS.md` |
| [`underworld/`](underworld/README.md) | The Underway Black Market sessions. | `docs/SERVER_AUTHORITATIVE_UNDERWORLD.md` |
| [`dungeon/`](dungeon/README.md) | Authoritative dungeon runs, topology, rewards, proofs. | `docs/DUNGEON_SYSTEM.md` |
| [`pvp/`](pvp/README.md) | Fracture/Lost admission, rooms, carry, settlement. | |
| [`save/`](save/README.md) | Save validation and canonicalization (cache only). | |
| [`vault/`](vault/README.md) | Proof-bound Vault claims. | |
| [`ws/`](ws/README.md) | Per-connection socket protections. | |
| [`middleware/`](middleware/README.md) | CORS, Origin guard, rate limit, error handling. | |
| [`internal/`](internal/README.md) | Service-only endpoints, separated from browser routes. | |
| [`db/`](db/README.md) | Serializable transaction helper. | |

## Cross-cutting invariants

- Every persistent inventory mutation passes through `inventory/service.ts`.
- Commands use optimistic revisions + replayable idempotency receipts.
- Entity-locking commands re-read the receipt after the lock before returning an
  already-completed conflict.
- Active Dungeon or PvP sessions are mutually exclusive and suspend overworld
  authority; canonical mutations outside the owning instance fail closed.

## Verification

```bash
npm run test:pure          # no database required
npm run typecheck:source
npm run prisma:generate && npm test && npm run build   # needs Postgres + engines
```
