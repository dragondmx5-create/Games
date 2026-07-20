# UNDRAL Art Quality Upgrade V3

Date: 2026-07-19

## Scope and safety

This pass improves environment rendering, terrain materials, procedural PBR authoring, road presentation, per-land atmosphere, and additive scenery. It does not change persistent gameplay value or server-side reward/damage/progression logic.

The protected character and creature builders were not modified. The extracted source blocks for `makeHero`, `makeNpc`, `makeEnemy`, and `makeAnimal` are byte-for-byte unchanged from the input project.

## 1. Terrain darkness investigation and fix

### Measured wetness extent

The original shader was reconstructed in a temporary WebGL2 probe and rendered at the same Evergrove center coordinate. The final fragment output was temporarily replaced with direct grayscale wetness output. The terrain plane was isolated from the background by selecting grayscale probe pixels, and the screenshot's sRGB values were decoded back to linear values.

Measured original `undralTerrainWetness` distribution across 130,218 visible terrain pixels:

| Metric | Linear wetness |
|---|---:|
| Mean | 0.001920 |
| Median | 0.001821 |
| 90th percentile | 0.002428 |
| 99th percentile | 0.002732 |
| Maximum | 0.078187 |
| Pixels above 0.02 | 0.01075% |
| Pixels above 0.05 | 0.001536% |
| Pixels above 0.10 | 0% |

This measurement did **not** support the hypothesis that wetness alone was broadly darkening most Evergrove pixels at this exact location. It did reveal that the constant ambient-rain input was conceptually incorrect and unnecessary.

### Dominant darkness cause found during live rendering

The first wetness-only correction still rendered the terrain near black. Cross-checking the live render with Three.js shader ordering exposed the dominant bug:

1. `vertexColors` multiplied `diffuseColor` before the custom map fragment.
2. The custom terrain fragment then multiplied the six-layer terrain sample into that already-darkened value.
3. The standard `color_fragment` stage multiplied `vColor` again after the custom map fragment.

The per-tile tint therefore compounded with the terrain texture instead of acting as a restrained palette tint.

### Final correction

`src/art3d/advancedTerrainMaterial.ts` now:

- Defaults the terrain rain input to `0` until a real weather system exists.
- Removes ambient-rain influence from procedural mud creation.
- Applies wetness only when mud is the dominant terrain layer.
- Raises the wetness brightness floor from `0.67` to `0.88`.
- Narrows macro brightness modulation from `0.90-1.08` to `0.94-1.06`.
- Assigns the sampled terrain color directly and preserves only a restrained chroma shift from the tile/land tint.
- Disables the later standard `color_fragment` multiplication for this material.
- Reduces wetness roughness suppression and gives packed roads a controlled roughness band.

Using the same camera, geometry, coordinate, atlas, and WebGL2 probe, the visible terrain plane changed from a mean linear luminance of `0.01590` to `0.40719`. Median linear luminance changed from `0.01403` to `0.40943`. The fixed render reads as bright green terrain instead of dark olive/near-black.

Evidence:

- `artifacts/verification-v3/terrain-before.png`
- `artifacts/verification-v3/terrain-wetness-diagnostic.png`
- `artifacts/verification-v3/terrain-after.png`
- `artifacts/verification-v3/terrain-comparison.png`

## 2. Professional procedural texture upgrades

`scripts/generate_pbr_textures.py` now includes a first-class, exactly tileable Worley primitive:

- Periodic feature-point grid.
- Wrapped 3x3 neighbor evaluation.
- F1 distance output.
- Normalized F2-F1 cell-boundary output.

It is used for materially different structures rather than generic noise duplication:

- Stone and roof: irregular cellular mortar/seam breakup.
- Dirt and mud: drying/crack boundaries.
- Leather and skin: pore/cell boundary structure.

Additional changes:

- Cloth weave uses domain-warped warp/weft phases plus an over-under structure instead of near-pure sine bands.
- Brushed metal uses domain-warped phase and directional streak layering.
- Metal starts from a cool steel reflectance color rather than generic gray.
- `periodic_spots` now produces anisotropic, multi-lobe forms instead of perfect circular spots.
- Practical authoring guards keep base color and roughness away from impossible pure endpoints.
- Macro, meso, and micro structures use different frequencies and different phenomena.

Only the touched material sets were regenerated: `stone`, `roof`, `dirt`, `mud`, `leather`, `skin`, `cloth`, and `metal`. The terrain atlas was rebuilt because `dirt` and `mud` changed.

Evidence:

- `artifacts/verification-v3/texture-previews.png`
- `artifacts/pbr-tiled-previews/`

Technique references used by the work order include Inigo Quilez's domain-warping/fBm articles and standard metallic-roughness PBR guidance.

## 3. Roads

The canonical road variant is `PATH_FLOOR_VARIANT = 6`, but the 3D renderer only recognized legacy variant `5`. The renderer now recognizes the canonical value while retaining compatibility with variant `5`.

Road visual changes:

- Soft tile-edge fringe using local tile coordinates and warped noise.
- Fade toward a neutral grass tint at the worn-path boundary.
- Increased embedded pebble micro-detail.
- Compacted-road roughness with reduced variance.

Additive roadside scenery follows canonical deterministic road tiles:

- Stacked-stone cairns.
- Standalone lantern posts, reusing the signpost lantern assembly.
- Deterministic adjacency placement without introducing a second road system.

## 4. Per-land atmosphere

Surface atmosphere now reads a small palette-adjacent profile by land ID rather than sharing one fog/light setup for every overworld land. Profiles currently tune:

- Fog density.
- Hemisphere intensity.
- Environment intensity.
- Sun intensity.
- Cool fill intensity.
- Warm rim intensity.

Profiles are present for Witchlands, Rainforest, Frostlands, Sunscorched Desert, and Cinder Coast, with a shared default for other lands. Dungeon/underworld behavior remains on the existing fallback path.

## 5. Additive scenery

New procedural props:

- `makeCairn()`
- `makeLanternPost()`
- `makeShrub()`

Each uses the existing modeling/material kit, receives the standard contact-shadow grounding, and participates in the existing material UV anti-repetition path. The lantern subassembly was extracted from `makeSignpost()` so it is reused rather than duplicated.

The props were rendered with the real `StylizedMaterialLibrary`, `ModelingToolkit`, and `StylizedAssetFactory` at close and gameplay distances. Their silhouettes remain readable at gameplay scale.

Evidence:

- `artifacts/verification-v3/props-close.png`
- `artifacts/verification-v3/props-gameplay.png`

## 6. Verification

Required commands completed successfully on the final clean tree:

```text
npm run check:authority
PASS — Server-authority boundary check passed.

npm test -- --run
PASS — 17 test files, 103 tests.

npm run build
PASS — TypeScript and Vite production build completed.

npm run art:validate
PASS — 76 PBR textures / 19 sets, 4 terrain atlases, seamless wrapping,
       3x3 anti-repetition previews, advanced rendering contracts, and
       procedural 3D asset validation.
```

Complete output: `artifacts/verification-v3/final-validation.log`.

### Rendering method and limitation

The full `CinematicPipeline3D`/game harness was attempted with headless Chromium and SwiftShader, including a reduced scene. In this container it stalled or crashed during full harness startup, so no successful full-pipeline screenshot is claimed.

Visual claims above are instead backed by two successful real WebGL2 probes:

1. An actual `AdvancedTerrainMaterial` render using the generated Evergrove center, real terrain atlases, instanced tile geometry, and the compiled shader.
2. An actual procedural-prop render using the production material/modeling/asset factory classes.

Both probes reported a live, non-lost WebGL2 context and no shader or GL compile errors. Temporary probe source and HTML files were removed before final validation.

## 7. Intentionally deferred

The following work-order items were not forced into this pass because they would expand canonical world topology/collision scope beyond a small, reviewable visual diff:

- Connected pond streams.
- Flow-tangent water animation.
- Road-water bridge generation.
- Dynamic weather or time-of-day systems.
- Character, NPC, enemy, or animal art.

No server files were modified.
