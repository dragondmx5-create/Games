# UNDRAL WebGL2 Renderer

## Scope

The main game canvas remains WebGL2-only. TypeScript owns simulation, networking, and authority projection; GLSL owns sprite sampling, procedural primitive coverage, and postprocessing. Visual effects never determine damage, collision, rewards, or progression.

## Pipeline

1. `Renderer.render()` culls tiles and depth-orders world objects.
2. `WebGL2DContext.beginFrame()` binds the scene framebuffer and uploads scene time.
3. Batched scene modes draw atlas sprites, solid primitives, radial gradients, procedural water, combat arcs, and glow particles.
4. `PostProcessPipeline` composites nearest-neighbour scene output with dynamic lights, a half-resolution two-pass gaussian bloom (`bloom.frag.glsl`: bright extract + separable blur, linearly upsampled so it stays soft over pixel art), world-anchored drifting cloud shadows, diagonal sun shafts (high tier only), color grading with a vibrance pass, fog/grain, vignette, and damage response. The scene pass additionally animates procedural water (caustic interference + sparse sun glints) and vegetation wind sway (`windSway()` in `effects.ts`, sheared per-quad on the CPU via `drawImageSwaying`).

## New GLSL effects

- **Water:** scene mode 4 combines stable per-tile seeds, directional waves, ripples, highlights, and shoreline foam derived from canonical neighbor edges.
- **Sword/combat impact:** scene mode 5 masks an angular slash arc in the fragment shader, with ability-weighted core glow. Damage postprocessing adds a small quality-gated chromatic split and distortion.
- **Environment particles:** scene mode 6 draws soft radial GPU particles with seeded twinkle. Dungeon hazards and ambient effects reuse this primitive.
- **Lighting:** postprocessing adds bounded light scattering around the existing nearest-first dynamic lights.

## Quality compatibility

`visualEffectBudget()` maps Low/Medium/High to bounded particle density, slash glow, water complexity, and light scattering. Shader loops remain statically bounded for mobile WebGL2 compilers. Low quality disables bloom and reduces particles/lights; higher tiers add samples without changing gameplay state.

## Verification expectations

Renderer changes must pass TypeScript production build, effect helper tests, existing render regression tests, and `check-authority-boundary.cjs`. New effects should extend existing scene modes or postprocessing rather than introducing a second canvas authority path.
