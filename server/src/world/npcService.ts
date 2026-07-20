import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { serializableTransaction } from '../db/transaction.js';
import { HttpError } from '../middleware/httpError.js';
import { recordQuestEventInTransaction } from '../quests/service.js';
import { getFreshWorldPresence } from './presence.js';
import { getOrCreateWorldSeed } from './service.js';
import { generateRegionNpcs, parseWorldNpcId, type WorldNpcDefinition } from './npcLayout.js';

const NPC_INTERACT_RADIUS = 38;

interface NpcReceiptRow {
  requestHash: string;
  result: unknown;
}

export interface NpcInteractionResult {
  npc: WorldNpcDefinition;
  dialogue: string;
  reaction: 'neutral' | 'encouraging' | 'story-complete' | 'merchant';
  replayed: boolean;
}

function requestHash(npcId: string): string {
  return createHash('sha256').update(JSON.stringify({ npcId })).digest('hex');
}

function parseResult(value: unknown): Omit<NpcInteractionResult, 'replayed'> {
  if (!value || typeof value !== 'object') throw new Error('invalid NPC receipt result');
  return value as Omit<NpcInteractionResult, 'replayed'>;
}

async function findReceipt(tx: Prisma.TransactionClient, userId: string, idempotencyKey: string): Promise<NpcReceiptRow | null> {
  const rows = await tx.$queryRaw<NpcReceiptRow[]>`
    SELECT "requestHash", "result" FROM "NpcInteractionReceipt"
    WHERE "userId" = ${userId} AND "idempotencyKey" = ${idempotencyKey}
  `;
  return rows[0] ?? null;
}

function replayReceipt(row: NpcReceiptRow | null, hash: string): NpcInteractionResult | null {
  if (!row) return null;
  if (row.requestHash !== hash) throw new HttpError(409, 'idempotency key was already used for another NPC interaction');
  return { ...parseResult(row.result), replayed: true };
}

function canonicalNpc(npcId: string, worldSeed: number): WorldNpcDefinition {
  const parsed = parseWorldNpcId(npcId);
  if (!parsed) throw new HttpError(400, 'invalid NPC id');
  const npc = generateRegionNpcs(worldSeed, parsed.rx, parsed.ry).find((candidate) => candidate.id === npcId);
  if (!npc) throw new HttpError(404, 'NPC is not present in this region');
  return npc;
}

function assertPresence(userId: string, npc: WorldNpcDefinition): void {
  const presence = getFreshWorldPresence(userId);
  if (!presence) throw new HttpError(409, 'world presence is not connected');
  if (presence.rx !== npc.rx || presence.ry !== npc.ry) throw new HttpError(409, 'NPC is in another region');
  if (Math.hypot(presence.x - npc.x, presence.y - npc.y) > NPC_INTERACT_RADIUS) throw new HttpError(409, 'too far from NPC');
}

async function dialogueFor(tx: Prisma.TransactionClient, userId: string, npc: WorldNpcDefinition): Promise<Pick<NpcInteractionResult, 'dialogue' | 'reaction'>> {
  if (npc.role === 'merchant') {
    return { dialogue: 'Supplies are priced by the server ledger. Browse, but no IOUs.', reaction: 'merchant' };
  }
  const rows = await tx.$queryRaw<Array<{ stageIndex: number; completedAt: Date | null; claimedAt: Date | null }>>`
    SELECT "stageIndex", "completedAt", "claimedAt" FROM "PlayerStoryQuest"
    WHERE "userId" = ${userId} AND "storyId" = 'echoes-beneath-the-crown'
  `;
  const story = rows[0];
  if (npc.role === 'archivist') {
    if (story?.completedAt && !story.claimedAt) {
      return { dialogue: 'The record is sealed. Your final reward is ready to claim.', reaction: 'story-complete' };
    }
    if (story?.claimedAt) return { dialogue: 'Your account now rests in the Crown archive.', reaction: 'neutral' };
    return { dialogue: 'Bring me proof from road, border, and depth. The archive accepts only server receipts.', reaction: 'encouraging' };
  }
  return { dialogue: 'The border shifts, but the canonical gates do not. Keep to the marked openings.', reaction: 'neutral' };
}

export async function listRegionNpcs(rx: number, ry: number): Promise<{ worldSeed: number; npcs: WorldNpcDefinition[] }> {
  const worldSeed = await getOrCreateWorldSeed();
  return { worldSeed, npcs: generateRegionNpcs(worldSeed, rx, ry) };
}

export async function interactWithNpc(userId: string, npcId: string, idempotencyKey: string): Promise<NpcInteractionResult> {
  const worldSeed = await getOrCreateWorldSeed();
  const npc = canonicalNpc(npcId, worldSeed);
  const hash = requestHash(npcId);
  return serializableTransaction(async (tx) => {
    const replay = replayReceipt(await findReceipt(tx, userId, idempotencyKey), hash);
    if (replay) return replay;
    await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const replayAfterLock = replayReceipt(await findReceipt(tx, userId, idempotencyKey), hash);
    if (replayAfterLock) return replayAfterLock;
    assertPresence(userId, npc);
    const receiptId = randomUUID();
    await recordQuestEventInTransaction(
      tx,
      userId,
      'npc_interaction',
      1,
      `npc-interaction:${receiptId}`,
      new Date(),
      { npcRole: npc.role },
    );
    const response = { npc, ...await dialogueFor(tx, userId, npc) };
    await tx.$executeRaw`
      INSERT INTO "NpcInteractionReceipt"
        ("id", "userId", "idempotencyKey", "requestHash", "result", "createdAt")
      VALUES
        (${receiptId}, ${userId}, ${idempotencyKey}, ${hash}, ${JSON.stringify(response)}::jsonb, CURRENT_TIMESTAMP)
    `;
    return { ...response, replayed: false };
  });
}
