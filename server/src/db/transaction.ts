import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

const MAX_SERIALIZABLE_ATTEMPTS = 3;

/** Retries PostgreSQL serialization/deadlock conflicts, never business errors. */
export async function serializableTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
      if (!retryable || attempt >= MAX_SERIALIZABLE_ATTEMPTS) throw error;
    }
  }
}
