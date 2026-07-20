# Upgrading the art to Mana Seed quality

Goal: bring the game's visuals up to the "Cambria World"-tier look in the
owner's reference screenshots, using **Mana Seed** assets by *Seliel the
Shaper* — the closest commercially-licensable match to that style.

> **Why Mana Seed and not the reference art itself:** the reference
> screenshots are from *Cambria World*, whose art is proprietary/copyright.
> We do **not** copy its assets. Mana Seed is a different, purchasable pixel
> art library in the same detailed 16-bit RPG tradition.

## The single best compatibility fact

Mana Seed's native grid is **16×16 px**, and this game already uses
`TILE = 16` (`src/config.ts`). So Mana Seed tiles drop in at **1:1 with no
rescaling** — proportions, walk-frame spacing, and prop footprints line up
natively. This is the main reason Mana Seed is the right pick over packs
built on 32×32 (Cainos) or oversized units (Tiny Swords).

## What to buy (and what's free)

| Pack | Role in this game | Price | Priority |
|---|---|---|---|
| **Character Base** (Mana Seed) | Player + townsfolk sprites (walk/idle) | **Free** | Must-have |
| **Farmer Sprite System** | Alt player/NPC outfits, farming anims | **Free** | Nice |
| **Gentle Forest** tileset | Trees/bushes/grass props — Rainforest & Green Land | **Free** | Must-have |
| **Basic / Grass Biome** tileset | Overworld ground: grass, dirt paths, cliffs (image #2 look) | Paid (~$15–30) | Must-have |
| **Cave Biome** tileset | Dungeon floors + walls (`wallTop`/`wallFace`) | Paid | For dungeons |
| **Winter Biome** tileset | Frostlands (Frosthold) reskin | Paid | Per-land |
| **Beach / Sandy Biome** | Desert (Solspire) / Cinder Coast | Paid | Per-land |
| **Monster sprites** (mushroom/bat/wasp/crab…) | Maps to the 4 enemy kinds | Paid | Combat polish |
| **Farming Crops #1** | Crop growth stages | $8.99 | Farming polish |
| **Full Tileset Collection** | All biomes in one bundle | ~$129 | If doing all 6 lands |

**Cheapest path to a real visual jump:** the two free packs (Character Base +
Gentle Forest) + **one** paid grass/overworld biome ≈ under \$30 total, and
that already covers the player, trees, and the main overworld ground that
fills most of every screenshot.

Links:
- Character Base — https://seliel-the-shaper.itch.io/character-base (free)
- Farmer Sprite System — https://seliel-the-shaper.itch.io/farmer-base (free)
- Gentle Forest — https://seliel-the-shaper.itch.io/gentle-forest (free)
- Full catalog — https://seliel-the-shaper.itch.io

## How this game consumes external art (already built for this)

`src/assets.ts` + `public/assets/manifest.json` are an owner-side override
layer: any key below, if present in the manifest, replaces the procedural
art. Rules (from `assets.ts`): **1 image px = 1 world px**, sprites drawn
**feet-at-bottom, horizontally centered**, side art **faces right**.

### Slot → Mana Seed source mapping

**Ground / walls** (looked up in `render.ts` `tilesetFor()`):

| Manifest key | Fill from | Notes |
|---|---|---|
| `floor` | Grass biome base grass tile | The green ground under everything |
| `farmland` | Farming/tilled-soil tile | Farm plots |
| `wallTop` / `wallFace` | Cave biome cliff top / face | Dungeon walls (3/4 view: top + riser) |
| `brickTop` / `brickFace` | Village stone wall top / face | Town buildings (image #2 castle) |

**Props** (already in `manifest.json`):

| Key(s) | Fill from |
|---|---|
| `tree`, `tree.2`…`tree.5` | Gentle Forest tree variants |
| `treeDead`, `treeStump` | Forest dead tree / stump |
| `rock`, `shrooms` (bush), `wood`, `fence` | Forest/village props |
| `cow`, `chicken`, `pet` (+ `.walk` strips) | Currently Ninja Adventure (CC0); keep or swap |

**Player** — two options:
- *Simple:* add a single `player` key → one static Mana Seed frame. Works
  immediately, but loses walk animation.
- *Full (recommended):* slice the Character Base sheet into this game's
  baked `PACK_PLAYER_FRAMES` shape — `{ down, up, side }`, each `idle` + a
  `walk` array (6 frames). See `src/packAssets.ts` for the exact format.
  A one-off slicing script (Node + the `canvas` dep already in
  `package.json`) turns the Character Base export into those frames.

**Enemies** — 4 kinds: `bug`, `shellbug`, `wallworm`, `spitter`
(`config.ts` `EnemyKind`). Each is either a single manifest key (static) or
an animated `PACK_MONSTER_FRAMES` entry (4-frame idle). Map each to a Mana
Seed monster (e.g. mushroom→`bug`, crab→`shellbug`, wasp→`spitter`).

## Two things that need code, not just files

1. **Full character animation.** The animated player path
   (`PACK_PLAYER_FRAMES`) is baked base64, not manifest-driven. Using Mana
   Seed's *animated* character means a slicing step to regenerate those
   frames (or accept a static single-frame `player` override to start).
2. **Auto-tiling ground edges.** Mana Seed grass tilesets include
   auto-tile edge/corner pieces for grass-meets-dirt transitions. This
   game's ground is procedurally shaded from `LAYER_PALETTES` with only a
   flat `floor` override hook — so a flat Mana Seed grass tile drops in
   cleanly, but reproducing Mana Seed's *edge blending* would need a small
   `render.ts` extension. Recommend phase 1 = flat tile (big win already),
   phase 2 = auto-tile edges if wanted.

## Per-land theming (the 6 capitals)

Right now all six capitals render with the same green tileset (biome art is
explicitly unfinished — see README). `render.ts` already selects a tileset
**per layer** (`tilesetFor(layer)` / `LAYER_PALETTES`). Hanging a
per-*land* biome (Grass/Winter/Beach/Cave) off the same selector is the
clean way to give Frostlands snow, the Desert sand, etc., once those biome
tilesets are bought.

## Licensing / repo hygiene

- Mana Seed's paid license permits use in a **compiled/shipped game** but
  **not** redistributing the raw art files. Do **not** commit purchased
  PNGs to a public repo. Keep them in `public/assets/` locally / in a
  private deploy artifact, and `.gitignore` them if this repo is public.
- The free Mana Seed packs (Character Base, Gentle Forest) follow the same
  no-raw-redistribution rule — same handling.
- Existing animal art is CC0 (Ninja Adventure) and is fine to keep committed.

## Suggested first step (turnkey)

1. Download the two free packs.
2. Export one grass tile → `public/assets/grass.png`, a couple of trees →
   `tree.png`/`tree-2.png`, and one Character Base frame → `player.png`.
3. Add `floor` + `player` to `manifest.json` (template in
   `manifest.example.json`).
4. `npm run build` and open `?visual-harness=0,0` — the harness renders a
   region with no backend, so you see the new art immediately.
