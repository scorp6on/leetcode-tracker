/**
 * Entry point for the API server.
 *
 * Responsibilities, top to bottom:
 *   1. Load environment variables from server/.env
 *   2. Build the Express application (middleware + routes)
 *   3. Start listening on a TCP port
 *   4. Shut down cleanly when the process is told to stop
 */

// Side-effect import: reading "dotenv/config" runs code that loads .env into
// process.env. It must come before anything that reads process.env.
import "dotenv/config";

import express, { type Request, type Response } from "express";
import { prisma } from "./db";
import { problemsRouter } from "./routes/problems";
import { attemptsRouter } from "./routes/attempts";
import { topicsRouter } from "./routes/topics";
import { predictionsRouter } from "./routes/predictions";
import { recommendationsRouter } from "./routes/recommendations";

const app = express();

// Middleware: parse incoming JSON request bodies into `req.body`. We don't need
// it for the health check, but every real endpoint later will.
app.use(express.json());

/**
 * GET /api/health
 *
 * A liveness probe. Returns 200 with the DB status if we can reach Postgres,
 * 503 otherwise. `SELECT 1` is the cheapest possible "are you there?" query.
 *
 * Express 5 automatically forwards a rejected promise from an async handler to
 * the error handler, so the try/catch here is just so we can return a nicer
 * 503 body instead of a generic 500.
 */
app.get("/api/health", async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "up" });
  } catch {
    res.status(503).json({ status: "error", db: "down" });
  }
});

// Mount the feature routers. Everything a router defines is prefixed with its
// mount path, so `problemsRouter`'s "/" becomes "/api/problems".
app.use("/api/problems", problemsRouter);
app.use("/api/attempts", attemptsRouter);
app.use("/api/topics", topicsRouter);
app.use("/api/predictions", predictionsRouter);
app.use("/api/recommendations", recommendationsRouter);

// process.env values are always strings (or undefined), so parse the port and
// fall back to 4000 if it's missing or not a number.
const port = Number(process.env.PORT) || 4000;

const server = app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

/**
 * Graceful shutdown. When you press Ctrl+C (SIGINT) or a supervisor sends
 * SIGTERM, close the HTTP server (stop accepting new requests, let in-flight
 * ones finish) and release the database connections before exiting.
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received, shutting down...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
