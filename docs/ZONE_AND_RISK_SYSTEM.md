# Zone and Risk System

## Terminology

The game uses four authored risk tiers. Familiar colors may be used in UI but never as the primary lore name.

### Sanctuary

- PvP disabled.
- No inventory loss.
- Fast travel may be allowed.
- Capitals and most settlement centers use this tier.

### Frontier

- Conditional or event-driven conflict.
- Twenty-five percent of carried supplies drop on death.
- Equipment is retained.
- Environmental and enemy pressure increase.

### Fracture

- Open PvPvE.
- Sixty percent of carried resources drop.
- One non-starter weapon may drop.
- Player count can remain visible for tactical readability.
- Fracture routes lead toward Lost Territories.

### Lost Territory

- Full-loot rules.
- Non-starter carried equipment and resources drop.
- Player count is hidden.
- Fast travel is disabled.
- Endgame resources, bosses and dungeon routes are concentrated here.

## Data-driven implementation

`RegionProfile.rules` contains:

```ts
interface ZoneRules {
  riskTier: RiskTier;
  displayName: string;
  pvpMode: 'disabled' | 'conditional' | 'open' | 'full-loot';
  itemLoss: 'none' | 'supplies' | 'partial' | 'full';
  showPlayerCount: boolean;
  allowFastTravel: boolean;
  resourceMultiplier: number;
  enemyMultiplier: number;
  environmentalPressure: number;
}
```

Death inventory splitting is isolated in `src/overworld/deathRules.ts` and covered by regression tests.

## Route progression

```text
Settlement / Sanctuary
→ Frontier wilderness
→ Fracture threshold
→ Lost Territory threshold
```

Red-style and black-style gates are landmarks, warnings and future matchmaking/network boundaries. The geography itself remains part of the land instead of becoming a detached generic arena.

## Future dynamic-risk layer

The static tier is the baseline. Future world events can temporarily raise or alter pressure:

- Blood Moon corruption.
- Predator migration.
- Siege or faction conflict.
- Monsoon flooding.
- Whiteout closure.
- Sandstorm route changes.
- Volcanic evacuation.

This dynamic layer is how UNDRAL will further separate itself from fixed-zone MMO maps.
