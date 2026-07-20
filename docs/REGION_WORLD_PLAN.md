# Region World Architecture — Implemented

This document replaces the earlier single-home-region plan.

## Geometry

- `WORLD_RADIUS = 5`
- Coordinates range from `-5` to `+5` on both axes.
- Total regions: `11 × 11 = 121`.
- Each region is deterministic from the global seed and coordinates.
- Shared-edge gate positions are deterministic and unit-tested.

## Ownership

`regionProfileAt(rx, ry)` resolves:

- Land ownership.
- Region and district name.
- Settlement, if present.
- Features and portals.
- Risk tier and rules.
- Generation and visual profile.
- Wildlife identity.

## Persistence

Every departed region is reduced to replayable mutations. The currently loaded region owns its live mutations. Dungeon floors and the Black Market are separate instance modes.

## Discovery

The world map displays visited and default-discovered regions. Hidden information can be revealed through exploration or Black Market maps.
