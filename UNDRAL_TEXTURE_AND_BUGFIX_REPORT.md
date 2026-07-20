# UNDRAL Texture and Rendering Bug-Fix Pass

## Scope

This pass improves environment and terrain presentation only. Character, NPC, monster, and animal artwork was not modified.

## Grass texture upgrade

The previous grass material was dominated by highly saturated, high-frequency photographic noise. It conflicted with UNDRAL's stylized environment art and became visual static at gameplay camera distance.

The grass PBR set was regenerated as a calmer, tileable meadow surface with:

- broad, low-frequency turf variation;
- restrained blade ridges instead of dense pixel noise;
- subtle dry patches;
- gentler height, roughness, ambient-occlusion, and normal response;
- lower grass-layer UV frequency in the terrain shader.

Automated readability metrics for the new grass base color:

- high-frequency energy: `0.0025` (limit `0.035`)
- mean saturation: `0.3883` (limit `0.65`)
- mean luminance: `0.5726` (accepted range `0.38-0.78`)

The regenerated grass maps are also much smaller:

| Asset | Before | After | Reduction |
|---|---:|---:|---:|
| `grass_basecolor.png` | 667.3 KiB | 86.4 KiB | 87.1% |
| `grass_normal.png` | 692.9 KiB | 113.2 KiB | 83.7% |
| `grass_orm.png` | 253.9 KiB | 58.9 KiB | 76.8% |
| `grass_height.png` | 220.7 KiB | 44.0 KiB | 80.1% |

The four terrain atlases were rebuilt from the corrected maps and dropped by approximately 32-53% each.

## Bugs found and fixed

### 1. Normal floor tiles could be rendered as roads

Floor variant `5` was treated as a road in one presentation path even though the canonical road value is `PATH_FLOOR_VARIANT`. Ordinary terrain could therefore receive path coloring.

**Fix:** terrain presentation now checks the canonical path flag first and treats other floor variants normally.

### 2. Settlement roads could be recolored as grass

Town/farm color overrides took precedence over path coloring. A legitimate road passing through a settlement could therefore visually disappear into green terrain.

**Fix:** path presentation now has explicit precedence over settlement and farm-zone coloring.

### 3. Decorative grass spawned on roads

The instanced terrain-detail system used a hard-coded floor value instead of `PATH_FLOOR_VARIANT`, allowing grass blades to appear on actual roads.

**Fix:** terrain details use the shared canonical constant and exclude all road tiles.

### 4. Water normals used the wrong tangent-space orientation

The procedural water normal map encoded a flat/up-facing normal into the green channel instead of the blue channel. This could produce incorrect light response and directional artifacts.

**Fix:** water normals now use standard tangent-space encoding; a flat sample is `[128, 128, 255]`.

### 5. Preselected terrain quality was ignored on first render

Calling the terrain quality setter before Three.js compiled the material did not persist the requested scale. The first shader compile silently fell back to a fixed value.

**Fix:** the selected terrain scale is stored independently and applied during shader compilation as well as subsequent quality changes.

### 6. Terrain details ignored each land's visual identity

Grass detail color and density were fixed globally, producing lush green treatment even in frost, desert, and cinder regions.

**Fix:** detail colors now derive from the active land palette, with land-specific density profiles. Green-land and rainforest remain lush; frostlands, sunscorched-desert, and cinder-coast use restrained coverage. Tended settlement/farming areas retain appropriate greenery.

### 7. House exclusion did repeated linear searches per tile

Terrain-detail generation called `houses.some(...)` for every candidate tile.

**Fix:** occupied house coordinates are precomputed into a set, reducing repeated work during terrain-detail generation.

## Regression coverage added

- terrain color/path precedence tests;
- terrain-detail road exclusion and biome-density tests;
- water normal encoding tests;
- advanced terrain material quality-persistence tests;
- grass-specific texture readability checks in the existing texture QA pipeline.

## Verification

All requested non-database checks pass:

- `npm run verify`
  - authority boundary check
  - 24 client test files
  - 121 client tests
  - PBR material validation
  - texture repetition/readability QA
  - advanced-rendering contract validation
  - procedural-art validation
  - TypeScript production build
- `npm --prefix server run test:pure`
  - 34 server test files
  - 120 server tests
- `npm --prefix server run typecheck:source`
- `npm run artifact`

The production build retains one non-blocking warning for the existing approximately 1.19 MB JavaScript chunk.

## Visual verification note

The regenerated texture and tiled preview were inspected directly, and all automated texture/rendering checks pass. The sandbox's Chromium + SwiftShader process stalled in the full WebGL gameplay harness, so no gameplay screenshot is claimed. A final real-GPU camera-distance review remains recommended.

## Main changed files

- `scripts/generate_pbr_textures.py`
- `scripts/validate_texture_repetition.py`
- `src/art3d/advancedTerrainMaterial.ts`
- `src/art3d/terrainDetails.ts`
- `src/render3d.ts`
- `src/render/terrainPresentation.ts`
- `src/rendering/core/normalMap.ts`
- grass PBR maps and terrain atlases under `src/assets3d/pbr/`
- four new regression-test files under `src/__tests__/` and `src/rendering/__tests__/`
