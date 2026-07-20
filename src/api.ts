// Thin fetch client for the server/ project's REST API. Relative '/api/...'
// paths in dev go through the Vite proxy (vite.config.ts) so requests stay
// same-origin; VITE_API_URL overrides the base for a production build where
// the game and the API are served from different origins.
import { SaveData } from './save';
import type { DungeonChestState, DungeonEnemyState, DungeonTopology } from '../server/src/dungeon/topology';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
const REQUEST_TIMEOUT_MS = 12_000;
const HEALTH_TIMEOUT_MS = 5_000;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = init.signal;
  const onAbort = (): void => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    else externalSignal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = window.setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onAbort);
  }
}

export function shouldRetryRequest(method: string, status: number, idempotentMutation = false): boolean {
  const safe = method === 'GET' || method === 'HEAD' || idempotentMutation;
  return safe && (status === 0 || status === 408 || status === 429 || status === 502 || status === 503 || status === 504);
}

function carriesIdempotencyKey(opts?: RequestInit): boolean {
  if (typeof opts?.body !== 'string') return false;
  try {
    const body = JSON.parse(opts.body) as { idempotencyKey?: unknown };
    return typeof body.idempotencyKey === 'string' && body.idempotencyKey.length >= 8;
  } catch {
    return false;
  }
}

function retryPause(attempt: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 180 * (attempt + 1)));
}


export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
}

// access tokens are short-lived (15min); without this, any session longer
// than that silently stops saving (putSave/putDeathSave/claimVault are
// all fire-and-forget from game.ts) until the player manually re-logs in.
// A single in-flight refresh is shared across concurrent 401s instead of
// firing one refresh call per failed request.
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetchWithTimeout(`${API_BASE}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

// these would otherwise cause pointless or recursive refresh attempts: a 401
// from login/register is a real credential failure, and refresh/logout must
// never retry themselves
const NO_AUTO_REFRESH = new Set(['/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/api/auth/logout']);

async function request<T>(path: string, opts?: RequestInit, isAuthRetry = false, networkAttempt = 0): Promise<T> {
  const method = (opts?.method ?? 'GET').toUpperCase();
  const idempotentMutation = carriesIdempotencyKey(opts);
  let res: Response;
  try {
    res = await fetchWithTimeout(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
  } catch (error) {
    if (networkAttempt < 1 && shouldRetryRequest(method, 0, idempotentMutation)) {
      await retryPause(networkAttempt);
      return request<T>(path, opts, isAuthRetry, networkAttempt + 1);
    }
    const timedOut = error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError');
    throw new ApiError(timedOut ? 408 : 0, timedOut ? 'Request timed out' : 'Network request failed');
  }
  if (res.status === 401 && !isAuthRetry && !NO_AUTO_REFRESH.has(path)) {
    if (await refreshSession()) return request<T>(path, opts, true, networkAttempt);
  }
  if (!res.ok) {
    if (networkAttempt < 1 && shouldRetryRequest(method, res.status, idempotentMutation)) {
      await retryPause(networkAttempt);
      return request<T>(path, opts, isAuthRetry, networkAttempt + 1);
    }
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { error?: string }).error ?? `request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** distinguishes "backend down/unreachable" from "not logged in" — now that
 * login is mandatory, the title screen needs different messaging for each
 * (a dead LOG IN TO PLAY button would look like a bug, not a config issue) */
export async function backendUp(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/health`, {}, HEALTH_TIMEOUT_MS);
    return res.ok;
  } catch {
    return false;
  }
}

export function register(email: string, username: string, password: string): Promise<{ user: AuthUser }> {
  return request('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, username, password }) });
}

export function login(email: string, password: string): Promise<{ user: AuthUser }> {
  return request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export function logout(): Promise<void> {
  return request('/api/auth/logout', { method: 'POST' });
}

// no UI wired to these yet — the ACCOUNT panel (authPanel.ts) doesn't have
// a change-password/delete-account flow — but the API-layer capability
// exists so a UI pass can wire it up without touching the server
export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return request('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
}

export function deleteAccount(): Promise<void> {
  return request('/api/auth/me', { method: 'DELETE' });
}

export async function me(): Promise<AuthUser | null> {
  try {
    const { user } = await request<{ user: AuthUser }>('/api/auth/me');
    return user;
  } catch {
    return null;
  }
}

export async function getSave(): Promise<SaveData | null> {
  const { save } = await request<{ save: SaveData | null }>('/api/save');
  return save;
}

export function putSave(data: SaveData): Promise<{ save: SaveData }> {
  return request('/api/save', { method: 'PUT', body: JSON.stringify(data) });
}

/** Compatibility save only: server strips unproven legacy bags and credits no Vault value. */
export function putDeathSave(data: SaveData, forfeitBagIds: string[]): Promise<{ save: SaveData; contributed: number }> {
  return request('/api/save/death', {
    method: 'POST',
    body: JSON.stringify({ save: data, forfeitBagIds }),
  });
}

export interface VaultTotals {
  layer0: number; // Red Zone PvP jackpot
  layer1: number;
  layer5: number;
}

/** public — no auth required, works even for a logged-out title screen */
export function getVault(): Promise<VaultTotals> {
  return request('/api/vault');
}

/** the ONE global world seed every player shares (docs/REGION_WORLD_PLAN.md
 * §2) — public, generated server-side on first request and stable after */
export async function getWorldSeed(): Promise<number> {
  const { worldSeed } = await request<{ worldSeed: number }>('/api/world');
  return worldSeed;
}

export interface VaultClaimReceipt {
  proofId: string;
  layer: 1 | 5;
  claimed: number;
  replay: boolean;
  canonicalSettled: boolean;
  inventory: ServerInventorySnapshot;
}

export function claimVault(proofId: string): Promise<VaultClaimReceipt> {
  return request('/api/vault/claim', {
    method: 'POST',
    body: JSON.stringify({ proofId }),
  });
}

export async function getPendingVaultProofs(): Promise<ServerDungeonVaultProof[]> {
  const { proofs } = await request<{ proofs: ServerDungeonVaultProof[] }>('/api/vault/proofs');
  return proofs;
}

// ---------------------------------------------------------------------------
// Phase 4 server-authoritative inventory foundation. Regular purchase,
// crafting, equip and overworld harvesting use these commands. Remaining
// gameplay faucets must migrate before legacy SaveGame economy is disabled.
export type ServerItemId =
  | 'currency.crystal' | 'consumable.shroom'
  | 'material.wood' | 'material.iron' | 'material.meat' | 'material.hide' | 'material.feathers'
  | 'weapon.bone' | 'weapon.chitin' | 'weapon.crystal' | 'weapon.wood_club'
  | 'weapon.iron_falchion' | 'weapon.hide_warclub' | 'weapon.feather_javelin' | 'weapon.prism_halberd'
  | 'tool.axe' | 'tool.pickaxe'
  | 'armor.leather' | 'armor.iron' | 'armor.hideVest'
  | 'container.supply_crate' | 'companion.cave_pup';

export interface ServerInventorySnapshot {
  revision: number;
  progressionLevel: number;
  equippedWeapon: ServerItemId;
  hasPet: boolean;
  migratedFromSave: boolean;
  stacks: Partial<Record<ServerItemId, number>>;
}

export interface ServerInventoryCommandResult {
  kind: string;
  replayed: boolean;
  inventory: ServerInventorySnapshot;
  deltas: Partial<Record<ServerItemId, number>>;
}

export interface ServerInventoryCatalog {
  items: Array<{ id: ServerItemId; category: string; maxStack: number; unique: boolean }>;
  recipes: Array<{ id: string; minLevel: number; costs: Partial<Record<ServerItemId, number>>; outputs: Partial<Record<ServerItemId, number>> }>;
  shopOffers: Array<{ id: string; crystalCost: number; outputs: Partial<Record<ServerItemId, number>> }>;
}

export function newEconomyCommandKey(kind: string): string {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${kind}:${suffix}`;
}

export async function getServerInventory(): Promise<ServerInventorySnapshot> {
  const { inventory } = await request<{ inventory: ServerInventorySnapshot }>('/api/inventory');
  return inventory;
}

export function getServerInventoryCatalog(): Promise<ServerInventoryCatalog> {
  return request('/api/inventory/catalog');
}

export function craftServerItem(recipeId: string, expectedRevision: number, idempotencyKey = newEconomyCommandKey('craft')): Promise<ServerInventoryCommandResult> {
  return request('/api/inventory/craft', {
    method: 'POST',
    body: JSON.stringify({ recipeId, expectedRevision, idempotencyKey }),
  });
}

export function purchaseServerItem(offerId: string, expectedRevision: number, idempotencyKey = newEconomyCommandKey('purchase')): Promise<ServerInventoryCommandResult> {
  return request('/api/inventory/purchase', {
    method: 'POST',
    body: JSON.stringify({ offerId, expectedRevision, idempotencyKey }),
  });
}

export function equipServerWeapon(weaponId: ServerItemId, expectedRevision: number, idempotencyKey = newEconomyCommandKey('equip')): Promise<ServerInventoryCommandResult> {
  return request('/api/inventory/equip', {
    method: 'POST',
    body: JSON.stringify({ weaponId, expectedRevision, idempotencyKey }),
  });
}

// ---------------------------------------------------------------------------
// Regional caravan travel, public market and direct Sanctuary trading.
export interface ServerTravelDestination {
  id: string;
  name: string;
  landId: string;
  kind: 'capital' | 'town' | 'outpost' | 'hidden';
  rx: number;
  ry: number;
  fare: number | null;
}

export interface ServerTravelNetwork {
  currentSettlementId: string | null;
  canDepart: boolean;
  destinations: ServerTravelDestination[];
}

export function getServerTravelNetwork(): Promise<ServerTravelNetwork> {
  return request('/api/travel');
}

export function travelServerCaravan(
  settlementId: string,
  expectedRevision: number,
  idempotencyKey = newEconomyCommandKey('caravan'),
): Promise<{ destination: ServerTravelDestination; inventoryCommand: ServerInventoryCommandResult; position: { rx: number; ry: number; x: number; y: number } }> {
  return request('/api/travel/caravan', {
    method: 'POST',
    body: JSON.stringify({ settlementId, expectedRevision, idempotencyKey }),
  });
}

export interface ServerMarketListing {
  id: string;
  sellerName: string;
  sellerUserId: string;
  itemId: ServerItemId;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  landId: string;
  settlementId: string;
  status: 'active' | 'sold' | 'cancelled';
  createdAt: string;
  soldAt: string | null;
  ownedByViewer: boolean;
}

export function getServerMarketListings(limit = 30): Promise<{ landId: string; listings: ServerMarketListing[] }> {
  return request(`/api/market/listings?limit=${Math.max(1, Math.min(50, Math.floor(limit)))}`);
}

export function createServerMarketListing(
  itemId: ServerItemId,
  quantity: number,
  unitPrice: number,
  expectedRevision: number,
  idempotencyKey = newEconomyCommandKey('market-list'),
): Promise<{ listing: ServerMarketListing; inventory: ServerInventorySnapshot }> {
  return request('/api/market/listings', {
    method: 'POST',
    body: JSON.stringify({ itemId, quantity, unitPrice, expectedRevision, idempotencyKey }),
  });
}

export function buyServerMarketListing(
  listingId: string,
  expectedRevision: number,
  idempotencyKey = newEconomyCommandKey('market-buy'),
): Promise<{ listing: ServerMarketListing; inventory: ServerInventorySnapshot; fee: number }> {
  return request(`/api/market/listings/${encodeURIComponent(listingId)}/buy`, {
    method: 'POST',
    body: JSON.stringify({ expectedRevision, idempotencyKey }),
  });
}

export function cancelServerMarketListing(
  listingId: string,
  expectedRevision: number,
  idempotencyKey = newEconomyCommandKey('market-cancel'),
): Promise<{ listing: ServerMarketListing; inventory: ServerInventorySnapshot }> {
  return request(`/api/market/listings/${encodeURIComponent(listingId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ expectedRevision, idempotencyKey }),
  });
}

export interface ServerTradeOffer {
  crystals: number;
  items: Partial<Record<ServerItemId, number>>;
}

export interface ServerTradeSession {
  id: string;
  role: 'initiator' | 'target';
  initiatorName: string;
  targetName: string;
  initiatorOffer: ServerTradeOffer;
  targetOffer: ServerTradeOffer;
  initiatorAccepted: boolean;
  targetAccepted: boolean;
  status: 'pending' | 'completed' | 'cancelled' | 'expired';
  expiresAt: string;
  createdAt: string;
  completedAt: string | null;
}

export function getServerPlayerTrades(): Promise<{ trades: ServerTradeSession[] }> {
  return request('/api/trades');
}

export function createServerPlayerTrade(targetUsername: string): Promise<{ trade: ServerTradeSession }> {
  return request('/api/trades', { method: 'POST', body: JSON.stringify({ targetUsername }) });
}

export function updateServerPlayerTradeOffer(
  tradeId: string,
  offer: ServerTradeOffer,
  expectedRevision: number,
): Promise<{ trade: ServerTradeSession }> {
  return request(`/api/trades/${encodeURIComponent(tradeId)}/offer`, {
    method: 'PUT',
    body: JSON.stringify({ offer, expectedRevision }),
  });
}

export function acceptServerPlayerTrade(
  tradeId: string,
  idempotencyKey = newEconomyCommandKey('p2p-accept'),
): Promise<{ trade: ServerTradeSession; inventory: ServerInventorySnapshot | null }> {
  return request(`/api/trades/${encodeURIComponent(tradeId)}/accept`, {
    method: 'POST',
    body: JSON.stringify({ idempotencyKey }),
  });
}

export function cancelServerPlayerTrade(tradeId: string): Promise<{ trade: ServerTradeSession }> {
  return request(`/api/trades/${encodeURIComponent(tradeId)}/cancel`, { method: 'POST', body: JSON.stringify({}) });
}

// ---------------------------------------------------------------------------
// Shared overworld presence + authoritative resource harvesting.
export interface ServerWorldResourceNode {
  id: string;
  worldSeed: number;
  rx: number;
  ry: number;
  kind: 'tree' | 'iron' | 'crystal' | 'shroom';
  ordinal: number;
  tx: number;
  ty: number;
  x: number;
  y: number;
  tool: 'axe' | 'pickaxe' | null;
  yieldMin: number;
  yieldMax: number;
  respawnSeconds: number;
  available: boolean;
  availableAt: string | null;
  harvestCount: number;
}

export interface RegionResourceResponse {
  worldSeed: number;
  serverTime: string;
  nodes: ServerWorldResourceNode[];
}

export function getRegionResources(rx: number, ry: number): Promise<RegionResourceResponse> {
  return request(`/api/world/regions/${rx}/${ry}/resources`);
}

export function harvestWorldResource(
  nodeId: string,
  idempotencyKey = newEconomyCommandKey('harvest'),
): Promise<{ nodeId: string; availableAt: string; inventoryCommand: ServerInventoryCommandResult; player: ServerCombatPlayerSnapshot }> {
  return request('/api/world/harvest', {
    method: 'POST',
    body: JSON.stringify({ nodeId, idempotencyKey }),
  });
}

export type ServerMiningKind = 'iron_vein' | 'crystal_geode' | 'ancient_seam';

export interface ServerMiningNode {
  id: string;
  worldSeed: number;
  rx: number;
  ry: number;
  kind: ServerMiningKind;
  ordinal: number;
  tx: number;
  ty: number;
  x: number;
  y: number;
  maxIntegrity: number;
  integrity: number;
  respawnSeconds: number;
  rewardMin: number;
  rewardMax: number;
  available: boolean;
  availableAt: string | null;
  extractionCount: number;
}

export function getRegionMining(rx: number, ry: number): Promise<{ worldSeed: number; serverTime: string; nodes: ServerMiningNode[] }> {
  return request(`/api/world/regions/${rx}/${ry}/mining`);
}

export function strikeServerMiningNode(
  nodeId: string,
  expectedRevision: number,
  idempotencyKey = newEconomyCommandKey('mining-strike'),
): Promise<{
  node: ServerMiningNode;
  collapsed: boolean;
  reward: Partial<Record<ServerItemId, number>>;
  inventoryCommand: ServerInventoryCommandResult;
  player: ServerCombatPlayerSnapshot;
}> {
  return request('/api/world/mining/strike', {
    method: 'POST',
    body: JSON.stringify({ nodeId, expectedRevision, idempotencyKey }),
  });
}

export type ServerNpcRole = 'merchant' | 'archivist' | 'scout';
export type ServerNpcBehavior = 'stationary' | 'patrol';
export interface ServerWorldNpc {
  id: string;
  rx: number;
  ry: number;
  role: ServerNpcRole;
  name: string;
  behavior: ServerNpcBehavior;
  x: number;
  y: number;
  wanderRadius: number;
}

export function getRegionNpcs(rx: number, ry: number): Promise<{ worldSeed: number; npcs: ServerWorldNpc[] }> {
  return request(`/api/world/regions/${rx}/${ry}/npcs`);
}

export function interactServerNpc(
  npcId: string,
  idempotencyKey = newEconomyCommandKey('npc-interact'),
): Promise<{ npc: ServerWorldNpc; dialogue: string; reaction: 'neutral' | 'encouraging' | 'story-complete' | 'merchant'; replayed: boolean }> {
  return request('/api/world/npcs/interact', {
    method: 'POST',
    body: JSON.stringify({ npcId, idempotencyKey }),
  });
}

export interface ServerWorldChest {
  id: string;
  worldSeed: number;
  rx: number;
  ry: number;
  ordinal: number;
  x: number;
  y: number;
  respawnMs: number;
  available: boolean;
  availableAt: string | null;
}

export interface RegionChestResponse {
  worldSeed: number;
  serverTime: string;
  chests: ServerWorldChest[];
}

export function getRegionChests(rx: number, ry: number): Promise<RegionChestResponse> {
  return request(`/api/world/regions/${rx}/${ry}/chests`);
}

export function openServerWorldChest(
  chestId: string,
  idempotencyKey = newEconomyCommandKey('world-chest'),
): Promise<{ chestId: string; availableAt: string; reward: Partial<Record<ServerItemId, number>>; inventoryCommand: ServerInventoryCommandResult; player: ServerCombatPlayerSnapshot }> {
  return request('/api/world/chests/open', {
    method: 'POST',
    body: JSON.stringify({ chestId, idempotencyKey }),
  });
}

export function openServerSupplyCrate(
  idempotencyKey = newEconomyCommandKey('supply-crate'),
): Promise<ServerInventoryCommandResult> {
  return request('/api/world/supply-crates/open', {
    method: 'POST',
    body: JSON.stringify({ idempotencyKey }),
  });
}


// ---------------------------------------------------------------------------
// Server-authoritative settlement farming and animal production.
export interface ServerFarmPlot {
  id: string;
  rx: number;
  ry: number;
  ordinal: number;
  tx: number;
  ty: number;
  x: number;
  y: number;
  crop: 'glowshroom' | 'caveberry';
  growMs: number;
  yieldMin: number;
  yieldMax: number;
  planted: boolean;
  plantedAt: string | null;
  readyAt: string | null;
  ready: boolean;
  harvestCount: number;
}

export interface ServerSettlementAnimal {
  id: string;
  rx: number;
  ry: number;
  ordinal: number;
  kind: string;
  x: number;
  y: number;
  readyMs: number;
  rewardItem: 'currency.crystal' | 'consumable.shroom';
  rewardAmount: number;
  ready: boolean;
  readyAt: string | null;
  collectCount: number;
}

export interface ServerSettlementSnapshot {
  serverTime: string;
  farmPlots: ServerFarmPlot[];
  animals: ServerSettlementAnimal[];
}

export function getServerSettlement(rx: number, ry: number): Promise<ServerSettlementSnapshot> {
  return request(`/api/world/regions/${rx}/${ry}/settlement`);
}

export function plantServerFarmPlot(
  plotId: string,
  expectedRevision: number,
  idempotencyKey = newEconomyCommandKey('farm-plant'),
): Promise<{ plot: ServerFarmPlot; inventoryCommand: ServerInventoryCommandResult; player: ServerCombatPlayerSnapshot }> {
  return request('/api/world/farm/plant', {
    method: 'POST',
    body: JSON.stringify({ plotId, expectedRevision, idempotencyKey }),
  });
}

export function harvestServerFarmPlot(
  plotId: string,
  expectedRevision: number,
  idempotencyKey = newEconomyCommandKey('farm-harvest'),
): Promise<{ plot: ServerFarmPlot; inventoryCommand: ServerInventoryCommandResult; player: ServerCombatPlayerSnapshot; reward: Partial<Record<ServerItemId, number>> }> {
  return request('/api/world/farm/harvest', {
    method: 'POST',
    body: JSON.stringify({ plotId, expectedRevision, idempotencyKey }),
  });
}

export function collectServerAnimal(
  animalId: string,
  expectedRevision: number,
  idempotencyKey = newEconomyCommandKey('animal-collect'),
): Promise<{ animal: ServerSettlementAnimal; inventoryCommand: ServerInventoryCommandResult; player: ServerCombatPlayerSnapshot; reward: Partial<Record<ServerItemId, number>> }> {
  return request('/api/world/animals/collect', {
    method: 'POST',
    body: JSON.stringify({ animalId, expectedRevision, idempotencyKey }),
  });
}

// ---------------------------------------------------------------------------
// Server-authoritative Black Market admission, rotation and settlement.
export type ServerUnderworldOfferId = 'contraband-cache' | 'lost-map' | 'clean-papers' | 'dungeon-key' | 'anonymous-contract';
export type ServerLandId = 'witchlands' | 'green-land' | 'rainforest' | 'frostlands' | 'sunscorched-desert' | 'cinder-coast';

export interface ServerUnderworldOffer {
  id: ServerUnderworldOfferId;
  label: string;
  description: string;
  crystalCost: number;
  reputationRequired: number;
  stockRule: 'always' | 'rotating' | 'rare';
}

export interface ServerUnderworldState {
  reputation: number;
  discoveredRoutes: ServerLandId[];
  revealedLostLands: ServerLandId[];
  forbiddenDungeonKeys: number;
  activeContracts: number;
  inspectionProtection: number;
  sessionToken: string | null;
  sourceLandId: ServerLandId | null;
  sessionExpiresAt: string | null;
}

export interface ServerUnderworldSession {
  state: ServerUnderworldState;
  worldDay: number;
  offers: ServerUnderworldOffer[];
}

export function getServerUnderworld(): Promise<ServerUnderworldSession> {
  return request('/api/underworld');
}

export function enterServerUnderworld(): Promise<ServerUnderworldSession> {
  return request('/api/underworld/enter', { method: 'POST', body: JSON.stringify({}) });
}

export function exitServerUnderworld(sessionToken: string): Promise<{ state: ServerUnderworldState }> {
  return request('/api/underworld/exit', { method: 'POST', body: JSON.stringify({ sessionToken }) });
}

// ---------------------------------------------------------------------------
// Server-authoritative daily objectives. Progress is emitted only by verified
// gameplay services; the client may list and claim but never increment it.
export interface ServerQuest {
  id: string;
  label: string;
  progress: number;
  target: number;
  completed: boolean;
  claimed: boolean;
  rewardCrystals: number;
  rewardXp: number;
}

export interface ServerStoryQuest {
  id: string;
  title: string;
  summary: string;
  stageIndex: number;
  totalStages: number;
  currentStage: null | { id: string; title: string; description: string; progress: number; target: number };
  completed: boolean;
  claimed: boolean;
  reward: Partial<Record<ServerItemId, number>>;
  rewardXp: number;
}

export function getServerQuests(): Promise<{ cycleKey: string; quests: ServerQuest[]; stories: ServerStoryQuest[] }> {
  return request('/api/quests');
}

export function claimServerQuest(
  questId: string,
  expectedRevision: number,
  idempotencyKey = newEconomyCommandKey('quest-claim'),
): Promise<{
  quests: ServerQuest[];
  stories: ServerStoryQuest[];
  inventoryCommand: ServerInventoryCommandResult;
  player: ServerCombatPlayerSnapshot;
}> {
  return request('/api/quests/claim', {
    method: 'POST',
    body: JSON.stringify({ questId, expectedRevision, idempotencyKey }),
  });
}

export function claimServerStory(
  storyId: string,
  expectedRevision: number,
  idempotencyKey = newEconomyCommandKey('story-claim'),
): Promise<{
  cycleKey: string;
  quests: ServerQuest[];
  stories: ServerStoryQuest[];
  inventoryCommand: ServerInventoryCommandResult;
  player: ServerCombatPlayerSnapshot;
}> {
  return request('/api/quests/stories/claim', {
    method: 'POST',
    body: JSON.stringify({ storyId, expectedRevision, idempotencyKey }),
  });
}

export function purchaseServerUnderworldOffer(
  sessionToken: string,
  offerId: ServerUnderworldOfferId,
  expectedRevision: number,
  idempotencyKey = newEconomyCommandKey('underworld'),
): Promise<{
  inventoryCommand: ServerInventoryCommandResult;
  state: ServerUnderworldState;
  offers: ServerUnderworldOffer[];
  revealedRegion: { rx: number; ry: number } | null;
  message: string;
}> {
  return request('/api/underworld/purchase', {
    method: 'POST',
    body: JSON.stringify({ sessionToken, offerId, expectedRevision, idempotencyKey }),
  });
}

// ---------------------------------------------------------------------------
// Fully server-authoritative Dungeon runs. The browser submits intent only;
// topology, collision, enemies, chests, receipts, Vault proofs and death/exit
// settlement all come back as canonical server snapshots.
export type ServerDungeonRunStatus = 'active' | 'death_pending' | 'completed' | 'exited' | 'dead';

export interface ServerDungeonSnapshot {
  runId: string;
  dungeonId: string;
  runSeed: number;
  floor: number;
  floorSeed: number;
  revision: number;
  status: ServerDungeonRunStatus;
  topology: DungeonTopology;
  player: { x: number; y: number; facing: number; hp: number; maxHp: number };
  enemies: DungeonEnemyState[];
  chests: DungeonChestState[];
  keyConsumed: boolean;
  contractSettled: boolean;
  floorCompleted: boolean;
  returnPosition: { rx: number; ry: number; x: number; y: number };
}

export interface ServerDungeonVaultProof {
  id: string;
  runId: string;
  layer: 1 | 5;
  proofHash: string;
  createdAt: string;
}

export interface ServerDungeonReceipt {
  id: string;
  runId: string;
  floor: number;
  boss: boolean;
  proofHash: string;
  createdAt: string;
}

export interface ServerDungeonCommandResponse {
  dungeon: ServerDungeonSnapshot;
  damageTaken?: number;
  killedEnemyIds?: string[];
  reward?: Partial<Record<ServerItemId, number>>;
  inventoryCommand?: ServerInventoryCommandResult;
  combatPlayer?: ServerCombatPlayerSnapshot;
  receipt?: ServerDungeonReceipt;
  vaultProofs?: ServerDungeonVaultProof[];
  contractSettled?: boolean;
}

export async function getActiveDungeon(): Promise<ServerDungeonSnapshot | null> {
  const { dungeon } = await request<{ dungeon: ServerDungeonSnapshot | null }>('/api/dungeon/active');
  return dungeon;
}

export function startServerDungeon(
  dungeonId: string,
  useForbiddenKey: boolean,
  idempotencyKey = newEconomyCommandKey('dungeon-start'),
): Promise<ServerDungeonCommandResponse> {
  return request('/api/dungeon/start', { method: 'POST', body: JSON.stringify({ dungeonId, useForbiddenKey, idempotencyKey }) });
}

export function moveServerDungeon(
  dungeon: Pick<ServerDungeonSnapshot, 'runId' | 'revision'>,
  intent: { moveX: number; moveY: number; running: boolean; facing: number; dtMs: number },
  idempotencyKey = newEconomyCommandKey('dungeon-move'),
): Promise<ServerDungeonCommandResponse> {
  return request('/api/dungeon/move', {
    method: 'POST',
    body: JSON.stringify({ runId: dungeon.runId, expectedRevision: dungeon.revision, idempotencyKey, ...intent }),
  });
}

export function attackServerDungeon(
  dungeon: Pick<ServerDungeonSnapshot, 'runId' | 'revision'>,
  ability: boolean,
  facing: number,
  idempotencyKey = newEconomyCommandKey('dungeon-attack'),
): Promise<ServerDungeonCommandResponse> {
  return request('/api/dungeon/attack', {
    method: 'POST',
    body: JSON.stringify({ runId: dungeon.runId, expectedRevision: dungeon.revision, idempotencyKey, ability, facing }),
  });
}

export function openServerDungeonChest(
  dungeon: Pick<ServerDungeonSnapshot, 'runId' | 'revision'>,
  chestId: string,
  idempotencyKey = newEconomyCommandKey('dungeon-chest'),
): Promise<ServerDungeonCommandResponse> {
  return request('/api/dungeon/chests/open', {
    method: 'POST',
    body: JSON.stringify({ runId: dungeon.runId, expectedRevision: dungeon.revision, idempotencyKey, chestId }),
  });
}

function dungeonRevisionCommand(
  path: string,
  kind: string,
  dungeon: Pick<ServerDungeonSnapshot, 'runId' | 'revision'>,
  idempotencyKey = newEconomyCommandKey(kind),
): Promise<ServerDungeonCommandResponse> {
  return request(path, {
    method: 'POST',
    body: JSON.stringify({ runId: dungeon.runId, expectedRevision: dungeon.revision, idempotencyKey }),
  });
}

export function completeServerDungeonFloor(dungeon: Pick<ServerDungeonSnapshot, 'runId' | 'revision'>): Promise<ServerDungeonCommandResponse> {
  return dungeonRevisionCommand('/api/dungeon/floors/complete', 'dungeon-complete', dungeon);
}

export function advanceServerDungeonFloor(dungeon: Pick<ServerDungeonSnapshot, 'runId' | 'revision'>): Promise<ServerDungeonCommandResponse> {
  return dungeonRevisionCommand('/api/dungeon/floors/advance', 'dungeon-advance', dungeon);
}

export function exitServerDungeon(dungeon: Pick<ServerDungeonSnapshot, 'runId' | 'revision'>): Promise<ServerDungeonCommandResponse & {
  position: { rx: number; ry: number; x: number; y: number };
  inventory: ServerInventorySnapshot;
  combatPlayer: ServerCombatPlayerSnapshot;
}> {
  return request('/api/dungeon/exit', {
    method: 'POST',
    body: JSON.stringify({
      runId: dungeon.runId,
      expectedRevision: dungeon.revision,
      idempotencyKey: newEconomyCommandKey('dungeon-exit'),
    }),
  });
}

export function settleServerDungeonDeath(
  runId: string,
  idempotencyKey = newEconomyCommandKey('dungeon-death'),
): Promise<{
  dungeon: ServerDungeonSnapshot;
  player: ServerCombatPlayerSnapshot;
  death: {
    token: string;
    riskTier: 'lost';
    bag: {
      id: string; ownerUserId: string; rx: number; ry: number; x: number; y: number;
      items: Partial<Record<ServerItemId, number>>; expiresAt: string;
    } | null;
    inventory: ServerInventoryCommandResult;
  };
}> {
  return request('/api/dungeon/death', { method: 'POST', body: JSON.stringify({ runId, idempotencyKey }) });
}

export interface ServerCombatPlayerSnapshot {
  hp: number;
  maxHp: number;
  xp: number;
  level: number;
  dead: boolean;
  deathToken?: string;
  deaths: number;
  kills: number;
}

export function settleInstanceDeath(): Promise<{
  player: ServerCombatPlayerSnapshot;
  damage: number;
  death?: {
    token: string;
    riskTier: 'sanctuary' | 'frontier' | 'fracture' | 'lost';
    bag: {
      id: string;
      ownerUserId: string;
      rx: number;
      ry: number;
      x: number;
      y: number;
      items: Partial<Record<ServerItemId, number>>;
      expiresAt: string;
    } | null;
    inventory: ServerInventoryCommandResult;
  };
}> {
  return request('/api/world/instance-death', { method: 'POST' });
}

export function respawnAfterDeath(deathToken: string): Promise<{
  position: { rx: number; ry: number; x: number; y: number };
  player: ServerCombatPlayerSnapshot;
  inventory: ServerInventorySnapshot;
}> {
  return request('/api/world/respawn', {
    method: 'POST',
    body: JSON.stringify({ deathToken }),
  });
}

export function worldPresenceWebSocketUrl(): string {
  const base = API_BASE || window.location.origin;
  const url = new URL(base, window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws/world';
  url.search = '';
  url.hash = '';
  return url.toString();
}

// ---------------------------------------------------------------------------
// Authoritative Fracture / Lost Territory PvP handoff.
export type ServerPvpRiskTier = 'fracture' | 'lost';
export type ServerPvpStatus = 'active' | 'death_pending' | 'exited' | 'dead';

export interface ServerPvpSession {
  sessionId: string;
  roomKey: string;
  gateId: string;
  riskTier: ServerPvpRiskTier;
  status: ServerPvpStatus;
  admissionToken: string;
  inventoryRevision: number;
  carriedInventory: ServerInventorySnapshot;
  hp: number;
  maxHp: number;
  player: { x: number; y: number; facing: number };
  source: { rx: number; ry: number; x: number; y: number };
  returnPosition: { rx: number; ry: number; x: number; y: number };
  deathToken?: string;
  createdAt: string;
}

export interface ServerPvpAdmissionResponse {
  replayed: boolean;
  pvp: ServerPvpSession;
}

export interface ServerPvpReturnResponse {
  replayed: boolean;
  sessionId: string;
  status: 'exited' | 'dead';
  position: { rx: number; ry: number; x: number; y: number };
  inventory: ServerInventorySnapshot;
}

export async function getActivePvp(): Promise<ServerPvpSession | null> {
  const { pvp } = await request<{ pvp: ServerPvpSession | null }>('/api/pvp/active');
  return pvp;
}

export function admitServerPvp(gateId: string, idempotencyKey = newEconomyCommandKey('pvp-admit')): Promise<ServerPvpAdmissionResponse> {
  return request('/api/pvp/admit', { method: 'POST', body: JSON.stringify({ gateId, idempotencyKey }) });
}

export function exitServerPvp(sessionId: string, idempotencyKey = newEconomyCommandKey('pvp-exit')): Promise<ServerPvpReturnResponse> {
  return request('/api/pvp/exit', { method: 'POST', body: JSON.stringify({ sessionId, idempotencyKey }) });
}

export function returnServerPvpDeath(sessionId: string, deathToken: string, idempotencyKey = newEconomyCommandKey('pvp-return')): Promise<ServerPvpReturnResponse> {
  return request('/api/pvp/return', { method: 'POST', body: JSON.stringify({ sessionId, deathToken, idempotencyKey }) });
}

export function pvpWebSocketUrl(admissionToken: string): string {
  const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
  const base = apiBase
    ? `${apiBase.replace(/^http/, 'ws')}/ws/pvp`
    : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/pvp`;
  return `${base}?token=${encodeURIComponent(admissionToken)}`;
}
