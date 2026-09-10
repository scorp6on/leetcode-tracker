/**
 * Background job: keep the imported submission history current.
 *
 * Every SYNC_INTERVAL_MINUTES (default 5; 0 or less disables), if LeetCode is
 * connected, run an INCREMENTAL sync + baseline seed and stamp
 * `submissionsSyncedAt`. Runs never overlap. `startAutoSync()` is called once at
 * boot; `stopAutoSync()` on shutdown.
 */

import { prisma } from "../db";
import { LeetCodeAuthError } from "./client";
import { resolveLeetCodeAuth } from "./auth";
import { runSubmissionSync } from "./syncSubmissions";
import { seedBaselineAttempts } from "../scripts/seedFromSubmissions";

let timer: NodeJS.Timeout | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return; // a previous run is still going
  running = true;
  try {
    const auth = await resolveLeetCodeAuth();
    const sync = await runSubmissionSync(auth);
    const seed = await seedBaselineAttempts();
    await prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1, submissionsSyncedAt: new Date() },
      update: { submissionsSyncedAt: new Date() },
    });
    if (sync.imported > 0 || seed.created > 0) {
      console.log(
        `[auto-sync] +${sync.imported} submissions, +${seed.created} baseline attempts`,
      );
    }
  } catch (err) {
    // Not connected / session expired -> stay quiet and retry next tick.
    if (err instanceof LeetCodeAuthError) return;
    console.error("[auto-sync] failed:", err instanceof Error ? err.message : err);
  } finally {
    running = false;
  }
}

export function startAutoSync(): void {
  const minutes = Number(process.env.SYNC_INTERVAL_MINUTES ?? 5);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    console.log("[auto-sync] disabled");
    return;
  }
  console.log(`[auto-sync] every ${minutes} min`);
  timer = setInterval(() => void tick(), minutes * 60_000);
  // Don't let this timer keep the process alive on its own.
  timer.unref?.();
}

export function stopAutoSync(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
