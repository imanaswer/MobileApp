import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * A Prisma client OR an interactive-transaction client. Repository factories
 * accept this so the same repository code runs inside or outside a transaction
 * (unit-of-work — see `withTransaction`).
 */
export type DbClient = PrismaClient | Prisma.TransactionClient;
