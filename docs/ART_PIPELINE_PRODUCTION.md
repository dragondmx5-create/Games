# UNDRAL Production Art Pipeline

This document defines the runtime material and texture contract for the true-3D renderer.

## Goals

- Stable texel density across modular geometry.
- Physically coherent materials under changing lighting.
- Stylized art direction without flat-color procedural primitives.
- Deterministic authoring assets that can be regenerated and validated in CI.
- A migration path to authored Blender/GLB assets without replacing the runtime material contract.

## Texture contract

Every textured surface uses a compact three-texture runtime set:

1. `*_basecolor.png` — color data, interpreted as sRGB.
2. `*_normal.png` — tangent-space normal data, interpreted as linear/non-color data.
3. `*_orm.png` — packed data texture: R=ambient occlusion, G=roughness, B=metallic.

An authoring-only `*_height.png` is retained for inspection, future rebaking and DCC workflows. Runtime textures live in `src/assets3d/pbr`; explicit Vite-safe URLs are listed in `src/art3d/pbrTextureManifest.ts`.

The current library contains 19 material families: wood, plaster, stone, roof,
metal, cloth, leather, ground, grass, dirt, mud, moss, pebble, leaf litter,
foliage, hair, fur, crystal and skin.

## Generation and validation

Generate deterministic 512px tileable sets:

```bash
npm run art:textures
```

Validate dimensions, bit depth, channel format, file completeness, seamless
wrapping and macro-repetition metrics:

```bash
npm run art:textures:validate
```

The generator also writes a deterministic 3×3 application preview for every
material into `artifacts/pbr-tiled-previews`. The blocking QA checks source-wrap
edges, preview cell boundaries and high-pass correlation between the nine
regions. `contact-sheet.jpg`, `focus-ground-foliage.jpg` and
`qa-metrics.json` are human-review/build artifacts, not runtime dependencies.

Validate the complete art contract, including PBR map assignment, color spaces, UV0, UV1/AO coverage and model bounds:

```bash
npm run art:validate
```

Run the complete client gate:

```bash
npm run verify
```

## Material system

`src/art3d/materials.ts` owns all runtime PBR state.

- Base color maps use `SRGBColorSpace`.
- Normal and ORM maps use `NoColorSpace`.
- Repeat wrapping, trilinear mip filtering and capped anisotropy are applied consistently.
- Cloth uses physical sheen.
- Leather uses a restrained clearcoat layer.
- Crystal uses physical clearcoat, IOR and limited transmission.
- Per-surface normal strength, AO strength and environment response are centralized in profiles.
- A world-space domain-warped gradient-noise pass breaks repetition over large structures.
- A second micro-normal and micro-roughness sample preserves close-range detail without adding another texture set.
- Each procedural mesh receives a deterministic 90° rotation/mirror/phase UV
  variant. Static house geometry bakes that transform before material-based
  merging, so anti-repetition does not add draw calls.

The source texture generator no longer synthesizes variation from a finite sum
of sine/cosine waves. It samples a periodic gradient lattice and warps the
coordinates with a second periodic low-frequency field. This keeps exact
tileability while avoiding the flatter cloud/banding character of the previous
Fourier signal.

Do not create one-off `MeshStandardMaterial` instances for production world assets. Add a surface profile or use the material library.

## Geometry and texel density

`src/art3d/modeling.ts` generates UVs for procedural geometry.

- Rounded boxes and extrusions use box-projected UV coordinates based on world scale.
- Cylinders, spheres, cones and torus pieces scale their stock UVs by physical dimensions.
- `uv1` is copied from `uv` for the current tileable AO workflow.
- Static house geometry is merged by material after construction to control draw calls.
- Seeded UV transforms are applied consistently to UV0 and UV1. Dynamic assets
  receive the transform through per-draw uniforms; static merged assets bake it
  into geometry.

When unique authored assets replace procedural geometry, keep a consistent texel-density target and provide a non-overlapping UV1 only when baked lightmaps or unique AO require it.

## Lighting

`src/render3d.ts` uses a layered lighting model:

- Hemisphere and directional key lighting.
- PMREM-filtered `RoomEnvironment` image-based lighting for coherent specular response.
- Local point lights only for gameplay-significant emissive sources.
- Soft shadows at medium/high quality and a cheaper shadow mode at low quality.
- ACES filmic tone mapping and sRGB output.

Avoid compensating for weak materials by adding many point lights. Fix albedo, roughness, normals and environment response first.

Major procedural props also receive a shared, soft contact-shadow mesh. It is a
cheap grounding/AO aid for trees, rocks, fences, chests, portals, mine entrances
and camps; it does not replace real shadow maps or baked unique AO.

## Layered terrain anti-tiling

`src/art3d/advancedTerrainMaterial.ts` combines six atlas layers with
height-biased weights. Large-scale masks use gradient fBm plus domain warping.
BaseColor, Normal and ORM each receive a second rotated/mirrored/phase-shifted
sample, blended by a continuous world-space field. The same transform and blend
are used for the three PBR channels so the anti-tiling remains materially
coherent instead of changing color independently from lighting response.

This costs additional texture samples. It should be profiled on representative
mobile hardware before raising terrain draw distance; do not hide that cost by
removing quality gates.

## Startup and streaming

`preloadPbrTextures()` decodes the complete runtime texture library while the boot UI displays progress. This avoids first-frame material popping and makes texture failures visible during startup.

The standalone artifact builder also converts referenced textures, sprites and fonts into data URIs, so the resulting HTML is genuinely self-contained. Login still requires a configured backend.

## Quality tiers

The renderer listens for the project graphics-quality event and adjusts:

- device pixel ratio cap;
- shadow map resolution;
- shadow filtering quality.

Geometry count, light count and texture count should remain bounded independently of quality tier. Future LODs should change mesh detail and shadow participation, not gameplay state.

## Production migration path

The current texture library is a strong tileable PBR foundation for procedural assets. The next character/building fidelity step is DCC-authored content:

1. Sculpt or model high and low meshes in Blender.
2. Unwrap unique UV0 with consistent texel density.
3. Bake normal, AO, curvature and material-ID maps from high to low.
4. Author BaseColor/Roughness/Metallic in Substance Painter or an equivalent tool.
5. Export GLB with skeletal animation and LODs.
6. Convert final deployment textures to KTX2/Basis Universal after visual approval.

Do not bake lighting or shadows into BaseColor. Keep color, material response and lighting separable.

## Review image

`docs/PBR_TEXTURE_LIBRARY_PREVIEW.jpg` is a contact sheet of the current generated library. It is a QA reference, not a runtime dependency.
