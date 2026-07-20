# `auth/` — accounts & sessions

Account creation, login, and session management. Accounts are mandatory; the
game cannot boot without a backend session.

| File | Responsibility |
|---|---|
| `routes.ts` | `/api/auth/*` — register, login, logout, refresh, me, change-password. |
| `password.ts` | Password hashing and verification. |
| `jwt.ts` | Access/refresh token signing and verification. |
| `cookies.ts` | HTTP-only cookie issuance (access + refresh), security flags. |
| `middleware.ts` | Auth guard that resolves the current account for protected routes. |
| `cleanup.ts` | Background pruning of expired refresh tokens. |

## Invariants

- Access and refresh tokens are HTTP-only cookies; refresh tokens rotate.
- Login/register/refresh/logout never auto-refresh (a failure there is a real
  credential failure).
- Unsafe mutations and WebSocket upgrades are Origin-checked in production
  (see `middleware/originGuard.ts`).
