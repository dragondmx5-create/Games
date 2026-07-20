# Server-Authoritative Combat

## Protocol

The browser sends intent only:

```json
{ "type": "attack", "attackId": "attack:<uuid>", "ability": false, "facing": 1.2 }
```

It never sends damage, target HP, reward, XP or item amounts.

## Server decisions

The backend derives:

- equipped weapon;
- attack profile and cooldown;
- legal targets from authoritative positions;
- range and arc intersection;
- armor reduction;
- enemy and player HP;
- kill ownership;
- loot and progression;
- death loss and Loot Bag contents.

## Persistence

`WorldEnemyState` stores HP, generation and respawn. `WorldEnemyKill` reserves one reward per enemy life. `PlayerCombatState` stores player HP, progression, death and cooldowns. `WorldLootBag` stores dropped canonical inventory.

## Atomic kill settlement

```text
Lock enemy life
→ reserve kill receipt
→ roll server loot
→ mutate canonical inventory
→ update progression and kill count
→ record quest event
→ commit
```

A process restart or concurrent attacker cannot mint a second reward for the same life.

## Client prediction boundary

The client may animate swings, hit flashes and movement. Server snapshots replace economic and combat truth. Dungeon combat follows the same rule through revisioned REST commands: the server owns player/enemy HP, movement collision, weapon profiles, cooldowns, rewards and death settlement.
