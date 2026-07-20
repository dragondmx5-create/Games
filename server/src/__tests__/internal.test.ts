import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db.js';
import { env } from '../env.js';

const app = createApp();
const KEY_HEADER = 'x-internal-api-key';

async function resetDb() {
  await prisma.internalLedgerEntry.deleteMany();
  await prisma.redZonePlayer.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.saveGame.deleteMany();
  await prisma.user.deleteMany();
}

beforeAll(resetDb);
afterEach(resetDb);
afterAll(async () => prisma.$disconnect());

async function makeUser(username: string) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: `${username}@example.com`, username, password: 'hunter2222' });
  return res.body.user.id as string;
}

describe('internal API auth', () => {
  it('rejects requests with no key', async () => {
    const res = await request(app).get('/api/internal/users/whatever/balance');
    expect(res.status).toBe(401);
  });

  it('rejects requests with the wrong key', async () => {
    const res = await request(app).get('/api/internal/users/whatever/balance').set(KEY_HEADER, 'wrong-key');
    expect(res.status).toBe(401);
  });
});

describe('internal API balance + credit', () => {
  it('reads a balance of 0 for a user who has never touched the Red Zone', async () => {
    const userId = await makeUser('freshuser');
    const res = await request(app).get(`/api/internal/users/${userId}/balance`).set(KEY_HEADER, env.INTERNAL_API_KEY);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ userId, username: 'freshuser', redZoneCrystals: 0 });
  });

  it('404s for an unknown userId', async () => {
    const res = await request(app).get('/api/internal/users/does-not-exist/balance').set(KEY_HEADER, env.INTERNAL_API_KEY);
    expect(res.status).toBe(404);
  });

  it('credits a balance and records a ledger entry', async () => {
    const userId = await makeUser('credituser');
    const res = await request(app)
      .post(`/api/internal/users/${userId}/redzone-credit`)
      .set(KEY_HEADER, env.INTERNAL_API_KEY)
      .send({ amount: 50, idempotencyKey: 'tx-1' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ userId, balance: 50, replay: false });

    const balance = await request(app).get(`/api/internal/users/${userId}/balance`).set(KEY_HEADER, env.INTERNAL_API_KEY);
    expect(balance.body.redZoneCrystals).toBe(50);
  });

  it('debits a balance, rejecting an amount that would go negative', async () => {
    const userId = await makeUser('debituser');
    await request(app)
      .post(`/api/internal/users/${userId}/redzone-credit`)
      .set(KEY_HEADER, env.INTERNAL_API_KEY)
      .send({ amount: 30, idempotencyKey: 'fund-1' });

    const tooMuch = await request(app)
      .post(`/api/internal/users/${userId}/redzone-credit`)
      .set(KEY_HEADER, env.INTERNAL_API_KEY)
      .send({ amount: -31, idempotencyKey: 'withdraw-1' });
    expect(tooMuch.status).toBe(409);

    const ok = await request(app)
      .post(`/api/internal/users/${userId}/redzone-credit`)
      .set(KEY_HEADER, env.INTERNAL_API_KEY)
      .send({ amount: -30, idempotencyKey: 'withdraw-2' });
    expect(ok.status).toBe(200);
    expect(ok.body.balance).toBe(0);
  });

  it('replays the same result for a repeated idempotencyKey instead of applying it twice', async () => {
    const userId = await makeUser('idempuser');
    const first = await request(app)
      .post(`/api/internal/users/${userId}/redzone-credit`)
      .set(KEY_HEADER, env.INTERNAL_API_KEY)
      .send({ amount: 20, idempotencyKey: 'dup-1' });
    expect(first.body).toMatchObject({ balance: 20, replay: false });

    const second = await request(app)
      .post(`/api/internal/users/${userId}/redzone-credit`)
      .set(KEY_HEADER, env.INTERNAL_API_KEY)
      .send({ amount: 20, idempotencyKey: 'dup-1' });
    expect(second.body).toMatchObject({ balance: 20, replay: true });

    const balance = await request(app).get(`/api/internal/users/${userId}/balance`).set(KEY_HEADER, env.INTERNAL_API_KEY);
    expect(balance.body.redZoneCrystals).toBe(20); // not 40 — the second call must not have re-applied
  });

  it('409s a reused idempotencyKey carrying a different amount instead of faking a replay', async () => {
    const userId = await makeUser('mismatchuser');
    await request(app)
      .post(`/api/internal/users/${userId}/redzone-credit`)
      .set(KEY_HEADER, env.INTERNAL_API_KEY)
      .send({ amount: 20, idempotencyKey: 'mismatch-1' });

    const res = await request(app)
      .post(`/api/internal/users/${userId}/redzone-credit`)
      .set(KEY_HEADER, env.INTERNAL_API_KEY)
      .send({ amount: 99, idempotencyKey: 'mismatch-1' });
    expect(res.status).toBe(409);

    const balance = await request(app).get(`/api/internal/users/${userId}/balance`).set(KEY_HEADER, env.INTERNAL_API_KEY);
    expect(balance.body.redZoneCrystals).toBe(20); // the mismatched call must not have applied either amount
  });

  it('rejects a concurrent idempotency collision with different amounts', async () => {
    const userId = await makeUser('race-mismatch-user');
    const [a, b] = await Promise.all([
      request(app)
        .post(`/api/internal/users/${userId}/redzone-credit`)
        .set(KEY_HEADER, env.INTERNAL_API_KEY)
        .send({ amount: 15, idempotencyKey: 'race-mismatch-1' }),
      request(app)
        .post(`/api/internal/users/${userId}/redzone-credit`)
        .set(KEY_HEADER, env.INTERNAL_API_KEY)
        .send({ amount: 30, idempotencyKey: 'race-mismatch-1' }),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const winner = a.status === 200 ? a.body.balance : b.body.balance;
    expect([15, 30]).toContain(winner);

    const entries = await prisma.internalLedgerEntry.findMany({ where: { idempotencyKey: 'race-mismatch-1' } });
    expect(entries).toHaveLength(1);
    expect(entries[0].resultBalance).toBe(winner);
  });

  it('handles two concurrent requests with the same idempotencyKey without double-applying', async () => {
    const userId = await makeUser('raceuser');
    const [a, b] = await Promise.all([
      request(app)
        .post(`/api/internal/users/${userId}/redzone-credit`)
        .set(KEY_HEADER, env.INTERNAL_API_KEY)
        .send({ amount: 15, idempotencyKey: 'race-1' }),
      request(app)
        .post(`/api/internal/users/${userId}/redzone-credit`)
        .set(KEY_HEADER, env.INTERNAL_API_KEY)
        .send({ amount: 15, idempotencyKey: 'race-1' }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.balance).toBe(15);
    expect(b.body.balance).toBe(15);

    const balance = await request(app).get(`/api/internal/users/${userId}/balance`).set(KEY_HEADER, env.INTERNAL_API_KEY);
    expect(balance.body.redZoneCrystals).toBe(15);

    const entries = await prisma.internalLedgerEntry.findMany({ where: { idempotencyKey: 'race-1' } });
    expect(entries).toHaveLength(1);
  });

  it('rejects a malformed credit body', async () => {
    const userId = await makeUser('badbodyuser');
    const res = await request(app)
      .post(`/api/internal/users/${userId}/redzone-credit`)
      .set(KEY_HEADER, env.INTERNAL_API_KEY)
      .send({ amount: 0, idempotencyKey: 'x' });
    expect(res.status).toBe(400);
  });
});
