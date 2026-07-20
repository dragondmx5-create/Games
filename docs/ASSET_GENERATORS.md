# Asset generators — GitHub survey for UNDRAL

A scan of open-source **asset generators** and how each fits this project
(16px top-down WebGL2 game, deterministic seeded world, TS, with an owner-side
asset override layer in `src/assets.ts`). Ranked by fit.

## Tier 1 — Best fit, free, no AI backend

### 1. pixel-sprite-generator (zfedoral) ★ top pick for enemies
- Repo: https://github.com/zfedoran/pixel-sprite-generator
- License: **MIT** · Language: **JavaScript, runs in-browser**
- What: procedurally generates retro creature/character sprites from a mask +
  seed (the classic technique).
- Why it fits us: pure code, **no art licensing**, and **seed-deterministic** —
  it matches our seeded world model, and sprites are presentation-only so this
  respects the authority boundary (the browser may render non-authoritative
  visuals). Ideal for programmatic variety on the four enemy kinds
  (`bug/shellbug/wallworm/spitter`) and future creatures, with a clean fallback
  to the current procedural art in `sprites.ts`.
- Caveat: output is abstract "creature" shapes, not authored monsters — great
  for variety/placeholder, not for hero art.

### 2. Universal LPC Spritesheet Character Generator ★ top pick for humanoids
- Repo: https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator
- Live: https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/
- License: assets **CC BY-SA 3.0 / GPL 3.0** (attribution + share-alike) · built
  with **Vite/npm**, same toolchain as us.
- What: composes full top-down character spritesheets — walk / slash / thrust /
  cast / shoot / hurt — from layered hair, clothing, armor and weapons.
- Why it fits us: the standard free source for **player and NPC** sprites with
  real animation frames; we can generate exactly the frames our
  `PACK_PLAYER_FRAMES` format needs and drop them into `public/assets/`.
- Caveat: LPC frames are **64×64** base (our tile is 16px) — characters would
  render larger than tiles (fine, sprites already scale independently), but the
  CC BY-SA **share-alike** term is stickier than CC-BY; keep the attribution.

## Tier 2 — Icon generators / libraries (drop-in)

### 3. RPG-Awesome
- Repo: https://github.com/nagoshiashumari/Rpg-Awesome
- License: code **MIT**, icons **CC BY 3.0** (derived from game-icons).
- What: 490+ fantasy item/skill icons delivered as a **webfont + CSS**.
- Why it fits us: trivial drop-in for item, skill and shop icons; complements
  the game-icons glyphs we already embed. Being a font, it needs no per-icon
  wiring.

## Tier 3 — AI generators (prompt → sprite; need a model/key)

### 4. SpriteBrew
- Repo: https://github.com/GAlbanese09/spritebrew
- What: AI text→pixel-art spritesheet generator (character, animate, slice,
  export for Unity/Godot/GameMaker/RPG Maker); also skill/inventory icon modes.
- Fit: useful for **concepting** authored assets quickly; output still needs
  hand-cleanup and its own licensing/key. Not a runtime dependency.

### 5. agent-sprite-forge
- Repo: https://github.com/0x0funky/agent-sprite-forge
- What: an agent skill that generates sprite sheets, transparent PNG frames and
  animated GIFs from prompts, plus placement metadata.
- Fit: pipeline/tooling for batch-generating placeholder art; evaluate license.

## Tier 4 — Tileset generators (for biome ground art)

- **Procedural Tileset Generator** (Donitz) — HTML5 tool that merges/splices
  template sprites into random pixel tilesets: https://donitz.itch.io/procedural-tileset-generator
- **YATE — Yet Another TileSet Editor** — open-source tool to build tileset
  images from standalone tiles (search GitHub topic `tileset-generator`).
- Fit: for authoring the per-land biome ground tiles the map already themes
  (Frostlands snow, Desert sand, …) that the world render still lacks.

## Recommendation

Two concrete, license-clean wins:

1. **pixel-sprite-generator (MIT)** — wire it as a deterministic, seed-driven
   sprite source for enemies/creatures behind the existing `sprites.ts`
   fallback. No licensing, no network, fits the authority model. Best
   *engineering* fit and something we can integrate now.
2. **LPC generator (CC BY-SA)** — use its exporter to produce real animated
   **player/NPC** spritesheets into `public/assets/`, keeping attribution.

For icons, **RPG-Awesome** is the fastest drop-in to enrich item/skill UI.
Treat the AI generators (SpriteBrew, agent-sprite-forge) as concepting tools,
not runtime dependencies.
