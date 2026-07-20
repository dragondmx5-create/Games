# UNDRAL MMO Overhaul — Implementation and Audit Report

Date: 20 July 2026

## Scope

This pass builds on `UNDRAL_TEXTURES_AND_BUGFIXES.zip`. It expands the deterministic overworld, adds a road hierarchy and settlement variety, extends environmental VFX, introduces mobile-first quality controls, hardens touch and networking behaviour, and consolidates backend world validation.

Character, NPC, monster, pet, and animal art were not modified.

## Executive summary

- Expanded the bounded shared overworld from **11×11 / 121 regions** to **15×15 / 225 regions**, an **86% increase** in explorable region count.
- Added deterministic **stone trade roads**, **dirt regional roads**, and **resource trails** with shared-edge continuity.
- Added five deterministic building archetypes: **cottage, shop, guild hall, workshop, and lodge**.
- Added a new procedural **handcart** settlement prop while keeping the existing per-town prop budget unchanged.
- Added land-specific ambient weather and movement dust, integrated with existing PBR wetness, water, wind, bloom, color grading, GTAO, SMAA, rim lighting, hit flashes, and combat particles.
- Added touch-aware startup quality, low/medium/high mobile budgets, and hysteresis-based adaptive resolution.
- Fixed interrupted-touch input, reconnect, REST timeout/retry, duplicated world-bound validation, cleanup-job, cache-growth, and rendering-lifecycle issues.
- Completed a deterministic generation sweep across all **225 regions**: 30 settlements, 35,826 procedural props, 329,207 path tiles, 101,039 stone-road tiles, and 29,081 resource-trail tiles for the verification seed.

## 1. World and map expansion

### Canonical 15×15 world bounds

A new shared source of truth was added at `server/src/world/worldBounds.ts`:

- `OVERWORLD_WORLD_RADIUS = 7`
- `OVERWORLD_WORLD_DIAMETER = 15`
- `OVERWORLD_REGION_COUNT = 225`
- `isOverworldRegionCoordinate(rx, ry)`

The client imports the canonical radius through `src/config.ts`. Server save validation, world protocol validation, position persistence, mining/resource commands, and topology generation now consume the same boundary instead of maintaining separate numeric limits.

The authored six-land identity remains intact. Newly opened outer regions inherit deterministic land/risk/resource profiles from the existing registry logic, and the generated `regionResourceProfiles.ts` table now covers all 225 canonical coordinates.

### Road hierarchy

`server/src/world/overworldTopology.ts` now defines three path classes:

- `PATH_FLOOR_VARIANT = 6`: dirt regional roads.
- `STONE_ROAD_FLOOR_VARIANT = 7`: broad trade routes through capital corridors.
- `RESOURCE_TRAIL_FLOOR_VARIANT = 8`: narrow trails from regional circulation routes toward canonical iron/crystal sites.

Road class is derived from the shared region edge, so east/west and north/south neighbours always agree. Stone trade spines run through selected rows and columns connecting the six land hubs; other canonical gates retain dirt links. Capital plazas and major settlement interiors use stone paving.

Client rendering, tile ownership replacement, prop scattering, terrain detail exclusion, and color presentation now use `isPathFloorVariant()` rather than checking one exact variant. New stone-road and resource-trail tile art was added to the existing sprite/material pipeline.

### Existing terrain systems retained and extended

The previous high-resolution PBR terrain pass remains active:

- Six-layer texture splatting through terrain atlases.
- Base color, normal, height, and ORM data.
- Seamless texture QA and anti-repetition previews.
- Water normal animation and wetness response.
- Instanced terrain, walls, resources, grass, flowers, stones, and leaf litter.

This pass adds distinct road surface presentation and weather-driven wetness rather than replacing the proven terrain material system.

## 2. Buildings and environment variety

### Five building archetypes

The server-authored house footprint and ordinal now select a stable archetype through `houseArchetypeFor()`:

1. **Cottage** — compact domestic treatment and herb garden details.
2. **Shop** — striped awning, hanging sign, and merchant-facing frontage.
3. **Guild hall** — larger profile, raised tower/cupola, and banners.
4. **Workshop** — lean-to work area, tools, and forge/anvil language.
5. **Lodge** — heavier stone corner piers and crest treatment.

Each archetype uses distinct plaster, timber, and roof choices while preserving deterministic doors, windows, interiors, collision footprints, and server-authored settlement layout.

### Settlement props

Existing wells, fences, lanterns, benches, flower planters, market stalls, fortification pieces, bridges, docks, monuments, and ruins remain in use.

A procedural **handcart** was added with:

- Timber bed and side rails.
- Metal-rimmed spoked wheels.
- Pull handles.
- Crate and cloth cargo details tinted from the land palette.

Handcarts replace existing decorative slots in towns/capitals, so visual variety increases without increasing settlement prop counts or mobile draw pressure.

## 3. Visual effects and shaders

### Land-specific ambient weather

`src/rendering/weather.ts` provides deterministic presentation profiles:

| Land | Effect | PBR wetness |
|---|---|---:|
| Witchlands | drifting mist | 0.42 |
| Green Land | pollen | 0.08 |
| Rainforest | rain | 0.90 |
| Frostlands | snow | 0.34 |
| Sunscorched Desert | sand | 0.00 |
| Cinder Coast | ash | 0.24 |

Particle rates scale by graphics tier. Weather is skipped while the document is hidden. Rain and other atmospheric effects share the existing pooled point-particle buffer and obey strict per-tier caps.

### Footstep dust

Movement distance now emits terrain-colored dust on non-water surfaces. Low quality uses wider spacing and one particle; high quality uses tighter spacing and up to three particles. This provides movement feedback without a per-frame emitter allocation.

### Existing shader/VFX stack integrated with quality tiers

The project already contained a modern rendering stack, which was retained and made more mobile-aware:

- PBR material library and terrain atlas blending.
- Animated water normal shader/material.
- Foliage wind vertex modifications.
- Hero rim lighting and environmental fill/rim lights.
- Hit flashes, sparks, combat slash/effect presentation, and screen shake.
- Bloom, color grading, ambient occlusion, SMAA, and cinematic post-processing.

Low/medium/high quality controls now govern post-processing, terrain detail density, shadows, lights, particle counts, and render resolution. Replacing this stack with a parallel shader system would have duplicated code and increased mobile shader compilation and memory costs.

## 4. Mobile bug fixes and optimization

### Mobile-first graphics selection

`resolveGraphicsQuality()` now considers CPU cores, reported device memory, touch capability, and viewport size. Auto mode no longer selects high quality on phone-sized touch devices. Low-memory or four-core devices start at low quality.

### Adaptive resolution with hysteresis

`AdaptiveResolutionGovernor` uses an exponential moving average and sustained frame windows:

- Resolution scales: **1.00, 0.85, 0.70**.
- Degrades only after a sustained slow window.
- Upgrades only after a much longer sustained fast window.
- Uses cooldown periods after changes to avoid visible quality pumping.

This is enabled only in Auto mode; explicit user quality choices remain stable.

### Per-tier rendering budgets

- Render radius: low **20**, medium **24**, high **26** tiles around the player.
- Particle cap: low **64**, medium **120**, high **180**.
- Nearest dynamic point lights: low **2**, medium **5**, high **8**.
- Pixel-ratio caps: low **1.0**, medium **1.5**, high **2.0** before adaptive scaling.
- Low quality disables MSAA at renderer creation and disables dynamic shadows.
- Shadow maps: low path **512** (disabled), medium **1536**, high **3072**.

The project already batches terrain, walls, water, resources, and foliage through instancing. This pass preserves that architecture instead of converting it to per-object meshes.

### Touch input hardening

The touch controller now:

- Tracks joystick and attack pointer IDs independently.
- Captures active pointers.
- Handles `pointercancel` and `lostpointercapture`.
- Resets all input on blur, page hide, or hidden visibility state.
- Disables gameplay touch intent while menus, panels, or death UI are active.
- Prevents queued actions from leaking through modal interfaces.
- Clamps the movable joystick origin inside the usable touch zone.

Safe-area variables and `100dvh` handling already existed and were retained. A `.touch-disabled` state makes modal input state visible and non-interactive.

### Allocation/lifecycle fixes

- Expired particles are removed by swap/pop rather than repeated array splice operations.
- WebGL context-loss listeners now have stable function identities and are removed during renderer disposal.
- World topology cache is bounded to 512 entries rather than growing indefinitely during long travel sessions.
- Existing instanced geometry, texture atlases, PBR material reuse, and object factories remain the primary draw-call/memory optimizations.

## 5. Backend and network reliability

### Client WebSocket reconnection

The world-presence client now includes:

- Exponential reconnect backoff with jitter and a 15-second cap.
- Reconnect-attempt reset after a valid welcome/synchronization message.
- A 35-second stalled-channel watchdog.
- Online/offline awareness.
- Visibility-aware reconnect handling.
- Duplicate reconnect timer prevention.
- Correct listener/timer cleanup on stop.

### REST reliability

The API client now has:

- 12-second request timeout and 5-second health timeout.
- External abort-signal propagation.
- One bounded retry only for safe `GET`/`HEAD` requests on network errors, 408, 429, 502, 503, or 504.
- No automatic replay of mutations, avoiding duplicate purchases, saves, claims, or combat-related commands.
- Existing single-flight session refresh retained.

### Server request limits

The HTTP server now sets:

- 30-second request timeout.
- 15-second header timeout.
- 5-second keep-alive timeout.
- 1,000 requests per socket.

These bounds reduce resources retained by abandoned mobile connections and slow clients.

### Refresh-token cleanup reliability

The scheduled refresh-token cleanup previously launched promises without error handling and could overlap if a database operation stalled. It is now:

- Single-flight.
- Error logged rather than becoming an unhandled rejection.
- Scheduled with an unref’d timer so it cannot keep shutdown alive.

### Authority and anti-cheat consistency

The existing server-authoritative movement, collision sweep, speed tolerance, sequence validation, region-edge transition checks, message-rate limiting, origin checks, idempotency, session socket revocation, and combat authority remain intact.

Centralising the 15×15 world boundary fixes an anti-cheat and reliability problem: outer-region coordinates are now accepted or rejected consistently by protocol parsing, saves, mining/resources, persistence, and topology.

## Bugs found and fixed

1. **World bounds duplicated in six server paths** — expanding one subsystem could cause valid outer-region movement, saves, mining, or resources to be rejected elsewhere. Fixed with `worldBounds.ts`.
2. **Resource profile table covered only 121 regions** — outer regions had no canonical profile. Regenerated and completeness-checked for 225.
3. **Path logic assumed exactly one floor variant** — new road classes could receive grass props, wrong colors, or be overwritten. Fixed with `isPathFloorVariant()` across generation/rendering.
4. **Neighbouring regions had no road-class contract** — visually mismatched crossings were possible when adding roads. Fixed with shared-edge road derivation and tests.
5. **All houses shared one architectural identity** — fixed with five deterministic archetypes and role-specific details.
6. **No cart/trade transport prop** — fixed with a procedural handcart without raising town prop budgets.
7. **Auto graphics could select desktop-quality settings on touch phones** — fixed with touch/viewport-aware capability resolution.
8. **Low quality still paid for MSAA and shadows** — fixed at renderer creation and runtime quality application.
9. **Quality changes could oscillate rapidly** — fixed with EMA, sustained thresholds, and cooldown hysteresis.
10. **Interrupted touch could leave movement or attack active** — fixed through pointer ownership, capture-loss handling, lifecycle reset, and modal gating.
11. **World WebSocket used fixed reconnect timing and had no stall watchdog** — fixed with jittered backoff, watchdog, and online/offline handling.
12. **REST calls could hang indefinitely** — fixed with abortable timeouts.
13. **Blind retries could duplicate mutations** — retries are now limited to safe idempotent reads.
14. **Expired particle removal used repeated splices** — fixed with O(1) swap/pop removal.
15. **WebGL context-loss listener could survive disposal** — fixed with a named listener and cleanup.
16. **Topology cache could grow without bound** — capped at 512 canonical entries.
17. **Refresh-token cleanup could overlap and reject unhandled** — fixed with single-flight scheduling and logging.
18. **HTTP connections used unbounded/default lifecycle behaviour** — explicit request/header/keep-alive/socket limits added.
19. **Legacy tests encoded the old radius numerically** — updated to canonical constants so future expansion remains coherent.
20. **Public world-size copy still advertised 121 regions** — README, architecture notes, landing-page statistics, and overworld documentation now state 225.

## Verification performed

### Client

- `npm run verify`: passed.
- Authority-boundary check: passed.
- **29 test files / 128 tests**: passed.
- PBR validation: **76 authoring textures / 19 material sets / 4 terrain atlases**: passed.
- Seamless wrapping and 3×3 anti-repetition QA: passed.
- Advanced terrain, physical-material, post-processing, water, wind, and lighting contracts: passed.
- Procedural 3D asset validation: passed, including walls, towers, gatehouse, keep, bridge, dock, road marker, monument, and ruined tower.
- TypeScript and Vite production build: passed.
- Standalone HTML build: passed.

### Server

- Source TypeScript check: passed.
- **34 pure-domain test files / 121 tests**: passed.
- World topology tests include full 15×15 boundary openings and shared-edge road-class continuity.
- Full production server bundle could not be completed in this offline sandbox because Prisma attempted to download its platform schema-engine binary from `binaries.prisma.sh`. This is an environment/dependency-generation limitation; source typechecking and all pure server tests are green.

### Full-world sweep

Verification seed `20260720` generated all 225 regions successfully:

- Regions: 225
- Settlements: 30
- Procedural props: 35,826
- All path tiles: 329,207
- Stone road tiles: 101,039
- Resource trail tiles: 29,081

## Performance claims and limitations

A stable 60 FPS target requires measurement on representative physical devices. This sandbox has no mobile device lab and its software WebGL renderer is not a valid thermal/GPU benchmark. Therefore this report does **not** claim measured 60 FPS.

The implementation provides the engineering controls needed to pursue that target: mobile-first startup tiers, strict scene budgets, adaptive resolution, instancing, texture atlases, capped particles/lights, shadow/MSAA reduction, and input/network lifecycle fixes.

ASTC/ETC2/KTX2 transcoding was not added because the repository has no Basis/KTX2 encoder pipeline or runtime loader, and the offline environment cannot fetch one. The current compressed PNG atlases remain validated. A production asset pipeline should add KTX2/Basis Universal with ASTC/ETC2 targets and device fallback.

No live PostgreSQL dataset was available, so database query latency and index usage could not be profiled honestly. Existing bounded queries, transactional authority, idempotency, and cleanup logic were audited; the cleanup overlap and connection-lifecycle defects found were fixed. Production DB work should use `EXPLAIN (ANALYZE, BUFFERS)`, slow-query sampling, connection-pool metrics, and realistic concurrent load.

The 225-region expansion adds space and connective structure while retaining the six authored lands. It does not pretend to be infinite terrain or add new lore-complete lands. Further authored zones can now use the single canonical boundary/profile system without repeating the previous validation bug.

## Recommended next production steps

1. Benchmark Auto/Low/Medium/High on representative Android devices and tune the governor thresholds from measured frame-time and thermal data.
2. Add KTX2/Basis texture packaging and test ASTC/ETC2 fallback matrices.
3. Add route-level code splitting after updating the standalone inliner to support multiple generated JS chunks.
4. Profile PostgreSQL with production-sized inventory, quest, combat, and world-state tables.
5. Run WebSocket soak tests with packet loss, background/foreground cycling, and 500–2,000 simulated connections.
6. Add device screenshots and GPU captures for every biome/weather profile on real WebGL2 hardware.
