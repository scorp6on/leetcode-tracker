/**
 * Database access.
 *
 * `PrismaClient` is the object you run every query through. It opens a pool of
 * connections to Postgres the first time it's used. You want exactly ONE
 * instance for the whole process — creating many would open many connection
 * pools and eventually exhaust the database.
 *
 * So we create it once here and export it. Every other file imports THIS
 * object rather than calling `new PrismaClient()` itself.
 */
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  // Always log warnings and errors. Also log every SQL statement when
  // PRISMA_LOG_QUERIES=true in .env — useful when you want to see exactly what
  // a query does, but far too noisy for bulk work like the catalog sync.
  log:
    process.env.PRISMA_LOG_QUERIES === "true"
      ? ["query", "warn", "error"]
      : ["warn", "error"],
});
