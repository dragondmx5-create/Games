const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const game = read('src/game.ts');
const api = read('src/api.ts');
const dungeonService = read('server/src/dungeon/service.ts');
const dungeonSchema = read('server/src/dungeon/schema.ts');
const dungeonTopology = read('server/src/dungeon/topology.ts');
const dungeonRoutes = read('server/src/dungeon/routes.ts');
const worldSocket = read('server/src/world/socket.ts');
const worldPresence = read('server/src/world/presence.ts');
const save = read('src/save.ts');
const vaultService = read('server/src/vault/service.ts');
const migration = read('server/prisma/migrations/20260713190000_authoritative_dungeon/migration.sql');
const clientWorld = read('src/world.ts');
const clientPvp = read('src/redZoneGame.ts');
const main = read('src/main.ts');
const app = read('server/src/app.ts');
const index = read('server/src/index.ts');
const overworldTopology = read('server/src/world/overworldTopology.ts');
const pvpService = read('server/src/pvp/service.ts');
const pvpRooms = read('server/src/pvp/rooms.ts');
const pvpSocket = read('server/src/pvp/socket.ts');
const pvpRoutes = read('server/src/pvp/routes.ts');
const pvpSchema = read('server/src/pvp/schema.ts');
const pvpProtocol = read('server/src/pvp/protocol.ts');
const pvpGuard = read('server/src/pvp/guard.ts');
const inventoryService = read('server/src/inventory/service.ts');
const pvpMigration = read('server/prisma/migrations/20260713203000_authoritative_pvp/migration.sql');
const questCatalog = read('server/src/quests/catalog.ts');
const questService = read('server/src/quests/service.ts');
const storyDomain = read('server/src/quests/storyDomain.ts');
const questRoutes = read('server/src/quests/routes.ts');
const questSchema = read('server/src/quests/schema.ts');
const storyMigration = read('server/prisma/migrations/20260713194500_story_quests/migration.sql');
const npcLayout = read('server/src/world/npcLayout.ts');
const npcService = read('server/src/world/npcService.ts');
const npcRoutes = read('server/src/world/npcRoutes.ts');
const npcSchema = read('server/src/world/npcSchema.ts');
const npcMigration = read('server/prisma/migrations/20260713195000_authoritative_npcs/migration.sql');
const miningLayout = read('server/src/world/miningLayout.ts');
const miningDomain = read('server/src/world/miningDomain.ts');
const miningService = read('server/src/world/miningService.ts');
const miningRoutes = read('server/src/world/miningRoutes.ts');
const miningSchema = read('server/src/world/miningSchema.ts');
const miningMigration = read('server/prisma/migrations/20260713211000_authoritative_mining/migration.sql');
const dungeonDomain = read('server/src/dungeon/domain.ts');
const dungeonMechanicsMigration = read('server/prisma/migrations/20260713212000_dungeon_floor_mechanics/migration.sql');
const sceneShader = read('src/rendering/shaders/scene.frag.glsl');
const postShader = read('src/rendering/shaders/post.frag.glsl');
const webglContext = read('src/rendering/core/WebGL2DContext.ts');
const effects = read('src/rendering/effects.ts');
const render = read('src/render.ts');
const serverPackage = read('server/package.json');
const serverVitest = read('server/vitest.config.ts');
const serverBuild = read('server/scripts/build.cjs');

const failures = [];
const persistentFields = [
  'loot', 'shrooms', 'wood', 'iron', 'meat', 'hide', 'feathers', 'chests',
  'xp', 'level', 'weapons', 'tools', 'armor',
].join('|');

const directMutation = new RegExp(
  `\\b(?:p|this\\.player)\\.(${persistentFields})\\s*(?:\\+\\+|--|\\+=|-=)`,
  'g',
);
for (const match of game.matchAll(directMutation)) {
  const line = game.slice(0, match.index).split('\n').length;
  failures.push(`direct client mutation of ${match[1]} at src/game.ts:${line}`);
}

for (const forbidden of ['private gainXp(', 'private applyDrops(', 'private grantDrop(', 'private killAnimal(']) {
  if (game.includes(forbidden)) failures.push(`legacy local reward function returned: ${forbidden}`);
}

const forbiddenDungeonClientPatterns = [
  ['seed: Date.now()', 'client-authored Dungeon run seed'],
  ['generateWorld(floor, this.activeDungeon.seed)', 'client-authored Dungeon topology'],
  ['e.hp -= damage', 'client-authored Dungeon enemy damage'],
  ['settleInstanceDeath()', 'generic instance death used for Dungeon'],
  ['Reward locked: server dungeon required', 'legacy preview Dungeon chest path'],
  ['Dungeon rewards require server proof', 'legacy preview Dungeon enemy path'],
];
for (const [pattern, label] of forbiddenDungeonClientPatterns) {
  if (game.includes(pattern)) failures.push(`${label} returned`);
}

if (save.includes('generateWorld(floor, data.dungeon.seed)')) failures.push('legacy Cloud Save still reconstructs client-authored Dungeon topology');
if (save.includes('dungeonSeed ?? Date.now()')) failures.push('legacy save still generates a client Dungeon seed');

for (const required of [
  'worldFromDungeonTopology(snapshot.topology)',
  'getActiveDungeon()',
  'getPendingVaultProofs()',
  'startServerDungeon(',
  'moveServerDungeon(',
  'attackServerDungeon(',
  'openServerDungeonChest(',
  'completeServerDungeonFloor(',
  'advanceServerDungeonFloor(',
  'exitServerDungeon(',
  'settleServerDungeonDeath(',
  "status === 'death_pending'",
]) {
  if (!game.includes(required) && !api.includes(required)) failures.push(`missing authoritative Dungeon client boundary: ${required}`);
}

for (const required of [
  'randomInt(-2147483648, 2147483648)',
  'generateDungeonTopology(',
  'moveInDungeon(',
  'tickDungeonEnemies(',
  'DungeonFloorReceipt',
  'createVaultProof(',
  'vaultProofs',
  'dungeon_contract_reward',
  'dungeon_death_loss',
  'planDeathLoss(inventory, \'lost\')',
  'dungeonOverworldEntrance(',
  'DUNGEON_ENTRANCE_RADIUS',
  'const lockedReplay = replayCommand<DungeonCommandResponse>',
]) {
  if (!dungeonService.includes(required) && !dungeonTopology.includes(required)) failures.push(`missing authoritative Dungeon server invariant: ${required}`);
}

for (const required of ['suspendWorldPresence(userId)', 'assertReplayRunStillBlocking']) {
  if (!dungeonService.includes(required)) failures.push(`Dungeon start does not close overworld authority: ${required}`);
}
for (const required of ['hasBlockingInstance', "status\" IN ('active', 'death_pending')", 'PvpSession', 'suspendWorldPresence(user.id)']) {
  if (!worldSocket.includes(required)) failures.push(`world websocket can rejoin during an active Dungeon: ${required}`);
}
if (!worldPresence.includes('export function suspendWorldPresence')) failures.push('world presence has no authoritative instance suspension primitive');

for (const route of ['/active', '/start', '/move', '/attack', '/chests/open', '/floors/complete', '/floors/advance', '/exit', '/death']) {
  if (!dungeonRoutes.includes(`'${route}'`)) failures.push(`missing Dungeon route: ${route}`);
}

for (const schemaMarker of ['.strict()', 'expectedRevision', 'idempotencyKey', 'dtMs']) {
  if (!dungeonSchema.includes(schemaMarker)) failures.push(`Dungeon protocol is missing ${schemaMarker}`);
}
for (const forbiddenField of ['clientSeed', 'topology:', 'damage:', 'reward:']) {
  if (dungeonSchema.includes(forbiddenField)) failures.push(`Dungeon public schema accepts client-authored ${forbiddenField}`);
}

for (const table of ['DungeonRun', 'DungeonCommand', 'DungeonFloorReceipt', 'DungeonVaultProof']) {
  if (!migration.includes(`CREATE TABLE "${table}"`)) failures.push(`missing Dungeon migration table: ${table}`);
}
if (!migration.includes('DungeonCommand_userId_idempotencyKey_key')) failures.push('Dungeon command idempotency unique index is missing');
if (!migration.includes('DungeonFloorReceipt_runId_floor_key')) failures.push('one-time floor receipt unique index is missing');
if (!migration.includes('DungeonVaultProof_runId_layer_key')) failures.push('one-time Vault proof unique index is missing');
if (!migration.includes('DungeonRun_userId_blocking_key')) failures.push('blocking Dungeon run partial unique index is missing');
if (!migration.includes('DungeonRun_status_check')) failures.push('Dungeon lifecycle status check constraint is missing');
if (!migration.includes('DungeonVaultProof_layer_check')) failures.push('Dungeon Vault proof layer check constraint is missing');

for (const required of ['DungeonVaultProof', 'listPendingDungeonVaultProofs', 'dungeon_vault_claim', 'claimedAt', 'WHERE "id" = ${proofId}', 'matching server-authored Dungeon proof']) {
  if (!vaultService.includes(required)) failures.push(`Vault is not bound to authoritative Dungeon proof: ${required}`);
}

if (!read('server/src/vault/routes.ts').includes("'/proofs'")) failures.push('missing pending Dungeon Vault proof recovery route');

if (!game.includes('Legacy bag rejected: no server receipt')) failures.push('legacy dungeon bags are not visibly fail-closed');
if (!game.includes('this.pickups = [];')) failures.push('legacy weapon pickup minting is not disabled');


// Full overworld obstacle authority: the browser renders the exact same pure
// topology that world presence uses for swept server-side collision checks.
for (const required of [
  'generateCanonicalOverworldTopology',
  'canonicalOverworldGatePositions',
  'isCanonicalOverworldPointWalkable',
  'isCanonicalOverworldPathWalkable',
  'OverworldTile.Rock',
  'OverworldTile.Brick',
  'carveAuthoritativeInteractionAreas',
  'normalizeCanonicalOverworldPosition',
]) {
  if (!overworldTopology.includes(required)) failures.push(`missing canonical overworld topology invariant: ${required}`);
}
for (const required of [
  "import { canonicalOverworldGatePositions, generateCanonicalOverworldTopology }",
  'return canonicalOverworldGatePositions(worldSeed, rx, ry, dir)',
  'world.tiles = Uint8Array.from(canonical.tiles)',
]) {
  if (!clientWorld.includes(required)) failures.push(`client overworld is not projected from canonical topology: ${required}`);
}
for (const required of [
  'generateCanonicalOverworldTopology(worldSeed, current.rx, current.ry)',
  'isCanonicalOverworldPathWalkable(topology, current, next)',
  'isCanonicalOverworldPointWalkable(sourceTopology, current.x, current.y)',
  'isCanonicalOverworldPointWalkable(targetTopology, next.x, next.y)',
]) {
  if (!worldPresence.includes(required)) failures.push(`world movement can bypass canonical obstacle collision: ${required}`);
}
if (!worldSocket.includes('updateWorldPresence(user.id, ws, message, worldSeed)')) failures.push('world websocket does not pass the global world seed into collision validation');
if (/function gatePositions[\s\S]{0,700}mulberry32/.test(clientWorld)) failures.push('client-local gate topology algorithm returned');

// Fracture/Lost are blocking instances backed by canonical inventory and a
// durable, one-time death receipt. Legacy /ws/redzone must never be attached.
for (const required of [
  'admitServerPvp(', 'getActivePvp()', 'exitServerPvp(', 'returnServerPvpDeath(', 'pvpWebSocketUrl(',
]) {
  if (!api.includes(required) && !game.includes(required)) failures.push(`missing authoritative PvP client boundary: ${required}`);
}
for (const required of ['enterAuthoritativePvp(', 'resumeFromPvp(', 'ServerPvpAdmissionResponse']) {
  if (!game.includes(required) && !main.includes(required)) failures.push(`missing overworld/PvP handoff: ${required}`);
}
for (const required of ['killSettled', 'youDied', 'carriedInventory', 'inventory rev', 'return to the center extraction beacon']) {
  if (!clientPvp.includes(required)) failures.push(`PvP client is not receipt/snapshot driven: ${required}`);
}
for (const forbidden of ['attachRedZone(', "url.pathname === '/ws/redzone' &&", 'loadRedZoneBalance(']) {
  if (index.includes(forbidden) || main.includes(forbidden) || clientPvp.includes(forbidden)) failures.push(`legacy PvP gameplay path is active: ${forbidden}`);
}
for (const required of [
  "url.pathname !== '/ws/pvp'", "url.pathname === '/ws/redzone'", "reject(socket, '410 Gone')",
  'sessionForAdmissionToken(admissionToken)', 'parsePvpClientMessage', 'MessageRateLimiter',
]) {
  if (!pvpSocket.includes(required)) failures.push(`missing authoritative PvP websocket invariant: ${required}`);
}
for (const route of ['/active', '/admit', '/exit', '/return']) {
  if (!pvpRoutes.includes(`'${route}'`)) failures.push(`missing PvP route: ${route}`);
}
for (const required of ['.strict()', 'idempotencyKey', 'sessionId', 'deathToken']) {
  if (!pvpSchema.includes(required)) failures.push(`PvP HTTP schema is missing ${required}`);
}
for (const forbiddenField of ['inventory:', 'damage:', 'reward:', 'crystals:']) {
  if (pvpSchema.includes(forbiddenField)) failures.push(`PvP HTTP schema accepts client-authored ${forbiddenField}`);
}
for (const required of ['Object.keys(value).length === 3', "value.type === 'move'", "value.type === 'attack'"]) {
  if (!pvpProtocol.includes(required)) failures.push(`PvP websocket protocol is not strict intent-only: ${required}`);
}
for (const required of [
  'const replay = await serializableTransaction',
  'canonicalPortalById(', 'GATE_USE_RADIUS', 'pvpRoomKey(', 'acquireRoomLease(', 'claimPvpRoomLease(',
  'assertRoomLeaseOwnedInTransaction(',
  'getInventoryInTransaction(tx, userId, true)', 'hasBlockingDungeon(', 'suspendWorldPresence(userId)',
  'planPvpDeathSettlement(', 'PvpDeathReceipt', 'pvp_death_loss', 'pvp_kill_loot',
  'allowActivePvpSessionId', 'inventoryRevision', 'carriedSnapshot',
  'isInsidePvpExtraction(', 'PVP_EXTRACTION_IDLE_MS', 'liveExitGuard?.(', 'registerPvpLiveExitGuard(',
  'releasePvpRoomLease(', 'upsertWorldPosition(',
  '"PvpRoomLease"."ownerId" = ${PROCESS_OWNER_ID}',
]) {
  if (!pvpService.includes(required)) failures.push(`missing authoritative PvP service invariant: ${required}`);
}
for (const required of [
  'claimPvpRoomLease(', 'renewPvpRoomLease(', 'releasePvpRoomLease(', 'pointWalkable(', 'attackProfile(',
  'targetInsideAttackArc(', 'reduceIncomingDamage(', 'settlePvpDeath(', 'PVP_EXTRACTION_RADIUS',
  'canExitPvpFromLiveState(', 'authoritative damage persistence failed',
]) {
  if (!pvpRooms.includes(required)) failures.push(`missing server-owned PvP room invariant: ${required}`);
}
for (const required of ['assertInventoryNotLockedByPvp', 'allowActivePvpSessionId']) {
  if (!inventoryService.includes(required) && !pvpGuard.includes(required)) failures.push(`canonical inventory is not locked during PvP: ${required}`);
}
if (!app.includes("app.use('/api/pvp', pvpRouter)")) failures.push('authoritative PvP router is not mounted');
if (!index.includes('attachPvp(server)') || index.includes('attachRedZone(server)')) failures.push('server entrypoint does not exclusively attach authoritative PvP');
if (!dungeonService.includes('SELECT "id" FROM "PvpSession"')) failures.push('Dungeon admission can overlap an active PvP session');

for (const table of ['PvpSession', 'PvpCommand', 'PvpDeathReceipt', 'PvpRoomLease']) {
  if (!pvpMigration.includes(`CREATE TABLE "${table}"`)) failures.push(`missing PvP migration table: ${table}`);
}
for (const required of [
  'PvpSession_userId_blocking_key', 'PvpCommand_userId_idempotencyKey_key',
  'PvpDeathReceipt_victimSessionId_key', 'PvpSession_riskTier_check',
  'PvpSession_status_check', 'PvpSession_hp_check', 'PvpSession_inventoryRevision_check',
  'PvpDeathReceipt_vaultCrystals_check',
]) {
  if (!pvpMigration.includes(required)) failures.push(`missing PvP migration invariant: ${required}`);
}

// Multi-stage story quests must advance only from deduplicated events emitted
// by authoritative services. The browser may request a claim, never progress.
for (const required of [
  'STORY_QUESTS', "distinctBy: 'regionKey'", 'storyStageMatches(', "eventKind: 'dungeon_floor'",
  "filters: { npcRole: 'archivist' }",
]) {
  if (!questCatalog.includes(required)) failures.push(`missing server story quest invariant: ${required}`);
}
for (const required of [
  'PlayerStoryQuest', 'recordQuestEventInTransaction(', 'ON CONFLICT ("userId", "eventKey") DO NOTHING',
  'readStoryRows(tx, userId, true)', 'executeInventoryCommandInTransaction(', 'expectedRevision',
  'claim_story_quest', 'claimedAt',
]) {
  if (!questService.includes(required)) failures.push(`story quest progress/reward is not authoritative: ${required}`);
}
if (!questRoutes.includes("'/stories/claim'")) failures.push('story quest claim route is missing');
for (const required of ['claimStoryQuestSchema', '.strict()', 'expectedRevision', 'idempotencyKey']) {
  if (!questSchema.includes(required)) failures.push(`story quest claim schema is missing ${required}`);
}
for (const forbiddenField of ['progress:', 'eventKind:', 'amount:', 'reward:']) {
  if (questSchema.includes(forbiddenField)) failures.push(`story quest public schema accepts client-authored ${forbiddenField}`);
}
for (const required of ['CREATE TABLE "PlayerStoryQuest"', 'PlayerStoryQuest_pkey', 'PlayerStoryQuest_stage_check', 'ADD COLUMN "metadata" JSONB']) {
  if (!storyMigration.includes(required)) failures.push(`missing story quest migration invariant: ${required}`);
}
for (const required of ['getServerQuests()', 'claimServerStory(', 'stories']) {
  if (!api.includes(required) && !game.includes(required)) failures.push(`client story projection is missing server boundary: ${required}`);
}

const dailyClaimSection = questService.slice(
  questService.indexOf('export async function claimPlayerQuest('),
  questService.indexOf('export async function claimPlayerStory('),
);
const storyClaimSection = questService.slice(questService.indexOf('export async function claimPlayerStory('));
for (const [label, section] of [['daily', dailyClaimSection], ['story', storyClaimSection]]) {
  const inventoryLock = section.indexOf('getInventoryInTransaction(tx, userId, true)');
  const objectiveLock = section.indexOf('FOR UPDATE');
  if (inventoryLock < 0 || objectiveLock < 0 || inventoryLock > objectiveLock) {
    failures.push(`${label} quest claim violates inventory -> objective lock order`);
  }
  if (!section.includes('replayAfterInventoryLock')) failures.push(`${label} quest claim lacks post-inventory-lock idempotency replay`);
}

for (const required of ['advanceStoryProgress(', 'distinctBy', 'stageCompleted', 'completed']) {
  if (!storyDomain.includes(required)) failures.push(`missing pure story transition invariant: ${required}`);
}
if (!questService.includes('advanceStoryProgress(')) failures.push('story service does not use the tested canonical transition');

// NPC interaction is canonical and receipt-driven. Dynamic patrol is disabled
// until a server-owned motion stream exists, so clients cannot invent proximity.
for (const required of ['generateRegionNpcs(', 'worldNpcId(', "behavior: 'stationary'", 'wanderRadius: 0']) {
  if (!npcLayout.includes(required)) failures.push(`missing canonical NPC layout invariant: ${required}`);
}
for (const required of [
  'getFreshWorldPresence(userId)', 'NPC_INTERACT_RADIUS', 'NpcInteractionReceipt',
  'replayAfterLock', 'FOR UPDATE', 'recordQuestEventInTransaction(', 'npcRole: npc.role',
]) {
  if (!npcService.includes(required)) failures.push(`NPC interaction is not authoritative/idempotent: ${required}`);
}
for (const route of ['/regions/:rx/:ry/npcs', '/npcs/interact']) {
  if (!npcRoutes.includes(`'${route}'`)) failures.push(`missing NPC route: ${route}`);
}
for (const required of ['.strict()', 'npcId', 'idempotencyKey']) {
  if (!npcSchema.includes(required)) failures.push(`NPC schema is missing ${required}`);
}
for (const forbiddenField of ['dialogue:', 'reaction:', 'reward:', 'progress:']) {
  if (npcSchema.includes(forbiddenField)) failures.push(`NPC public schema accepts client-authored ${forbiddenField}`);
}
for (const required of ['CREATE TABLE "NpcInteractionReceipt"', 'NpcInteractionReceipt_userId_idempotencyKey_key']) {
  if (!npcMigration.includes(required)) failures.push(`missing NPC receipt migration invariant: ${required}`);
}
for (const required of ['getRegionNpcs(', 'interactServerNpc(', 'serverOwned']) {
  if (!api.includes(required) && !game.includes(required)) failures.push(`client NPC flow is not receipt-driven: ${required}`);
}

// Mining uses deterministic node definitions plus a row-locked mutable state.
// Every strike is an inventory-ledger command; only the collapsing strike pays.
for (const required of [
  'generateRegionMiningNodes(', 'miningNodeId(', 'isCanonicalOverworldTileWalkable(',
  'generateRegionResourceNodes(', 'maxIntegrity', 'respawnSeconds',
]) {
  if (!miningLayout.includes(required)) failures.push(`missing canonical mining layout invariant: ${required}`);
}
for (const required of ['resolveMiningStrike(', 'availableAtMs > nowMs', 'extractionCount', 'collapsed']) {
  if (!miningDomain.includes(required)) failures.push(`missing canonical mining transition: ${required}`);
}
for (const required of [
  'getFreshWorldPresence(userId)', 'MINING_RADIUS', 'FOR UPDATE', "snapshot.stacks['tool.pickaxe']",
  'executeInventoryCommandInTransaction(', 'expectedRevision', 'resolveMiningStrike(',
  'recordQuestEventInTransaction(', "'mineral_mined'",
]) {
  if (!miningService.includes(required)) failures.push(`mining is not server-authoritative/idempotent: ${required}`);
}
for (const route of ['/regions/:rx/:ry/mining', '/mining/strike']) {
  if (!miningRoutes.includes(`'${route}'`)) failures.push(`missing mining route: ${route}`);
}
for (const required of ['.strict()', 'nodeId', 'expectedRevision', 'idempotencyKey']) {
  if (!miningSchema.includes(required)) failures.push(`mining schema is missing ${required}`);
}
for (const forbiddenField of ['reward:', 'amount:', 'integrity:', 'kind:']) {
  if (miningSchema.includes(forbiddenField)) failures.push(`mining public schema accepts client-authored ${forbiddenField}`);
}
for (const required of [
  'CREATE TABLE "WorldMiningState"', 'WorldMiningState_kind_check',
  'WorldMiningState_integrity_check', 'WorldMiningState_extractionCount_check',
]) {
  if (!miningMigration.includes(required)) failures.push(`missing mining migration invariant: ${required}`);
}
for (const required of ['getRegionMining(', 'strikeServerMiningNode(', 'expectedRevision']) {
  if (!api.includes(required) && !game.includes(required)) failures.push(`client mining flow is missing server boundary: ${required}`);
}

// Dungeon v2 mechanics remain part of the checksummed server topology. Damage,
// slow, elite affixes and catch-up cadence are never accepted from the client.
for (const required of ['version: 2 as const', 'theme', 'mechanic', 'hazards', 'topologyChecksum(', 'DungeonEnemyAffix']) {
  if (!dungeonTopology.includes(required)) failures.push(`missing Dungeon v2 topology invariant: ${required}`);
}
for (const required of [
  'dungeonMovementMultiplier(', 'tickDungeonHazards(', 'elapsedTicks', 'lethalTickCount',
  "AFFIXES", "affix === 'swift'", "affix === 'venomous'", "affix === 'armored'",
]) {
  if (!dungeonDomain.includes(required) && !dungeonService.includes(required)) failures.push(`missing authoritative Dungeon mechanic invariant: ${required}`);
}
for (const required of ['hazardReadyAt', 'hazardId', 'tickDungeonHazards(', 'moveDungeonWithMechanics(']) {
  if (!dungeonService.includes(required)) failures.push(`Dungeon service does not persist/apply mechanics: ${required}`);
}
const dungeonChestSection = dungeonService.slice(
  dungeonService.indexOf('export function openDungeonChest('),
  dungeonService.indexOf('export function completeDungeonFloor('),
);
for (const required of ['Settle authoritative threats before any reward-bearing interaction', 'tickDungeonEnemies(', 'tickDungeonHazards(', 'hazardTick.playerHp <= 0', 'dungeon_chest_reward']) {
  if (!dungeonChestSection.includes(required)) failures.push(`Dungeon chest path does not settle threats before reward: ${required}`);
}
if (dungeonChestSection.indexOf('tickDungeonHazards(') > dungeonChestSection.indexOf("'dungeon_chest_reward'")) {
  failures.push('Dungeon chest reward is applied before authoritative hazard settlement');
}

for (const required of ['ADD COLUMN "hazardReadyAt"', 'ADD COLUMN "hazardId"']) {
  if (!dungeonMechanicsMigration.includes(required)) failures.push(`Dungeon hazard cadence migration is missing: ${required}`);
}
if (!clientWorld.includes('dungeonHazards')) failures.push('client Dungeon projection cannot render server hazards');

// GLSL effects are presentation-only, quality-bounded, and use the existing
// WebGL2 scene/post pipeline rather than adding gameplay authority.
for (const required of ['vMode == 4', 'vMode == 5', 'vMode == 6', 'Procedural water', 'combat arc']) {
  if (!sceneShader.includes(required)) failures.push(`missing scene GLSL effect: ${required}`);
}
for (const required of ['uBloomStrength', 'cloudField(', 'uDamage', 'uQuality', 'lightScatter']) {
  if (!postShader.includes(required)) failures.push(`missing postprocessing effect invariant: ${required}`);
}
for (const required of ['drawWaterTile(', 'drawCombatSlash(', 'drawGlowParticle(']) {
  if (!webglContext.includes(required) || !render.includes(required)) failures.push(`renderer does not use WebGL2 effect primitive: ${required}`);
}
for (const required of ['visualEffectBudget(', 'waterEdgeMask(', 'slashProgress(']) {
  if (!effects.includes(required)) failures.push(`missing quality/effect helper: ${required}`);
}

for (const required of [
  "app.use('/api/quests', questRouter)", "app.use('/api/world', npcRouter)", "app.use('/api/world', miningRouter)",
]) {
  if (!app.includes(required)) failures.push(`server router not mounted: ${required}`);
}


// Backend delivery must fail closed. A failed TypeScript build cannot leave a
// partially emitted server/dist tree, and tests must never discover compiled
// copies of source suites.
if (!serverPackage.includes('"build": "node scripts/build.cjs"')) {
  failures.push('server build does not use the fail-closed build wrapper');
}
for (const required of [
  "fs.rmSync(distDir, { recursive: true, force: true })",
  'cleanDist();',
  'result.status !== 0',
  'Never leave',
]) {
  if (!serverBuild.includes(required)) failures.push(`server build wrapper is missing: ${required}`);
}
if ((serverBuild.match(/cleanDist\(\);/g) ?? []).length < 2) {
  failures.push('server build wrapper does not clean dist both before build and after failure');
}
if (!serverVitest.includes("exclude: ['dist/**', 'node_modules/**']")) {
  failures.push('server Vitest can discover compiled dist tests');
}

if (failures.length) {
  console.error('Server-authority boundary check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Server-authority boundary check passed.');
