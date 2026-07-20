# Server Authority Phase 3 Report

> Historical milestone report. Its former “next PvP milestone” is now implemented; see `SERVER_AUTHORITY_AUDIT.md` for the current authority boundary.

Date: 2026-07-13

## Scope

This phase migrated the largest remaining active value paths from client simulation to server-owned commands and made unported Dungeon rewards fail closed.

## Delivered systems

### Authoritative overworld combat

- Deterministic enemy IDs and server catalog.
- Authenticated attack intents over `/ws/world`.
- Server-derived weapon damage, range, arc, cooldown and armor reduction.
- Durable enemy HP/generation/respawn in PostgreSQL.
- One reward receipt per enemy life.
- Atomic inventory reward, XP, level, kill count and quest progression.
- Server-owned player HP, death token and combat cooldowns.
- Atomic regional loss and server Loot Bags.
- One-time bag recovery and capital respawn.

### Authoritative world containers

- Shared chest definitions and lifecycle.
- Persistent open count and respawn timestamps.
- Atomic chest reward, XP and quest progression.
- Server-owned Supply Crate consumption and reward.

### Authoritative progression and objectives

- Central combat progression service.
- Daily server quest catalog.
- Deduplicated verified gameplay events.
- Atomic quest claim rewards.

### Authoritative settlement production

- Deterministic farm plots and settlement animals.
- Server clocks for crop growth and animal readiness.
- Canonical seed cost, yield, XP and inventory settlement.

### Authoritative Underway economy

- Presence-gated admission.
- Expiring server session.
- Server rotation, reputation, price and rewards.
- Canonical Black Market purchases.

### Save demotion

Once canonical rows exist, Cloud Save cannot overwrite:

- inventory stacks;
- equipped weapon;
- HP, max HP, XP or level;
- Underway reputation, routes, keys, contracts or protection;
- canonical death bags.

### Fail-closed Dungeon economy at Phase 3 delivery

At the original Phase 3 delivery, before the follow-up Dungeon milestone was implemented:

- local kills mint nothing;
- local chests mint nothing;
- local pickups are disabled;
- local bags cannot be claimed;
- Vault, keys and contracts could not settle from client floor state.

This historical boundary has since been replaced by the authoritative service described in `SERVER_AUTHORITY_DUNGEON_REPORT.md`.

## Concurrency and security hardening

- Entity-locked commands re-read idempotency receipts after the lock.
- Kill quest events commit with the kill reward.
- Production HTTP mutations require the configured browser Origin.
- Production WebSockets require the configured Origin.
- World and Red Zone sockets use token-bucket message-rate limits.
- CI authority-boundary scanning detects reintroduced local reward functions or direct client item increments.

## New database models

- `PlayerCombatState`
- `WorldEnemyState`
- `WorldEnemyKill`
- `WorldLootBag`
- `WorldChestState`
- `PlayerUnderworldState`
- `PlayerQuestProgress`
- `PlayerQuestEvent`
- `PlayerFarmPlot`
- `PlayerAnimalState`

## Main modules

```text
server/src/combat/
server/src/quests/
server/src/underworld/
server/src/world/chest*.ts
server/src/world/settlement*.ts
server/src/ws/rateLimit.ts
server/src/middleware/originGuard.ts
```

## Verification performed

- Authority-boundary check: passed.
- Client tests: 95/95 passed across 15 files.
- Client TypeScript and Vite production build: passed.
- Standalone artifact: generated successfully.
- Pure server tests: 73/73 passed across 21 files.
- Strict server source TypeScript check: passed.
- ZIP integrity check: passed after packaging.

`prisma generate` was attempted and failed because the delivery environment could not resolve `binaries.prisma.sh` (`EAI_AGAIN`). Database-backed Prisma/PostgreSQL tests and the generated-client server build therefore did not run here. They must run in connected CI before deployment.

## Milestone completion addendum

The Dungeon milestone listed in the original Phase 3 report is now implemented:

1. server-issued run and floor seeds;
2. server-generated topology with checksum projection to the client;
3. server movement and collision;
4. server-owned enemy, boss and chest state;
5. unique floor and boss completion receipts;
6. atomic Forbidden Key and Anonymous Contract settlement;
7. proof-ID-bound Vault claims;
8. authoritative exit, death loss, Loot Bag and exact return.

See `SERVER_AUTHORITY_DUNGEON_REPORT.md`. The next gameplay authority milestone is the Fracture/Lost Territory PvP handoff using canonical carried inventory.
