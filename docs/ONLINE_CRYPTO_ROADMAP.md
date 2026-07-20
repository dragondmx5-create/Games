# Online and Token Roadmap

This roadmap is ordered by trust dependency, not by marketing value. A token bridge is last because no external value should be attached while a browser can mint, destroy or transfer persistent game value.

## Current status

| Phase | Status | Current boundary |
|---|---|---|
| Phase 1 — shared bounded world | Substantially complete | One global seed, 121 shared regions, canonical resource/chest identities and durable shared state |
| Phase 2 — online presence and overworld authority | Authoritative single-process path complete | Same-region presence, shared topology collision and authoritative combat/death/loot; seamless horizontal routing remains |
| Phase 3 — in-world conflict and The Underway | Authoritative single-process path complete | Underway and Fracture/Lost gate handoffs use backend-owned sessions, rooms and settlement |
| Phase 4 — authoritative economy | Advanced, not complete | Active overworld and Dungeon faucets/sinks are server-owned; wild hunting and player transfer paths remain disabled or incomplete |
| Phase 5 — token bridge | Scaffold only | Internal ledger exists; custody, service authentication, limits, monitoring and legal launch work remain |

## Phase 1 — Shared bounded world

Delivered:

- one backend-owned global world seed;
- deterministic 11×11 world shared by every account;
- six authored lands and matching region gates;
- stable server/client resource, enemy and chest identities;
- PostgreSQL state for shared resource depletion, enemy lives and chest lifecycle;
- persistent world position and canonical region identity.

The world does not reroll when a player dies. Death changes player state, not world geography.

## Phase 2 — Presence and authoritative overworld simulation

Delivered foundation:

- authenticated `/ws/world` presence;
- server reconnect checkpoint;
- sequence, speed, bounds and edge-transition validation;
- shared deterministic rock/brick topology and swept player-radius collision validation;
- canonical matching openings on both sides of every region edge;
- normalization of legacy checkpoints trapped inside newly authoritative solids;
- session ownership preventing stale-tab writes;
- deterministic server enemy instances;
- server attack intent, weapon, cooldown, HP and death;
- atomic loot, XP, quest progress and regional loss;
- server Loot Bags and death-token respawn;
- production Origin checks and WebSocket message-rate limits.

Remaining:

- coordinate active rooms and routing across multiple backend processes;
- expand social presence only after authoritative simulation remains stable under load.

## Phase 3 — In-world conflict and The Underway

Delivered:

- separate title-screen Red Zone entry retired;
- Fracture and Lost Territory routes represented in the overworld;
- one shared Underway hub with six regional entrances;
- presence-gated, expiring Underway sessions;
- backend-owned rotation, prices, reputation and purchase settlement;
- canonical route, key, contract and protection state.
- presence-gated Fracture/Lost admission at the exact canonical portal;
- leased regional PvP rooms with server movement, collision, combat and HP;
- revisioned canonical inventory carry and mutation lock for the duration of a PvP session;
- atomic Fracture/Lost death transfer, destruction, Vault contribution and unique victim receipt;
- live extraction checks, authoritative death token and exact return/relocation flow;
- legacy `/ws/redzone` retired with `410 Gone`.

Remaining:

1. sticky routing or redirect/pub-sub coordination for seamless multi-process room handoff;
2. abuse telemetry and production load testing for regional PvP.

## Phase 4 — Server-authoritative economy

### Delivered

#### Canonical inventory

- normalized server stacks and equipment;
- revisioned commands;
- idempotent receipts;
- serializable settlement;
- one-time import from legacy saves;
- server catalog for items, recipes and regular shop offers;
- no public generic grant endpoint.

#### Active authoritative faucets and sinks

- regular purchase, crafting and equipment changes;
- shared harvesting and resource respawn;
- overworld combat loot and progression;
- player death loss and Loot Bag recovery;
- shared world chests and Supply Crates;
- daily quest progress and claims;
- farming and settlement animal production;
- Underway purchases and state;
- guarded Vault boundary.

#### Save demotion

After canonical records exist, browser Cloud Save cannot overwrite inventory, equipment, HP, XP, level, death bags or Underway economic state.

### Fail-closed boundaries

Legacy client-authored Dungeon saves, pickups and Loot Bags remain fail closed. The active Dungeon path is server-authoritative: rewards, Forbidden Keys, Anonymous Contracts and proof-specific Vault claims settle only from server run records and receipts.

Wild animal hunting is still economically disabled until wildlife instances are server-owned.

### Remaining Phase 4 work

#### Completed — Authoritative Dungeons

Server-issued runs/floors, canonical topology, movement/collision, enemies/chests/bosses, rewards, unique receipts, key/contract settlement, proof-ID Vault claims and authoritative death/exit are implemented. See `SERVER_AUTHORITY_DUNGEON_REPORT.md`.

#### Completed — Overworld topology collision

`server/src/world/overworldTopology.ts` now generates the canonical obstacle map imported by the browser and independently used by `/ws/world`. Every same-region movement is swept against player-radius walkability, region changes require matching shared openings, and invalid legacy checkpoints are normalized.

#### Completed — Fracture/Lost regional PvP

World gates now create durable blocking `PvpSession` records, acquire one regional room lease, carry canonical inventory, and suspend overworld authority. The room owns movement, collision, weapon/cooldown/damage/HP decisions. Death settlement, Vault contribution, unique receipts, extraction and death return are server-authoritative and idempotent.

#### P1 — Scale and wildlife

- room leases or sticky ownership for multiple backend processes;
- shared event distribution or Redis-style coordination;
- server wildlife populations, hunting damage and loot receipts;
- load testing and abuse telemetry.

Only after these are complete should direct player trading, marketplace settlement or regional economic arbitrage be enabled.

## Phase 5 — Token bridge

A separate custody service must own wallet keys. The game server must never hold them.

Required before activation:

- signed service-to-service requests using mTLS or rotated HMAC keys;
- caller allowlists and independent credentials;
- idempotent deposits and withdrawals;
- withdrawal limits, cooling periods and manual-review thresholds;
- immutable audit and reconciliation;
- monitoring, alerting and incident procedures;
- custody isolation and key rotation;
- jurisdiction-specific legal, tax, consumer-protection and KYC/AML review.

The current internal ledger is only a scaffold and must not be described as a production token bridge.

## Immediate next milestone

Add seamless horizontal routing/coordination for active world and PvP rooms, then migrate wild-animal hunting to durable server-owned instances. Token work remains blocked on the separate custody/security/legal layer.
