import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db.js';

const app = createApp();

beforeAll(async () => {
  await prisma.worldConfig.deleteMany();
});
afterAll(async () => prisma.$disconnect());

describe('GET /api/world', () => {
  it('creates the global world seed on first request and returns it stably after', async () => {
    const first = await request(app).get('/api/world');
    expect(first.status).toBe(200);
    expect(typeof first.body.worldSeed).toBe('number');
    expect(Number.isInteger(first.body.worldSeed)).toBe(true);

    const second = await request(app).get('/api/world');
    expect(second.body.worldSeed).toBe(first.body.worldSeed); // same seed forever — one shared world

    const rows = await prisma.worldConfig.findMany();
    expect(rows).toHaveLength(1);
  });

  it('is public — no auth required', async () => {
    const res = await request(app).get('/api/world');
    expect(res.status).toBe(200);
  });
});
