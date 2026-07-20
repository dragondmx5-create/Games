import {
  TILE, PLAYER, WEAPONS, WeaponId, ANIMALS, SHOP_ITEMS, ShopItemId,
  CROPS, WOODCUTTING,
  MaterialKind, ARMOR, CRAFTING_RECIPES,
  xpForLevel, QuestTrack,
  WORLD_RADIUS,
} from './config';
import {
  World, WorldPortal, Tile, Chest, generateRegion, generateBlackMarketHub, worldFromDungeonTopology, regionKey, inWorldBounds, EdgeDir,
  tileAt, farmPlotAt, resourceNodeAtTile, setRegionResourceStatuses, setRegionResourceUnavailable, prepareAuthoritativeEnemyArea, prepareAuthoritativeChestArea, prepareAuthoritativeSettlementArea, type WorldResourceNode, type WorldMiningNode,
} from './world';
import { Player, Enemy, Npc, Animal, Pet, LootBag, WeaponPickup, newPlayer, newEnemy, newNpc, newAnimal, newPet, moveWithCollision, wanderStep, dist, currentWeapon } from './entities';
import { Renderer, HIT_FLASH_TIME } from './render3d';
import { Input } from './input';
import { Assets } from './assets';
import { TouchControls } from './touch';
import { AudioManager } from './audio';
import { Stats, loadStats, saveStats } from './stats';
import { setPanelOpen } from './tween';
import { SaveData, RegionMutations, buildSaveData, reconstructFromSave, migrateSave, captureMutations, applyMutations } from './save';
import {
  putSave, putDeathSave, claimVault, getPendingVaultProofs, getRegionResources, harvestWorldResource, getRegionMining, strikeServerMiningNode, getRegionNpcs, interactServerNpc, getRegionChests, openServerWorldChest, openServerSupplyCrate, getServerInventory, getServerInventoryCatalog,
  purchaseServerItem, craftServerItem, equipServerWeapon, respawnAfterDeath, admitServerPvp, getActivePvp, getServerUnderworld, enterServerUnderworld, exitServerUnderworld, purchaseServerUnderworldOffer, getServerQuests, claimServerQuest, claimServerStory, getServerSettlement, plantServerFarmPlot, harvestServerFarmPlot, collectServerAnimal, getActiveDungeon, startServerDungeon, moveServerDungeon, attackServerDungeon, openServerDungeonChest, completeServerDungeonFloor, advanceServerDungeonFloor, exitServerDungeon, settleServerDungeonDeath,
  getServerTravelNetwork, travelServerCaravan, getServerMarketListings, createServerMarketListing, buyServerMarketListing, cancelServerMarketListing,
  getServerPlayerTrades, createServerPlayerTrade, updateServerPlayerTradeOffer, acceptServerPlayerTrade, cancelServerPlayerTrade,
  ApiError, type ServerInventorySnapshot, type ServerInventoryCatalog, type ServerItemId, type ServerCombatPlayerSnapshot, type ServerUnderworldOffer, type ServerUnderworldState, type ServerUnderworldOfferId, type ServerQuest, type ServerStoryQuest, type ServerDungeonSnapshot, type ServerDungeonCommandResponse, type ServerDungeonVaultProof, type ServerPvpSession, type ServerPvpAdmissionResponse, type ServerPvpReturnResponse, type ServerMarketListing, type ServerTradeSession,
} from './api';
import { GamePersistence } from './gamePersistence';
import { getDungeon } from './overworld/dungeons';
import { getLand, regionProfileAt } from './overworld/registry';
import type { LandId, RegionProfile } from './overworld/types';
import {
  WorldPresenceClient, type AuthoritativeWorldPosition, type RemoteWorldPlayer, type AuthoritativeEnemySnapshot,
  type AuthoritativeLootBagSnapshot, type CombatHitResult,
} from './worldPresence';
import { applyServerInventorySnapshot, projectServerItemStacks } from './serverInventory';
import { notify, setConnection, setSaveState, updateRuntime } from './ui/events';
import { catalogOffer, catalogRecipe, crownValue, formatStackMap, itemPresentation, primaryOutput } from './ui/economyPresentation';
import { iconSvg } from './ui/gameIcons';

import { escapeUi, type ActiveDungeonState, type MarketReturnState } from './game/session';

export class Game {
  private world: World;
  private player: Player;
  private enemies: Enemy[] = [];
  private npcs: Npc[] = [];
  private animals: Animal[] = [];
  private pet: Pet | null = null;
  private bags: LootBag[] = [];
  private pickups: WeaponPickup[] = [];
  private renderer: Renderer;
  private input = new Input();
  private worldPresence: WorldPresenceClient;
  private remotePlayers = new Map<string, { player: Player; username: string }>();
  private serverBags: LootBag[] = [];
  private authoritativeDeathToken: string | null = null;
  private harvestInFlight = new Set<string>();
  private miningInFlight = new Set<string>();
  private npcInteractInFlight = new Set<string>();
  private chestOpenInFlight = new Set<string>();
  private supplyCrateOpenInFlight = false;
  private farmCommandInFlight = new Set<string>();
  private animalCollectInFlight = new Set<string>();
  private serverInventoryRevision = 0;
  private economyCommandInFlight = false;
  private canonicalInventory: ServerInventorySnapshot | null = null;
  private serverCatalog: ServerInventoryCatalog | null = null;
  private respawnInFlight = false;
  private persistence = new GamePersistence({ putSave, putDeathSave });
  private stats: Stats;
  // the surface overworld is a bounded region grid generated from ONE
  // global server-issued overworld seed. Dungeon run/floor seeds and
  // topology arrive only in the authenticated server snapshot.
  private mode: 'surface' | 'dungeon' | 'black-market' = 'surface';
  private running = false;
  private pvpCommandInFlight = false;
  private region = { rx: 0, ry: 0 };
  private activeDungeon: ActiveDungeonState | null = null;
  private serverDungeon: ServerDungeonSnapshot | null = null;
  private dungeonCommandInFlight = false;
  private dungeonMoveAccumulatorMs = 0;
  private dungeonDeathSettlementInFlight = false;
  private vaultProofSettlementTail: Promise<void> = Promise.resolve();
  private marketReturn: MarketReturnState | null = null;
  private underworldReputation = 0;
  private forbiddenDungeonKeys = 0;
  private activeUnderworldContracts = 0;
  private inspectionProtection = 0;
  private underworldSessionToken: string | null = null;
  private serverUnderworldOffers: ServerUnderworldOffer[] = [];
  private discoveredMarketRoutes = new Set<LandId>(['green-land']);
  // mutation snapshots for every touched region EXCEPT the loaded one (the
  // live World + choppedTrees/gatheredTiles are the current region's state)
  private regionStore = new Map<string, RegionMutations>();
  private visited = new Set<string>([regionKey(0, 0)]);

  private dead = false;
  private flashRed = 0;
  private statsSaveTimer = 0;
  private cloudSaveTimer = 0;
  private lastTime = 0;
  private shopOpen = false;
  private invOpen = false;
  private mapOpen = false;
  private journalOpen = false;
  private quests: ServerQuest[] = [];
  private stories: ServerStoryQuest[] = [];
  private questSyncInFlight = false;
  // Vault proof settlement is serialized client-side for clean UX; server
  // proof receipts remain the only authority and make retries idempotent.
  // accumulated incrementally as they happen, not diffed at save time — see
  // save.ts's module comment for why (chests/farmPlots are read live instead).
  private choppedTrees: { x: number; y: number }[] = [];
  private gatheredTiles: { tx: number; ty: number }[] = [];

  private hpFill = document.getElementById('hp-fill')!;
  private xpFill = document.getElementById('xp-fill')!;
  private depthEl = document.getElementById('depth')!;
  private lootEl = document.getElementById('loot')!;
  private weaponEl = document.getElementById('weapon-label')!;
  private deathEl = document.getElementById('death')!;
  private deathMsgEl = document.getElementById('death-msg')!;
  private shopEl = document.getElementById('shop-panel')!;
  private shopListEl = document.getElementById('sp-list')!;
  private shopStatusEl = document.getElementById('sp-status')!;
  private shopTabTradeEl = document.getElementById('sp-tab-trade')!;
  private shopTabCraftEl = document.getElementById('sp-tab-craft')!;
  private shopTabMarketEl = document.getElementById('sp-tab-market')!;
  private shopTabP2pEl = document.getElementById('sp-tab-p2p')!;
  private shopSection: 'merchant' | 'craft' | 'market' | 'p2p' = 'merchant';
  private questListEl = document.getElementById('quest-list')!;
  private invEl = document.getElementById('inventory-panel')!;
  private invListEl = document.getElementById('inv-list')!;
  private mapEl = document.getElementById('world-map-panel')!;
  private mapGridEl = document.getElementById('world-map-grid')!;
  private mapDetailsEl = document.getElementById('world-map-details')!;
  private journalEl = document.getElementById('journal-panel')!;
  private journalStoryEl = document.getElementById('journal-story')!;
  private journalDailyEl = document.getElementById('journal-daily')!;
  private journalSystemsEl = document.getElementById('journal-systems')!;

  constructor(
    canvas: HTMLCanvasElement,
    assets: Assets,
    private touch: TouchControls,
    private audio: AudioManager,
    private worldSeed: number,
    private readonly onPvpHandoff: (admission: ServerPvpAdmissionResponse, game: Game) => void = () => {},
  ) {
    this.stats = loadStats();
    this.stats.sessions++;
    this.world = generateRegion(0, 0, this.worldSeed);
    this.world.chests = [];
    this.world.weaponSpots = [];
    this.world.farmPlots = [];
    this.world.animalSpawns = [];
    this.world.npcSpawns = [];
    this.world.miningNodes = [];
    this.player = newPlayer(this.world);
    this.renderer = new Renderer(canvas, assets);
    this.worldPresence = new WorldPresenceClient(
      (players) => this.applyRemotePresence(players),
      (position) => this.applyAuthoritativeWorldPosition(position),
      {
        onCombatSnapshot: (enemies, bags) => this.applyCombatSnapshot(enemies, bags),
        onCombatPlayer: (player) => this.applyCombatPlayer(player),
        onCombatResult: (hits, player, inventory) => this.applyCombatResult(hits, player, inventory),
        onPlayerDamaged: (damage, player) => this.applyAuthoritativeDamage(damage, player),
        onPlayerDied: (payload) => this.applyAuthoritativeDeath(payload.player, payload.riskTier, payload.deathToken, payload.bag, payload.inventory),
        onBagClaimed: (bagId, inventory) => this.applyBagClaim(bagId, inventory),
        onCombatError: (message) => this.renderer.addFloat(this.player.x, this.player.y - 22, message, '#d88a7a'),
      },
    );
    this.spawnEnemies();
    this.spawnPickups();
    this.spawnNpcs();
    this.renderQuestBox();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        saveStats(this.stats);
        this.saveCloud();
      }
    });
    window.addEventListener('beforeunload', () => {
      saveStats(this.stats);
      this.saveCloud();
    });
    // mobile: tap the death screen to go back down
    this.deathEl.addEventListener('pointerdown', () => {
      if (this.dead) void this.respawn();
    });
    document.getElementById('sp-close')!.addEventListener('click', () => this.closeShop());
    this.shopTabTradeEl.addEventListener('click', () => this.setShopTab('merchant'));
    this.shopTabMarketEl.addEventListener('click', () => this.setShopTab('market'));
    this.shopTabP2pEl.addEventListener('click', () => this.setShopTab('p2p'));
    this.shopTabCraftEl.addEventListener('click', () => this.setShopTab('craft'));
    document.getElementById('inv-close')!.addEventListener('click', () => this.closeInventory());
    document.getElementById('inv-corner-btn')!.addEventListener('click', () => {
      this.invOpen ? this.closeInventory() : this.openInventory();
    });
    document.getElementById('map-corner-btn')!.addEventListener('click', () => {
      this.mapOpen ? this.closeWorldMap() : this.openWorldMap();
    });
    document.getElementById('world-map-close')!.addEventListener('click', () => this.closeWorldMap());
    document.getElementById('journal-corner-btn')!.addEventListener('click', () => {
      this.journalOpen ? this.closeJournal() : this.openJournal();
    });
    document.getElementById('journal-inline-btn')!.addEventListener('click', () => this.openJournal());
    document.getElementById('journal-close')!.addEventListener('click', () => this.closeJournal());
    document.getElementById('respawn-btn')!.addEventListener('click', () => {
      if (this.dead) void this.respawn();
    });
  }

  async initializeOnline(): Promise<ServerPvpSession | null> {
    setConnection('pending', 'Synchronizing canonical state');
    const [snapshot, dungeon, pvp] = await Promise.all([
      getServerInventory(),
      getActiveDungeon(),
      getActivePvp(),
    ]);
    this.applyCanonicalInventory(snapshot);

    const optional = await Promise.allSettled([
      getServerInventoryCatalog(),
      getServerUnderworld(),
      getServerQuests(),
      getPendingVaultProofs(),
    ] as const);

    const [catalogResult, underworldResult, questResult, proofsResult] = optional;
    if (catalogResult.status === 'fulfilled') this.serverCatalog = catalogResult.value;
    else notify({ title: 'Economy catalog fallback', message: 'The merchant UI is using its bundled presentation data until the server catalog is reachable.', tone: 'info' });

    if (underworldResult.status === 'fulfilled') this.applyCanonicalUnderworld(underworldResult.value.state, underworldResult.value.offers);
    else notify({ title: 'Underway state unavailable', message: 'Hidden-market status will refresh when you enter an Underway route.', tone: 'info' });

    if (questResult.status === 'fulfilled') {
      this.quests = questResult.value.quests;
      this.stories = questResult.value.stories;
    } else {
      notify({ title: 'Journal synchronization delayed', message: 'World play can continue; verified objectives will retry in the background.', tone: 'info' });
      void this.refreshServerQuests(false);
    }
    this.renderQuestBox();
    this.renderJournal();

    if (dungeon && pvp) throw new Error('server authority conflict: Dungeon and PvP are both blocking');
    if (pvp) return pvp;

    if (dungeon) this.applyDungeonSnapshot(dungeon);
    else if (this.activeDungeon) this.discardUnverifiedDungeonSave();
    if (proofsResult.status === 'fulfilled') await this.settleVaultProofs(proofsResult.value);

    await this.worldPresence.start();
    this.worldPresence.setActive(this.mode === 'surface');
    if (this.mode === 'surface') await this.syncRegionAuthority();
    if (dungeon?.status === 'death_pending') void this.settleDungeonAuthoritativeDeath();
    setConnection('online', 'Realm synchronized');
    notify({ title: 'Expedition synchronized', message: 'Inventory, position, combat and world state are now server-authoritative.', tone: 'success' });
    return null;
  }

  private applyCanonicalUnderworld(state: ServerUnderworldState, offers: ServerUnderworldOffer[] = this.serverUnderworldOffers): void {
    this.underworldReputation = state.reputation;
    this.discoveredMarketRoutes = new Set(state.discoveredRoutes as LandId[]);
    this.forbiddenDungeonKeys = state.forbiddenDungeonKeys;
    this.activeUnderworldContracts = state.activeContracts;
    this.inspectionProtection = state.inspectionProtection;
    this.underworldSessionToken = state.sessionToken;
    this.serverUnderworldOffers = offers;
    this.renderJournal();
    for (const landId of state.revealedLostLands as LandId[]) {
      const hidden = getLand(landId).features.find((feature) => feature.kind === 'black-gate');
      if (hidden) this.visited.add(regionKey(hidden.rx, hidden.ry));
    }
  }

  private applyCanonicalInventory(snapshot: ServerInventorySnapshot): void {
    this.canonicalInventory = snapshot;
    this.serverInventoryRevision = snapshot.revision;
    updateRuntime({ inventoryRevision: snapshot.revision });
    const projection = applyServerInventorySnapshot(this.player, snapshot);
    if (projection.hasPet && !this.pet) this.pet = newPet(this.player.x + TILE, this.player.y);
    else if (!projection.hasPet) this.pet = null;
  }

  private async refreshCanonicalInventory(): Promise<void> {
    this.applyCanonicalInventory(await getServerInventory());
    if (this.shopOpen) this.renderShopTabs();
    if (this.invOpen) this.renderInventoryList();
  }

  private discardUnverifiedDungeonSave(): void {
    const returning = this.activeDungeon;
    this.mode = 'surface';
    this.serverDungeon = null;
    this.activeDungeon = null;
    if (returning && inWorldBounds(returning.returnRegion.rx, returning.returnRegion.ry)) {
      this.region = { ...returning.returnRegion };
      this.world = this.loadRegion(this.region.rx, this.region.ry);
      if (Number.isFinite(returning.returnPos.x) && Number.isFinite(returning.returnPos.y) && returning.returnPos.x >= 0 && returning.returnPos.y >= 0) {
        this.player.x = returning.returnPos.x;
        this.player.y = returning.returnPos.y;
      }
    } else {
      this.region = { rx: 0, ry: 0 };
      this.world = this.loadRegion(0, 0);
      this.player.x = (this.world.entrance.x + 0.5) * TILE;
      this.player.y = (this.world.entrance.y + 0.5) * TILE;
    }
    this.enemies = [];
    this.spawnNpcs();
    this.spawnPickups();
    this.renderer.addFloat(this.player.x, this.player.y - 28, 'Legacy Dungeon resume rejected: no active server run', '#d88a7a');
  }

  private applyDungeonSnapshot(snapshot: ServerDungeonSnapshot): void {
    const dungeon = getDungeon(snapshot.dungeonId);
    const previousEnemies = new Map(this.enemies.map((enemy) => [enemy.id, enemy]));
    this.serverDungeon = snapshot;
    this.mode = 'dungeon';
    this.activeDungeon = {
      id: snapshot.dungeonId,
      floor: snapshot.floor,
      seed: snapshot.runSeed,
      returnRegion: { rx: snapshot.returnPosition.rx, ry: snapshot.returnPosition.ry },
      returnPos: { x: snapshot.returnPosition.x, y: snapshot.returnPosition.y },
    };
    this.world = worldFromDungeonTopology(snapshot.topology);
    this.world.visualLayer = getLand(dungeon.landId).generation.visualLayer;
    this.world.dangerLevel = Math.max(1, dungeon.recommendedLevel + snapshot.floor - 1);
    this.world.chests = snapshot.chests.map((chest) => ({
      id: chest.id,
      x: chest.x,
      y: chest.y,
      opened: chest.opened,
      serverOwned: true,
    }));
    this.enemies = snapshot.enemies.filter((enemy) => enemy.alive).map((state) => {
      const enemy = previousEnemies.get(state.id) ?? newEnemy(state.kind, state.x, state.y, snapshot.floor);
      enemy.id = state.id;
      enemy.serverOwned = true;
      enemy.kind = state.kind;
      enemy.x = state.x;
      enemy.y = state.y;
      enemy.hp = state.hp;
      enemy.maxHp = state.maxHp;
      enemy.damage = state.damage;
      enemy.speed = state.speed;
      enemy.emergeTimer = 0;
      enemy.aggro = true;
      return enemy;
    });
    this.player.x = snapshot.player.x;
    this.player.y = snapshot.player.y;
    this.player.facing = snapshot.player.facing;
    this.player.hp = snapshot.player.hp;
    this.player.maxHp = snapshot.player.maxHp;
    this.choppedTrees = [];
    this.gatheredTiles = [];
    this.npcs = [];
    this.animals = [];
    this.pickups = [];
    this.stats.deepestLayer = Math.max(this.stats.deepestLayer, Math.min(5, snapshot.floor));
    this.worldPresence.setActive(false);
  }

  private applyDungeonCommandResponse(response: ServerDungeonCommandResponse): void {
    const previousHp = this.player.hp;
    this.applyDungeonSnapshot(response.dungeon);
    if (response.inventoryCommand) this.applyCanonicalInventory(response.inventoryCommand.inventory);
    if (response.combatPlayer) {
      this.player.xp = response.combatPlayer.xp;
      this.player.level = response.combatPlayer.level;
    }
    if ((response.damageTaken ?? 0) > 0 || response.dungeon.player.hp < previousHp) {
      this.flashRed = 0.5;
      this.renderer.shake(2.5);
    }
    if (response.killedEnemyIds?.length) {
      this.stats.kills += response.killedEnemyIds.length;
      this.audio.playHit();
      saveStats(this.stats);
    }
    const projected = projectServerItemStacks(response.reward ?? {});
    const labels: string[] = [];
    if (projected.loot) labels.push(`${projected.loot} crystals`);
    if (projected.shrooms) labels.push(`${projected.shrooms} shrooms`);
    if (projected.chests) labels.push(`${projected.chests} crate`);
    if (labels.length) this.renderer.addFloat(this.player.x, this.player.y - 28, `Server reward: ${labels.join(', ')}`, '#7de8c3');
    if (response.contractSettled) {
      this.activeUnderworldContracts = Math.max(0, this.activeUnderworldContracts - 1);
      this.underworldReputation += 5;
      this.renderer.addFloat(this.player.x, this.player.y - 42, 'Anonymous Contract settled by floor receipt', '#b98af0');
    }
    if (response.vaultProofs?.length) void this.settleVaultProofs(response.vaultProofs);
    if (response.dungeon.status === 'death_pending') void this.settleDungeonAuthoritativeDeath();
  }

  private settleVaultProofs(proofs: readonly ServerDungeonVaultProof[]): Promise<void> {
    const unique = [...new Map(proofs.map((proof) => [proof.id, proof])).values()];
    const operation = this.vaultProofSettlementTail.then(async () => {
      for (const proof of unique) {
        let claim;
        try {
          claim = await claimVault(proof.id);
        } catch {
          // Proof ID is the semantic idempotency key; a lost response can be
          // recovered by replaying the exact same proof.
          claim = await claimVault(proof.id);
        }
        this.applyCanonicalInventory(claim.inventory);
        this.renderer.addFloat(this.player.x, this.player.y - 36, `Vault layer ${claim.layer} proof accepted: +${claim.claimed}`, '#d9a772');
      }
    });
    this.vaultProofSettlementTail = operation.catch((error: unknown) => {
      this.renderer.addFloat(this.player.x, this.player.y - 36, error instanceof ApiError ? error.message : 'Vault proof claim failed', '#d88a7a');
    });
    return this.vaultProofSettlementTail;
  }

  private async refreshDungeonAuthority(): Promise<void> {
    const [snapshot, pendingVaultProofs] = await Promise.all([getActiveDungeon(), getPendingVaultProofs()]);
    if (snapshot) this.applyDungeonSnapshot(snapshot);
    else if (this.mode === 'dungeon') this.discardUnverifiedDungeonSave();
    await this.settleVaultProofs(pendingVaultProofs);
  }

  private async settleDungeonAuthoritativeDeath(): Promise<void> {
    if (this.dungeonDeathSettlementInFlight || !this.serverDungeon || this.serverDungeon.status !== 'death_pending') return;
    this.dungeonDeathSettlementInFlight = true;
    this.dead = true;
    this.deathMsgEl.textContent = 'Settling the authoritative Dungeon death atomically…';
    setPanelOpen(this.deathEl, true, 'visible', true);
    try {
      const settled = await settleServerDungeonDeath(this.serverDungeon.runId);
      this.serverDungeon = settled.dungeon;
      this.applyAuthoritativeDeath(settled.player, settled.death.riskTier, settled.death.token, settled.death.bag, settled.death.inventory.inventory);
    } catch (error) {
      this.deathMsgEl.textContent = error instanceof ApiError ? error.message : 'Unable to settle the authoritative Dungeon death. Press Enter to retry.';
    } finally {
      this.dungeonDeathSettlementInFlight = false;
    }
  }

  private applyAuthoritativeWorldPosition(position: AuthoritativeWorldPosition): void {
    if (this.mode !== 'surface' || !inWorldBounds(position.rx, position.ry)) return;
    const regionChanged = this.region.rx !== position.rx || this.region.ry !== position.ry;
    if (regionChanged) {
      this.storeCurrentRegion();
      this.region = { rx: position.rx, ry: position.ry };
      this.world = this.loadRegion(position.rx, position.ry);
      this.spawnEnemies();
      this.spawnNpcs();
      this.spawnPickups();
      this.remotePlayers.clear();
    }
    this.player.x = position.x;
    this.player.y = position.y;
    if (this.pet) {
      this.pet.x = position.x + TILE;
      this.pet.y = position.y;
    }
    if (regionChanged) void this.syncRegionAuthority();
  }

  private applyRemotePresence(players: RemoteWorldPlayer[]): void {
    const visible = new Set(players.map((player) => player.userId));
    for (const userId of this.remotePlayers.keys()) if (!visible.has(userId)) this.remotePlayers.delete(userId);
    for (const remote of players) {
      let actor = this.remotePlayers.get(remote.userId);
      if (!actor) {
        actor = { player: newPlayer(this.world), username: remote.username };
        actor.player.x = remote.x;
        actor.player.y = remote.y;
        this.remotePlayers.set(remote.userId, actor);
      }
      const dx = remote.x - actor.player.x;
      const dy = remote.y - actor.player.y;
      actor.player.moving = Math.hypot(dx, dy) > 0.5;
      if (Math.abs(dx) > Math.abs(dy)) { actor.player.dir = 'side'; actor.player.flipX = dx < 0; }
      else if (dy < 0) actor.player.dir = 'up';
      else if (dy > 0) actor.player.dir = 'down';
      actor.player.x = remote.x;
      actor.player.y = remote.y;
    }
  }

  private applyCombatSnapshot(enemies: AuthoritativeEnemySnapshot[], bags: AuthoritativeLootBagSnapshot[]): void {
    if (this.mode !== 'surface') return;
    for (const snapshot of enemies) prepareAuthoritativeEnemyArea(this.world, snapshot.homeX, snapshot.homeY);
    const existing = new Map(this.enemies.filter((enemy) => enemy.serverOwned && enemy.id).map((enemy) => [enemy.id!, enemy]));
    this.enemies = enemies.filter((enemy) => enemy.alive).map((snapshot) => {
      const enemy = existing.get(snapshot.id) ?? newEnemy(snapshot.kind, snapshot.x, snapshot.y, this.world.dangerLevel ?? 1);
      Object.assign(enemy, {
        id: snapshot.id,
        serverOwned: true,
        kind: snapshot.kind,
        x: snapshot.x,
        y: snapshot.y,
        hp: snapshot.hp,
        maxHp: snapshot.maxHp,
        emergeTimer: 0,
        hitFlash: snapshot.hit ? HIT_FLASH_TIME : Math.max(0, enemy.hitFlash),
        hpBarTimer: snapshot.hp < snapshot.maxHp ? 3 : enemy.hpBarTimer,
      });
      return enemy;
    });
    this.serverBags = bags
      .filter((bag) => bag.rx === this.region.rx && bag.ry === this.region.ry)
      .map((bag) => this.projectAuthoritativeBag(bag));
  }

  private projectAuthoritativeBag(bag: AuthoritativeLootBagSnapshot): LootBag {
    const items = projectServerItemStacks(bag.items);
    return {
      id: bag.id,
      serverOwned: true,
      layer: 1,
      regionKey: regionKey(bag.rx, bag.ry),
      x: bag.x,
      y: bag.y,
      ...items,
    };
  }

  private applyCombatPlayer(player: ServerCombatPlayerSnapshot): void {
    this.player.hp = player.hp;
    this.player.maxHp = player.maxHp;
    this.player.xp = player.xp;
    this.player.level = player.level;
    this.authoritativeDeathToken = player.deathToken ?? null;
    if (this.mode === 'surface' && player.dead && !this.dead) {
      this.dead = true;
      this.deathMsgEl.textContent = 'Your server combat state is awaiting respawn. Your loss was already settled atomically.';
      setPanelOpen(this.deathEl, true, 'visible', true);
    }
  }

  private applyCombatResult(hits: CombatHitResult[], player: ServerCombatPlayerSnapshot, inventory: ServerInventorySnapshot | null): void {
    this.applyCombatPlayer(player);
    if (inventory) this.applyCanonicalInventory(inventory);
    let kills = 0;
    for (const hit of hits) {
      const enemy = this.enemies.find((candidate) => candidate.id === hit.enemyId);
      if (enemy) {
        enemy.hitFlash = HIT_FLASH_TIME;
        enemy.hpBarTimer = 3;
        this.renderer.addFloat(enemy.x, enemy.y - 14, `-${hit.damage}`, '#e8e0d0');
        this.renderer.addSparks(enemy.x, enemy.y - 6, 5);
      }
      if (hit.killed) {
        kills++;
        const reward = projectServerItemStacks(hit.reward ?? {});
        const labels: string[] = [];
        if (reward.loot) labels.push(`${reward.loot} crystals`);
        if (reward.shrooms) labels.push(`${reward.shrooms} shrooms`);
        if (reward.wood) labels.push(`${reward.wood} wood`);
        if (reward.iron) labels.push(`${reward.iron} iron`);
        if (reward.meat) labels.push(`${reward.meat} meat`);
        if (reward.weapons.length) labels.push(...reward.weapons.map((weapon) => WEAPONS[weapon].name));
        if (enemy && labels.length) this.renderer.addFloat(enemy.x, enemy.y - 28, `+${labels.join(', ')}`, '#7de8c3');
      }
    }
    if (hits.length > 0) this.audio.playHit();
    if (kills > 0) {
      this.stats.kills += kills;
      this.progressQuest('kills', kills);
      saveStats(this.stats);
    }
  }

  private applyAuthoritativeDamage(damage: number, player: ServerCombatPlayerSnapshot): void {
    this.applyCombatPlayer(player);
    if (damage <= 0) return;
    this.flashRed = 0.5;
    this.renderer.shake(2.5);
  }

  private applyAuthoritativeDeath(
    player: ServerCombatPlayerSnapshot,
    riskTier: 'sanctuary' | 'frontier' | 'fracture' | 'lost',
    deathToken: string,
    bag: AuthoritativeLootBagSnapshot | null,
    inventory: ServerInventorySnapshot,
  ): void {
    this.applyCanonicalInventory(inventory);
    this.applyCombatPlayer(player);
    this.authoritativeDeathToken = deathToken;
    this.dead = true;
    this.audio.playDeath();
    this.stats.deaths++;
    saveStats(this.stats);
    if (bag) {
      const projected = this.projectAuthoritativeBag(bag);
      this.serverBags = [...this.serverBags.filter((entry) => entry.id !== bag.id), projected];
    }
    const rule = riskTier === 'sanctuary' ? 'no item loss' : riskTier === 'frontier' ? '25% supply loss' : riskTier === 'fracture' ? '60% supply loss and one weapon' : 'full carried-item loss';
    this.deathMsgEl.textContent = `${riskTier.toUpperCase()} rules applied by the server: ${rule}. Press Enter or tap to respawn at this land's capital.`;
    setPanelOpen(this.deathEl, true, 'visible', true);
  }

  private applyBagClaim(bagId: string, inventory: ServerInventorySnapshot): void {
    this.serverBags = this.serverBags.filter((bag) => bag.id !== bagId);
    this.applyCanonicalInventory(inventory);
    this.audio.playPickup();
    this.renderer.addFloat(this.player.x, this.player.y - 20, 'Server loot bag recovered', '#7de8c3');
  }

  private async syncRegionResources(): Promise<void> {
    if (this.mode !== 'surface') return;
    const world = this.world;
    const region = { ...this.region };
    try {
      const response = await getRegionResources(region.rx, region.ry);
      if (this.world !== world || this.mode !== 'surface' || this.region.rx !== region.rx || this.region.ry !== region.ry) return;
      if (response.worldSeed !== this.worldSeed) return;
      setRegionResourceStatuses(world, response.nodes);
    } catch {
      // The next region entry or successful harvest refreshes the snapshot.
    }
  }

  private async syncRegionMining(): Promise<void> {
    if (this.mode !== 'surface') return;
    const world = this.world;
    const region = { ...this.region };
    world.miningNodes = [];
    try {
      const response = await getRegionMining(region.rx, region.ry);
      if (this.world !== world || this.mode !== 'surface' || this.region.rx !== region.rx || this.region.ry !== region.ry) return;
      if (response.worldSeed !== this.worldSeed) return;
      world.miningNodes = response.nodes.map((node) => ({ ...node }));
    } catch {
      world.miningNodes = [];
    }
  }

  private async syncRegionNpcs(): Promise<void> {
    if (this.mode !== 'surface') return;
    const world = this.world;
    const region = { ...this.region };
    world.npcSpawns = [];
    this.npcs = [];
    try {
      const response = await getRegionNpcs(region.rx, region.ry);
      if (this.world !== world || this.mode !== 'surface' || this.region.rx !== region.rx || this.region.ry !== region.ry) return;
      if (response.worldSeed !== this.worldSeed) return;
      world.npcSpawns = response.npcs.map((npc) => ({
        id: npc.id,
        serverOwned: true,
        role: npc.role,
        name: npc.name,
        behavior: npc.behavior,
        kind: npc.role === 'merchant' ? 'shopkeeper' : 'wanderer',
        x: npc.x,
        y: npc.y,
        // Dynamic NPC motion remains fail-closed until a server snapshot stream exists.
        wanderRadius: 0,
      }));
      this.spawnNpcs();
    } catch {
      world.npcSpawns = [];
      this.npcs = [];
    }
  }

  private async syncRegionChests(): Promise<void> {
    if (this.mode !== 'surface') return;
    const world = this.world;
    const region = { ...this.region };
    // Never expose the deterministic legacy ruin loot while the authoritative
    // snapshot is loading or unavailable. A backend outage must fail closed.
    world.chests = [];
    world.weaponSpots = [];
    try {
      const response = await getRegionChests(region.rx, region.ry);
      if (this.world !== world || this.mode !== 'surface' || this.region.rx !== region.rx || this.region.ry !== region.ry) return;
      if (response.worldSeed !== this.worldSeed) return;
      for (const chest of response.chests) prepareAuthoritativeChestArea(world, chest.x, chest.y);
      world.chests = response.chests.map((chest) => ({
        id: chest.id,
        x: chest.x,
        y: chest.y,
        opened: !chest.available,
        serverOwned: true,
        availableAt: chest.availableAt,
      }));
    } catch {
      world.chests = [];
    }
  }

  private async syncSettlementProduction(): Promise<void> {
    if (this.mode !== 'surface') return;
    const world = this.world;
    const region = { ...this.region };
    world.farmPlots = [];
    world.animalSpawns = [];
    this.animals = [];
    try {
      const snapshot = await getServerSettlement(region.rx, region.ry);
      if (this.world !== world || this.mode !== 'surface' || this.region.rx !== region.rx || this.region.ry !== region.ry) return;
      prepareAuthoritativeSettlementArea(
        world,
        snapshot.farmPlots,
        snapshot.animals.map((animal) => ({
          ...animal,
          kind: animal.kind as Animal['kind'],
        })),
      );
      this.animals = world.animalSpawns.map(newAnimal);
      const now = Date.now();
      for (const animal of this.animals) {
        animal.readyTimer = animal.readyAt ? Math.max(0, (new Date(animal.readyAt).getTime() - now) / 1000) : 0;
      }
    } catch {
      world.farmPlots = [];
      world.animalSpawns = [];
      this.animals = [];
    }
  }

  private async syncRegionAuthority(): Promise<void> {
    await Promise.all([this.syncRegionResources(), this.syncRegionMining(), this.syncRegionNpcs(), this.syncRegionChests(), this.syncSettlementProduction()]);
  }

  /** debug/test hook — not used by gameplay */
  get debug() {
    return { world: this.world, player: this.player, enemies: this.enemies, npcs: this.npcs, animals: this.animals, pet: this.pet };
  }

  /** current run state as a cloud-save blob — see save.ts */
  serializeSave(): SaveData {
    return buildSaveData({
      worldSeed: this.worldSeed,
      mode: this.mode,
      currentRegion: this.region,
      world: this.world,
      player: this.player,
      activeDungeon: this.activeDungeon,
      marketReturn: this.marketReturn,
      underworld: {
        reputation: this.underworldReputation,
        discoveredRoutes: [...this.discoveredMarketRoutes],
        forbiddenDungeonKeys: this.forbiddenDungeonKeys,
        activeContracts: this.activeUnderworldContracts,
        inspectionProtection: this.inspectionProtection,
      },
      hasPet: !!this.pet,
      bags: this.bags,
      choppedTrees: this.choppedTrees,
      gatheredTiles: this.gatheredTiles,
      regionStore: this.regionStore,
      visited: this.visited,
      stats: this.stats,
    });
  }

  /** replaces the current run with a loaded cloud save — same shape of work
   * as descend()/respawn(). Accepts v1 saves too (migrateSave). */
  applySave(raw: SaveData): void {
    const data = migrateSave(raw, this.worldSeed);
    const { world, player, hasPet, bags, regionStore, visited, currentLogs, activeDungeon, marketReturn, underworld } = reconstructFromSave(data);
    this.world = world;
    this.player = player;
    this.mode = data.mode === 'dungeon' && activeDungeon
      ? 'dungeon'
      : data.mode === 'black-market' && marketReturn
        ? 'black-market'
        : 'surface';
    this.region = inWorldBounds(data.currentRegion.rx, data.currentRegion.ry) ? { ...data.currentRegion } : { rx: 0, ry: 0 };
    this.activeDungeon = activeDungeon;
    this.serverDungeon = null;
    this.marketReturn = marketReturn;
    this.underworldReputation = underworld.reputation;
    this.discoveredMarketRoutes = new Set(underworld.discoveredRoutes);
    this.forbiddenDungeonKeys = underworld.forbiddenDungeonKeys;
    this.activeUnderworldContracts = underworld.activeContracts;
    this.inspectionProtection = underworld.inspectionProtection;
    this.regionStore = regionStore;
    this.visited = visited;
    this.choppedTrees = currentLogs.choppedTrees;
    this.gatheredTiles = currentLogs.gatheredTiles;
    this.stats = { ...data.stats, sessions: data.stats.sessions + 1 };
    // avoid a pointless re-claim attempt on the next descend if this save's
    // dungeon run already passed a vault's trigger layer; a surface save is
    // between runs, where a fresh descent should try again
    if (this.mode === 'surface') {
      this.world.chests = [];
      this.world.weaponSpots = [];
      this.world.farmPlots = [];
      this.world.animalSpawns = [];
      this.world.npcSpawns = [];
      this.world.miningNodes = [];
    }
    this.spawnEnemies();
    this.spawnNpcs();
    this.spawnPickups();
    this.pet = hasPet ? newPet(this.player.x + TILE, this.player.y) : null;
    this.bags = bags;
    this.checkLayerQuests();
    if (this.mode === 'surface') void this.syncRegionAuthority();
  }

  // ---------------- region travel (surface overworld) ----------------

  /** snapshot the loaded region's mutations into the store — called before
   * anything replaces this.world while on the surface */
  private storeCurrentRegion(): void {
    if (this.mode !== 'surface') return;
    this.regionStore.set(regionKey(this.region.rx, this.region.ry), captureMutations(this.world, this.choppedTrees, this.gatheredTiles));
  }

  /** generate a region from the global seed and replay any stored
   * mutations; the store entry moves into the live world + logs */
  private loadRegion(rx: number, ry: number): World {
    const key = regionKey(rx, ry);
    const world = generateRegion(rx, ry, this.worldSeed);
    world.chests = [];
    world.weaponSpots = [];
    world.farmPlots = [];
    world.animalSpawns = [];
    world.npcSpawns = [];
    world.miningNodes = [];
    const m = this.regionStore.get(key);
    if (m) {
      applyMutations(world, m);
      this.choppedTrees = m.choppedTrees.map((t) => ({ ...t }));
      this.gatheredTiles = m.gatheredTiles.map((t) => ({ ...t }));
      this.regionStore.delete(key);
    } else {
      this.choppedTrees = [];
      this.gatheredTiles = [];
    }
    this.visited.add(key);
    return world;
  }

  /** Invisible streaming boundary. City streets remain walkable across the
   * edge; the coordinate change only swaps the authoritative sector chunk. */
  private checkRegionTravel(): void {
    const p = this.player;
    const margin = TILE * 0.45;
    let dir: EdgeDir | null = null;
    if (p.x < margin) dir = 'w';
    else if (p.x > this.world.w * TILE - margin) dir = 'e';
    else if (p.y < margin) dir = 'n';
    else if (p.y > this.world.h * TILE - margin) dir = 's';
    if (!dir) return;
    const [ox, oy] = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[dir] as [number, number];
    const nrx = this.region.rx + ox;
    const nry = this.region.ry + oy;
    if (!inWorldBounds(nrx, nry)) return; // world border — sealed anyway, belt and braces
    this.travelTo(nrx, nry, dir);
  }

  private travelTo(nrx: number, nry: number, dir: EdgeDir): void {
    this.storeCurrentRegion();
    this.region = { rx: nrx, ry: nry };
    this.world = this.loadRegion(nrx, nry);
    const p = this.player;
    // arrive just inside the matching gate on the opposite edge — both
    // regions carved it at the same rows/cols (see world.ts gatePositions),
    // so preserving the cross-axis coordinate lands inside the corridor
    if (dir === 'w') p.x = (this.world.w - 1.6) * TILE;
    else if (dir === 'e') p.x = 1.6 * TILE;
    else if (dir === 'n') p.y = (this.world.h - 1.6) * TILE;
    else p.y = 1.6 * TILE;
    this.spawnEnemies();
    this.spawnNpcs();
    this.spawnPickups();
    void this.syncRegionAuthority();
    notify({ title: 'Region entered', message: this.regionLabel(), tone: 'info' });
    this.audio.playPickup();
    this.saveCloud();
  }

  private regionLabel(): string {
    const profile = this.world.profile ?? regionProfileAt(this.region.rx, this.region.ry);
    const settlement = profile.settlement ? ` • ${profile.settlement.name}` : '';
    return `${profile.landName} — ${profile.regionName}${settlement} [${profile.rules.displayName}]`;
  }

  /** a bag is interactable/visible only in the world it fell in: its region
   * on the surface, its layer in the dungeon */
  private bagVisible(b: LootBag): boolean {
    if (this.mode === 'surface') return b.regionKey === regionKey(this.region.rx, this.region.ry);
    if (this.mode === 'dungeon') return !b.regionKey && b.layer === this.world.layer;
    return false;
  }

  /** best-effort, fire-and-forget — never blocks unload. Every Game
   * instance is created post-login now (see main.ts), so this always has
   * an account to save against. */
  private saveCloud(): void {
    setSaveState('saving');
    this.persistence.save(this.serializeSave())
      .then(() => setSaveState('saved'))
      .catch((error: unknown) => {
        setSaveState('error');
        notify({ title: 'Cloud save failed', message: error instanceof Error ? error.message : 'Your local session remains active.', tone: 'error' });
      });
  }

  start(): void {
    this.running = true;
    updateRuntime({ mode: 'game' });
    this.lastTime = performance.now();
    this.saveCloud(); // immediately commits the new expedition checkpoint and refreshes resumed saves
    const loop = (t: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (t - this.lastTime) / 1000);
      this.lastTime = t;
      try {
        this.update(dt);
        if (this.mode === 'surface') this.worldPresence.update(t, { ...this.region, x: this.player.x, y: this.player.y });
        this.renderer.render(
          this.world, this.player, this.enemies, this.npcs, this.animals, this.pet,
          [...this.bags.filter((b) => this.bagVisible(b)), ...(this.mode === 'surface' ? this.serverBags : [])], this.pickups, this.flashRed, dt,
          this.mode === 'surface' ? [...this.remotePlayers.values()] : [],
        );
      } catch (err) {
        // one bad frame must not freeze the game forever
        console.error('[undral] frame error:', err);
      }
      this.input.endFrame();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private spawnEnemies(): void {
    // Surface and Dungeon enemies are both server-owned. A snapshot projection
    // may populate this.enemies; generation is never permitted in the client.
    if (this.mode !== 'dungeon') this.enemies = [];
  }

  private spawnNpcs(): void {
    const spawns = this.mode === 'surface' ? this.world.npcSpawns.filter((spawn) => spawn.serverOwned) : this.world.npcSpawns;
    this.npcs = spawns.map(newNpc);
    this.animals = this.world.animalSpawns.map(newAnimal);
  }

  private spawnPickups(): void {
    // Weapon acquisition is economically meaningful, so legacy world/dungeon
    // pickup spots are fail-closed until a server-issued pickup receipt exists.
    this.pickups = [];
  }

  // ---------------- update ----------------

  private update(dt: number): void {
    this.stats.totalPlaySeconds += dt;
    this.statsSaveTimer += dt;
    if (this.statsSaveTimer > 10) {
      this.statsSaveTimer = 0;
      saveStats(this.stats);
    }
    this.cloudSaveTimer += dt;
    if (this.cloudSaveTimer > 60) {
      this.cloudSaveTimer = 0;
      this.saveCloud();
    }
    this.flashRed = Math.max(0, this.flashRed - dt * 1.5);

    if (this.dead) {
      this.touch.setGameplayEnabled(false);
      if (this.input.justPressed('Enter')) void this.respawn();
      return;
    }

    // The interface settings panel is presentation-only, but it still needs
    // to pause local intent so keyboard/touch input cannot leak into play.
    if (!document.getElementById('interface-panel')?.classList.contains('hidden')) {
      this.touch.setGameplayEnabled(false);
      return;
    }

    // 'I' toggles inventory even though updatePlayer() below is skipped while
    // a menu is open (the pause gate would otherwise make it unreachable)
    if (this.input.justPressed('KeyI') && !this.shopOpen && !this.mapOpen) {
      if (this.invOpen) this.closeInventory();
      else this.openInventory();
    }
    if (this.input.justPressed('KeyM') && !this.shopOpen && !this.invOpen && !this.journalOpen) {
      if (this.mapOpen) this.closeWorldMap();
      else this.openWorldMap();
    }

    if (this.input.justPressed('KeyJ') && !this.shopOpen && !this.invOpen && !this.mapOpen) {
      if (this.journalOpen) this.closeJournal();
      else this.openJournal();
    }

    if (this.shopOpen || this.invOpen || this.mapOpen || this.journalOpen) {
      this.touch.setGameplayEnabled(false);
      return; // menu open, world paused
    }

    this.touch.setGameplayEnabled(true);
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updateNpcs(dt);
    this.updateAnimals(dt);
    this.updatePet(dt);
    this.updateAmbush(dt);
    this.updateTriggers();
    this.updateFarmPlots(dt);
    this.updateHud();
  }

  private updatePlayer(dt: number): void {
    const p = this.player;
    const mx = this.input.moveX + this.touch.moveX;
    const my = this.input.moveY + this.touch.moveY;
    p.running = this.input.held('ShiftLeft') || this.input.held('ShiftRight') || this.touch.running;
    p.moving = Math.hypot(mx, my) > 0.01;

    if (p.moving) {
      const len = Math.hypot(mx, my);
      if (this.mode !== 'dungeon') {
        const speed = p.running ? PLAYER.runSpeed : PLAYER.speed;
        moveWithCollision(this.world, p, (mx / len) * speed * dt, (my / len) * speed * dt, 5);
      }
      p.facing = Math.atan2(my, mx);
      p.animTime += dt;
      // sprite direction: vertical wins ties so up/down reads clearly
      if (Math.abs(my) >= Math.abs(mx)) p.dir = my >= 0 ? 'down' : 'up';
      else {
        p.dir = 'side';
        p.flipX = mx < 0;
      }
    } else {
      p.animTime = 0;
    }

    if (this.mode === 'dungeon') {
      this.dungeonMoveAccumulatorMs += dt * 1000;
      if (this.dungeonMoveAccumulatorMs >= 200) {
        const elapsedMs = Math.max(16, Math.min(250, Math.round(this.dungeonMoveAccumulatorMs)));
        this.dungeonMoveAccumulatorMs = 0;
        void this.sendDungeonMove(mx, my, p.running, p.facing, elapsedMs);
      }
    }

    p.attackTimer = Math.max(0, p.attackTimer - dt);
    p.swingT = Math.max(0, p.swingT - dt);
    p.abilityTimer = Math.max(0, p.abilityTimer - dt);
    p.invulnTimer = Math.max(0, p.invulnTimer - dt);

    if ((this.input.justPressed('Space') || this.touch.attackHeld) && p.attackTimer <= 0) {
      const w = currentWeapon(p);
      p.attackTimer = w.cooldown;
      p.swingT = 0.16;
      p.swingPower = 1;
      p.swingArc = w.arc;
      p.swingRange = w.range;
      this.audio.playSwing();
      this.resolveHits(w.range, w.arc, w.damage, 6, false);
    }

    if ((this.input.justPressed('KeyF') || this.touch.consumeAbility()) && p.abilityTimer <= 0) {
      this.useAbility();
    }

    if (this.input.justPressed('KeyE') || this.touch.consumeInteract()) this.interact();

    if ((this.input.justPressed('KeyQ') || this.touch.consumeSwitch()) && p.weapons.length > 1 && !this.economyCommandInFlight) {
      const nextWeapon = p.weapons[(p.weaponIdx + 1) % p.weapons.length];
      void this.equipWeapon(nextWeapon);
    }

    if (this.mode === 'surface') this.checkRegionTravel();
  }

  private async sendDungeonMove(moveX: number, moveY: number, running: boolean, facing: number, dtMs: number): Promise<void> {
    if (this.dungeonCommandInFlight || !this.serverDungeon || this.serverDungeon.status !== 'active') return;
    this.dungeonCommandInFlight = true;
    try {
      const response = await moveServerDungeon(this.serverDungeon, { moveX, moveY, running, facing, dtMs });
      this.applyDungeonCommandResponse(response);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) await this.refreshDungeonAuthority();
      else this.renderer.addFloat(this.player.x, this.player.y - 24, error instanceof ApiError ? error.message : 'Dungeon movement rejected', '#d88a7a');
    } finally {
      this.dungeonCommandInFlight = false;
    }
  }

  /** Dispatches on the weapon's ability *archetype* (config.ts AbilityDef),
   * not the weapon id — every weapon reuses one of 5 shared implementations,
   * tuned per weapon via arcMul/rangeMul/damageMul/knockback/etc, instead of
   * needing its own bespoke case here. */
  private useAbility(): void {
    const p = this.player;
    const w = currentWeapon(p);
    const a = w.ability;
    p.abilityTimer = a.cooldown;
    p.swingT = 0.22;
    p.swingPower = 2;
    this.audio.playSwing();
    this.renderer.addFloat(p.x, p.y - 22, a.name, w.color);

    const damage = w.damage * (a.damageMul ?? 1);

    switch (a.archetype) {
      case 'flurry': {
        // a heavier, wider stab in the same facing arc
        const arc = w.arc * (a.arcMul ?? 1);
        const range = w.range * (a.rangeMul ?? 1);
        p.swingArc = arc;
        p.swingRange = range;
        this.resolveHits(range, arc, damage, a.knockback ?? 10, true);
        break;
      }
      case 'cleave': {
        // hits everything around the player, not just in front
        const range = w.range * (a.rangeMul ?? 1);
        p.swingArc = Math.PI * 2;
        p.swingRange = range;
        this.resolveHits(range, Math.PI * 2, damage, a.knockback ?? 8, true);
        break;
      }
      case 'lunge': {
        // dash forward, then a heavy narrow stab with brief invulnerability
        const range = w.range * (a.rangeMul ?? 1);
        const arc = w.arc * (a.arcMul ?? 1);
        const dashDist = a.dashDist ?? 46;
        p.swingArc = arc;
        p.swingRange = range;
        if (this.mode !== 'dungeon') {
          moveWithCollision(this.world, p, Math.cos(p.facing) * dashDist, Math.sin(p.facing) * dashDist, 5);
          p.invulnTimer = Math.max(p.invulnTimer, a.invulnSec ?? 0.3);
        }
        this.resolveHits(range, arc, damage, a.knockback ?? 14, true);
        break;
      }
      case 'pierce': {
        // narrow arc, bonus range, one hard poke
        const range = w.range * (a.rangeMul ?? 1.4);
        const arc = w.arc * (a.arcMul ?? 0.5);
        p.swingArc = arc;
        p.swingRange = range;
        this.resolveHits(range, arc, damage, a.knockback ?? 6, true);
        break;
      }
      case 'slam': {
        // short range, heavy single hit, big knockback
        const range = w.range * (a.rangeMul ?? 0.75);
        const arc = w.arc * (a.arcMul ?? 1);
        p.swingArc = arc;
        p.swingRange = range;
        this.resolveHits(range, arc, damage, a.knockback ?? 22, true);
        break;
      }
    }
  }

  /** Shared melee hit resolution for both the basic attack and weapon abilities. */
  private resolveHits(range: number, arc: number, damage: number, knockback: number, ability = false): void {
    void range; void arc; void damage; void knockback;
    const p = this.player;
    if (this.mode === 'surface') {
      this.worldPresence.attack(ability, p.facing);
      return;
    }
    if (this.mode !== 'dungeon' || !this.serverDungeon || this.dungeonCommandInFlight) return;
    this.dungeonCommandInFlight = true;
    void attackServerDungeon(this.serverDungeon, ability, p.facing).then((response) => {
      this.applyDungeonCommandResponse(response);
    }).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 409) void this.refreshDungeonAuthority();
      else this.renderer.addFloat(p.x, p.y - 24, error instanceof ApiError ? error.message : 'Dungeon attack rejected', '#d88a7a');
    }).finally(() => { this.dungeonCommandInFlight = false; });
  }

  private serverRewardLabel(deltas: Partial<Record<ServerItemId, number>>): string {
    const reward = projectServerItemStacks(deltas);
    const labels: string[] = [];
    if (reward.loot > 0) labels.push(`${reward.loot} crystals`);
    if (reward.shrooms > 0) labels.push(`${reward.shrooms} shrooms`);
    if (reward.wood > 0) labels.push(`${reward.wood} wood`);
    if (reward.iron > 0) labels.push(`${reward.iron} iron`);
    if (reward.meat > 0) labels.push(`${reward.meat} meat`);
    if (reward.hide > 0) labels.push(`${reward.hide} hide`);
    if (reward.feathers > 0) labels.push(`${reward.feathers} feathers`);
    if (reward.chests > 0) labels.push(`${reward.chests} supply crate`);
    labels.push(...reward.weapons.map((weapon) => WEAPONS[weapon].name));
    labels.push(...reward.tools.map((tool) => tool === 'axe' ? 'Axe' : 'Pickaxe'));
    labels.push(...reward.armor.map((armor) => ARMOR[armor].name));
    return labels.length > 0 ? labels.join(', ') : 'No eligible reward';
  }

  /** Surface chests are shared world entities. The client sends only the
   * canonical chest ID; availability, roll and inventory mutation are atomic
   * on the backend. Dungeon chests use the authoritative run/chest command path. */
  private openChest(chest: Chest): void {
    if (this.mode === 'surface') {
      if (!chest.serverOwned || !chest.id || chest.opened || this.chestOpenInFlight.has(chest.id)) return;
      const chestId = chest.id;
      this.chestOpenInFlight.add(chestId);
      void openServerWorldChest(chestId).then((result) => {
        if (this.mode !== 'surface') return;
        const current = this.world.chests.find((candidate) => candidate.id === result.chestId);
        if (current) {
          current.opened = true;
          current.availableAt = result.availableAt;
        }
        this.applyCanonicalInventory(result.inventoryCommand.inventory);
        this.applyCombatPlayer(result.player);
        this.renderer.addFloat(chest.x, chest.y - 20, `+${this.serverRewardLabel(result.reward)}`, '#7de8c3');
        this.progressQuest('chests');
        this.audio.playChest();
        if (this.invOpen) this.renderInventoryList();
      }).catch((error) => {
        this.renderer.addFloat(chest.x, chest.y - 20, error instanceof ApiError ? error.message : 'Chest request failed', '#d88a7a');
        if (error instanceof ApiError && error.status === 409) void this.syncRegionChests();
      }).finally(() => this.chestOpenInFlight.delete(chestId));
      return;
    }

    if (this.mode !== 'dungeon' || !this.serverDungeon || !chest.serverOwned || !chest.id || chest.opened || this.dungeonCommandInFlight) return;
    this.dungeonCommandInFlight = true;
    void openServerDungeonChest(this.serverDungeon, chest.id).then((response) => {
      this.applyDungeonCommandResponse(response);
      this.audio.playChest();
    }).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 409) void this.refreshDungeonAuthority();
      else this.renderer.addFloat(chest.x, chest.y - 18, error instanceof ApiError ? error.message : 'Dungeon chest rejected', '#d88a7a');
    }).finally(() => { this.dungeonCommandInFlight = false; });
  }

  /** Supply Crates are consumed and rolled by the backend. No local decrement
   * or random reward is performed, so retries cannot duplicate the container. */
  private openInventoryChest(): void {
    if (this.player.chests <= 0 || this.supplyCrateOpenInFlight) return;
    this.supplyCrateOpenInFlight = true;
    void openServerSupplyCrate().then((result) => {
      this.applyCanonicalInventory(result.inventory);
      this.renderer.addFloat(this.player.x, this.player.y - 20, `+${this.serverRewardLabel(result.deltas)}`, '#7de8c3');
      this.progressQuest('chests');
      this.audio.playChest();
      this.renderInventoryList();
    }).catch((error) => {
      this.renderer.addFloat(this.player.x, this.player.y - 20, error instanceof ApiError ? error.message : 'Supply crate request failed', '#d88a7a');
      if (error instanceof ApiError && error.status === 409) void this.refreshCanonicalInventory();
    }).finally(() => { this.supplyCrateOpenInFlight = false; });
  }

  private async harvestResourceNode(node: WorldResourceNode): Promise<void> {
    if (this.harvestInFlight.has(node.id) || !node.available) return;
    this.harvestInFlight.add(node.id);
    try {
      const result = await harvestWorldResource(node.id);
      if (this.mode !== 'surface' || !this.world.resourceNodes.some((candidate) => candidate.id === node.id)) return;
      setRegionResourceUnavailable(this.world, node.id, result.availableAt);
      const deltas = result.inventoryCommand.deltas;
      const amount = node.kind === 'tree' ? deltas['material.wood'] ?? 0
        : node.kind === 'iron' ? deltas['material.iron'] ?? 0
        : node.kind === 'crystal' ? deltas['currency.crystal'] ?? 0
        : deltas['consumable.shroom'] ?? 0;
      this.applyCanonicalInventory(result.inventoryCommand.inventory);
      this.applyCombatPlayer(result.player);
      if (node.kind === 'tree') this.progressQuest('wood', amount);
      else if (node.kind === 'iron') { this.progressQuest('iron', amount); this.stats.itemsFound += amount; }
      else if (node.kind === 'crystal') this.stats.itemsFound += amount;
      else this.stats.itemsFound += amount;
      this.renderer.addFloat(node.x, node.y - 16, `+${amount} ${node.kind === 'tree' ? 'wood' : node.kind}`, node.kind === 'crystal' ? '#7ad4e8' : '#c9c0b0');
      this.audio.playPickup();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Harvest failed';
      this.renderer.addFloat(this.player.x, this.player.y - 20, message, '#d97b72');
      if (error instanceof ApiError && error.status === 409) void this.syncRegionAuthority();
    } finally {
      this.harvestInFlight.delete(node.id);
    }
  }

  private async strikeMiningNode(node: WorldMiningNode): Promise<void> {
    if (this.mode !== 'surface' || !node.available || this.miningInFlight.has(node.id)) return;
    this.miningInFlight.add(node.id);
    try {
      const result = await strikeServerMiningNode(node.id, this.serverInventoryRevision);
      const current = this.world.miningNodes.find((candidate) => candidate.id === node.id);
      if (current) Object.assign(current, result.node);
      this.applyCanonicalInventory(result.inventoryCommand.inventory);
      this.applyCombatPlayer(result.player);
      if (result.collapsed) {
        this.renderer.addFloat(node.x, node.y - 20, `Vein collapsed: +${this.serverRewardLabel(result.reward)}`, '#7ad4e8');
        this.audio.playPickup();
        void this.refreshServerQuests(true);
      } else {
        this.renderer.addFloat(node.x, node.y - 18, `Integrity ${result.node.integrity}/${result.node.maxIntegrity}`, '#c9c0b0');
        this.audio.playHit();
      }
    } catch (error) {
      this.renderer.addFloat(node.x, node.y - 20, error instanceof ApiError ? error.message : 'Mining strike failed', '#d88a7a');
      if (error instanceof ApiError && error.status === 409) {
        await this.refreshCanonicalInventory().catch(() => undefined);
        void this.syncRegionMining();
      }
    } finally {
      this.miningInFlight.delete(node.id);
    }
  }

  private async interactWithCanonicalNpc(npc: Npc): Promise<void> {
    if (this.mode !== 'surface' || !npc.id || this.npcInteractInFlight.has(npc.id)) return;
    this.npcInteractInFlight.add(npc.id);
    try {
      const result = await interactServerNpc(npc.id);
      this.renderer.addFloat(npc.x, npc.y - 30, result.dialogue, result.reaction === 'story-complete' ? '#d3a54a' : '#8fd6b0');
      if (result.npc.role === 'merchant') this.openShop();
      await this.refreshServerQuests(true);
    } catch (error) {
      this.renderer.addFloat(npc.x, npc.y - 24, error instanceof ApiError ? error.message : 'NPC interaction failed', '#d88a7a');
      if (error instanceof ApiError && error.status === 409) void this.syncRegionNpcs();
    } finally {
      this.npcInteractInFlight.delete(npc.id);
    }
  }

  private interact(): void {
    const p = this.player;
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor(p.y / TILE);

    const portal = this.world.portals.find((candidate) => dist(p.x, p.y, candidate.x, candidate.y) < 24);
    if (portal) {
      this.usePortal(portal);
      return;
    }

    // Every surface NPC interaction is admitted and receipted by the server.
    const npc = this.npcs.find((candidate) => candidate.serverOwned && candidate.id && dist(p.x, p.y, candidate.x, candidate.y) < 30);
    if (npc) {
      void this.interactWithCanonicalNpc(npc);
      return;
    }

    // collect from a ready animal
    const animal = this.animals.find((a) => !a.dead && a.readyTimer <= 0 && dist(p.x, p.y, a.x, a.y) < 20);
    if (animal) {
      this.collectAnimal(animal);
      return;
    }

    // open a nearby chest
    const chest = this.world.chests.find((c) => !c.opened && dist(p.x, p.y, c.x, c.y) < 22);
    if (chest) {
      this.openChest(chest);
      return;
    }

    const miningNode = this.world.miningNodes.find((node) => node.available && dist(p.x, p.y, node.x, node.y) < 36);
    if (miningNode) {
      if (!p.tools.includes('pickaxe')) this.renderer.addFloat(p.x, p.y - 20, 'Need a pickaxe', '#b8ad98');
      else void this.strikeMiningNode(miningNode);
      return;
    }

    // Shared overworld resources are server-owned. The client sends only the
    // canonical node ID; distance, tool ownership, depletion and yield are
    // validated by the backend.
    const treeNode = this.world.resourceNodes.find((node) => node.kind === 'tree' && node.available && dist(p.x, p.y, node.x, node.y) < WOODCUTTING.interactRadius);
    if (treeNode) {
      if (!p.tools.includes('axe')) this.renderer.addFloat(p.x, p.y - 20, 'Need an axe', '#b8ad98');
      else void this.harvestResourceNode(treeNode);
      return;
    }

    // pick up a weapon
    for (let i = 0; i < this.pickups.length; i++) {
      const pk = this.pickups[i];
      if (dist(p.x, p.y, pk.x, pk.y) < 16) {
        if (!p.weapons.includes(pk.weapon)) {
          p.weapons.push(pk.weapon);
          p.weaponIdx = p.weapons.length - 1;
          this.renderer.addFloat(p.x, p.y - 20, WEAPONS[pk.weapon].name, '#c9a44a');
        }
        this.pickups.splice(i, 1);
        this.audio.playPickup();
        return;
      }
    }

    // Server-owned overworld death bags are claimed through the authoritative
    // inventory transaction; the client never applies their contents directly.
    if (this.mode === 'surface') {
      const serverBag = this.serverBags.find((bag) => dist(p.x, p.y, bag.x, bag.y) < 18);
      if (serverBag) {
        if (!this.worldPresence.claimBag(serverBag.id)) this.renderer.addFloat(p.x, p.y - 20, 'Combat server is disconnected', '#d88a7a');
        return;
      }
    }

    // Legacy instance bags may exist in older saves, but they have no server
    // receipt and therefore cannot credit the canonical inventory.
    for (let i = 0; i < this.bags.length; i++) {
      const bag = this.bags[i];
      if (this.bagVisible(bag) && dist(p.x, p.y, bag.x, bag.y) < 18) {
        this.bags.splice(i, 1);
        this.renderer.addFloat(p.x, p.y - 20, 'Legacy bag rejected: no server receipt', '#d88a7a');
        return;
      }
    }

    // nearby tiles
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const t = tileAt(this.world, tx + dx, ty + dy);
      if (t === Tile.Glowshroom || t === Tile.Crystal || t === Tile.IronOre) {
        const node = resourceNodeAtTile(this.world, tx + dx, ty + dy);
        if (!node) continue;
        if (node.kind === 'iron' && !p.tools.includes('pickaxe')) {
          this.renderer.addFloat(p.x, p.y - 20, 'Need a pickaxe', '#b8ad98');
          return;
        }
        void this.harvestResourceNode(node);
        return;
      }
      if (t === Tile.Entrance && this.mode === 'dungeon') {
        void this.leaveDungeon();
        return;
      }
      if (t === Tile.Exit) {
        void this.descend();
        return;
      }
      if (t === Tile.Farmland) {
        this.tendFarmPlot(tx + dx, ty + dy);
        return;
      }
    }
  }

  private tendFarmPlot(tx: number, ty: number): void {
    const plot = farmPlotAt(this.world, tx, ty);
    if (!plot?.serverOwned || !plot.id || this.mode !== 'surface' || this.farmCommandInFlight.has(plot.id)) return;
    const plotId = plot.id;
    this.farmCommandInFlight.add(plotId);
    const command = plot.stage === 3
      ? harvestServerFarmPlot(plotId, this.serverInventoryRevision)
      : plot.stage === 0
        ? plantServerFarmPlot(plotId, this.serverInventoryRevision)
        : null;
    if (!command) {
      this.renderer.addFloat(this.player.x, this.player.y - 20, 'Still growing…', '#8fae5a');
      this.farmCommandInFlight.delete(plotId);
      return;
    }
    void command.then((result) => {
      this.applyCanonicalInventory(result.inventoryCommand.inventory);
      this.applyCombatPlayer(result.player);
      const target = this.world.farmPlots.find((candidate) => candidate.id === plotId);
      if (target) {
        target.plantedAt = result.plot.plantedAt;
        target.readyAt = result.plot.readyAt;
        target.growMs = result.plot.growMs;
        target.stage = !result.plot.planted ? 0 : result.plot.ready ? 3 : 1;
      }
      if ('reward' in result && result.reward) {
        this.renderer.addFloat(this.player.x, this.player.y - 20, `+${this.serverRewardLabel(result.reward)}`, '#7de8c3');
        this.audio.playPickup();
      } else {
        this.renderer.addFloat(this.player.x, this.player.y - 20, 'Planted on server', '#8fd6b0');
      }
    }).catch((error) => {
      this.renderer.addFloat(this.player.x, this.player.y - 20, error instanceof ApiError ? error.message : 'Farm command failed', '#d88a7a');
      if (error instanceof ApiError && error.status === 409) void this.syncSettlementProduction();
    }).finally(() => this.farmCommandInFlight.delete(plotId));
  }

  private collectAnimal(a: Animal): void {
    if (this.mode !== 'surface' || !a.serverOwned || !a.id || this.animalCollectInFlight.has(a.id)) return;
    const animalId = a.id;
    this.animalCollectInFlight.add(animalId);
    void collectServerAnimal(animalId, this.serverInventoryRevision).then((result) => {
      this.applyCanonicalInventory(result.inventoryCommand.inventory);
      this.applyCombatPlayer(result.player);
      const current = this.animals.find((animal) => animal.id === animalId);
      if (current) {
        current.readyAt = result.animal.readyAt;
        current.readyTimer = result.animal.readyAt ? Math.max(0, (new Date(result.animal.readyAt).getTime() - Date.now()) / 1000) : 0;
      }
      this.renderer.addFloat(this.player.x, this.player.y - 20, `+${this.serverRewardLabel(result.reward)}`, '#7de8c3');
      this.audio.playPickup();
    }).catch((error) => {
      this.renderer.addFloat(this.player.x, this.player.y - 20, error instanceof ApiError ? error.message : 'Animal collection failed', '#d88a7a');
      if (error instanceof ApiError && error.status === 409) void this.syncSettlementProduction();
    }).finally(() => this.animalCollectInFlight.delete(animalId));
  }

  private openShop(): void {
    this.shopOpen = true;
    this.shopSection = 'merchant';
    setPanelOpen(this.shopEl, true, 'hidden', false);
    const blackMarket = this.mode === 'black-market';
    this.shopTabTradeEl.textContent = blackMarket ? 'BLACK MARKET' : 'MERCHANT';
    this.shopTabMarketEl.classList.toggle('hidden', blackMarket);
    this.shopTabP2pEl.classList.toggle('hidden', blackMarket);
    this.shopTabCraftEl.classList.toggle('hidden', blackMarket);
    this.shopStatusEl.textContent = blackMarket
      ? `Crystals: ${this.player.loot} • Underworld reputation: ${this.underworldReputation}`
      : `You have ${this.player.loot} crystals. Public market and P2P trades are server verified.`;
    this.renderShopTabs();
  }

  private closeShop(): void {
    this.shopOpen = false;
    setPanelOpen(this.shopEl, false, 'hidden', false);
  }

  private setShopTab(section: 'merchant' | 'craft' | 'market' | 'p2p'): void {
    if (this.mode === 'black-market') return;
    this.shopSection = section;
    this.renderShopTabs();
  }

  private renderShopTabs(): void {
    if (this.mode === 'black-market') {
      this.shopTabTradeEl.classList.add('active');
      this.shopTabMarketEl.classList.remove('active');
      this.shopTabP2pEl.classList.remove('active');
      this.shopTabCraftEl.classList.remove('active');
      this.renderBlackMarketList();
      return;
    }
    this.shopTabTradeEl.classList.toggle('active', this.shopSection === 'merchant');
    this.shopTabMarketEl.classList.toggle('active', this.shopSection === 'market');
    this.shopTabP2pEl.classList.toggle('active', this.shopSection === 'p2p');
    this.shopTabCraftEl.classList.toggle('active', this.shopSection === 'craft');
    if (this.shopSection === 'craft') this.renderCraftList();
    else if (this.shopSection === 'market') void this.renderPublicMarket();
    else if (this.shopSection === 'p2p') void this.renderP2pTrades();
    else this.renderShopList();
  }

  private marketItemOptions(includeEmpty = false): string {
    const entries = Object.entries(this.canonicalInventory?.stacks ?? {})
      .filter((entry): entry is [ServerItemId, number] => {
        const [itemId, quantity] = entry;
        return typeof quantity === 'number' && quantity > 0
          && itemId !== 'currency.crystal'
          && itemId !== 'companion.cave_pup'
          && itemId !== this.canonicalInventory?.equippedWeapon;
      });
    const options = entries.map(([itemId, quantity]) => `<option value="${itemId}">${escapeUi(itemPresentation(itemId).label)} ×${quantity}</option>`).join('');
    return `${includeEmpty ? '<option value="">No item</option>' : ''}${options}`;
  }

  private async renderPublicMarket(): Promise<void> {
    if (!this.shopOpen || this.shopSection !== 'market') return;
    this.shopStatusEl.textContent = 'Loading the regional player market…';
    this.shopListEl.innerHTML = '<div class="sp-empty">Reading canonical listings…</div>';
    try {
      const result = await getServerMarketListings();
      if (!this.shopOpen || this.shopSection !== 'market') return;
      this.shopStatusEl.textContent = `${result.landId.replaceAll('-', ' ')} regional market • listings are escrowed by the server.`;
      this.renderMarketListings(result.listings);
    } catch (error) {
      if (!this.shopOpen || this.shopSection !== 'market') return;
      this.shopStatusEl.textContent = error instanceof ApiError ? error.message : 'Regional market unavailable';
      this.shopListEl.innerHTML = '<div class="sp-empty">Stand near a settlement merchant to use the public market.</div>';
    }
  }

  private renderMarketListings(listings: ServerMarketListing[]): void {
    this.shopListEl.innerHTML = '';
    const composer = document.createElement('div');
    composer.className = 'economy-composer';
    composer.innerHTML = `
      <div class="economy-composer-title">Create listing</div>
      <select class="economy-field" aria-label="Item to list">${this.marketItemOptions()}</select>
      <input class="economy-field" type="number" min="1" max="10000" value="1" inputmode="numeric" aria-label="Quantity">
      <input class="economy-field" type="number" min="1" max="100000" value="5" inputmode="numeric" aria-label="Unit price">
      <button class="sp-btn" type="button">List</button>`;
    const [itemEl, quantityEl, priceEl] = Array.from(composer.querySelectorAll('select,input')) as Array<HTMLSelectElement | HTMLInputElement>;
    const listButton = composer.querySelector('button')!;
    listButton.disabled = !itemEl?.value || this.economyCommandInFlight;
    listButton.addEventListener('click', () => {
      const itemId = itemEl.value as ServerItemId;
      const quantity = Number(quantityEl.value);
      const unitPrice = Number(priceEl.value);
      if (!itemId || !Number.isSafeInteger(quantity) || !Number.isSafeInteger(unitPrice)) return;
      void this.runMarketCommand(async () => {
        const result = await createServerMarketListing(itemId, quantity, unitPrice, this.serverInventoryRevision);
        this.applyCanonicalInventory(result.inventory);
        this.renderer.addFloat(this.player.x, this.player.y - 24, 'Listing escrowed on the regional market', '#8fd6b0');
      });
    });
    this.shopListEl.appendChild(composer);

    if (listings.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'sp-empty';
      empty.textContent = 'No active player listings in this land yet.';
      this.shopListEl.appendChild(empty);
      return;
    }
    for (const listing of listings) {
      const row = document.createElement('div');
      row.className = 'sp-row';
      const presentation = itemPresentation(listing.itemId);
      row.innerHTML = `
        <div class="sp-info">
          <div class="sp-name">${escapeUi(presentation.label)} ×${listing.quantity}</div>
          <div class="sp-cost">Seller: ${escapeUi(listing.sellerName)} · ${listing.unitPrice} crystals each · <b>${listing.totalPrice}</b> total</div>
        </div>`;
      const button = document.createElement('button');
      button.className = 'sp-btn';
      button.type = 'button';
      button.textContent = listing.ownedByViewer ? 'Cancel' : 'Buy';
      button.disabled = this.economyCommandInFlight
        || (!listing.ownedByViewer && (this.canonicalInventory?.stacks['currency.crystal'] ?? 0) < listing.totalPrice);
      button.addEventListener('click', () => void this.runMarketCommand(async () => {
        const result = listing.ownedByViewer
          ? await cancelServerMarketListing(listing.id, this.serverInventoryRevision)
          : await buyServerMarketListing(listing.id, this.serverInventoryRevision);
        this.applyCanonicalInventory(result.inventory);
        this.renderer.addFloat(this.player.x, this.player.y - 24, listing.ownedByViewer ? 'Listing cancelled' : 'Market purchase settled', '#8fd6b0');
      }));
      row.appendChild(button);
      this.shopListEl.appendChild(row);
    }
  }

  private async runMarketCommand(command: () => Promise<void>): Promise<void> {
    if (this.economyCommandInFlight) return;
    this.economyCommandInFlight = true;
    let shouldRefresh = false;
    try {
      await command();
      shouldRefresh = true;
    } catch (error) {
      this.shopStatusEl.textContent = error instanceof ApiError ? error.message : 'Market command failed';
      if (error instanceof ApiError && error.status === 409) await this.refreshCanonicalInventory();
    } finally {
      this.economyCommandInFlight = false;
    }
    if (shouldRefresh) await this.renderPublicMarket();
  }

  private async renderP2pTrades(): Promise<void> {
    if (!this.shopOpen || this.shopSection !== 'p2p') return;
    this.shopStatusEl.textContent = 'P2P trade requires both players nearby in a Sanctuary region.';
    this.shopListEl.innerHTML = '<div class="sp-empty">Loading direct trades…</div>';
    try {
      const { trades } = await getServerPlayerTrades();
      if (!this.shopOpen || this.shopSection !== 'p2p') return;
      this.renderTradeSessions(trades);
    } catch (error) {
      if (!this.shopOpen || this.shopSection !== 'p2p') return;
      this.shopStatusEl.textContent = error instanceof ApiError ? error.message : 'Direct trade unavailable';
    }
  }

  private renderTradeSessions(trades: ServerTradeSession[]): void {
    this.shopListEl.innerHTML = '';
    const invite = document.createElement('div');
    invite.className = 'economy-composer economy-composer-invite';
    invite.innerHTML = `
      <div class="economy-composer-title">Invite nearby player</div>
      <input class="economy-field economy-grow" type="text" minlength="3" maxlength="32" placeholder="Exact username" aria-label="Player username">
      <button class="sp-btn" type="button">Invite</button>`;
    const usernameEl = invite.querySelector('input')!;
    const inviteButton = invite.querySelector('button')!;
    inviteButton.addEventListener('click', () => {
      const username = usernameEl.value.trim();
      if (username.length < 3) return;
      void this.runTradeCommand(async () => { await createServerPlayerTrade(username); });
    });
    this.shopListEl.appendChild(invite);

    if (trades.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'sp-empty';
      empty.textContent = 'No active direct trades.';
      this.shopListEl.appendChild(empty);
      return;
    }
    for (const trade of trades) this.shopListEl.appendChild(this.buildTradeRow(trade));
  }

  private tradeOfferLabel(offer: ServerTradeSession['initiatorOffer']): string {
    const parts: string[] = [];
    if (offer.crystals) parts.push(`${offer.crystals} crystals`);
    const items = formatStackMap(offer.items);
    if (items) parts.push(items);
    return parts.join(' · ') || 'Nothing offered';
  }

  private buildTradeRow(trade: ServerTradeSession): HTMLElement {
    const row = document.createElement('div');
    row.className = 'trade-session';
    const myOffer = trade.role === 'initiator' ? trade.initiatorOffer : trade.targetOffer;
    const otherName = trade.role === 'initiator' ? trade.targetName : trade.initiatorName;
    row.innerHTML = `
      <div class="trade-session-head"><strong>${escapeUi(otherName)}</strong><span>${trade.status}</span></div>
      <div class="trade-offer-grid">
        <div><small>${escapeUi(trade.initiatorName)}</small><p>${escapeUi(this.tradeOfferLabel(trade.initiatorOffer))}</p><b>${trade.initiatorAccepted ? 'Accepted' : 'Reviewing'}</b></div>
        <div><small>${escapeUi(trade.targetName)}</small><p>${escapeUi(this.tradeOfferLabel(trade.targetOffer))}</p><b>${trade.targetAccepted ? 'Accepted' : 'Reviewing'}</b></div>
      </div>`;
    if (trade.status !== 'pending') return row;

    const controls = document.createElement('div');
    controls.className = 'trade-controls';
    controls.innerHTML = `
      <select class="economy-field" aria-label="Trade item">${this.marketItemOptions(true)}</select>
      <input class="economy-field" type="number" min="0" max="10000" value="${Object.values(myOffer.items)[0] ?? 0}" inputmode="numeric" aria-label="Item quantity">
      <input class="economy-field" type="number" min="0" max="1000000" value="${myOffer.crystals}" inputmode="numeric" aria-label="Crystals">
      <button class="sp-btn trade-update" type="button">Update</button>
      <button class="sp-btn trade-accept" type="button">Accept</button>
      <button class="sp-btn trade-cancel" type="button">Cancel</button>`;
    const select = controls.querySelector('select')!;
    const existingItem = Object.keys(myOffer.items)[0] as ServerItemId | undefined;
    if (existingItem && Array.from(select.options).some((option) => option.value === existingItem)) select.value = existingItem;
    const inputs = controls.querySelectorAll('input');
    controls.querySelector('.trade-update')!.addEventListener('click', () => {
      const itemId = select.value as ServerItemId;
      const quantity = Number((inputs[0] as HTMLInputElement).value);
      const crystals = Number((inputs[1] as HTMLInputElement).value);
      const items = itemId && quantity > 0 ? { [itemId]: quantity } : {};
      void this.runTradeCommand(async () => {
        await updateServerPlayerTradeOffer(trade.id, { crystals, items }, this.serverInventoryRevision);
      });
    });
    controls.querySelector('.trade-accept')!.addEventListener('click', () => void this.runTradeCommand(async () => {
      const result = await acceptServerPlayerTrade(trade.id);
      if (result.inventory) this.applyCanonicalInventory(result.inventory);
    }));
    controls.querySelector('.trade-cancel')!.addEventListener('click', () => void this.runTradeCommand(async () => {
      await cancelServerPlayerTrade(trade.id);
    }));
    row.appendChild(controls);
    return row;
  }

  private async runTradeCommand(command: () => Promise<void>): Promise<void> {
    if (this.economyCommandInFlight) return;
    this.economyCommandInFlight = true;
    let shouldRefresh = false;
    try {
      await command();
      shouldRefresh = true;
    } catch (error) {
      this.shopStatusEl.textContent = error instanceof ApiError ? error.message : 'Direct trade command failed';
      if (error instanceof ApiError && error.status === 409) await this.refreshCanonicalInventory();
    } finally {
      this.economyCommandInFlight = false;
    }
    if (shouldRefresh) await this.renderP2pTrades();
  }

  private renderShopList(): void {
    const p = this.player;
    this.shopListEl.innerHTML = '';
    for (const item of SHOP_ITEMS) {
      const canonicalOffer = catalogOffer(this.serverCatalog, item.id);
      const cost = canonicalOffer?.crystalCost ?? item.cost;
      const outputId = canonicalOffer ? primaryOutput(canonicalOffer.outputs) : null;
      const presentation = outputId ? itemPresentation(outputId) : null;
      const owned =
        (item.kind === 'weapon' && item.weapon && p.weapons.includes(item.weapon)) ||
        (item.kind === 'pet' && !!this.pet) ||
        (item.kind === 'tool' && item.tool && p.tools.includes(item.tool)) ||
        (item.kind === 'armor' && item.armor && p.armor.includes(item.armor));
      const crystalBalance = this.canonicalInventory?.stacks['currency.crystal'] ?? p.loot;
      const afford = crystalBalance >= cost;
      const outputSummary = canonicalOffer ? formatStackMap(canonicalOffer.outputs) : item.label;
      const row = document.createElement('div');
      row.className = 'sp-row';
      row.innerHTML = `
        <div class="sp-info">
          <div class="sp-name">${escapeUi(presentation?.label ?? item.label)}</div>
          <div class="sp-cost">${escapeUi(presentation?.description ?? outputSummary)}<br>${cost} crystals · ${escapeUi(outputSummary)}</div>
        </div>
        <button class="sp-btn" ${owned || !afford ? 'disabled' : ''}>${owned ? 'Owned' : afford ? 'Buy' : 'Short'}</button>
      `;
      row.querySelector('button')!.addEventListener('click', () => void this.buyItem(item.id));
      this.shopListEl.appendChild(row);
    }
  }

  private renderBlackMarketList(): void {
    const offers = this.serverUnderworldOffers;
    this.shopListEl.innerHTML = '';
    if (offers.length === 0) {
      this.shopListEl.innerHTML = '<div class="sp-empty">No broker trusts you enough today.</div>';
      return;
    }
    for (const offer of offers) {
      const row = document.createElement('div');
      row.className = 'sp-row';
      row.innerHTML = `
        <div class="sp-info">
          <div class="sp-name">${escapeUi(offer.label)}</div>
          <div class="sp-cost">${escapeUi(offer.description)}<br>${offer.crystalCost} crystals • Rep ${offer.reputationRequired}</div>
        </div>
        <button class="sp-btn" ${this.player.loot < offer.crystalCost ? 'disabled' : ''}>Buy</button>
      `;
      row.querySelector('button')!.addEventListener('click', () => void this.buyBlackMarketOffer(offer.id));
      this.shopListEl.appendChild(row);
    }
  }

  private async buyBlackMarketOffer(id: ServerUnderworldOfferId): Promise<void> {
    if (!this.underworldSessionToken || this.economyCommandInFlight) return;
    this.economyCommandInFlight = true;
    try {
      const result = await purchaseServerUnderworldOffer(this.underworldSessionToken, id, this.serverInventoryRevision);
      this.applyCanonicalInventory(result.inventoryCommand.inventory);
      this.applyCanonicalUnderworld(result.state, result.offers);
      if (result.revealedRegion) this.visited.add(regionKey(result.revealedRegion.rx, result.revealedRegion.ry));
      this.shopStatusEl.textContent = `${result.message} Crystals: ${this.player.loot} • Reputation: ${this.underworldReputation}`;
      this.renderBlackMarketList();
      this.audio.playBuy();
      this.saveCloud();
    } catch (error) {
      this.shopStatusEl.textContent = error instanceof ApiError ? error.message : 'Black Market command failed.';
      if (error instanceof ApiError && error.status === 409) {
        const current = await getServerUnderworld().catch(() => null);
        if (current) this.applyCanonicalUnderworld(current.state, current.offers);
        await this.refreshCanonicalInventory().catch(() => undefined);
        this.renderBlackMarketList();
      }
    } finally {
      this.economyCommandInFlight = false;
    }
  }

  private openJournal(): void {
    if (this.shopOpen || this.invOpen || this.mapOpen) return;
    this.journalOpen = true;
    this.renderJournal();
    setPanelOpen(this.journalEl, true, 'hidden', false);
  }

  private closeJournal(): void {
    this.journalOpen = false;
    setPanelOpen(this.journalEl, false, 'hidden', false);
  }

  private renderJournal(): void {
    const storyRows = this.stories.map((story, index) => {
      const stage = story.currentStage;
      const progress = stage ? stage.progress : story.claimed ? 1 : 0;
      const target = stage ? Math.max(1, stage.target) : 1;
      const percent = Math.max(0, Math.min(100, (progress / target) * 100));
      const state = story.claimed ? 'Claimed' : story.completed ? 'Ready to claim' : `${progress}/${target}`;
      return `<article class="journal-card${story.completed || story.claimed ? ' complete' : ''}">
        <div class="journal-icon">${story.claimed ? '✓' : index + 1}</div>
        <div><h3>${escapeUi(story.title)}</h3><p>${escapeUi(stage?.title ?? 'Story arc complete')}</p></div>
        <div class="journal-progress">${escapeUi(state)}<div class="journal-progress-bar"><i style="width:${percent}%"></i></div></div>
      </article>`;
    });
    this.journalStoryEl.innerHTML = storyRows.join('') || '<article class="journal-card"><div class="journal-icon">◆</div><div><h3>Story ledger synchronizing</h3><p>Verified story stages will appear after the realm responds.</p></div></article>';

    const dailyRows = this.quests.map((quest, index) => {
      const percent = Math.max(0, Math.min(100, (quest.progress / Math.max(1, quest.target)) * 100));
      const state = quest.claimed ? 'Claimed' : quest.completed ? 'Ready to claim' : `${quest.progress}/${quest.target}`;
      return `<article class="journal-card${quest.completed || quest.claimed ? ' complete' : ''}">
        <div class="journal-icon">${quest.claimed ? '✓' : index + 1}</div>
        <div><h3>${escapeUi(quest.label)}</h3><p>${quest.rewardCrystals} crystals · ${quest.rewardXp} XP · server-verified progress</p></div>
        <div class="journal-progress">${escapeUi(state)}<div class="journal-progress-bar"><i style="width:${percent}%"></i></div></div>
      </article>`;
    });
    this.journalDailyEl.innerHTML = dailyRows.join('') || '<article class="journal-card"><div class="journal-icon">•</div><div><h3>Daily ledger synchronizing</h3><p>Daily objectives are issued and settled by the backend.</p></div></article>';

    const modeLabel = this.mode === 'surface' ? 'Overworld' : this.mode === 'dungeon' ? 'Dungeon run' : 'The Underway';
    const activeDungeon = this.serverDungeon ? `${getDungeon(this.serverDungeon.dungeonId).name} · floor ${this.serverDungeon.floor}` : 'No active run';
    this.journalSystemsEl.innerHTML = `<div class="expedition-grid">
      <article class="expedition-stat"><span>Current mode</span><strong>${escapeUi(modeLabel)}</strong><p>${escapeUi(this.regionLabel())}</p></article>
      <article class="expedition-stat"><span>Inventory authority</span><strong>REV ${this.serverInventoryRevision}</strong><p>${this.canonicalInventory ? `${Object.keys(this.canonicalInventory.stacks).length} canonical stack types` : 'Awaiting snapshot'}</p></article>
      <article class="expedition-stat"><span>Underway reputation</span><strong>${this.underworldReputation}</strong><p>${this.discoveredMarketRoutes.size}/6 hidden routes discovered</p></article>
      <article class="expedition-stat"><span>Forbidden access</span><strong>${this.forbiddenDungeonKeys}</strong><p>${this.activeUnderworldContracts} active contracts · ${this.inspectionProtection} inspection protection</p></article>
      <article class="expedition-stat"><span>Dungeon authority</span><strong>${escapeUi(activeDungeon)}</strong><p>Runs, topology, enemies, rewards and return positions are server-owned.</p></article>
      <article class="expedition-stat"><span>Exploration</span><strong>${this.visited.size}/${(WORLD_RADIUS * 2 + 1) ** 2}</strong><p>Visited or revealed deterministic world regions across the six lands.</p></article>
    </div>`;
  }

  private openWorldMap(): void {
    if (this.shopOpen || this.invOpen || this.journalOpen) return;
    this.mapOpen = true;
    setPanelOpen(this.mapEl, true, 'hidden', false);
    this.renderWorldMap();
  }

  private closeWorldMap(): void {
    this.mapOpen = false;
    setPanelOpen(this.mapEl, false, 'hidden', false);
  }

  // Biome tint per land so the atlas reads as a coloured world, not a grid of
  // identical squares. Presentation only — geography stays server-authoritative.
  private static readonly LAND_TINT: Record<string, string> = {
    'witchlands': '#b28be1',
    'green-land': '#91c96e',
    'rainforest': '#54c8a2',
    'frostlands': '#8fcceb',
    'sunscorched-desert': '#e4b665',
    'cinder-coast': '#e17563',
  };

  private renderWorldMap(): void {
    this.mapGridEl.innerHTML = '';
    this.mapGridEl.style.gridTemplateColumns = `repeat(${WORLD_RADIUS * 2 + 1}, minmax(18px, 1fr))`;
    for (let ry = -WORLD_RADIUS; ry <= WORLD_RADIUS; ry++) {
      for (let rx = -WORLD_RADIUS; rx <= WORLD_RADIUS; rx++) {
        const profile = regionProfileAt(rx, ry);
        const key = regionKey(rx, ry);
        const isHere = rx === this.region.rx && ry === this.region.ry;
        const revealed = this.visited.has(key) || profile.discoveredByDefault || isHere;
        const tint = Game.LAND_TINT[profile.landId] ?? '#8ea0b4';
        const cell = document.createElement('button');
        cell.className = `wm-cell risk-${profile.riskTier}${isHere ? ' current' : ''}${revealed ? '' : ' unknown'}`;
        if (revealed) {
          cell.style.setProperty('--land', tint);
          const marker = profile.settlement?.kind === 'capital' ? iconSvg('castle', 20, 'wm-icon capital')
            : profile.settlement ? iconSvg('village', 17, 'wm-icon town')
            : profile.features.length > 0 ? iconSvg('compass', 16, 'wm-icon town')
            : '';
          const initials = profile.regionName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
          cell.innerHTML = marker || `<span class="wm-land-tag">${initials}</span>`;
        } else {
          cell.innerHTML = '<span class="wm-land-tag">?</span>';
        }
        if (isHere) cell.innerHTML += '<span class="wm-here" aria-hidden="true"></span>';
        cell.title = revealed ? `${profile.regionName} — ${profile.rules.displayName}` : 'Uncharted region';
        cell.addEventListener('click', () => this.showMapRegion(profile, revealed));
        this.mapGridEl.appendChild(cell);
      }
    }
    const current = this.world.profile ?? regionProfileAt(this.region.rx, this.region.ry);
    this.showMapRegion(current, true);
  }

  private showMapRegion(profile: RegionProfile, revealed: boolean): void {
    if (!revealed) {
      this.mapDetailsEl.innerHTML = '<strong>Uncharted region</strong><p class="wm-muted">Explore a neighboring route or buy information from the Black Market.</p>';
      return;
    }
    const tint = Game.LAND_TINT[profile.landId] ?? '#8ea0b4';
    const kind = profile.settlement?.kind;
    const isHere = profile.rx === this.region.rx && profile.ry === this.region.ry;
    const hero = kind === 'capital' ? iconSvg('castle', 52) : kind ? iconSvg('village', 46) : iconSvg('compass', 44);
    // A small illustrative "postcard" so each place reads visually, not just as text.
    const props = profile.features.slice(0, 3).map((feature) => {
      const g = /gate|market|underway/i.test(feature.name) ? 'scroll' : /dungeon|mine|crypt|falls/i.test(feature.name) ? 'swords' : 'village';
      return `<span class="wm-prop" title="${feature.name}">${iconSvg(g, 18)}</span>`;
    }).join('');
    const features = profile.features.map((feature) => feature.name).join(' • ') || 'Open wilderness';
    const riskCopy = profile.riskTier === 'fracture'
      ? 'Fracture · red danger · open PvP and partial item loss'
      : profile.riskTier === 'lost'
        ? 'Lost Territory · extreme danger · full-loot rules'
        : profile.rules.displayName;
    this.mapDetailsEl.dataset.region = profile.key;
    this.mapDetailsEl.innerHTML = `
      <div class="wm-preview" style="--land:${tint}">
        <div class="wm-preview-scene">${hero}</div>
        ${props ? `<div class="wm-prop-row">${props}</div>` : ''}
        ${isHere ? '<span class="wm-preview-here">You are here</span>' : ''}
      </div>
      <div class="wm-detail-head" style="--land:${tint}">
        <div><strong>${profile.regionName}</strong><span class="wm-detail-land">${profile.landName}</span></div>
        <span class="wm-detail-risk risk-${profile.riskTier}">${riskCopy}</span>
      </div>
      ${profile.settlement ? `<p class="wm-detail-line"><b>${profile.settlement.name}</b> — ${profile.settlement.specialty}</p>` : ''}
      <p class="wm-detail-line">${features}</p>
      <p class="wm-muted">${profile.rules.displayName} • resources ×${profile.rules.resourceMultiplier.toFixed(2)} • enemies ×${profile.rules.enemyMultiplier.toFixed(2)}</p>
      <p class="wm-muted">Six authored lands • 121 regions • Black Market routes ${this.discoveredMarketRoutes.size}/6</p>
      <div class="wm-travel-slot"></div>`;
    void this.appendMapTravelAction(profile, isHere);
  }

  private async appendMapTravelAction(profile: RegionProfile, isHere: boolean): Promise<void> {
    const settlement = profile.settlement;
    if (!settlement?.public || settlement.kind === 'hidden' || isHere) return;
    const selectedKey = profile.key;
    const slot = this.mapDetailsEl.querySelector<HTMLElement>('.wm-travel-slot');
    if (!slot) return;
    slot.innerHTML = '<p class="wm-muted">Checking caravan route…</p>';
    try {
      const network = await getServerTravelNetwork();
      if (!this.mapOpen || this.mapDetailsEl.dataset.region !== selectedKey) return;
      const destination = network.destinations.find((candidate) => candidate.id === settlement.id);
      if (!destination || destination.fare === null) {
        slot.innerHTML = '<p class="wm-muted">Visit a public settlement merchant to unlock caravan departure.</p>';
        return;
      }
      const canAfford = (this.canonicalInventory?.stacks['currency.crystal'] ?? 0) >= destination.fare;
      const button = document.createElement('button');
      button.className = 'sp-btn wm-travel-btn';
      button.type = 'button';
      button.textContent = `Travel by caravan · ${destination.fare} crystals`;
      button.disabled = !network.canDepart || !canAfford || this.economyCommandInFlight;
      button.addEventListener('click', () => void this.travelFromMap(destination.id));
      slot.innerHTML = '';
      slot.appendChild(button);
      if (!network.canDepart) slot.insertAdjacentHTML('beforeend', '<p class="wm-muted">Stand beside the merchant in your current public settlement.</p>');
      else if (!canAfford) slot.insertAdjacentHTML('beforeend', '<p class="wm-muted">Not enough crystals for this caravan.</p>');
    } catch (error) {
      if (this.mapDetailsEl.dataset.region !== selectedKey) return;
      slot.innerHTML = `<p class="wm-muted">${escapeUi(error instanceof ApiError ? error.message : 'Caravan network unavailable')}</p>`;
    }
  }

  private async travelFromMap(settlementId: string): Promise<void> {
    if (this.economyCommandInFlight) return;
    this.economyCommandInFlight = true;
    try {
      const result = await travelServerCaravan(settlementId, this.serverInventoryRevision);
      this.applyCanonicalInventory(result.inventoryCommand.inventory);
      this.closeWorldMap();
      this.applyAuthoritativeWorldPosition(result.position);
      this.renderer.addFloat(this.player.x, this.player.y - 28, `Arrived in ${result.destination.name}`, '#8fd6b0');
      this.saveCloud();
    } catch (error) {
      notify({ title: 'Caravan travel failed', message: error instanceof ApiError ? error.message : 'The route could not be settled.', tone: 'error' });
      if (error instanceof ApiError && error.status === 409) await this.refreshCanonicalInventory();
    } finally {
      this.economyCommandInFlight = false;
    }
  }

  private openInventory(): void {
    if (this.shopOpen || this.mapOpen || this.journalOpen) return;
    this.invOpen = true;
    setPanelOpen(this.invEl, true, 'hidden', false);
    this.renderInventoryList();
  }

  private closeInventory(): void {
    this.invOpen = false;
    setPanelOpen(this.invEl, false, 'hidden', false);
  }

  /** draws one icon+label(+extra) row into #inv-list, reusing whatever sprite
   * (procedural or custom-asset-overridden) the renderer already built */
  private addInventoryRow(spriteKey: string, label: string, extra: string, highlight: boolean, onClick?: () => void): void {
    const row = document.createElement('div');
    row.className = 'inv-row' + (highlight ? ' inv-equipped' : '') + (onClick ? ' inv-clickable' : '');

    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 24;
    canvas.className = 'inv-icon';
    const spr = this.renderer.getSprite(spriteKey) as HTMLCanvasElement | undefined;
    if (spr) {
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      const scale = Math.min(20 / spr.width, 20 / spr.height);
      const w = spr.width * scale;
      const h = spr.height * scale;
      ctx.drawImage(spr, (24 - w) / 2, (24 - h) / 2, w, h);
    }
    row.appendChild(canvas);

    const info = document.createElement('div');
    info.className = 'inv-info';
    info.innerHTML = `<div class="inv-name">${label}</div><div class="inv-extra">${extra}</div>`;
    row.appendChild(info);

    if (onClick) row.addEventListener('click', onClick);
    this.invListEl.appendChild(row);
  }

  private renderInventoryList(): void {
    const p = this.player;
    this.invListEl.innerHTML = '';

    // Crystals surface only as the Gold Crown balance; Shrooms are folded into
    // provisions — neither gets a standalone pack row anymore (owner request).
    if (p.wood > 0) this.addInventoryRow('wood', 'Wood', `${p.wood}`, false);
    if (p.iron > 0) this.addInventoryRow('ironOre', 'Iron', `${p.iron}`, false);
    if (p.meat > 0) this.addInventoryRow('meat', 'Meat', `${p.meat}`, false);
    if (p.hide > 0) this.addInventoryRow('hide', 'Hide', `${p.hide}`, false);
    if (p.feathers > 0) this.addInventoryRow('feathers', 'Feathers', `${p.feathers}`, false);
    if (p.chests > 0) {
      this.addInventoryRow('chestClosed', 'Supply Crate', `×${p.chests} — tap to open`, false, () => this.openInventoryChest());
    }

    p.weapons.forEach((w, i) => {
      const equipped = i === p.weaponIdx;
      this.addInventoryRow(WEAPONS[w].sprite, WEAPONS[w].name, equipped ? 'Equipped' : 'Tap to equip', equipped, () => {
        void this.equipWeapon(w);
      });
    });

    for (const t of p.tools) {
      this.addInventoryRow(`tool.${t}`, t === 'axe' ? 'Axe' : 'Pickaxe', 'Owned', false);
    }

    const bestArmor = p.armor.length ? p.armor.reduce((a, b) => (ARMOR[b].reduction > ARMOR[a].reduction ? b : a)) : null;
    for (const a of p.armor) {
      this.addInventoryRow(`armor.${a}`, ARMOR[a].name, a === bestArmor ? 'Active' : 'Owned', a === bestArmor);
    }
  }

  private async buyItem(id: ShopItemId): Promise<void> {
    if (this.economyCommandInFlight) return;
    const item = SHOP_ITEMS.find((candidate) => candidate.id === id);
    if (!item) return;
    this.economyCommandInFlight = true;
    this.shopStatusEl.textContent = `Buying ${item.label}…`;
    try {
      const result = await purchaseServerItem(id, this.serverInventoryRevision);
      this.applyCanonicalInventory(result.inventory);
      this.shopStatusEl.textContent = `Bought ${item.label}. You have ${this.player.loot} crystals.`;
      this.renderShopList();
      this.audio.playBuy();
    } catch (error) {
      this.shopStatusEl.textContent = error instanceof ApiError ? error.message : 'Purchase failed.';
      if (error instanceof ApiError && error.status === 409) await this.refreshCanonicalInventory().catch(() => undefined);
    } finally {
      this.economyCommandInFlight = false;
    }
  }

  /** MaterialKind's 'crystal'/'shroom' map to Player.loot/.shrooms, not
   * identically-named fields (crystals are the shared currency, not a
   * separate stockpile) — every other kind matches its field name directly. */
  private materialAmount(p: Player, mat: MaterialKind): number {
    if (mat === 'crystal') return p.loot;
    if (mat === 'shroom') return p.shrooms;
    return p[mat];
  }

  /** Sends the recipe ID only; the server validates level, costs, uniqueness
   * and applies the inventory mutation atomically. */
  private async craftItem(id: string): Promise<void> {
    if (this.economyCommandInFlight) return;
    const recipe = CRAFTING_RECIPES.find((candidate) => candidate.id === id);
    if (!recipe) return;
    this.economyCommandInFlight = true;
    this.shopStatusEl.textContent = `Crafting ${recipe.label}…`;
    try {
      const result = await craftServerItem(id, this.serverInventoryRevision);
      this.applyCanonicalInventory(result.inventory);
      this.shopStatusEl.textContent = `Crafted ${recipe.label}.`;
      this.renderCraftList();
      this.audio.playBuy();
    } catch (error) {
      this.shopStatusEl.textContent = error instanceof ApiError ? error.message : 'Craft failed.';
      if (error instanceof ApiError && error.status === 409) await this.refreshCanonicalInventory().catch(() => undefined);
    } finally {
      this.economyCommandInFlight = false;
    }
  }

  private async equipWeapon(weapon: WeaponId): Promise<void> {
    if (this.economyCommandInFlight) return;
    this.economyCommandInFlight = true;
    try {
      const result = await equipServerWeapon(`weapon.${weapon}` as ServerItemId, this.serverInventoryRevision);
      this.applyCanonicalInventory(result.inventory);
      this.renderInventoryList();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) await this.refreshCanonicalInventory().catch(() => undefined);
      this.renderer.addFloat(this.player.x, this.player.y - 20, error instanceof ApiError ? error.message : 'Equip failed', '#d97b72');
    } finally {
      this.economyCommandInFlight = false;
    }
  }

  private renderCraftList(): void {
    const p = this.player;
    this.shopListEl.innerHTML = '';
    for (const recipe of CRAFTING_RECIPES) {
      const canonicalRecipe = catalogRecipe(this.serverCatalog, recipe.id);
      const outputId = canonicalRecipe ? primaryOutput(canonicalRecipe.outputs) : null;
      const outputPresentation = outputId ? itemPresentation(outputId) : null;
      const owned = outputId
        ? (this.canonicalInventory?.stacks[outputId] ?? 0) > 0 && outputId !== 'container.supply_crate'
        : (recipe.outputKind === 'weapon' && recipe.weapon && p.weapons.includes(recipe.weapon)) ||
          (recipe.outputKind === 'armor' && recipe.armor && p.armor.includes(recipe.armor));
      const minimumLevel = canonicalRecipe?.minLevel ?? recipe.minLevel ?? 1;
      const belowLevel = p.level < minimumLevel;

      let canAfford = true;
      let costsHtml = '';
      if (canonicalRecipe) {
        costsHtml = Object.entries(canonicalRecipe.costs).map(([rawId, need]) => {
          const id = rawId as ServerItemId;
          const required = need ?? 0;
          const have = this.canonicalInventory?.stacks[id] ?? 0;
          if (have < required) canAfford = false;
          return `<span${have < required ? ' class="sp-need-short"' : ''}>${have}/${required} ${escapeUi(itemPresentation(id).shortLabel)}</span>`;
        }).join(' · ');
      } else {
        const parts = Object.entries(recipe.materials).map(([material, need]) => {
          const have = this.materialAmount(p, material as MaterialKind);
          if (have < need!) canAfford = false;
          return `<span${have < need! ? ' class="sp-need-short"' : ''}>${have}/${need} ${escapeUi(material)}</span>`;
        });
        if (recipe.crystalCost) {
          if (p.loot < recipe.crystalCost) canAfford = false;
          parts.push(`<span${p.loot < recipe.crystalCost ? ' class="sp-need-short"' : ''}>${p.loot}/${recipe.crystalCost} crystals</span>`);
        }
        costsHtml = parts.join(' · ');
      }

      const row = document.createElement('div');
      row.className = 'sp-row';
      const label = outputPresentation?.label ?? recipe.label;
      const description = outputPresentation?.description ?? 'Crafted equipment settled by the canonical inventory service.';
      row.innerHTML = `
        <div class="sp-info">
          <div class="sp-name">${escapeUi(label)}${belowLevel ? ` · requires level ${minimumLevel}` : ''}</div>
          <div class="sp-cost">${escapeUi(description)}<br>${costsHtml}</div>
        </div>
        <button class="sp-btn" ${owned || !canAfford || belowLevel ? 'disabled' : ''}>${owned ? 'Owned' : belowLevel ? `Lv.${minimumLevel}` : canAfford ? 'Craft' : 'Short'}</button>
      `;
      row.querySelector('button')!.addEventListener('click', () => void this.craftItem(recipe.id));
      this.shopListEl.appendChild(row);
    }
  }

  private updateFarmPlots(dt: number): void {
    for (const plot of this.world.farmPlots) {
      if (plot.serverOwned) {
        if (!plot.readyAt) { plot.stage = 0; continue; }
        const remaining = Math.max(0, new Date(plot.readyAt).getTime() - Date.now());
        plot.timer = remaining / 1000;
        plot.stage = remaining <= 0 ? 3 : remaining > (plot.growMs ?? 1) / 2 ? 1 : 2;
        continue;
      }
      if (plot.stage === 0 || plot.stage === 3) continue;
      plot.timer -= dt;
      if (plot.timer <= 0) {
        plot.stage = (plot.stage + 1) as 2 | 3;
        plot.timer = CROPS[plot.crop].growStageTime;
      }
    }
  }

  private usePortal(portal: WorldPortal): void {
    if (portal.kind === 'dungeon' && portal.dungeonId) {
      void this.enterDungeon(portal.dungeonId);
      return;
    }
    if (portal.kind === 'black-market') {
      void this.enterBlackMarket();
      return;
    }
    if (portal.kind === 'market-exit') {
      this.leaveBlackMarket();
      return;
    }
    if (portal.kind === 'red-gate' || portal.kind === 'black-gate') {
      void this.enterAuthoritativePvp(portal);
    }
  }

  private async enterAuthoritativePvp(portal: WorldPortal): Promise<void> {
    if (this.mode !== 'surface' || this.pvpCommandInFlight) return;
    this.pvpCommandInFlight = true;
    try {
      const admission = await admitServerPvp(portal.id);
      this.storeCurrentRegion();
      this.running = false;
      this.worldPresence.stop();
      this.remotePlayers.clear();
      this.serverBags = [];
      this.onPvpHandoff(admission, this);
    } catch (error) {
      this.renderer.addFloat(this.player.x, this.player.y - 28, error instanceof ApiError ? error.message : 'PvP admission failed', '#d88a7a');
    } finally {
      this.pvpCommandInFlight = false;
    }
  }

  public async resumeFromPvp(result: ServerPvpReturnResponse): Promise<void> {
    this.mode = 'surface';
    this.applyCanonicalInventory(result.inventory);
    this.applyAuthoritativeWorldPosition(result.position);
    await this.worldPresence.start();
    this.worldPresence.setActive(true);
    await this.syncRegionAuthority();
    this.start();
  }

  private async enterDungeon(dungeonId: string): Promise<void> {
    if (this.mode !== 'surface' || this.dungeonCommandInFlight) return;
    const dungeon = getDungeon(dungeonId);
    this.dungeonCommandInFlight = true;
    try {
      const response = await startServerDungeon(dungeonId, this.forbiddenDungeonKeys > 0);
      this.storeCurrentRegion();
      this.applyDungeonCommandResponse(response);
      if (response.dungeon.keyConsumed) this.forbiddenDungeonKeys = Math.max(0, this.forbiddenDungeonKeys - 1);
      this.renderer.addFloat(this.player.x, this.player.y - 28, `${dungeon.name} • server run ${response.dungeon.runId.slice(0, 8)}`, '#d3a54a');
      this.saveCloud();
    } catch (error) {
      this.renderer.addFloat(this.player.x, this.player.y - 28, error instanceof ApiError ? error.message : 'Dungeon admission failed', '#d88a7a');
      if (error instanceof ApiError && error.status === 409) void this.refreshDungeonAuthority();
    } finally {
      this.dungeonCommandInFlight = false;
    }
  }

  private async leaveDungeon(): Promise<void> {
    if (this.mode !== 'dungeon' || !this.serverDungeon || this.dungeonCommandInFlight) return;
    this.dungeonCommandInFlight = true;
    try {
      const result = await exitServerDungeon(this.serverDungeon);
      this.serverDungeon = null;
      this.mode = 'surface';
      this.activeDungeon = null;
      this.applyCanonicalInventory(result.inventory);
      this.applyCombatPlayer(result.combatPlayer);
      this.region = { rx: result.position.rx, ry: result.position.ry };
      this.world = this.loadRegion(result.position.rx, result.position.ry);
      this.player.x = result.position.x;
      this.player.y = result.position.y;
      this.worldPresence.setActive(true);
      this.spawnEnemies();
      this.spawnPickups();
      this.spawnNpcs();
      await this.syncRegionAuthority();
      this.renderer.addFloat(this.player.x, this.player.y - 26, result.dungeon.status === 'completed' ? 'Dungeon completion settled' : 'Dungeon exit settled', '#8fd6b0');
      this.saveCloud();
    } catch (error) {
      this.renderer.addFloat(this.player.x, this.player.y - 26, error instanceof ApiError ? error.message : 'Dungeon exit rejected', '#d88a7a');
      if (error instanceof ApiError && error.status === 409) await this.refreshDungeonAuthority();
    } finally {
      this.dungeonCommandInFlight = false;
    }
  }

  private async enterBlackMarket(): Promise<void> {
    if (this.mode !== 'surface' || this.economyCommandInFlight) return;
    this.economyCommandInFlight = true;
    try {
      const session = await enterServerUnderworld();
      const profile = this.world.profile ?? regionProfileAt(this.region.rx, this.region.ry);
      this.storeCurrentRegion();
      this.applyCanonicalUnderworld(session.state, session.offers);
      this.marketReturn = {
        sourceLandId: profile.landId,
        returnRegion: { ...this.region },
        returnPos: { x: this.player.x, y: this.player.y },
      };
      this.mode = 'black-market';
      this.worldPresence.setActive(false);
      this.world = generateBlackMarketHub(profile.landId, this.worldSeed);
      this.player.x = (this.world.entrance.x + 0.5) * TILE;
      this.player.y = (this.world.entrance.y + 0.5) * TILE;
      this.enemies = [];
      this.spawnNpcs();
      this.spawnPickups();
      this.renderer.addFloat(this.player.x, this.player.y - 26, 'The Underway Black Market', '#b98af0');
      this.saveCloud();
    } catch (error) {
      this.renderer.addFloat(this.player.x, this.player.y - 26, error instanceof ApiError ? error.message : 'Underworld admission failed', '#d88a7a');
    } finally {
      this.economyCommandInFlight = false;
    }
  }

  private leaveBlackMarket(): void {
    if (this.mode !== 'black-market' || !this.marketReturn) return;
    const returning = this.marketReturn;
    const sessionToken = this.underworldSessionToken;
    this.underworldSessionToken = null;
    if (sessionToken) void exitServerUnderworld(sessionToken).then(({ state }) => this.applyCanonicalUnderworld(state, [])).catch(() => undefined);
    this.mode = 'surface';
    this.worldPresence.setActive(true);
    this.region = { ...returning.returnRegion };
    this.world = this.loadRegion(this.region.rx, this.region.ry);
    this.player.x = returning.returnPos.x;
    this.player.y = returning.returnPos.y;
    this.marketReturn = null;
    this.spawnEnemies();
    this.spawnNpcs();
    this.spawnPickups();
    void this.syncRegionAuthority();
    this.saveCloud();
  }

  /** Complete/advance/final-exit are separate idempotent server commands. */
  private async descend(): Promise<void> {
    if (this.mode !== 'dungeon' || !this.serverDungeon || this.dungeonCommandInFlight) return;
    this.dungeonCommandInFlight = true;
    try {
      if (!this.serverDungeon.floorCompleted) {
        const completed = await completeServerDungeonFloor(this.serverDungeon);
        this.applyDungeonCommandResponse(completed);
        if (completed.receipt) {
          this.renderer.addFloat(this.player.x, this.player.y - 26, completed.receipt.boss ? 'Boss receipt issued' : 'Floor receipt issued', '#d3a54a');
        }
      } else {
        const dungeon = getDungeon(this.serverDungeon.dungeonId);
        if (this.serverDungeon.floor >= dungeon.floors) {
          this.dungeonCommandInFlight = false;
          await this.leaveDungeon();
          return;
        }
        const advanced = await advanceServerDungeonFloor(this.serverDungeon);
        this.applyDungeonCommandResponse(advanced);
        saveStats(this.stats);
        this.saveCloud();
      }
    } catch (error) {
      this.renderer.addFloat(this.player.x, this.player.y - 24, error instanceof ApiError ? error.message : 'Dungeon floor command rejected', '#d88a7a');
      if (error instanceof ApiError && error.status === 409) await this.refreshDungeonAuthority();
    } finally {
      this.dungeonCommandInFlight = false;
    }
  }

  private updateEnemies(dt: number): void {
    // Enemy transforms, HP, attacks and deaths are snapshots from the server.
    // The render client advances visual-only timers between snapshots.
    for (const enemy of this.enemies) {
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      enemy.hpBarTimer = Math.max(0, enemy.hpBarTimer - dt);
      enemy.animTime += dt;
    }
  }

  private updateNpcs(dt: number): void {
    for (const npc of this.npcs) {
      npc.animTime += dt;
      wanderStep(this.world, npc, dt, 20); // a slow amble, not a run
    }
  }

  private updateAnimals(dt: number): void {
    for (const a of this.animals) {
      a.hitFlash = Math.max(0, a.hitFlash - dt);
      if (a.dead) {
        a.respawnTimer -= dt;
        if (a.respawnTimer <= 0) {
          a.dead = false;
          a.hp = a.maxHp;
          a.x = a.homeX;
          a.y = a.homeY;
          a.readyTimer = ANIMALS[a.kind].readyTime * 0.3; // ready again soon, not immediately
        }
        continue;
      }
      a.animTime += dt;
      wanderStep(this.world, a, dt, 14); // livestock amble slower than people
      a.readyTimer = a.serverOwned && a.readyAt
        ? Math.max(0, (new Date(a.readyAt).getTime() - Date.now()) / 1000)
        : a.readyTimer - dt;
    }
  }

  private updatePet(dt: number): void {
    if (!this.pet) return;
    const pet = this.pet;
    const p = this.player;
    pet.animTime += dt;
    const d = dist(pet.x, pet.y, p.x, p.y);
    const FOLLOW_DIST = 20;
    if (d <= FOLLOW_DIST) {
      pet.moving = false;
      return;
    }
    const ang = Math.atan2(p.y - pet.y, p.x - pet.x);
    const speed = Math.min(d - FOLLOW_DIST, 90) * 3; // catches up faster the further behind
    const mx = Math.cos(ang) * speed * dt;
    const my = Math.sin(ang) * speed * dt;
    moveWithCollision(this.world, pet, mx, my, 4);
    pet.moving = true;
    if (Math.abs(my) >= Math.abs(mx)) pet.dir = my >= 0 ? 'down' : 'up';
    else {
      pet.dir = 'side';
      pet.flipX = mx < 0;
    }
  }

  private updateAmbush(dt: number): void {
    // Ambush scheduling is economically/combat meaningful and therefore
    // fail-closed until represented by a server-owned enemy snapshot.
    void dt;
  }



  private async respawn(): Promise<void> {
    if (this.respawnInFlight) return;
    if (!this.authoritativeDeathToken) {
      if (this.mode === 'dungeon') await this.settleDungeonAuthoritativeDeath();
      return;
    }

    this.respawnInFlight = true;
    try {
      const result = await respawnAfterDeath(this.authoritativeDeathToken);
      this.storeCurrentRegion();
      this.mode = 'surface';
      this.activeDungeon = null;
      this.serverDungeon = null;
      this.marketReturn = null;
      this.authoritativeDeathToken = null;
      this.dead = false;
      this.applyCanonicalInventory(result.inventory);
      this.applyCombatPlayer(result.player);
      this.region = { rx: result.position.rx, ry: result.position.ry };
      this.world = this.loadRegion(result.position.rx, result.position.ry);
      this.player.x = result.position.x;
      this.player.y = result.position.y;
      this.serverBags = [];
      this.worldPresence.setActive(true);
      this.spawnEnemies();
      this.spawnNpcs();
      this.spawnPickups();
      if (this.pet) {
        this.pet.x = this.player.x + TILE;
        this.pet.y = this.player.y;
      }
      void this.syncRegionAuthority();
      this.checkLayerQuests();
      setPanelOpen(this.deathEl, false, 'visible', true);
      this.saveCloud();
    } catch (error) {
      this.deathMsgEl.textContent = error instanceof ApiError ? error.message : 'Unable to respawn at the capital.';
    } finally {
      this.respawnInFlight = false;
    }
  }

  // ---------------- environmental triggers ----------------

  private updateTriggers(): void {
    // The retired lantern system no longer applies hidden drain, refills or
    // zero-light triggers. Environmental authority remains server-owned.
  }

  /** Refreshes server-owned objectives and atomically claims completed rewards.
   * Gameplay events themselves are recorded only by verified backend services. */
  private async refreshServerQuests(autoClaim = false): Promise<void> {
    if (this.questSyncInFlight) return;
    this.questSyncInFlight = true;
    try {
      const state = await getServerQuests();
      this.quests = state.quests;
      this.stories = state.stories;
      this.renderQuestBox();
      if (!autoClaim) return;

      for (const quest of [...this.quests]) {
        if (!quest.completed || quest.claimed) continue;
        const result = await claimServerQuest(quest.id, this.serverInventoryRevision);
        this.quests = result.quests;
        this.stories = result.stories;
        this.applyCanonicalInventory(result.inventoryCommand.inventory);
        this.applyCombatPlayer(result.player);
        this.renderer.addFloat(
          this.player.x,
          this.player.y - 26,
          `Objective claimed: +${quest.rewardCrystals} crystals, +${quest.rewardXp} XP`,
          '#8fd6b0',
        );
        this.audio.playLevelUp();
      }
      for (const story of [...this.stories]) {
        if (!story.completed || story.claimed) continue;
        const result = await claimServerStory(story.id, this.serverInventoryRevision);
        this.quests = result.quests;
        this.stories = result.stories;
        this.applyCanonicalInventory(result.inventoryCommand.inventory);
        this.applyCombatPlayer(result.player);
        this.renderer.addFloat(this.player.x, this.player.y - 30, `Story complete: ${story.title}`, '#d3a54a');
        this.audio.playLevelUp();
      }
      this.renderQuestBox();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        await this.refreshCanonicalInventory().catch(() => undefined);
      }
      console.warn('Unable to synchronize server objectives', error);
    } finally {
      this.questSyncInFlight = false;
    }
  }

  private progressQuest(_track: QuestTrack, _amount = 1): void {
    if (this.mode === 'surface') void this.refreshServerQuests(true);
  }

  private checkLayerQuests(): void {
    // Layer/floor progress is emitted by authoritative Dungeon receipts. This
    // compatibility hook intentionally performs no client-side progression.
  }

  private renderQuestBox(): void {
    const questRow = (title: string, detail: string, progress: number, target: number, done: boolean, story: boolean): string => {
      const safeTarget = Math.max(1, target);
      const percent = done ? 100 : Math.max(0, Math.min(100, (progress / safeTarget) * 100));
      return `<article class="q-row${done ? ' q-done' : ''}">
        <span class="q-icon" aria-hidden="true">${done ? '✓' : story ? '◆' : '•'}</span>
        <div class="q-copy"><strong>${escapeUi(title)}</strong><span>${escapeUi(detail)}</span>
          <i class="q-progress" aria-hidden="true"><b style="width:${percent.toFixed(1)}%"></b></i>
        </div>
      </article>`;
    };
    const storyRows = this.stories.map((story) => {
      const stage = story.currentStage;
      return questRow(
        story.title,
        stage ? `${stage.title} · ${stage.progress}/${stage.target}` : 'Objective complete',
        stage?.progress ?? 1,
        stage?.target ?? 1,
        story.claimed,
        true,
      );
    });
    const dailyRows = this.quests.map((quest) => questRow(
      quest.label,
      `${quest.progress}/${quest.target} verified`,
      quest.progress,
      quest.target,
      quest.claimed,
      false,
    ));
    const rows = [...storyRows, ...dailyRows];
    this.questListEl.innerHTML = rows.length === 0
      ? '<div class="q-empty">Synchronizing verified objectives…</div>'
      : rows.join('');
    this.renderJournal();
  }

  private updateHud(): void {
    const p = this.player;
    (this.hpFill as HTMLElement).style.width = `${(p.hp / p.maxHp) * 100}%`;
    (this.xpFill as HTMLElement).style.width = `${(p.xp / xpForLevel(p.level)) * 100}%`;
    this.depthEl.textContent = this.mode === 'surface'
      ? `${this.regionLabel()} • Lv. ${p.level}`
      : this.mode === 'black-market'
        ? `The Underway Black Market • Reputation ${this.underworldReputation} • Lv. ${p.level}`
        : `${getDungeon(this.activeDungeon?.id ?? 'old-crown-mine').name} • Floor ${this.world.layer} • Lv. ${p.level}`;
    const materialTotal = p.wood + p.iron + p.hide + p.feathers;
    const provisionTotal = p.shrooms + p.meat;
    this.lootEl.textContent = `${materialTotal} materials · ${provisionTotal} provisions · ${crownValue(p.loot)} crowns`;
    const w = currentWeapon(p);
    const abilityHint = p.abilityTimer > 0 ? `${w.ability.name} (${p.abilityTimer.toFixed(1)}s)` : `${w.ability.name} [F]`;
    this.weaponEl.textContent = `${w.name}${p.weapons.length > 1 ? ' [Q]' : ''} — ${abilityHint}`;
    const profile = this.world.profile ?? regionProfileAt(this.region.rx, this.region.ry);
    updateRuntime({
      location: this.depthEl.textContent ?? this.regionLabel(),
      risk: profile.rules.displayName.toUpperCase(),
      hpPercent: (p.hp / Math.max(1, p.maxHp)) * 100,
      hpCurrent: p.hp,
      hpMax: p.maxHp,
      xpPercent: (p.xp / Math.max(1, xpForLevel(p.level))) * 100,
      xpCurrent: p.xp,
      xpTarget: xpForLevel(p.level),
      level: p.level,
      abilityName: w.ability.name,
      abilityCooldownPercent: (p.abilityTimer / Math.max(0.001, w.ability.cooldown)) * 100,
      abilityCooldownSeconds: p.abilityTimer,
      inventoryRevision: this.serverInventoryRevision,
      resources: {
        coins: crownValue(p.loot),
        crystals: p.loot,
        shrooms: p.shrooms,
        wood: p.wood,
        iron: p.iron,
        meat: p.meat,
        hide: p.hide,
        feathers: p.feathers,
        crates: p.chests,
      },
    });
    this.touch.setAbilityCooldown(p.abilityTimer > 0);
  }
}
