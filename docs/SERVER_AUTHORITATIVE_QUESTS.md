# Server-Authoritative Quests

## Daily objectives

Daily objectives remain server-owned, keyed by a UTC cycle, and stored in `PlayerQuestProgress`. The browser can list them and request a claim; it cannot submit progress.

Verified services emit deduplicated `PlayerQuestEvent` rows for enemy kills, harvesting, world chests, travel, Dungeon floors, NPC interactions, and mining. Replaying the same gameplay receipt cannot advance an objective twice.

## Story arcs

`server/src/quests/catalog.ts` now defines ordered story arcs in addition to dailies. The first arc, **Echoes Beneath the Crown**, contains five stages:

1. defeat authoritative enemies;
2. gather canonical resources or collapse mining veins;
3. enter distinct regions through validated transitions;
4. complete an authoritative Dungeon floor;
5. return to a canonical Archivist NPC.

`PlayerStoryQuest` stores the current stage, bounded progress, distinct-event state, completion, and claim time. Only the current stage consumes matching verified events. Distinct travel uses server region keys, so reconnects or repeated visits do not inflate progress.

## Claim and failure behavior

The final story reward is claimed through the canonical inventory command ledger with `expectedRevision` and an idempotency key. Inventory, XP, claim state, and the replay receipt commit in one serializable transaction.

Unknown stories, incomplete stages, stale inventory revisions, reused idempotency keys with different payloads, and client-authored progress all fail closed. The client HUD is only a projection of `/api/quests`.
