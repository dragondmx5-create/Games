# `middleware/` — Express middleware

Cross-cutting HTTP concerns applied in `app.ts`.

| File | Responsibility |
|---|---|
| `cors.ts` | CORS with credentials, scoped to `CORS_ORIGIN`. |
| `originGuard.ts` | Rejects unsafe (non-GET/HEAD/OPTIONS) mutations and WS upgrades whose `Origin` is not the trusted browser origin (in production). |
| `rateLimit.ts` | HTTP rate limiting. |
| `errorHandler.ts` | Central error-to-response mapping. |
| `httpError.ts` | Typed HTTP error helpers. |
| `asyncHandler.ts` | Wraps async route handlers so rejections reach the error handler. |
| `logging.ts` | Request logging. |

## Invariants

- CORS only controls response visibility; the Origin guard is what actually
  stops a forged cross-site mutation or WS upgrade.
- Internal service endpoints (`internal/`) are exempt from the browser Origin
  guard and use their own service authentication.
