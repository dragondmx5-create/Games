# `world/` — overworld authority

The largest server domain: world seed, player position/presence, and every
shared canonical world object (resources, mining, chests, NPCs, settlements)
plus the deterministic collision topology.

## Position & presence

| File | Responsibility |
|---|---|
| `positionService.ts` | `PlayerWorldPosition` ownership after one-time migration. |
| `presence.ts` | Same-region player snapshots. |
| `relocationService.ts` | Relocating invalid legacy checkpoints to canonical walkable points. |
| `socket.ts` / `protocol.ts` | `/ws/world` channel + message protocol. |
| `overworldTopology.ts` | Shared deterministic collision authority; movement is swept against it. |

## Canonical world objects

| Area | Files |
|---|---|
| Resources / harvest | `resourceLayout.ts`, `resourceService.ts`, `resourceRoutes.ts`, `resourceSchema.ts`, `regionResourceProfiles.ts` |
| Mining | `miningLayout.ts`, `miningDomain.ts`, `miningService.ts`, `miningRoutes.ts`, `miningSchema.ts` |
| Chests / crates | `chestLayout.ts`, `chestDomain.ts`, `chestService.ts` |
| NPCs | `npcLayout.ts`, `npcService.ts`, `npcRoutes.ts`, `npcSchema.ts` |
| Settlements / animals / farms | `settlementLayout.ts`, `settlementService.ts`, `settlementRoutes.ts`, `settlementSchema.ts`, `landLocations.ts` |
| Shared plumbing | `service.ts`, `routes.ts`, `layoutRandom.ts` |

## Invariants

- `resourceLayout.ts` owns canonical resource identity — never accept resource
  coordinates, kind or yield from a client.
- Enemy/chest/farm/animal identities derive from canonical layouts, not
  browser-provided definitions.
- `/ws/world` re-sweeps every accepted movement against `overworldTopology.ts`;
  region transitions must use matching canonical edge gates.
- Economic validators use fresh server presence, not SaveGame coordinates.
- See `docs/SERVER_AUTHORITATIVE_HARVESTING.md`, `_MINING.md`, `_NPCS.md`,
  `_SETTLEMENTS.md`.
