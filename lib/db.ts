import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

// HMR-safe singleton — reuses the client across hot reloads in dev
const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
