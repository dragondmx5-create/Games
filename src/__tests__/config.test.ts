import { describe, it, expect } from 'vitest';
import {
  ENEMY_DEFS, DROP_TABLES, CROPS, WEAPONS, pickEnemyKind, enemyCountFor, EnemyKind, ANIMALS, SHOP_ITEMS,
  WOODCUTTING, MINING, CHEST_LOOT, MATERIAL_KINDS, ARMOR, MaterialKind,
  LEVELING, xpForLevel, QUEST_POOL,
  CRAFTING_RECIPES, WeaponId, lootBagValue,
} from '../config';
import { LootBag } from '../entities';

const KINDS = Object.keys(ENEMY_DEFS) as EnemyKind[];

describe('ENEMY_DEFS', () => {
  it('has sane stats for every kind', () => {
    for (const kind of KINDS) {
      const def = ENEMY_DEFS[kind];
      expect(def.hp).toBeGreaterThan(0);
      expect(def.speed).toBeGreaterThan(0);
      expect(def.damage).toBeGreaterThan(0);
      expect(def.minLayer).toBeGreaterThanOrEqual(1);
      expect(def.weight).toBeGreaterThan(0);
    }
  });

  it('gives every ranged kind a preferredRange and telegraphTime', () => {
    for (const kind of KINDS) {
      const def = ENEMY_DEFS[kind];
      if (!def.ranged) continue;
      expect(def.preferredRange).toBeGreaterThan(0);
      expect(def.telegraphTime).toBeGreaterThan(0);
    }
  });
});

describe('pickEnemyKind', () => {
  it('only ever returns kinds eligible for the given layer + spawn mechanism', () => {
    for (const emergesFromWall of [true, false]) {
      for (let layer = 1; layer <= 5; layer++) {
        for (let i = 0; i < 200; i++) {
          const kind = pickEnemyKind(layer, emergesFromWall, Math.random);
          const def = ENEMY_DEFS[kind];
          expect(def.emergesFromWall).toBe(emergesFromWall);
          expect(layer).toBeGreaterThanOrEqual(def.minLayer);
        }
      }
    }
  });

  it('is deterministic given a deterministic rand function', () => {
    const a = pickEnemyKind(3, false, () => 0);
    const b = pickEnemyKind(3, false, () => 0);
    expect(a).toBe(b);
  });

  it('picks every eligible kind at least once over many trials (roughly matches weights)', () => {
    const seen = new Set<EnemyKind>();
    for (let i = 0; i < 2000; i++) seen.add(pickEnemyKind(5, false, Math.random));
    const eligible = KINDS.filter((k) => !ENEMY_DEFS[k].emergesFromWall && 5 >= ENEMY_DEFS[k].minLayer);
    for (const kind of eligible) expect(seen.has(kind)).toBe(true);
  });
});

describe('enemyCountFor', () => {
  it('increases with layer depth', () => {
    let prev = 0;
    for (let layer = 1; layer <= 5; layer++) {
      const count = enemyCountFor(layer);
      expect(count).toBeGreaterThan(prev);
      prev = count;
    }
  });
});

function assertValidDropEntries(entries: { kind: string; chance: number; amount: [number, number] }[]) {
  for (const drop of entries) {
    expect(drop.chance).toBeGreaterThan(0);
    expect(drop.chance).toBeLessThanOrEqual(1);
    const [lo, hi] = drop.amount;
    expect(lo).toBeGreaterThanOrEqual(1);
    expect(hi).toBeGreaterThanOrEqual(lo);
    if (!MATERIAL_KINDS.includes(drop.kind as MaterialKind)) {
      expect(WEAPONS[drop.kind as keyof typeof WEAPONS]).toBeDefined();
    }
  }
}

describe('DROP_TABLES', () => {
  it('has valid chances and amount ranges for every enemy kind', () => {
    for (const kind of KINDS) {
      const table = DROP_TABLES[kind];
      expect(table).toBeDefined();
      assertValidDropEntries(table);
    }
  });
});

describe('CHEST_LOOT', () => {
  it('has valid chances and amount ranges', () => {
    expect(CHEST_LOOT.length).toBeGreaterThan(0);
    assertValidDropEntries(CHEST_LOOT);
  });
});

describe('ARMOR', () => {
  it('has a valid, distinct damage reduction per tier', () => {
    for (const def of Object.values(ARMOR)) {
      expect(def.reduction).toBeGreaterThan(0);
      expect(def.reduction).toBeLessThan(1);
    }
    expect(ARMOR.iron.reduction).toBeGreaterThan(ARMOR.leather.reduction);
  });
});

describe('CROPS', () => {
  it('has valid growth/yield/minLayer values', () => {
    for (const crop of Object.values(CROPS)) {
      expect(crop.growStageTime).toBeGreaterThan(0);
      expect(crop.harvestYieldMax).toBeGreaterThanOrEqual(crop.harvestYieldMin);
      expect(crop.harvestYieldMin).toBeGreaterThan(0);
      expect(crop.minLayer).toBeGreaterThanOrEqual(1);
      expect(['shrooms', 'crystals']).toContain(crop.grants);
    }
  });
});

describe('ANIMALS', () => {
  it('has valid combat/kill-drop stats for every kind', () => {
    for (const def of Object.values(ANIMALS)) {
      expect(def.hp).toBeGreaterThan(0);
      expect(def.respawnTime).toBeGreaterThan(0);
      expect(def.meatAmount[1]).toBeGreaterThanOrEqual(def.meatAmount[0]);
      expect(def.meatAmount[0]).toBeGreaterThan(0);
      expect(['hide', 'feathers']).toContain(def.material);
    }
  });
});

describe('SHOP_ITEMS', () => {
  it('every tool-kind item references a valid tool and every weapon-kind item a valid weapon', () => {
    for (const item of SHOP_ITEMS) {
      expect(item.cost).toBeGreaterThan(0);
      if (item.kind === 'tool') expect(['axe', 'pickaxe']).toContain(item.tool);
      if (item.kind === 'weapon') expect(WEAPONS[item.weapon!]).toBeDefined();
    }
  });
});

describe('WOODCUTTING / MINING', () => {
  it('has valid yield ranges', () => {
    expect(WOODCUTTING.yieldMax).toBeGreaterThanOrEqual(WOODCUTTING.yieldMin);
    expect(WOODCUTTING.yieldMin).toBeGreaterThan(0);
    expect(MINING.yieldMax).toBeGreaterThanOrEqual(MINING.yieldMin);
    expect(MINING.yieldMin).toBeGreaterThan(0);
  });
});

describe('xpForLevel', () => {
  it('is strictly increasing and matches LEVELING.baseXp at level 1', () => {
    expect(xpForLevel(1)).toBe(LEVELING.baseXp);
    let prev = 0;
    for (let level = 1; level <= 20; level++) {
      const need = xpForLevel(level);
      expect(need).toBeGreaterThan(prev);
      prev = need;
    }
  });

  it('every xp reward in LEVELING is positive', () => {
    expect(LEVELING.xpKill).toBeGreaterThan(0);
    expect(LEVELING.xpChest).toBeGreaterThan(0);
    expect(LEVELING.xpHarvest).toBeGreaterThan(0);
    expect(LEVELING.xpGather).toBeGreaterThan(0);
    expect(LEVELING.xpAnimal).toBeGreaterThan(0);
    expect(LEVELING.hpPerLevel).toBeGreaterThan(0);
  });
});

describe('WEAPONS abilities', () => {
  const ARCHETYPES = ['flurry', 'cleave', 'lunge', 'pierce', 'slam'];

  it('every weapon has a known ability archetype and positive cooldown', () => {
    for (const def of Object.values(WEAPONS)) {
      expect(ARCHETYPES).toContain(def.ability.archetype);
      expect(def.ability.cooldown).toBeGreaterThan(0);
    }
  });

  it('every lunge-archetype weapon has a dash distance and i-frames', () => {
    for (const def of Object.values(WEAPONS)) {
      if (def.ability.archetype !== 'lunge') continue;
      expect(def.ability.dashDist).toBeGreaterThan(0);
      expect(def.ability.invulnSec).toBeGreaterThan(0);
    }
  });

  it('multipliers, when set, are positive', () => {
    for (const def of Object.values(WEAPONS)) {
      const a = def.ability;
      for (const v of [a.arcMul, a.rangeMul, a.damageMul, a.knockback, a.dashDist, a.invulnSec]) {
        if (v !== undefined) expect(v).toBeGreaterThan(0);
      }
    }
  });
});

describe('CRAFTING_RECIPES', () => {
  it('has unique ids', () => {
    const ids = new Set<string>();
    for (const r of CRAFTING_RECIPES) {
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
    }
  });

  it('every materials bag has only valid material kinds with positive integer amounts', () => {
    for (const r of CRAFTING_RECIPES) {
      const entries = Object.entries(r.materials);
      expect(entries.length).toBeGreaterThan(0);
      for (const [mat, amount] of entries) {
        expect(MATERIAL_KINDS).toContain(mat as MaterialKind);
        expect(Number.isInteger(amount)).toBe(true);
        expect(amount).toBeGreaterThan(0);
      }
    }
  });

  it('every output id references a real weapon/armor definition, matching its outputKind', () => {
    for (const r of CRAFTING_RECIPES) {
      if (r.outputKind === 'weapon') {
        expect(r.weapon).toBeDefined();
        expect(WEAPONS[r.weapon!]).toBeDefined();
      } else if (r.outputKind === 'armor') {
        expect(r.armor).toBeDefined();
        expect(ARMOR[r.armor!]).toBeDefined();
      } else {
        expect(r.outputKind).toBe('chest');
      }
    }
  });

  it('crystalCost and minLevel, when set, are positive', () => {
    for (const r of CRAFTING_RECIPES) {
      if (r.crystalCost !== undefined) expect(r.crystalCost).toBeGreaterThan(0);
      if (r.minLevel !== undefined) expect(r.minLevel).toBeGreaterThan(0);
    }
  });

  it('every craft-only weapon (not sold in the shop) has exactly one recipe', () => {
    const shopWeapons = new Set(SHOP_ITEMS.filter((i) => i.kind === 'weapon').map((i) => i.weapon));
    const craftWeapons = CRAFTING_RECIPES.filter((r) => r.outputKind === 'weapon').map((r) => r.weapon);
    for (const w of Object.keys(WEAPONS) as WeaponId[]) {
      if (w === 'bone' || shopWeapons.has(w)) continue; // starter / shop-sourced
      expect(craftWeapons.filter((cw) => cw === w)).toHaveLength(1);
    }
  });
});

describe('lootBagValue', () => {
  function emptyBag(): LootBag {
    return { id: 'bag-test', layer: 1, x: 0, y: 0, loot: 0, shrooms: 0, weapons: [], tools: [], armor: [], chests: 0, wood: 0, iron: 0, meat: 0, hide: 0, feathers: 0 };
  }

  it('values a craft-only weapon above zero (recipe-material fallback, not the missing shop price)', () => {
    const bag = emptyBag();
    bag.weapons = ['iron_falchion'];
    expect(lootBagValue(bag)).toBeGreaterThan(0);
  });

  it('values carried supply crates at the shop price', () => {
    const bag = emptyBag();
    bag.chests = 2;
    const chestCost = SHOP_ITEMS.find((i) => i.kind === 'chest')!.cost;
    expect(lootBagValue(bag)).toBe(2 * chestCost);
  });
});

describe('QUEST_POOL', () => {
  it('has unique ids and valid target/reward values', () => {
    const ids = new Set<string>();
    for (const q of QUEST_POOL) {
      expect(ids.has(q.id)).toBe(false);
      ids.add(q.id);
      expect(q.target).toBeGreaterThan(0);
      expect(q.rewardCrystals).toBeGreaterThan(0);
      expect(q.rewardXp).toBeGreaterThan(0);
      expect(q.label(q.target).length).toBeGreaterThan(0);
    }
  });

  it('has at least 3 entries (pickQuests draws 3 without repeats)', () => {
    expect(QUEST_POOL.length).toBeGreaterThanOrEqual(3);
  });
});
