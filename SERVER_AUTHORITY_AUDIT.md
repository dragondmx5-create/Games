# Server Authority Audit

Date: 2026-07-13

## Goal

Any action that creates, destroys, transfers, unlocks, or proves persistent value must be decided and committed by the backend. The browser may predict presentation, submit bounded intent, and display returned snapshots, but it must not choose rewards, damage, progression, prices, inventory deltas, collision acceptance, quest progress, NPC outcomes, mining state, Dungeon mechanics, or death settlement.

## Authoritative production paths

### Account and session

- HTTP-only access and refresh cookies.
- Refresh-token rotation with concurrent-use protection.
- Authenticated REST and WebSocket channels.
- Production Origin validation for unsafe browser requests and WebSocket upgrades.
- Per-connection WebSocket message-rate limits.

### World identity, topology, and presence

- One global world seed.
- `server/src/world/overworldTopology.ts` generates canonical region tiles, obstacles, portals, and matching border openings.
- The browser imports the same pure generator for rendering; `/ws/world` independently regenerates and validates it.
- `PlayerWorldPosition` is the durable source of truth for overworld position.
- Every same-region move is swept against player-radius walkability; crossing rock or brick between valid endpoints is rejected.
- Region changes require walkable endpoints at the matching canonical opening.
- Invalid legacy checkpoints are normalized to the nearest canonical walkable point.
- Session-scoped writes prevent an older tab from overwriting a newer connection.
- Server-selected relocation requires a server-issued death token.

### Inventory and economy

- `PlayerInventory` and `InventoryStack` are canonical.
- Every mutation uses a serializable inventory transaction, revision check, and per-account idempotency receipt.
- Exact retries replay the original result after row locks.
- The client cannot submit arbitrary positive deltas.
- Purchases, crafting, equipment, rewards, and death losses are authoritative.
- SaveGame economic fields are overwritten from canonical state after migration.
- Active Dungeon or PvP sessions lock unrelated inventory commands fail closed.

### Shared harvesting and mining

Harvesting remains authoritative: resource identity, coordinate, yield, respawn, distance, region, tool ownership, depletion, reward, XP, and quest event are validated and committed atomically.

Mining now follows the same authority boundary with multi-strike shared state:

- `server/src/world/miningLayout.ts` deterministically derives iron veins, crystal geodes, and ancient seams from world seed and region.
- Placement is checked against canonical walkability and kept away from harvesting nodes, settlements, portals, and other veins.
- `WorldMiningState` owns integrity, cooldown, extraction count, and last miner.
- A strike accepts only canonical node ID, inventory revision, and idempotency key.
- Fresh presence, region, distance, pickaxe ownership, cooldown, and row-locked integrity are revalidated.
- Every accepted strike is an inventory-ledger command; only the collapsing strike creates a reward.
- Collapse reward, cooldown, XP, extraction count, and one deduplicated story event commit together.
- Exact retries cannot consume extra integrity or mint a second reward.

### Overworld combat and death

- Enemy identities and spawn definitions are server-derived.
- The client submits only attack intent, ability flag, and facing.
- Weapon, damage, range, arc, cooldown, armor reduction, HP, enemy life generation, and respawn are server-owned.
- `WorldEnemyKill` is unique per enemy life.
- Loot, XP, level, kill count, and quest progress commit atomically.
- Regional loss and recoverable death bags settle against canonical inventory.
- Respawn requires a server-issued death token.

### Chests and containers

- Shared chest layout and lifecycle are server-derived.
- Open count and respawn are durable.
- Reward, XP, quest event, and inventory update are atomic.
- Supply Crates are consumed and rolled by the server.

### Daily and story quests

- Daily definitions and UTC cycle keys are server-owned.
- `PlayerQuestEvent` deduplicates verified gameplay receipts.
- The browser cannot submit progress or event amounts.
- A multi-stage story layer is stored in `PlayerStoryQuest`.
- The current story arc verifies, in order: authoritative kills, canonical collection/mining, distinct validated region travel, Dungeon floor completion, and an Archivist interaction.
- Distinct travel keys are stored server-side and repeated region events do not inflate progress.
- Story completion does not directly mint value; the final reward is claimed through the canonical inventory ledger with expected revision and idempotency.
- Quest claims acquire locks in the same canonical order as event emitters (`inventory` before objective state), then re-check replay after the inventory lock to prevent deadlock and concurrent duplicate claims.
- Reward inventory, XP, claim state, and replay receipt commit in one serializable transaction.

### Canonical NPC interactions

- Settlement NPC identity, role, name, and anchor are generated from canonical world topology.
- The active roles are merchant, Archivist, and scout.
- Interaction accepts only `npcId` and an idempotency key.
- The server validates the NPC definition, fresh world presence, region, and exact interaction distance.
- `NpcInteractionReceipt` stores the result and safely replays retries.
- Dialogue and reaction are selected from current server state after locks.
- The Archivist reads story state and emits the final verified story event; the merchant UI opens only after a successful receipt.
- Dynamic NPC patrol is fail-closed: canonical NPC anchors are stationary until a server-owned motion stream exists.

### Settlement production

- Farm plots and settlement animals use deterministic server-issued IDs and positions.
- Plant, harvest, and animal collection validate presence and distance.
- Growth/readiness timers use server timestamps.
- Costs, yields, XP, inventory revision, and retry behavior are server-owned.

### The Underway Black Market

- Admission requires fresh world presence in the correct route.
- The server issues a short-lived session token.
- Rotation, reputation, prices, rewards, and state effects are server-owned.
- Purchases settle through canonical inventory.
- Client Save underworld fields are presentation-only after canonical state exists.

### Authoritative Dungeons and Vault

- Run and floor seeds, topology, checksums, movement, collision, HP, enemies, bosses, chests, rewards, receipts, and return points are server-owned.
- Topology v2 adds checksummed floor themes, variable room shapes, floor variants, and canonical hazards.
- Themes include crypt, flooded, crystal, foundry, frost, and thorn, each with a server-owned mechanic.
- Movement slow and hazard damage are applied in Dungeon commands, never inferred by the client.
- A player cannot freeze environmental damage by withholding commands: the next command applies every elapsed hazard cadence up to lethal damage.
- Leaving a damaging hazard clears its cadence so an old timer cannot leak into another area.
- Reward-bearing chest commands settle pending enemy and environmental damage before granting loot; lethal catch-up commits death state and mints no chest reward.
- Theme-specific enemy pools and deterministic elite affixes (`swift`, `armored`, `venomous`) affect speed, cooldown, damage, mitigation, XP, and rewards only on the server.
- Commands use run revision and a per-user idempotency ledger with post-lock replay checks.
- Floor receipts are unique per run/floor; final receipts are boss receipts.
- Forbidden Keys and Anonymous Contracts settle only inside locked run transactions.
- Vault claims require one exact `DungeonVaultProof` owned by the caller.
- Exit, death loss, Loot Bag creation, death token, and return are authoritative.

### Fracture and Lost Territory PvP

- Admission requires fresh presence within the exact canonical red/black gate radius.
- A durable, mutually exclusive `PvpSession` captures source/return position, HP, risk tier, room identity, and canonical inventory snapshot/revision.
- Admission suspends overworld authority; reconnect or forged visibility cannot reactivate it while blocking.
- Each route maps to a deterministic room key and one expiring `PvpRoomLease` owner.
- Motion, HP persistence, extraction, and death settlement re-check the current unexpired owner-scoped lease in SQL.
- `/ws/pvp` accepts only admission token and strict movement/attack intent.
- Arena topology, collision, weapon profile, cooldown, armor, damage, and HP persistence are server-owned.
- Persistence uncertainty disconnects rather than inventing a local rollback.
- Fracture/Lost death loss, killer transfer, destroyed overflow, Vault contribution, combat stats, and unique `PvpDeathReceipt` commit atomically.
- Exit requires a live room-owned state inside the extraction beacon and stationary for the server interval.
- Death return requires the exact death token; normal extraction returns to the recorded gate checkpoint.

## Presentation-only WebGL2 effects

The visual expansion does not create a second gameplay authority path:

- Scene GLSL mode 4 renders procedural water and canonical shoreline foam.
- Scene GLSL mode 5 renders sword/combat arcs.
- Scene GLSL mode 6 renders bounded glow particles used by environment and Dungeon hazards.
- Postprocessing adds quality-scaled bloom, damage chromatic response, light scattering, fog, grain, and vignette.
- Low/Medium/High budgets cap particles, lights, water complexity, and glow.
- These shaders consume already-authoritative state; they never calculate collision, damage, rewards, or progress.

## Fail-closed legacy and incomplete paths

- Legacy client Dungeon saves, seeds, mutations, pickups, and bags cannot resume a run or create value.
- A stored Dungeon topology from an older generator whose checksum no longer matches v2 is rejected rather than silently reinterpreted. Deployments should drain active v1 runs before rollout.
- The old `/ws/redzone` endpoint returns `410 Gone`; `RedZonePlayer` remains only isolated migration/internal scaffolding.
- NPC patrol remains stationary until server motion exists; there is no local fallback.
- Missing presence, stale revision, unavailable room lease, uncertain persistence, invalid receipt, depleted resource, or incomplete quest rejects the action.
- Server builds remove `server/dist` before TypeScript compilation, and Vitest excludes compiled output, so stale backend code cannot satisfy tests or remain as a runnable fallback after a failed build.

`scripts/check-authority-boundary.cjs` now prevents regression of the existing overworld/PvP/Dungeon boundaries and additionally checks story-event authority, NPC receipts/proximity, mining row locks and intent-only schemas, Dungeon v2 hazard/affix application, migrations, router mounting, and use of the existing quality-bounded WebGL2 pipeline.

## Remaining authority gaps

No new browser-authored economy path was introduced by the quest, NPC, Dungeon, mining, or GLSL expansion.

| Priority | Gap | Risk | Required work |
|---|---|---|---|
| P1 | Seamless horizontal PvP room routing | Leases prevent split-brain writes, but a client connected to a non-owner backend cannot be transparently redirected | Sticky routing or signed owner redirects plus Redis/pub-sub or equivalent coordination |
| P1 | Wild animal hunting | Settlement production is authoritative; combat hunting remains disabled rather than migrated | Server wildlife instances, damage, population, and loot receipts |
| P1 | PvP assist/disconnect policy depth | Kill settlement and reconnect are authoritative, but assists and long-disconnect forfeiture are not reward-bearing | Server-owned assist windows and explicit timeout/forfeit receipts |
| P2 | Dynamic NPC locomotion | Interactions and reactions are authoritative, but patrol motion is intentionally stationary/fail-closed | Server NPC tick/lease or shared motion stream with proximity validation against current position |
| P2 | Local lifetime statistics | Cosmetic statistics remain browser-managed and are not trusted for rewards | Server event analytics before leaderboards or rewards use them |
| P2 | Token service | Internal ledger is only a scaffold | Separate custody service, signed calls, limits, monitoring, reconciliation, and legal controls |

## Changes in this expansion

- Added quality-aware GLSL water, combat arc, glow particle, bloom, damage, and light-scattering effects on the existing WebGL2 pipeline.
- Added persistent multi-stage story arcs driven only by deduplicated server events.
- Added revisioned/idempotent final story reward claims.
- Added canonical NPC layout, proximity validation, state-reactive dialogue, and interaction receipts.
- Disabled local NPC patrol until authoritative movement exists.
- Added deterministic mining layout, row-locked multi-strike integrity, canonical cooldown, and idempotent collapse rewards.
- Added Dungeon topology v2 with themes, hazards, elite affixes, and server-applied mechanic effects.
- Added elapsed hazard catch-up to prevent command-silence freezing and pre-reward threat settlement for Dungeon chests.
- Added pure story transition tests for ordered stages, distinct travel, Archivist filtering, and final completion.
- Standardized quest claim lock order and post-lock replay checks.
- Added stale-build hygiene: backend build cleans `dist`, tests exclude compiled output, and CI guards both invariants.
- Expanded pure tests and CI authority checks for every new boundary.

## Token-readiness conclusion

The implemented overworld, Dungeon, Fracture/Lost PvP, story quest, NPC interaction, and mining economy paths are server-authoritative on the current execution architecture. The project is still **not token-ready**: seamless horizontal coordination, wildlife authority where enabled, dedicated custody/security controls, observability, reconciliation, incident response, and jurisdiction-specific legal work remain mandatory before value can leave the game.

## Delivery verification

- Authority-boundary check: passed after the new story/NPC/mining/Dungeon/GLSL guards.
- Client tests: 99/99 passed in final delivery verification.
- Client production build and standalone artifact generation: passed in final delivery verification.
- Pure server tests: 116/116 passed across 33 files.
- Full server test discovery is source-only: the same 116 pure tests pass, while 8 PostgreSQL-backed suites fail to import because Prisma generation is unavailable in this environment; no compiled `dist` tests are discovered.
- Strict server source TypeScript check: passed.
- Fail-closed server build wrapper: verified against the unavailable-Prisma failure path; build exited non-zero and left no `server/dist` directory.
- Prisma validation/generation is blocked by DNS resolution for `binaries.prisma.sh` (`EAI_AGAIN`), so generated-client build and PostgreSQL-backed suites are not reported as successful.
