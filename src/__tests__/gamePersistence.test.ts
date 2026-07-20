import { describe, expect, it } from 'vitest';
import { GamePersistence, GamePersistenceApi } from '../gamePersistence';
import type { SaveData } from '../save';

function fakeSave(marker: number): SaveData {
  return { marker } as unknown as SaveData;
}

describe('GamePersistence', () => {
  it('serializes writes and preserves enqueue-time snapshots', async () => {
    const written: number[] = [];
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => (releaseFirst = resolve));
    const firstStarted = new Promise<void>((resolve) => (markFirstStarted = resolve));
    let calls = 0;
    const api: GamePersistenceApi = {
      async putSave(data) {
        calls++;
        if (calls === 1) {
          markFirstStarted();
          await firstGate;
        }
        written.push((data as unknown as { marker: number }).marker);
      },
      async putDeathSave() {},
    };
    const persistence = new GamePersistence(api);
    const first = persistence.save(fakeSave(1));
    await firstStarted;
    const second = persistence.save(fakeSave(2));
    releaseFirst();
    await Promise.all([first, second]);
    expect(written).toEqual([1, 2]);
  });

  it('keeps later saves running after a failed request', async () => {
    const written: number[] = [];
    let fail = true;
    const api: GamePersistenceApi = {
      async putSave(data) {
        if (fail) {
          fail = false;
          throw new Error('offline');
        }
        written.push((data as unknown as { marker: number }).marker);
      },
      async putDeathSave() {},
    };
    const persistence = new GamePersistence(api);
    await expect(persistence.save(fakeSave(1))).rejects.toThrow('offline');
    await persistence.save(fakeSave(2));
    expect(written).toEqual([2]);
  });

  it('deduplicates legacy bag ids and retries a fail-closed death save safely', async () => {
    const attempts: string[][] = [];
    let failFirst = true;
    const api: GamePersistenceApi = {
      async putSave() {},
      async putDeathSave(_data, ids) {
        attempts.push(ids);
        if (failFirst) {
          failFirst = false;
          throw new Error('response lost');
        }
      },
    };
    const persistence = new GamePersistence(api);
    await persistence.saveDeath(fakeSave(1), ['bag-00000001', 'bag-00000001', 'bag-00000002']);
    expect(attempts).toEqual([
      ['bag-00000001', 'bag-00000002'],
      ['bag-00000001', 'bag-00000002'],
    ]);
  });

});
