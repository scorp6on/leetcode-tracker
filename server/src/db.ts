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
  // Log the SQL Prisma runs, plus warnings and errors, to the console.
  // Helpful while learning; you can trim this to ["warn", "error"] later.
  log: ["query", "warn", "error"],
});
