# UNDRAL World Design

## Design goals

UNDRAL’s world should be recognized for living ecosystems, regional identity, hidden routes and changing danger rather than for a color-coded PvP ladder.

The core loop is:

```text
Explore a land
→ learn its settlements and ecosystem
→ gather, hunt, trade and build reputation
→ discover a dungeon or smuggler route
→ accept greater environmental and player risk
→ extract rewards
→ change the economy and future route choices
```

## World topology

The current implementation is a bounded 11×11 region grid. Every coordinate resolves to exactly one land using authored anchors and deterministic assignment. Authored settlements and features override nearest-anchor ownership so important landmarks can sit on meaningful borders.

Travel is physical. Neighboring regions share deterministic gate positions; a player crosses by walking through a gate, not by selecting a menu destination.

## Three connected spaces

### Overworld

The overworld contains lands, cities, wilderness, resources, wildlife and entrances. It has no global floor or layer count.

### Dungeons

Dungeons are instanced runs with floors. They have their own seed, mutations and return point. Floors are discarded or reconstructed independently from the overworld.

### The Underway

The Underway is a shared Black Market network. Each land has a culturally distinct hidden entrance, but all routes lead to the same economy and reputation system.

## Identity versus familiar MMO structures

The game may use green/amber/red/dark UI warnings for readability, but those colors are not world terminology. The identity comes from:

- Different loss rules between risk tiers.
- Environmental pressure, not only PvP.
- Regional wildlife and resource chains.
- Hidden settlements and smuggler access.
- Authored cities with economic specialties.
- Dynamic events planned on top of deterministic geography.
- Dungeons integrated into each culture and biome.

## Persistence principles

- Geography is deterministic from the global world seed.
- Player impact is stored as mutations rather than full map snapshots.
- Instance metadata is explicit.
- Return positions are persisted.
- Risk rules are resolved from authoritative region data.
- Old saves migrate forward; they do not silently reinterpret old coordinates as new content.
