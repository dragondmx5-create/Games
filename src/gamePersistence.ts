import type { SaveData } from './save';

export interface GamePersistenceApi {
  putSave(data: SaveData): Promise<unknown>;
  putDeathSave(data: SaveData, forfeitBagIds: string[]): Promise<unknown>;
}

/**
 * Serializes cloud mutations so HTTP response order can never roll state back.
 * Ordinary save snapshots are captured by the caller at enqueue time, keeping
 * gameplay event order intact (especially the state immediately before a
 * compatibility save or authoritative death response).
 */
export class GamePersistence {
  private tail: Promise<void> = Promise.resolve();
  constructor(private readonly api: GamePersistenceApi) {}

  save(data: SaveData): Promise<void> {
    return this.enqueue(async () => {
      await this.api.putSave(data);
    });
  }

  /** Persists the compatibility death snapshot; unproven legacy bags are stripped server-side. */
  saveDeath(data: SaveData, forfeitBagIds: string[]): Promise<void> {
    const ids = [...new Set(forfeitBagIds)];
    return this.enqueue(async () => {
      try {
        await this.api.putDeathSave(data, ids);
      } catch {
        // The first response may have been lost after the DB committed. The
        // compatibility endpoint is fail-closed and retry-safe because it never credits bag value.
        await this.api.putDeathSave(data, ids);
      }
    });
  }

  /** Exposed for tests/page lifecycle coordination. */
  idle(): Promise<void> {
    return this.tail;
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const current = this.tail.then(operation);
    // A failed request must reject its own caller but must not permanently
    // poison the queue and block every future autosave.
    this.tail = current.catch(() => {});
    return current;
  }
}
