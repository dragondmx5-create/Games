# `src/ui/` — DOM UI

HTML/CSS panels layered over the WebGL canvas: menus, inventory, world map,
shop, journal, settings, and the combat/economy HUD. UI applies **returned
canonical snapshots** rather than reproducing mutations locally.

| File | Responsibility |
|---|---|
| `shell.ts` | Panel shell: opening/closing panels, tabs, and wiring UI to game events. |
| `events.ts` | Typed UI event bus between game state and DOM. |
| `experience.ts` | Title-screen presentation (land preview, pointer parallax, realm accent). |
| `economyPresentation.ts` | Formats canonical economy state (wallet, prices, ledgers) for display. |
| `gameIcons.ts` | Inlined game-icons.net glyphs (CC BY 3.0) — map/settlement/utility icons. |
| `lucideIcons.ts` | Lucide combat-hotbar glyphs (ISC), rendered to inline SVG. |

## Rules

- Shop, craft, equip, harvest, chest, quest, farm, animal, Underway and Vault
  panels **apply server snapshots**; they must not compute inventory deltas.
- Styling lives in `src/styles.css` (a split into `styles/*.css` is a planned
  refactor). Modal panels must stack above the full-screen title layer.
- All user-facing text is English.
