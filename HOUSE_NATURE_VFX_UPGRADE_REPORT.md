# UNDRAL House Audit, Nature, and Ambient VFX Upgrade

Date: 2026-07-20

## Scope

This pass audits the unified-city house renderer and adds district-aware natural scenery and ambient effects. It preserves server-authoritative building footprints, doors, movement, resources, and quest ownership. Character, NPC, monster, and animal artwork was not modified.

## House audit result

The shared city layout remains structurally sound after the fixes in this pass. A deterministic full-city sweep generated all 225 hidden streaming sectors and checked 4,552 building entrances. Every entrance remained on a walkable authoritative tile, including all nine quest houses.

Seven representative high-level building archetypes were also constructed through the production `StylizedAssetFactory` and passed procedural geometry validation for finite positions, UV0/UV1, PBR materials, bounds, and contact shadows:

- Cottage
- Townhouse
- Luxury manor
- Quest house
- Market hall
- Office building
- Workshop

This automated validation is stronger than spot-checking a few screenshots, but it is not a substitute for a final art-direction review of every procedural combination on a physical GPU.

## House defects found and fixed

1. **Visually sealed walkable doors**
   - The authoritative layout allowed passage through a door tile, but the procedural facade could still read as a closed slab over a continuous plinth.
   - Door panels now contain split jambs, a threshold, a real opening, and a slightly ajar leaf.

2. **Incorrect gable material**
   - Some brick, stone, canal, and mercantile houses received a hard-coded beige roof gable.
   - Gables now use the building's actual facade plaster/material color.

3. **Incomplete palette cache key**
   - The house prototype cache omitted palette values used by trim and role decorations.
   - A house loaded in a later land could inherit visual materials from an earlier palette.
   - The cache key now includes every palette input used by the prototype.

4. **Door offset missing from the prototype cache key**
   - Houses with the same size, side, style, storeys, and ordinal but different door positions could reuse the wrong facade prototype.
   - The relative door index is now part of the cache key and is covered by the procedural-art validator.

5. **House prototype cache growth across streamed sectors**
   - Exploring many sectors could retain house geometry prototypes from prior worlds for the entire renderer session.
   - After old house clones are detached on a world transition, their prototype cache is now explicitly disposed and rebuilt for the newly streamed world.

6. **Unbounded chimney ambience pressure**
   - Dense neighborhoods could fill the shared particle pool with chimney smoke and suppress weather, footsteps, or combat effects.
   - Smoke eligibility is deterministic per archetype and only the nearest active chimneys receive emitters: zero on low, two on medium, and four on high quality.

7. **Redundant renderer disposal guard**
   - A duplicated disposal condition was removed while auditing renderer lifecycle code.

## New natural assets

The existing procedural modeling and PBR material system now provides:

- Broadleaf tree variants
- Ancient park trees
- Pine trees
- Mossy boulders
- Outer-perimeter cliff outcrops
- Flower patches
- Reeds and wetland clusters

Canonical harvestable `tree` props still use the same server resource kind. Their visual factory now selects broadleaf, pine, or occasional ancient silhouettes deterministically, so resource/save behavior is unchanged.

## District-aware placement

Nature placement is deterministic and derived from the city district and authored open spaces:

- Garden Quarter and Outer Suburbs receive the strongest tree silhouettes.
- Garden Quarter parks guarantee ancient trees and boulder groupings.
- Civic Heights receives formal pine accents.
- Canal and Harbor spaces receive reeds near actual water tiles.
- Dense central districts keep lower free-nature budgets for street readability.
- Cliff outcrops appear only on the true outside city perimeter and are anchored to authoritative rock tiles, never hidden streaming seams.

Placement rejects building footprints, roads, portals, canonical resources, invalid ground, and nearby scenery.

A full-city seed-424242 sweep produced 977 new natural props:

| Prop | Count |
|---|---:|
| Ancient trees | 32 |
| Pine trees | 43 |
| Boulders | 255 |
| Cliff outcrops | 162 |
| Flower patches | 449 |
| Reed clusters | 36 |

The sweep reported zero props inside buildings, on roads, on invalid ground, on internal streaming seams, or within the protected portal radius.

## Ambient VFX upgrade

- Foliage groups now carry wind metadata and sway through the existing shared wind model.
- Nearby trees can release bounded falling leaves.
- Flower patches can emit small pollen/firefly motes.
- Reeds can emit soft water-edge mist.
- Ambient emitters are distance-limited and disabled on low quality.
- Medium and high tiers use separate bounded spawn rates.
- The shared point-particle renderer now uses a soft-circle shader with per-particle size and alpha instead of hard square points.
- Rain, snow, mist, leaves, pollen, and footsteps receive distinct size/opacity behavior.
- Particle spawning occurs before simulation in the frame update, removing a one-frame response delay.

## Mobile controls and budgets

- New scenery uses deterministic per-sector budgets rather than unrestricted scatter.
- Cliff, tree, flower, and reed meshes are culled by the existing visible chunk.
- Ambient nature particles are disabled on low quality and limited to nearby emitters.
- Chimney smoke lights/effects are nearest-only.
- House prototype geometry is released when the streamed world changes.
- Existing medium/low draw-distance and quality controls remain intact.

## Regression coverage

Added `src/__tests__/cityNature.test.ts` to verify:

- District-specific silhouettes
- Deterministic placement
- No building-interior overlap
- No path overlap using the final rendered prop tile
- Cliff anchoring to rock
- No cliffs on internal streaming seams

The procedural-art validator now also constructs and checks ancient trees, pines, boulders, cliff outcrops, flower patches, reeds, and different-offset house doors.

## Verification

Passed:

- `npm run verify`
  - Authority-boundary check
  - 134 client tests
  - PBR validation for 76 textures / 19 material sets
  - Four terrain-atlas checks
  - Texture seam and repetition QA
  - Advanced terrain, physical material, post-processing, water, foliage wind, and character-lighting contracts
  - Procedural-art validation
  - Production client build
- `npm run artifact`
- `npm --prefix server run typecheck:source`
- `npm --prefix server run test:pure`
  - 125 server tests
- Full deterministic sweep of all 225 city sectors
  - 4,552 walkable building entrances
  - Nine quest houses
  - 977 validated new natural props
  - Zero placement errors

## Known verification limits

- The sandbox does not provide reliable physical-mobile GPU profiling, so stable frame rate and thermal behavior still require testing on representative Android and iOS devices.
- No claim is made that every one of the 4,552 generated buildings received an individual manual art screenshot review.
- The standalone HTML was built without `VITE_API_URL`; authentication and online play require a configured backend.
