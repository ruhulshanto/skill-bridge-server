import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

let connectionString = process.env.DATABASE_URL;

// Add SSL mode if not present to avoid warnings and ensure secure connection
if (connectionString && !connectionString.includes("sslmode=")) {
  const separator = connectionString.includes("?") ? "&" : "?";
  connectionString += `${separator}sslmode=verify-full`;
}

// Singleton pattern for Prisma Client with explicit connection pooling
const globalForPrisma = global as unknown as { prisma: PrismaClient };

const pool = new Pool({ 
  connectionString,
  max: 20, // Limit connections to prevent "too many clients"
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 5000, // Wait 5 seconds for a connection
});

// Handle unexpected pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

const adapter = new PrismaPg(pool);

export const prisma = globalForPrisma.prisma || new PrismaClient({ 
  adapter,
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Automatic reconnection logic
const connectWithRetry = async (retries = 5) => {
  while (retries > 0) {
    try {
      await prisma.$connect();
      console.log('Successfully connected to the database');
      break;
    } catch (err) {
      console.error(`Database connection failed. Retries left: ${retries - 1}`, err);
      retries -= 1;
      await new Promise(res => setTimeout(res, 5000));
    }
  }
};

connectWithRetry();
