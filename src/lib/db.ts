import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 * Prevents exhausting DB connections from hot-reload in dev.
 */
declare global {
  // eslint-disable-next-line no-var
  var __tecnoidPrisma: PrismaClient | undefined;
}

export const db =
  global.__tecnoidPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  global.__tecnoidPrisma = db;
}
