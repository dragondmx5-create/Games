import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { HttpError } from '../middleware/httpError.js';
import { hashPassword, verifyPassword } from './password.js';
import { generateRefreshToken, hashToken, refreshExpiry, signAccessToken } from './jwt.js';
import { clearAuthCookies, setAuthCookies } from './cookies.js';
import { requireAuth } from './middleware.js';
import { serializableTransaction } from '../db/transaction.js';
import { ensureStarterAccountState } from '../account/bootstrap.js';
import { closeSessionSockets, closeUserSockets } from './socketRegistry.js';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  username: z.string().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(200),
});

function publicUser(user: { id: string; email: string; username: string }) {
  return { id: user.id, email: user.email, username: user.username };
}

async function issueSession(userId: string) {
  const refreshToken = generateRefreshToken();
  const row = await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(refreshToken), expiresAt: refreshExpiry() },
    select: { id: true },
  });
  const accessToken = signAccessToken(userId, row.id);
  return { accessToken, refreshToken, sessionId: row.id };
}

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.parse(req.body);
    const email = parsed.email;
    const username = parsed.username;
    const passwordHash = await hashPassword(parsed.password);
    const user = await serializableTransaction(async (tx) => {
      const created = await tx.user.create({ data: { email, username, passwordHash } });
      await ensureStarterAccountState(tx, created.id);
      return created;
    });
    const { accessToken, refreshToken } = await issueSession(user.id);
    setAuthCookies(res, accessToken, refreshToken);
    res.status(201).json({ user: publicUser(user) });
  }),
);

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.parse(req.body);
    const email = parsed.email;
    const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (!user || !(await verifyPassword(parsed.password, user.passwordHash))) {
      throw new HttpError(401, 'invalid email or password');
    }
    const { accessToken, refreshToken } = await issueSession(user.id);
    setAuthCookies(res, accessToken, refreshToken);
    res.json({ user: publicUser(user) });
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.refresh_token as string | undefined;
    if (!raw) throw new HttpError(401, 'no refresh token');

    const tokenHash = hashToken(raw);
    const row = await prisma.refreshToken.findFirst({ where: { tokenHash } });
    if (!row) throw new HttpError(401, 'refresh token invalid or expired');
    if (row.expiresAt < new Date()) throw new HttpError(401, 'refresh token invalid or expired');

    // atomic compare-and-swap, not read-then-write: two concurrent requests
    // presenting the same token (two tabs racing a refresh) must never both
    // see revoked:false and both "win" — only the request whose updateMany
    // actually flips the row gets to rotate. Same pattern as the vault
    // claim's CAS in vault/routes.ts.
    const claimed = await prisma.refreshToken.updateMany({ where: { id: row.id, revoked: false }, data: { revoked: true } });

    if (claimed.count === 0) {
      // lost the race, or this really is a stale/stolen token being
      // replayed — either way this exact token is done. Only escalate to
      // "kill every session for this user" if it was revoked well before
      // now: a reuse long after rotation reads as a genuinely stolen old
      // token, not a same-instant tab race (where the loser arrives
      // milliseconds after the winner already flipped the row).
      const current = await prisma.refreshToken.findUnique({ where: { id: row.id } });
      const REUSE_GRACE_MS = 10_000;
      const revokedRecently = current && Date.now() - current.updatedAt.getTime() < REUSE_GRACE_MS;
      if (!revokedRecently) {
        await prisma.refreshToken.updateMany({ where: { userId: row.userId, revoked: false }, data: { revoked: true } });
        closeUserSockets(row.userId, 'refresh token reuse detected');
        clearAuthCookies(res);
      }
      throw new HttpError(401, 'refresh token invalid or expired');
    }

    closeSessionSockets(row.id, 'session rotated');
    const { accessToken, refreshToken } = await issueSession(row.userId);
    setAuthCookies(res, accessToken, refreshToken);
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.refresh_token as string | undefined;
    if (raw) {
      const row = await prisma.refreshToken.findFirst({
        where: { tokenHash: hashToken(raw) },
        select: { id: true },
      });
      if (row) {
        await prisma.refreshToken.updateMany({ where: { id: row.id }, data: { revoked: true } });
        closeSessionSockets(row.id, 'logged out');
      }
    }
    clearAuthCookies(res);
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) throw new HttpError(401, 'user not found');
    res.json({ user: publicUser(user) });
  }),
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

authRouter.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new HttpError(401, 'current password is incorrect');
    }
    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    // a password change should log out every other device/tab, not just
    // rotate the one making this request
    await prisma.refreshToken.updateMany({ where: { userId: user.id, revoked: false }, data: { revoked: true } });
    closeUserSockets(user.id, 'password changed');
    const { accessToken, refreshToken } = await issueSession(user.id);
    setAuthCookies(res, accessToken, refreshToken);
    res.json({ ok: true });
  }),
);

authRouter.delete(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    // cascades RefreshToken/SaveGame/RedZonePlayer via the schema's
    // onDelete: Cascade — nothing else references userId directly
    closeUserSockets(req.userId!, 'account deleted');
    await prisma.user.delete({ where: { id: req.userId! } });
    clearAuthCookies(res);
    res.json({ ok: true });
  }),
);
