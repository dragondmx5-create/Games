# Roadmap

A tidy view of where UNDRAL is going. Grouped by theme, roughly ordered within
each group. This complements `docs/IMPLEMENTATION_STATUS.md` (current state) and
`docs/PROJECT_ISSUES.md` (problems to fix). Nothing here changes the authority
model: the client stays a renderer + intent sender.

## Legend

✅ done · 🔨 in progress · 🔜 next · 🧭 planned · 💡 idea

---

## 1. Visual & art

- ✅ Self-hosted fonts; grounded prop shadows; softened terrain patches.
- 🔜 Adopt a cohesive CC0 16×16 tileset (trees/grass/props with baked shadows)
  through the `manifest.json` override, per-land.
- 🔜 Player + NPC character art with real walk/idle animation (Character Base).
- 🧭 Grass↔road soft edges and grass-tile colour variation to break tiling.
- 🧭 Per-land biome reskins (Frostlands, Desert, Cinder Coast, Rainforest, Witchlands).
- 💡 Weather/time-of-day wash, water shaders, witch-light and fog ambience.

## 2. Combat & progression

- ✅ Server-authoritative overworld combat, HP, death, Loot Bags.
- 🔜 More enemy archetypes and boss patterns beyond the current four kinds.
- 🧭 Skill/ability trees and gear affixes layered on canonical inventory.
- 🧭 Authoritative wild-animal hunting (server wildlife instances).
- 💡 Status effects (poison, chill, burn) tied to land identity.

## 3. World & content

- ✅ 121 deterministic regions, 30 settlements, 12 dungeons.
- 🔜 Flesh out secondary/hidden settlements with unique services.
- 🧭 More dungeon floor archetypes and modifiers (keyed/forbidden variety).
- 🧭 Dynamic world events (invasions, market shocks) driven by verified services.
- 💡 Seasonal world cycles ("Age of Ash" → next ages).

## 4. Economy & social

- ✅ Canonical inventory, catalog, crafting, The Underway, Vault.
- 🔜 Player-to-player trade settled through the inventory transaction service.
- 🧭 Auction house / consignment via the Underway network.
- 🧭 Guild/party grouping with shared authoritative state.
- 💡 Reputation systems per land and per Underway node.

## 5. Multiplayer scale

- ✅ `/ws/world` presence, PvP rooms with database leases (no split-brain).
- 🔜 Sticky routing or redirect/pub-sub for seamless multi-process active rooms.
- 🧭 Horizontal scale-out of socket servers with shared session state.
- 🧭 Spectate/replay from server room state.

## 6. Platform & DX

- ✅ CI workflow runs `check:authority`, client/server tests, builds and Docker checks on every PR.
- 🔜 Split the largest files per `ARCHITECTURE.md §6`.
- ✅ Node 22 is pinned via `engines`; Docker Compose remains the one-command local stack.
- 🧭 Add a devcontainer for editor/toolchain parity.
- 🧭 Structured logging + metrics dashboards on the authoritative services.
- 💡 Automated visual-regression via the `?visual-harness` renderer.

## 7. Token-readiness (explicitly gated)

The project is **not** token-ready and will not be described as such until all of
the following are complete:

- 🧭 Separate custody service with signed internal requests.
- 🧭 Withdrawal controls, rate/abuse monitoring, and audit trails.
- 🧭 Independent security review of the authority boundary and settlement paths.
- 🧭 Legal review.

Until then, `internal/` service endpoints must not bridge to any external value.
