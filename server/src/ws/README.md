# `ws/` — socket protections

Shared protections for WebSocket connections (`/ws/world`, PvP, dungeon).

| File | Responsibility |
|---|---|
| `rateLimit.ts` | Per-connection message-rate limiting (token bucket). |

## Invariants

- WebSockets retain per-connection message-rate limiting.
- Production WebSocket upgrades pass the configured Origin guard
  (`middleware/originGuard.ts`).
