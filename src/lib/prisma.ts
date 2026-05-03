import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Prisma Client Singleton for Serverless Environments
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set in environment variables.");
}

// Singleton pattern for Prisma
const globalForPrisma = global as unknown as { prisma: PrismaClient };

// PostgreSQL Pool configuration optimized for Serverless (Vercel)
const pool = new Pool({ 
  connectionString,
  max: 1, 
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  // Ensure SSL is handled correctly for Neon/Managed DBs
  ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1") 
    ? false 
    : { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PG client', err);
});

const adapter = new PrismaPg(pool);

export const prisma = globalForPrisma.prisma || new PrismaClient({ 
  adapter,
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
