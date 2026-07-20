import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db.js';

const app = createApp();

async function resetDb() {
  await prisma.refreshToken.deleteMany();
  await prisma.saveGame.deleteMany();
  await prisma.user.deleteMany();
}

beforeAll(resetDb);
afterEach(resetDb);
afterAll(async () => prisma.$disconnect());

const creds = { email: 'alice@example.com', username: 'alice', password: 'hunter2222' };

describe('auth routes', () => {
  it('registers a new account and sets cookies', async () => {
    const res = await request(app).post('/api/auth/register').send(creds);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: creds.email, username: creds.username });
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('access_token='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
  });

  it('rejects a duplicate email with 409', async () => {
    await request(app).post('/api/auth/register').send(creds);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...creds, username: 'someoneelse' });
    expect(res.status).toBe(409);
  });

  it('normalizes email case and whitespace on registration/login', async () => {
    const registered = await request(app).post('/api/auth/register').send({
      ...creds,
      email: '  Alice@Example.COM  ',
    });
    expect(registered.status).toBe(201);
    expect(registered.body.user.email).toBe('alice@example.com');
    const login = await request(app).post('/api/auth/login').send({ email: 'ALICE@EXAMPLE.COM', password: creds.password });
    expect(login.status).toBe(200);
  });

  it('creates canonical starter rows in the registration transaction', async () => {
    const registered = await request(app).post('/api/auth/register').send(creds);
    const userId = registered.body.user.id as string;
    const [inventory, position, combat, underworld] = await Promise.all([
      prisma.playerInventory.findUnique({ where: { userId }, include: { stacks: true } }),
      prisma.playerWorldPosition.findUnique({ where: { userId } }),
      prisma.playerCombatState.findUnique({ where: { userId } }),
      prisma.playerUnderworldState.findUnique({ where: { userId } }),
    ]);
    expect(inventory).toMatchObject({ progressionLevel: 1, equippedWeapon: 'weapon.bone', migratedFromSave: false });
    expect(inventory?.stacks).toContainEqual({ userId, itemId: 'weapon.bone', quantity: 1 });
    expect(position).toMatchObject({ rx: 0, ry: 0 });
    expect(combat).toMatchObject({ hp: 10, maxHp: 10, level: 1 });
    expect(underworld).toMatchObject({ reputation: 0 });
  });

  it('rejects login with the wrong password', async () => {
    await request(app).post('/api/auth/register').send(creds);
    const res = await request(app).post('/api/auth/login').send({ email: creds.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('logs in and reads the current user via /me', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send(creds);
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(creds.email);
  });

  it('rejects /me without a session', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rotates the refresh token and issues a new access token', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send(creds);
    const res = await agent.post('/api/auth/refresh');
    expect(res.status).toBe(200);
    // old cookie jar was rotated in place; /me should still work with the new one
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
  });

  it('logs out and revokes the session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send(creds);
    await agent.post('/api/auth/logout');
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('changes the password, requires the old one, and revokes other sessions', async () => {
    const agentA = request.agent(app);
    await agentA.post('/api/auth/register').send(creds);
    const agentB = request.agent(app);
    await agentB.post('/api/auth/login').send({ email: creds.email, password: creds.password });

    const wrongOld = await agentA.post('/api/auth/change-password').send({ currentPassword: 'nope', newPassword: 'newhunter222' });
    expect(wrongOld.status).toBe(401);

    const changed = await agentA.post('/api/auth/change-password').send({ currentPassword: creds.password, newPassword: 'newhunter222' });
    expect(changed.status).toBe(200);

    // agentA's session was reissued in the same response, so it still works
    const meA = await agentA.get('/api/auth/me');
    expect(meA.status).toBe(200);

    // Access tokens are tied to the revocable RefreshToken session row, so
    // the other device loses both HTTP access and refresh immediately.
    const meB = await agentB.get('/api/auth/me');
    expect(meB.status).toBe(401);
    const refreshB = await agentB.post('/api/auth/refresh');
    expect(refreshB.status).toBe(401);

    // old password no longer works, new one does
    const oldLogin = await request(app).post('/api/auth/login').send({ email: creds.email, password: creds.password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app).post('/api/auth/login').send({ email: creds.email, password: 'newhunter222' });
    expect(newLogin.status).toBe(200);
  });

  it('deletes the account and cascades its sessions', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send(creds);
    const del = await agent.delete('/api/auth/me');
    expect(del.status).toBe(200);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(401);

    // the account is really gone, not just logged out — a fresh register
    // with the same email should succeed instead of hitting a 409
    const reregister = await request(app).post('/api/auth/register').send(creds);
    expect(reregister.status).toBe(201);
  });

  function extractCookie(res: request.Response, name: string): string {
    const raw = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${name}=`));
    if (!raw) throw new Error(`no ${name} cookie in response`);
    return raw.split(';')[0];
  }

  it('rotating twice with the original token: the reused (now-stale) token gets rejected and kills every session', async () => {
    const register = await request(app).post('/api/auth/register').send(creds);
    const originalRefreshCookie = extractCookie(register, 'refresh_token');

    const firstRefresh = await request(app).post('/api/auth/refresh').set('Cookie', originalRefreshCookie);
    expect(firstRefresh.status).toBe(200);
    const rotatedRefreshCookie = extractCookie(firstRefresh, 'refresh_token');

    // backdate the now-revoked original token past the reuse grace window,
    // so replaying it reads as theft rather than a same-instant tab race
    const rawOriginal = decodeURIComponent(originalRefreshCookie.split('=')[1]);
    const { hashToken } = await import('../auth/jwt.js');
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawOriginal) },
      data: { updatedAt: new Date(Date.now() - 60_000) },
    });

    const replay = await request(app).post('/api/auth/refresh').set('Cookie', originalRefreshCookie);
    expect(replay.status).toBe(401);

    // the legitimately-rotated session should be dead too — reuse detection
    // revokes every session for the user, not just the replayed one
    const rotatedNowDead = await request(app).post('/api/auth/refresh').set('Cookie', rotatedRefreshCookie);
    expect(rotatedNowDead.status).toBe(401);
  });

  it('a near-simultaneous reuse (same-instant tab race) does not nuke the winning session', async () => {
    const register = await request(app).post('/api/auth/register').send(creds);
    const originalRefreshCookie = extractCookie(register, 'refresh_token');

    // two "tabs" racing a refresh with the same still-current token
    const [first, second] = await Promise.all([
      request(app).post('/api/auth/refresh').set('Cookie', originalRefreshCookie),
      request(app).post('/api/auth/refresh').set('Cookie', originalRefreshCookie),
    ]);
    const [winner, loser] = first.status === 200 ? [first, second] : [second, first];
    expect(winner.status).toBe(200);
    expect(loser.status).toBe(401);

    // the winner's freshly-issued session must still be alive — a same-
    // instant race must not be treated as theft and nuke it
    const winnerCookie = extractCookie(winner, 'refresh_token');
    const stillWorks = await request(app).post('/api/auth/refresh').set('Cookie', winnerCookie);
    expect(stillWorks.status).toBe(200);
  });
});
