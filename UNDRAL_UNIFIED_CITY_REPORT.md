# UNDRAL Unified City Overhaul

## Outcome

The surface overworld has been redesigned as **one continuous, sprawling city**. The existing 15×15 coordinate grid remains only as an invisible streaming, persistence, and server-authority partition. Players no longer encounter those coordinates as 225 named zones, gated settlement maps, or repeated wilderness cells.

The implemented city covers 2,400×2,400 surface tiles through 225 mobile-friendly 160×160 streamed sectors. Roads, public spaces, building footprints, doors, collision, resources, NPC roles, and sector seams are generated deterministically from shared client/server modules.

Character, NPC, monster, and animal art factories were not changed.

## City structure

Nine districts provide different density, street character, architecture, and activity:

| District | Density | Main identity | Maximum storeys |
|---|---:|---|---:|
| Crown Centre | High | Civic squares, offices, guild halls | 4 |
| Grand Market Ward | High | Shops, cafés, arcades, market halls | 3 |
| The Old Quarter | High | Timber streets, quest lodges, historic ruins | 3 |
| Civic Heights | Medium | Academies, offices, luxury residences | 4 |
| Artisan Row | Medium | Workshops, brick terraces, guild yards | 3 |
| Canal Ward | Medium | Canals, bridges, cafés, promenades | 3 |
| Garden Quarter | Low | Villas, parks, conservatories | 2 |
| Harbor Front | Medium | Docks, warehouses, inns, mercantile offices | 3 |
| Outer Suburbs | Low | Detached homes, local shops, gardens, farms | 2 |

Density is spatial rather than cosmetic. Central districts use tighter lot spacing, taller buildings, higher commercial probability, and smaller park probability. Outer districts use larger setbacks, fewer storeys, more green spaces, farms, and quieter decoration budgets.

## Building variety

`server/src/world/cityLayout.ts` now authors shared deterministic footprints and metadata for:

- small residential cottages;
- medium residential townhouses;
- luxury residences and manors;
- enterable quest/story houses;
- shops;
- market halls;
- cafés;
- offices;
- guild halls;
- civic buildings;
- workshops.

Seven architectural material languages are distributed by district and role: timber, stone, plaster, brick, canal, garden, and mercantile.

The reference validation seed (`20260720`) generated **4,411 buildings**:

| Role | Count |
|---|---:|
| Small residential | 1,421 |
| Medium residential | 1,555 |
| Luxury residential | 219 |
| Shops | 790 |
| Cafés | 219 |
| Workshops | 87 |
| Guild halls | 31 |
| Market halls | 28 |
| Offices | 29 |
| Civic buildings | 23 |
| Quest/story houses | 9 |

These counts are deterministic for a given world seed. Exact non-quest lot counts can vary with the seed while district rules and the nine story anchors remain stable.

### Visual composition

`src/art3d/houseComposition.ts` and `src/art3d/assets.ts` now map role, style, footprint, and storey count to distinct silhouettes and materials. The renderer can produce cottages, townhouses, manors, quest lodges, shops, market halls, cafés, offices, guild halls, civic buildings, workshops, and lodges rather than presenting every footprint with one house model.

Multi-storey massing, trim, frontage, roof placement, windows, and archetype details vary by building. Emissive windows provide night readability without assigning a point light to every dense-city building.

## Quest houses

Each district has one deterministic story-house anchor and stable quest ID:

- `city-story:crown-centre`
- `city-story:market-ward`
- `city-story:old-quarter`
- `city-story:civic-heights`
- `city-story:artisan-row`
- `city-story:canal-ward`
- `city-story:garden-quarter`
- `city-story:harbor-front`
- `city-story:outer-suburbs`

Quest houses are marked enterable in the canonical footprint and receive an authoritative archivist NPC interaction. This connects them to the existing quest/story framework without inventing new reward values or bypassing server authority.

## Roads and continuity

The city uses three deterministic cross-sector avenues per edge plus curved internal collectors and offset ring streets. Adjacent sectors derive avenue positions from the same edge seed, so roads continue across hidden streaming seams.

Changes include:

- all internal sector seams remain walkable;
- only the true outside perimeter of the full city is sealed;
- region-transition banners and travel identity changes were removed;
- world-map labels now show district and neighborhood identity;
- stone avenues, local streets, paths, bridges, canals, parks, plazas, markets, and waterfronts share canonical placement;
- client prediction and `/ws/world` movement authority use the same topology.

## Public spaces and landmarks

New city-specific procedural props are integrated through the existing `PropKind` and `StylizedAssetFactory` pipeline:

- city fountain;
- clock tower;
- park gazebo;
- lighthouse;
- café terrace.

They are combined with existing markets, handcarts, benches, flower planters, lanterns, bridges, docks, monuments, keeps, and ruined towers. Placement varies by district: civic landmarks occupy the centre, café terraces and markets concentrate in commercial wards, canal bridges align to water, the harbor receives waterfront content, and quieter districts receive parks and gazebos.

## Shared authority and collision

The browser and backend now consume the same city building and public-space definitions. This prevents visible houses from disagreeing with server collision or doors from being decorative-only.

Key modules:

- `server/src/world/cityLayout.ts` — district, road, public-space, building, style, density, and quest-house generation.
- `server/src/world/overworldTopology.ts` — authoritative city collision, streets, buildings, seams, portals, and perimeter.
- `server/src/world/settlementLayout.ts` — city neighborhood, building, farm, and animal projection.
- `src/overworld/registry.ts` — client district/neighborhood identity and palette projection.
- `src/world.ts` — client presentation, landmarks, district decoration, canonical projection.
- `src/art3d/houseComposition.ts` and `src/art3d/assets.ts` — varied building composition.

## Mobile performance decisions

The city remains sector-streamed internally because constructing the full 2,400×2,400-tile surface and all 4,000+ buildings simultaneously would be inappropriate for mobile hardware. The implementation hides this technical partition rather than deleting streaming.

Performance safeguards include:

- per-sector deterministic generation and existing bounded topology caching;
- district-capped residents, street lamps, props, and particles;
- emissive windows instead of point lights on most buildings;
- prototype caching by archetype/style/storey combination;
- no fortification ring or gatehouse geometry at every hidden seam;
- no region-transition UI/audio work during seamless sector travel;
- existing mobile quality tiers, dynamic resolution, visibility budgets, and low-quality shadow/MSAA reductions remain active.

A stable 60 FPS still requires profiling on representative physical devices. The sandbox does not provide reliable real-mobile GPU timing, so no unsupported FPS claim is made.

## Bugs and defects found

### 1. Old Quarter ruins could seal city-house entrances

**Cause:** Ruin collision dressing was carved after authoritative houses. Random ruin walls could overwrite a house door or street approach.

**Fix:** Old Quarter ruins are now carved before occupied lots and streets. Buildings and avenues remain authoritative foreground geometry. A server regression test checks every Old Quarter building entrance.

### 2. Artisan resource specialization was visually ineffective

**Cause:** The artisan iron multiplier rounded down to the same minimum node count as the civic core, so the intended district difference did not exist in generated gameplay.

**Fix:** The artisan profile was raised within the existing resource cap so it generates a distinct iron count. The server resource-layout test now verifies the difference.

### 3. Internal sector boundaries were represented as gated zone borders

**Cause:** The earlier world model sealed each region edge and reopened only authored gate mouths.

**Fix:** Internal seams are fully continuous and server-validated. Only the full city perimeter is sealed.

### 4. Surface identity reset at every streamed coordinate

**Cause:** UI, registry, settlement IDs, and travel feedback treated each coordinate as a separate destination.

**Fix:** All coordinates belong to Undral City. The HUD and map display district/neighborhood names, and seamless transitions no longer trigger region-arrival banners or audio.

### 5. Repetitive settlement building composition

**Cause:** Building footprints were rendered through a narrow archetype set with limited storey/material distinction.

**Fix:** Role, style, density, footprint, and storeys now drive distinct building composition and materials.

### 6. Client/server city footprints could have diverged under separate generation

**Cause:** City-scale variety would be unsafe if the client independently chose visible buildings while the backend validated older settlement rectangles.

**Fix:** Building footprints, doors, roads, parks, canals, and waterfronts are generated in shared server-owned pure modules imported by the client.

## Verification

Completed successfully:

- client source typecheck;
- **130/130 client tests**;
- server source typecheck;
- **125/125 pure server tests**;
- server-authority boundary validation;
- all 19 PBR material sets and four terrain atlases;
- seamless texture repetition QA;
- advanced terrain, water, wind, physical-material, post-processing, and character-lighting contracts;
- procedural 3D art validation for seven representative building archetypes and all five new city landmarks;
- production Vite build;
- standalone HTML artifact build;
- complete 225-sector deterministic generation sweep.

The sweep verified:

- 225 streamed sectors;
- all nine districts;
- 4,411 canonical building footprints for the reference seed;
- exactly nine quest houses;
- every building door walkable;
- 66,192 sampled walkable internal-seam cells;
- 9,600 solid cells around the true outer perimeter.

## Known limitations

- Streaming still occurs at hidden sector boundaries; this is intentional for mobile memory and authority scalability.
- Quest houses expose stable story IDs and authoritative NPC hooks, but this pass does not invent nine complete quest scripts or rebalance rewards.
- The existing six environmental identities remain in palette, resource, dungeon, portal, and economy metadata for compatibility.
- Physical-device performance, thermal behavior, and touch usability require real Android/iOS profiling.
- The standalone build requires a configured backend API because authentication and online authority are mandatory.
- The full server production bundle could not be completed in this offline sandbox because Prisma's generated client and platform engine were absent; `prisma generate` attempted to reach `binaries.prisma.sh` and failed DNS resolution. Server source typechecking and all pure-domain tests passed, so this is recorded as an environment/dependency-generation limitation rather than a city-source failure.
