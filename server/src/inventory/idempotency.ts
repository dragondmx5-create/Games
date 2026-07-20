import { createHash } from 'node:crypto';
import { HttpError } from '../middleware/httpError.js';
import type { InventoryCommandResult } from './types.js';

export interface StoredInventoryCommand {
  requestHash: string;
  result: unknown;
}

export function hashInventoryCommand(kind: string, payload: unknown, expectedRevision: number | undefined): string {
  return createHash('sha256').update(JSON.stringify({ kind, payload, expectedRevision: expectedRevision ?? null })).digest('hex');
}

export function replayStoredCommand(stored: StoredInventoryCommand | undefined, hash: string): InventoryCommandResult | null {
  if (!stored) return null;
  if (stored.requestHash !== hash) throw new HttpError(409, 'idempotency key already used with a different command');
  const result = stored.result as InventoryCommandResult;
  return { ...result, replayed: true };
}

export function assertInventoryRevision(currentRevision: number, expectedRevision: number | undefined): void {
  if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
    throw new HttpError(409, `inventory revision mismatch; current revision is ${currentRevision}`);
  }
}
