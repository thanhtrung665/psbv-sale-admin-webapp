import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = global as unknown as { 
  prisma: PrismaClient;
  pgPool: Pool;
};

const connectionString = process.env.DATABASE_URL;

if (!globalForPrisma.pgPool) {
  globalForPrisma.pgPool = new Pool({ 
    connectionString,
    max: 5, // Limit connections to prevent EMAXCONNSESSION in session mode
    idleTimeoutMillis: 30000,
  });
}

const adapter = new PrismaPg(globalForPrisma.pgPool);

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log: ['error'], // reduced logging to avoid console spam
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
