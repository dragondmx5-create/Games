# UNDRAL Landmark Architecture — Implementation Report

## Delivered

- Fortified all six capital settlements with deterministic perimeter walls, four corner towers, and one gatehouse aligned to a real canonical path opening.
- Added one deterministic standalone keep region per land, deliberately outside settlements and feature regions.
- Added path-aware bridges, an Emberport shoreline dock, and sparse road markers.
- Added rare monuments and ruined towers to general overworld prop scattering.
- Added all new prop kinds to the existing `PropKind` → `Renderer` → `StylizedAssetFactory` pipeline.
- Preserved character, NPC, monster, and animal art unchanged.

## Procedural assets

New `StylizedAssetFactory` methods:

- `makeWallSection(length, palette)`
- `makeWallTower(palette)`
- `makeGatehouse(palette, width)`
- `makeKeep(palette, seed)`
- `makeBridge(span, palette)`
- `makeDock(length, palette)`
- `makeRoadMarker(palette, seed)`
- `makeMonument(palette, seed)`
- `makeRuinedTower(palette, seed)`

All fortress stone uses each land's existing `palette.rock` and `palette.brick`; bridge/dock timber uses `palette.path`.

## Placement rules

- Capital walls derive from canonical `world.townBounds` after server topology projection.
- Every real perimeter path crossing remains open; the gatehouse occupies one of those actual openings.
- Bridges are emitted only where existing path tiles cross water flanked on both sides.
- Emberport's dock is emitted only from a floor shoreline with at least five consecutive water tiles outward.
- Keeps use seed-derived, non-settlement, feature-free regions and require a large clear walkable footprint away from portals, entrances, and resource nodes.
- Monuments and ruined towers use low-frequency deterministic scatter.

## Verification

Passed:

- `npm run verify`
- `npm --prefix server run test:pure`
- `npm --prefix server run typecheck:source`
- `npm run artifact`
- 113 client tests
- 120 server pure tests
- Multi-seed landmark placement sweep: 42 land/seed cases
- Existing authority-boundary, PBR texture, advanced-rendering, and procedural-art validators

The procedural-art validator now instantiates and checks geometry, UV/PBR coverage, contact shadows, triangle counts, and finite bounds for every new landmark asset.

## Visual verification caveat

The app loaded in sandboxed Chromium after temporarily allowing localhost and using Xvfb, but the real WebGL harness stalled under the environment's SwiftShader software-rendering path before CDP could capture a trustworthy gameplay screenshot. Browser policy was restored immediately. No visual screenshot is claimed as verified; real-GPU gameplay-camera review remains recommended.

## Gameplay scope

The keep is decorative in this pass. No loot tiers, enemy balance, collision authority, or combat hooks were guessed or changed.
