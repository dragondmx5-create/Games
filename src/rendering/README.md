# `src/rendering/` — WebGL2 pipeline

The native WebGL2 rendering layer used by `src/render.ts`. Gameplay authority
never lives here — shaders draw, they do not decide value (GLSL is presentation
only).

## Layout

| Path | Responsibility |
|---|---|
| `core/` | The WebGL2 context wrapper (`WebGL2DContext.ts`) — a 2D-style drawing API (drawImage, gradients, ellipses, tinting) backed by GPU quads and a texture-array atlas. |
| `shaders/` | GLSL ES 3.00 vertex/fragment shaders. |
| `postprocessing/` | Bloom, fog, color grading, vignette, damage distortion. |
| `quality/` | Auto / Low / Medium / High quality tiers and per-frame effect budgets. |
| `effects.ts` | Shared visual-effect helpers (wind sway, motes, etc.). |

## Notes

- The main game scene is WebGL2; HTML/CSS is used only for menus and panels.
- Context-loss and portrait/landscape resize are handled in `core/`.
- `render.ts` (one level up) is the scene composer that calls into this layer;
  it is a refactor target and is expected to split into `render/ground.ts`,
  `render/props.ts`, `render/entities.ts`, etc.
