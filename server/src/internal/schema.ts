import { z } from 'zod';

export const ledgerAdjustSchema = z.object({
  // signed: positive credits the balance, negative debits it. Zero is
  // rejected — a caller has no legitimate reason to submit a no-op.
  amount: z.number().int().refine((n) => n !== 0, 'amount must not be zero'),
  // caller-supplied, unique per logical operation on the caller's side
  // (e.g. an on-chain tx hash or a UUID) — replaying the same key returns
  // the original result instead of applying the effect again
  idempotencyKey: z.string().min(1).max(200),
});
