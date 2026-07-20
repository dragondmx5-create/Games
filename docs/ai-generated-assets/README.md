# AI-generated assets — experiment log

Prototype/testing that these images came from: the owner generates images with
an AI image tool (Bing Image Creator / Gemini / etc.), uploads the result,
Claude crops/downsamples/tests it in a live game screenshot before it's
used. This folder keeps the useful outputs and the prompt that produced them,
so a fresh session doesn't have to re-derive the working prompt from scratch.

## The style-lock prompt (use this as the base for anything new)

```
Retro pixel art game sprite, in the exact visual style of 16-bit SNES/Game Boy Advance era RPGs (like Golden Sun or a classic tile-based dungeon crawler). CRITICAL: flat cel-shaded pixel art with a strictly limited color palette (max 5-6 flat colors total for the whole character, no gradients, no soft shading, no airbrush blending, no glow, no anti-aliasing, no blur anywhere). Every pixel block must be a single solid flat color with hard, crisp, blocky edges — the kind of sprite that still reads clearly even when displayed at only 24-32 pixels tall.

3/4 top-down perspective (elevated angled camera looking down at the subject, the way a character looks in Zelda: A Link to the Past — NOT a front-facing portrait, NOT a side profile, NOT eye-level).

Single object, centered, small simple silhouette with clearly separated color regions (so it stays readable at tiny size). Background: pure flat solid black (#000000), no vignette, no gradient, no texture in the background at all, hard clean edge between subject and background with zero soft/blended/semi-transparent pixels at the boundary.

No text, no watermark, no logo, no UI, no border, no drop shadow, no multiple variations — exactly one asset.

Subject: [SUBJECT HERE]
```

Key lessons learned (from actually testing outputs in-engine, not just eyeballing them):

- **Background must be pure black, not magenta.** An early attempt used a
  magenta (#FF00FF) background for chroma-keying; anti-aliased edges against
  it left a visible magenta halo after background removal that didn't fully
  key out. Black edges clean up reliably.
- **"3/4 top-down" is often ignored for small creatures, and that's fine.**
  Every model we tried rendered farm animals in a side profile instead. This
  actually matches how the game already draws animals/NPCs/the player (flat
  "billboard" side-view sprites positioned on a top-down world) — a true
  top-down view of a small animal is less readable anyway (you'd mostly see
  its back). Don't fight the model on this one.
- **Push hard on "flat, no gradient, no shading, no blur."** The default
  tendency of these tools is soft airbrush-style shading that looks fine at
  the tool's native resolution but turns to mush once downscaled to the
  game's actual sprite size (players/animals are ~14-26px tall). See
  `reference-orc-failed-raw.png` for a case that looked great large and
  unreadable in-game — the detail (armor, weapon, face) blurred into a
  blob at actual scale. Confirmed by uploading it in-game via the CUSTOM
  ASSETS panel (wallworm slot) and screenshotting real gameplay, not by
  guessing from the reference image alone.
- **Walk-cycle consistency**: ask for all frames in ONE image (a single
  horizontal strip), not one request per frame — a fresh generation has no
  memory of a previous one, so frame-to-frame consistency is unreliable
  unless they're generated together. Even then, expect 1-2 retries; the
  first attempt at a walk-cycle sheet came back as a 2x4 grid on a *white*
  background with color drift (ignored several explicit instructions) —
  see the "gone wrong" note below. The second attempt, prompted with an
  explicit physical description of the already-approved pig (colors, spot
  placement, ear/tail shape) to keep it consistent with `pig-idle.png`,
  worked well.

## Walk-cycle sprite-sheet prompt (append-only, use after the base prompt)

```
Layout: a horizontal sprite sheet strip containing exactly 4 frames of the SAME [subject] performing one full walk cycle (legs alternating: frame 1 = legs together/neutral, frame 2 = legs spread mid-stride, frame 3 = legs together/neutral again, frame 4 = legs spread opposite mid-stride). All 4 frames must be perfectly identical in size, color palette, body proportions, and camera angle — only the leg positions change between frames. Equal spacing between frames, all frames aligned on the same baseline (feet at the same vertical level). No text, no numbers, no labels, no watermark, no logo, no UI, no border, no grid lines separating the frames — just the frames on the black background.
```

If regenerating a walk cycle for something already established (like the
pig), also describe its exact appearance in the `Subject:` line (colors,
markings, proportions) so the new generation stays visually consistent with
the approved one — a plain species name alone will drift.

## Files in this folder

| File | What it is |
|---|---|
| `pig-idle.png` | First successful pig gen, processed (background removed, cropped, downscaled to game scale ~16px tall). Usable as a single-frame idle sprite. |
| `pig-walk-frame-0.png` … `pig-walk-frame-3.png` | The 4 walk-cycle frames from the second (better) pig generation, individually cropped/aligned/downscaled to game scale. |
| `pig-walk-strip.png` | The same 4 frames composed into one horizontal strip — this is the exact file format `Assets.getWalkFrames()` expects for a `<key>.walk` custom upload (see `src/assets.ts`). Ready to upload as-is via the CUSTOM ASSETS panel for the `cow`/`chicken`/`pet` slot's walk-cycle upload. |
| `reference-good-pig-raw.png` | The raw, unprocessed second pig generation (before cropping into individual frames), for comparison against future generations. |
| `reference-orc-failed-raw.png` | A cautionary example — visually appealing at full size, but its soft/gradient shading didn't survive downscaling to actual in-game enemy scale. Kept as a "don't do this" reference, not for use as an asset. |

None of these are wired in as permanent default sprites yet (see the game's
three-tier asset system in `src/assets.ts`/README.md) — they exist as
custom-upload-ready test assets. Whether/which of these become permanent
defaults (e.g. a real third `pig` `AnimalKind` in `config.ts`) is a decision
for the project owner, not assumed here.
