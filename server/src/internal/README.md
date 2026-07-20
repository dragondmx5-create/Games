# `internal/` — service-only endpoints

Endpoints intended for internal/service callers, intentionally separated from
browser routes. These need stronger service authentication before any token
bridge is activated.

| File | Responsibility |
|---|---|
| `routes.ts` | `/internal/*` service endpoints. |
| `middleware.ts` | Internal API-key authentication (`INTERNAL_API_KEY`). |
| `schema.ts` | Request validation. |

## Invariants

- Internal routes are not browser routes and bypass the browser Origin guard by
  design — they are gated by the internal API key instead.
- Custody/withdrawal/token features must not ride on these until signed internal
  requests and controls exist (see `docs/PROJECT_ISSUES.md`).
