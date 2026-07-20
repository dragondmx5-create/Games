# `src/overworld/` — authored world data

The source of truth for the six lands and the 121-region overworld identity on
the client. Deterministic geography is not stored as a full map; authored
definitions and mutations are persisted separately.

| File | Responsibility |
|---|---|
| `registry.ts` | **Source of truth** for lands, settlements, features and regional identity. |
| `dungeons.ts` | Authored Dungeon metadata (12 dungeons, two per land). Metadata only — never completion proof. |
| `blackMarket.ts` | The Underway (shared Black Market) route and presentation data. |
| `deathRules.ts` | Per-tier persistent-loss rules (Sanctuary → Frontier → Fracture → Lost Territory). |
| `types.ts` | Shared overworld types. |
| `index.ts` | Barrel re-export of the above. |

## Invariants

- `registry.ts` is authoritative for land/region identity; do not duplicate this
  data elsewhere on the client.
- Dungeon metadata here is authored content, **not** a run or a reward — actual
  runs settle server-side (`server/src/dungeon/`).
- The six risk tiers use the project's own terminology (Sanctuary / Frontier /
  Fracture / Lost Territory), never generic colored-zone naming.
