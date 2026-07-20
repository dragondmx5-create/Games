declare module '@prisma/client' {
  export interface PrismaClientLike {
    [key: string]: any;
    $queryRaw<T = unknown>(query: unknown, ...values: unknown[]): Promise<T>;
    $executeRaw(query: unknown, ...values: unknown[]): Promise<number>;
    $transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, options?: unknown): Promise<T>;
    $disconnect(): Promise<void>;
  }

  export class PrismaClient implements PrismaClientLike {
    [key: string]: any;
    $queryRaw<T = unknown>(query: unknown, ...values: unknown[]): Promise<T>;
    $executeRaw(query: unknown, ...values: unknown[]): Promise<number>;
    $transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, options?: unknown): Promise<T>;
    $disconnect(): Promise<void>;
  }

  export namespace Prisma {
    type TransactionClient = PrismaClientLike;
    type InputJsonValue = any;
    type JsonValue = any;
    const sql: any;
    const empty: any;
    enum TransactionIsolationLevel {
      Serializable = 'Serializable',
    }
    class PrismaClientKnownRequestError extends Error {
      code: string;
    }
  }
}
