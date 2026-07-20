# UNDRAL Art Quality V4 — House Composition and Town Plaza Pass

Date: 2026-07-19

## Scope

This pass addressed three located environment-art problems without changing character, NPC, enemy, or animal art and without changing persistent gameplay authority:

1. Window clustering and uneven opposing-wall density.
2. Wall-adjacent furniture that could float away from walls or conflict with windows.
3. Town plazas whose decoration count did not scale with settlement size.

A fresh visual assessment of the existing terrain shader was also performed. No terrain look change was shipped in this pass because the remaining complaint is subjective and needs user confirmation.

## 1. Deterministic, balanced house windows

### Root cause

Each wall segment independently used a roughly 66% window roll. The roll did not know its index along a side, opposing-wall density, doors, or furniture positions. Longer walls and random streaks could therefore produce obvious clusters.

### Fix

A new shared composition module, `src/art3d/houseComposition.ts`, plans the complete house before geometry is emitted:

- Opposing sides receive exactly equal window counts.
- Candidate arrangements enforce at least one solid panel between windows.
- Windows are selected around evenly spaced target positions.
- Seeded tie-breaking preserves procedural variation without allowing unbounded clustering.
- Door and furniture-backed segments are reserved as solid before windows are selected.

### Verification

The new test samples more than 100 canonical houses across an 11×11 region range and verifies:

- north window count equals south window count;
- east window count equals west window count;
- no adjacent windows on any side;
- every door and reserved furniture segment remains solid.

Real WebGL2 comparison renders were captured for two different house definitions/seeds. See `qa/windows-comparison.png`.

## 2. Wall-aware interior furniture

### Root cause

The fireplace, bookshelf, workbench, and barrel group used an independently tuned proportional interior rectangle. Wall panels used different constants, so varying house footprints could create gaps or clipping. Furniture placement also had no knowledge of windows behind it.

### Fix

The same house composition now provides both wall faces and furniture anchors:

- The actual inner wall-face coordinates are computed from the exact wall-panel geometry.
- Fireplace, bookshelf, bed, workbench, and barrels derive their placement from those coordinates.
- Explicit rotations make each piece face into the room consistently.
- The wall segments behind these pieces are reserved as solid before window selection.

### Verification

Tests mathematically cross-check every furniture offset against the corresponding wall face over the same large house sample. Two different houses were also rendered before and after. See `qa/interior-comparison.png`.

## 3. Size-scaled town plaza decoration

### Root cause

The previous town pass placed one statue and two pillars regardless of whether the settlement was a small hidden settlement or a capital.

### Fix

Town decoration is now deterministic and settlement-size aware:

| Settlement | Decoration budget |
|---|---:|
| Hidden | 5 |
| Outpost | 7 |
| Town | 11 |
| Capital | 15 |

New reusable environment props were added:

- town well;
- market stall;
- town bench;
- flower planter.

Existing lantern posts are also reused. Placement rejects candidates that overlap or obstruct:

- the central north/south and east/west through-routes;
- house footprints;
- paths from doors toward the plaza center;
- shop/NPC anchors;
- farms and animals;
- pens;
- other placed decorations.

The renderer now respects optional authored `rotationY` so benches, stalls, and planters can face the plaza rather than receive arbitrary rotation.

### Verification

Tests verify exact budgets for capital, town, outpost, and hidden settlements, deterministic repeat generation, and a clear 2.4-tile-wide central cross. Real WebGL2 comparison renders show a capital increasing from 3 to 15 decorations and an outpost increasing from 3 to 7. See `qa/plaza-comparison.png`.

## 4. Fresh terrain assessment

The V3 terrain material was rendered separately using the real `AdvancedTerrainMaterial`, real terrain atlas textures, the game lighting/tone-mapping setup, and a live WebGL2 SwiftShader context.

### Honest subjective read

Brightness is no longer the main issue, but the surface still has a noticeable square/checker rhythm at normal overview distance. The repeated soft green cells are coherent enough to read as grass, yet their frequency and alignment can compete with scenery and explain why the ground still feels visually irritating. This pass does **not** claim that taste issue is fixed. No terrain shader or texture changes were shipped; the screenshot is provided for user confirmation before a later tuning pass changes macro frequency, stochastic projection balance, or contrast.

See `qa/terrain-fresh-assessment.png`.

## Visual verification method and limitation

- WebGL2 contexts were live and not lost in all retained probes.
- House and plaza captures use the production `StylizedAssetFactory` geometry and production placement/composition data with simplified materials. The full cinematic composer saturated SwiftShader in this environment, so these captures verify geometry, spacing, orientation, silhouettes, and composition rather than final PBR/post-processing appearance.
- The terrain capture uses the real advanced terrain shader and real atlas textures without the heavy cinematic composer.
- Temporary probe files and temporary browser-policy changes were removed/restored before packaging.

## Required verification commands

All required commands passed on the final production tree:

```text
npm run check:authority   PASS
npm test -- --run         PASS — 19 files, 109 tests
npm run build             PASS — TypeScript + Vite, 1837 modules
npm run art:validate      PASS
```

Art validation details:

```text
76 PBR authoring textures
19 material sets
4 terrain atlases
seamless wrapping and 3×3 repetition QA passed
advanced rendering contracts passed
3D art validation passed
```

Full command output is in `UNDRAL_ART_QUALITY_V4_VALIDATION.log`.

## Production files changed

- `AI_MAP.md`
- `src/art3d/assets.ts`
- `src/art3d/houseComposition.ts` (new)
- `src/render3d.ts`
- `src/world.ts`
- `src/world/types.ts`
- `src/__tests__/houseComposition.test.ts` (new)
- `src/__tests__/townDecoration.test.ts` (new)

No server source file was changed. Character/monster/NPC/animal builder bodies were not changed.
