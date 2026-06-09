import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "~/generated/prisma/client";

import { env } from "~/env.mjs";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.DATABASE_URL,
    }),
    log:
      env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

const cachedPrisma = globalForPrisma.prisma;

export const prisma =
  cachedPrisma && "scoreShare" in cachedPrisma
    ? cachedPrisma
    : createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
