import { z } from 'zod';

const attackMessageSchema = z.object({
  type: z.literal('attack'),
  attackId: z.string().min(8).max(120).regex(/^[A-Za-z0-9:_-]+$/),
  ability: z.boolean(),
  facing: z.number().finite().min(-Math.PI * 2).max(Math.PI * 2),
}).strict();

const claimBagMessageSchema = z.object({
  type: z.literal('claim_bag'),
  bagId: z.string().uuid(),
  claimId: z.string().min(8).max(120).regex(/^[A-Za-z0-9:_-]+$/),
}).strict();

export const combatClientMessageSchema = z.discriminatedUnion('type', [attackMessageSchema, claimBagMessageSchema]);
export type CombatClientMessage = z.infer<typeof combatClientMessageSchema>;

export function parseCombatClientMessage(value: unknown): CombatClientMessage | null {
  const parsed = combatClientMessageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
