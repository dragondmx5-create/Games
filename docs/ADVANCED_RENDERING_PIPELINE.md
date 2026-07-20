# Advanced Rendering Pipeline

UNDRAL's 3D renderer uses a quality-scaled, data-driven rendering stack built on Three.js.

## Terrain

The terrain renderer blends six authored PBR surface layers in world space:

- grass
- dirt
- mud
- moss
- pebbles
- leaf litter

The layers are packed into four atlases (base color, tangent-space normal, ORM, and height). A custom shader combines macro noise, tile metadata, wetness, path bias, and height-aware weighting. Geometry-instanced detail then adds short grass, tall grass, flowers, pebbles, and leaves above the blended surface. Wind is evaluated per instance in the vertex shader.

## Materials

The procedural material library contains 19 surface families. Standard materials are used by default; physical features are enabled selectively for surfaces that benefit from them:

- metal: anisotropy and clearcoat
- cloth/fur: sheen
- leather: clearcoat and controlled specular response
- hair: anisotropy and sheen
- skin: restrained specular and sheen
- crystal: clearcoat, transmission, attenuation, iridescence, and dispersion
- water: IOR, transmission, absorption, clearcoat, and animated normal detail

All color textures use sRGB color space. Normal, ORM, and height textures remain linear data textures.

## Lighting and post-processing

The runtime combines:

- PMREM-filtered environment lighting
- directional key light with quality-scaled shadows
- cool fill and warm rim lights
- a hero-following rim light
- emissive practical lights
- GTAO
- restrained Unreal Bloom
- SMAA
- final color grading, vignette, film grain, and damage feedback
- OutputPass for display color conversion

Post-processing and shadow resolution are scaled by the selected graphics quality tier.

## Validation

Run the complete graphics validation stack with:

```bash
npm run art:validate
```

Regenerate PBR textures and terrain atlases with:

```bash
npm run art:textures
```

Run all client checks with:

```bash
npm run verify
```

The validation scripts check texture dimensions and color-space contracts, atlas layout, UV0/UV1 availability, PBR map coverage, advanced shader integration, post-processing order, and representative asset complexity.

## Production follow-ups

The current renderer is fully code-generated and browser-ready. For the next fidelity tier, replace hero and creature prototypes with authored GLB assets using unique UVs, high-to-low normal baking, skeletal animation, and LODs. Convert production texture maps to KTX2/Basis Universal after profiling the target GPU matrix. Split the main bundle and profile draw calls, fill rate, shader variants, and GPU memory on real devices before release.
