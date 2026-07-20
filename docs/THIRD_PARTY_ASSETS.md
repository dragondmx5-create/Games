# Third-party assets

## UI glyphs — game-icons.net

Several UI glyphs (world-map capital/settlement markers and the utility-dock
icons) are derived from **game-icons.net**:

- Source: https://github.com/game-icons/icons
- License: **Creative Commons Attribution 3.0 (CC BY 3.0)** —
  https://creativecommons.org/licenses/by/3.0/
- Authors: **Delapouite** and **Lorc** (see game-icons.net for per-icon credit).

Icons used (author / icon): Delapouite — castle, village, spell-book,
backpack, treasure-map, cog, speaker; Lorc — crossed-swords, compass,
scroll-unfurled.

The SVG path data is embedded in `src/ui/gameIcons.ts`. Only the foreground
path is kept (the original solid background rectangle is stripped) so the
glyph inherits `currentColor`. No modifications were made to the artwork
beyond this recoloring.

## UI line icons — Lucide

The combat hotbar glyphs use **Lucide** (https://github.com/lucide-icons/lucide),
**ISC licensed**. Consumed as the `lucide` npm package and rendered to inline
SVG by `src/ui/lucideIcons.ts`.

## UI micro-animations — @formkit/auto-animate

Smooth add/remove/reorder transitions for dynamic lists (inventory, quests,
resource feed, world-map grid) use **@formkit/auto-animate**
(https://github.com/formkit/auto-animate), **MIT licensed**.

## Animal sprites — Ninja Adventure

The cow/chicken/pet sprites in `public/assets/` come from the **Ninja
Adventure Asset Pack** by *pixel-boy*, released under **CC0** (public
domain) — https://pixel-boy.itch.io/ninja-adventure-asset-pack. No
attribution is required for CC0; recorded here for provenance.
