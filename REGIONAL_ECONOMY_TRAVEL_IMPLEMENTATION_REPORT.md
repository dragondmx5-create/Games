# UNDRAL Regional Identity, Travel, Market and P2P Trade Upgrade

## Delivery summary

This pass preserves UNDRAL's intended six-land, 121-region overworld and adds the missing regional identity and economy features requested by the owner:

- Six visibly different architectural languages, one for each authored land.
- Land-specific tree silhouettes and foliage colour stories.
- Clear red warning treatment for Fracture regions on the world map without renaming the canonical risk tiers.
- Server-authoritative caravan travel between public settlements.
- A regional player market with inventory escrow and atomic settlement.
- Preservation of the existing shared Black Market/Underway network.
- Server-authoritative proximity P2P trading with two-party acceptance.

The browser remains a presentation and intent layer. Travel destinations, fares, inventory changes, listing settlement and direct-trade settlement are validated by the server.

## World structure retained

The overworld remains an 11 × 11 deterministic region grid:

- 121 total regions.
- Six authored lands.
- 30 authored settlements: six capitals, twelve towns, six outposts and six hidden settlements.
- 24 public caravan destinations; hidden settlements are not offered as normal travel destinations.
- 12 dungeon entrances.
- Six Black Market routes.

The validation seed (`424242`) contains 30 Sanctuary, 63 Frontier, 21 Fracture and seven Lost Territory regions.

## Regional architecture

Settlement houses now carry authoritative land, settlement, architectural-theme and district-variant metadata. The renderer uses these values in the house cache key and in geometry composition.

The six architectural languages are:

1. **Witchlands — `witch-crooked`**: asymmetrical roofs, crooked silhouettes, dark timber and ward-like details.
2. **Green Land — `green-homestead`**: broad homestead roofs, hedges and warmer rural trim.
3. **Rainforest — `rainforest-stilt`**: raised supports, rope beams and larger shaded roof forms.
4. **Frostlands — `frost-steep`**: steep snow-shedding roofs, cold masonry and crystalline trim.
5. **Sunscorched Desert — `desert-courtyard`**: parapets, shaded courtyard/canopy details and warm stone forms.
6. **Cinder Coast — `cinder-industrial`**: soot-dark masonry, roof hardware, pipes and industrial trim.

This is not a palette-only swap. Roof form, base/support geometry, frontage, trim and silhouette vary by land while existing building roles—residential, shop, workshop, guild hall, civic, market hall and quest house—remain intact.

For the validation seed, every land contains 25 settlement buildings across five settlements, for 150 settlement buildings total.

## Regional vegetation

`makeTree()` now receives the current land identity and selects a land-appropriate procedural tree family:

- Twisted, darker growth in Witchlands.
- Broadleaf and ancient trees in Green Land.
- Larger tropical broadleaf forms in Rainforest.
- Pine-heavy vegetation in Frostlands.
- Sparse acacia/palm-like forms in Sunscorched Desert.
- Charred and wind-beaten trees in Cinder Coast.

The existing deterministic nature-placement budgets are preserved, so the six regions differ in both silhouette and density without creating a second placement authority.

## Risk-map presentation

The canonical terminology remains Sanctuary, Frontier, Fracture and Lost Territory.

The map now makes danger easier to understand:

- Fracture regions use a red border and red diagonal warning treatment.
- The map legend labels Fracture as “red danger”.
- Selected Fracture regions explain open PvP and partial item loss.
- Lost Territory retains a darker extreme-danger presentation and full-loot warning.
- Capital icons now follow the actual settlement kind instead of a hard-coded centre-region special case.
- Stale “225 regions” copy was corrected to 121 regions throughout the launch and world-map UI.

## Caravan travel

New server modules under `server/src/travel/` provide the authoritative travel network and travel command.

Rules:

- Departure is allowed only while the player is beside the canonical merchant in a public settlement.
- Hidden settlements are excluded from normal caravan travel.
- The server owns destination coordinates and relocation.
- Fares are deterministic and range from three to 80 crystals.
- Cross-land and destination distance costs are included.
- Crystal debit and world-position relocation are committed through authoritative services.
- Travel commands use idempotency keys. Retrying the same completed request returns the original result rather than charging the fare twice.
- The map travel button reflects actual merchant proximity and affordability instead of presenting a client-only teleport.

## Regional public market

New modules under `server/src/market/` implement a player market separate from the existing Black Market.

Rules:

- The public market is accessible beside a canonical merchant in a public settlement.
- Active listings are scoped to the player's current land.
- Creating a listing removes the item from the seller's canonical inventory and places it in server-side escrow.
- Equipped weapons, currency and companion entities cannot be listed as ordinary items.
- A listing may contain one to 10,000 units, with a unit price from one to 100,000 crystals.
- The seller fee is 5%, with a one-crystal minimum.
- Buy and cancel operations run as serializable atomic transactions.
- Buyer and seller inventory rows are locked in deterministic user-ID order to reduce deadlock risk.
- Command replay is idempotent; create-key reuse with a different payload is rejected.
- A listing from another land cannot be purchased through the current regional market.

The merchant UI now exposes Merchant, Market, P2P Trade and Craft sections. In Black Market mode, the legacy Underway inventory remains isolated and the panel is explicitly labelled **BLACK MARKET**.

## Secure P2P trade

New modules under `server/src/trade/` implement direct player-to-player trade.

Rules:

- The target is resolved by exact online username, case-insensitively.
- Both players must be connected, in the same region, within 96 world pixels and inside a Sanctuary region.
- Sessions expire after ten minutes.
- The server supports up to four item kinds plus crystals per side.
- Currency cannot be inserted as an item stack; companions and equipped weapons are prohibited.
- Updating either offer records the current authoritative inventory revision and clears both acceptance flags.
- Both players must accept before settlement.
- Settlement rechecks proximity, risk tier, inventory revisions and ownership after locking the trade and both inventories.
- Reciprocal inventory deltas are committed atomically.
- A PostgreSQL transaction advisory lock prevents duplicate concurrent sessions for the same player pair.
- Retrying acceptance after a completed settlement returns the completed state without applying the exchange twice.

The current compact client UI edits one item kind plus crystals at a time. The backend contract already supports four item kinds per side.

## Reliability and defects fixed

1. **Stale world scale copy:** launch and map UI still claimed 225 regions after the project returned to 121.
2. **Hard-coded capital marker:** only the centre region received the capital symbol; markers now follow canonical settlement kind.
3. **Economy controls remaining disabled:** market and P2P buttons could remain locked after a successful asynchronous refresh. The command lock now clears before rerender.
4. **Unsafe market listing creation replay:** an idempotency key could be reused without verifying that item, quantity and price matched the original command. Payload collisions now fail closed.
5. **Market replay tied to current location:** a legitimate retry could fail after the player moved. Completed receipts are resolved before current-location validation where safe.
6. **Caravan duplicate-charge risk:** a timed-out response could be manually retried after relocation and produce an “already there” conflict despite having charged once. Travel replay now returns the original fare and canonical destination.
7. **Mutation retry gap:** transient failures on POST commands had no safe retry path. Mutations carrying a valid idempotency key now retry once with the same body/key for selected transient status codes.
8. **Migration key-type mismatch:** the initial new tables used UUID identifiers while the existing `User.id` is `TEXT`, which would break foreign-key creation. New migration columns now use `TEXT` consistently.
9. **Duplicate P2P-session race:** simultaneous invites could create multiple pending sessions for the same pair. A transaction advisory lock serializes pair creation.
10. **Parallel Prisma operations inside one interactive transaction:** parallel promises could compete on a single transaction connection. Trade settlement now performs ordered sequential reads/locks.
11. **Client-only travel affordance:** the map did not accurately represent whether the player was actually near a merchant. Network metadata now exposes authoritative departure availability.
12. **Insufficient regional visual identity:** houses and trees previously differed mainly through broad palette variation. Geometry-level architecture and vegetation families were added per land.

## Database migration

The source includes:

`server/prisma/migrations/20260720150000_market_travel_p2p/migration.sql`

It creates:

- `MarketListing`
- `PlayerTradeSession`
- Foreign keys, status checks, quantity/price checks and query indexes.

Deployment requires a configured PostgreSQL `DATABASE_URL` and generated Prisma client. Typical production deployment:

```bash
npm --prefix server run prisma:generate
npm --prefix server exec -- prisma migrate deploy
npm --prefix server run build
```

Run the migration first in an isolated staging database and exercise listing creation, purchase, cancellation, travel replay and two-account P2P settlement before production rollout.

## Verification completed

- Authority boundary check passed.
- Client: 31 test files, **135 tests passed**.
- Server pure-domain: 38 test files, **133 tests passed**.
- Client source TypeScript check passed.
- Server source TypeScript check passed.
- 76 PBR authoring textures across 19 material sets passed validation.
- Four terrain atlases passed validation.
- Texture wrapping and 3 × 3 repetition QA passed for 19 material sets.
- Advanced terrain, physical materials, post-processing, water, wind and character-lighting contracts passed.
- Procedural 3D asset validation passed, including houses, regional nature and dungeon assets.
- Production client build passed.
- Standalone client artifact was generated.
- Full regional audit passed for all 121 regions and six lands.

## Regional audit highlights

- 121 regions across six lands.
- 30 authored settlements.
- 24 public travel destinations.
- 150 settlement buildings.
- 17,887 environmental props.
- 30 portals, including 12 dungeon entrances and six Black Market routes.
- 21 Fracture red-danger regions and seven Lost Territory regions.
- Six unique land architecture themes.

The full machine-readable result is delivered as `UNDRAL_REGIONAL_FEATURES_AUDIT.json`.

## Limitations and required live validation

- The sandbox did not provide a live PostgreSQL service with two authenticated browser clients, so database-backed multi-user end-to-end tests were not claimed.
- Prisma attempted to download its platform engine from `binaries.prisma.sh`, but the offline sandbox returned a DNS error. Server source typechecking and all pure-domain server tests passed; generated-client production build must be repeated in an online CI/deployment environment.
- The standalone HTML was built without `VITE_API_URL`; authentication, travel, market and trade require a configured live backend.
- Physical-device testing should still cover touch ergonomics, poor-network retries, reconnect during trade, thermal throttling and concurrent market load.
- The client bundle remains approximately 1.25 MB before gzip and produces Vite's chunk-size warning; code splitting is a sensible future loading optimisation but is not a correctness failure.
