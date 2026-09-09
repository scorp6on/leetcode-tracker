/**
 * Routes under /api/settings — currently just the LeetCode account connection
 * used by the "Connect LeetCode" onboarding screen.
 *
 * The stored session/csrf are never returned to the client; only whether a
 * connection exists.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { leetcodeGraphQL, LeetCodeAuthError } from "../leetcode/client";
import { buildAuthHeaders, resolveLeetCodeAuth } from "../leetcode/auth";
import { runSubmissionSync } from "../leetcode/syncSubmissions";
import { seedBaselineAttempts } from "../scripts/seedFromSubmissions";

export const settingsRouter = Router();

/** Is a LeetCode session available from either the DB row or .env? */
function envHasCredentials(): boolean {
  return Boolean(process.env.LEETCODE_SESSION?.trim() && process.env.LEETCODE_CSRF?.trim());
}

interface MatchedUser {
  matchedUser: { profile: { userAvatar: string | null } | null } | null;
}

/** The public LeetCode profile picture URL, or null. Best-effort — never throws. */
async function fetchAvatar(username: string): Promise<string | null> {
  if (!username) return null;
  try {
    const data = await leetcodeGraphQL<MatchedUser>({
      query:
        "query($u: String!) { matchedUser(username: $u) { profile { userAvatar } } }",
      variables: { u: username },
    });
    return data.matchedUser?.profile?.userAvatar ?? null;
  } catch {
    return null;
  }
}

// --- GET /api/settings ------------------------------------------------

settingsRouter.get("/", async (_req: Request, res: Response) => {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });

  const connected =
    Boolean(settings?.leetcodeSession && settings?.leetcodeCsrf) || envHasCredentials();

  res.json({
    connected,
    username: settings?.leetcodeUsername ?? process.env.LEETCODE_USERNAME ?? null,
    avatarUrl: settings?.leetcodeAvatarUrl ?? null,
    submissionsSyncedAt: settings?.submissionsSyncedAt ?? null,
    // True when creds come only from .env — the app's Disconnect can't clear those.
    viaEnvOnly: !settings?.leetcodeSession && envHasCredentials(),
  });
});

// --- PUT /api/settings/leetcode -------------------------------------

const connectSchema = z.object({
  session: z.string().trim().min(10, "That doesn't look like a LEETCODE_SESSION value"),
  csrf: z.string().trim().min(8, "That doesn't look like a csrftoken value"),
});

interface UserStatus {
  userStatus: { username: string; isSignedIn: boolean } | null;
}

settingsRouter.put("/leetcode", async (req: Request, res: Response) => {
  const parsed = connectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: z.treeifyError(parsed.error) });
  }
  const { session, csrf } = parsed.data;

  // Verify the cookies with one signed request before storing them.
  let username: string;
  try {
    const data = await leetcodeGraphQL<UserStatus>(
      { query: "query { userStatus { username isSignedIn } }" },
      buildAuthHeaders({ session, csrfToken: csrf, username: "" }),
    );
    if (!data.userStatus?.isSignedIn) {
      return res.status(400).json({
        error:
          "That session was rejected — it may have expired. Copy a fresh one from your browser.",
      });
    }
    username = data.userStatus.username;
  } catch {
    return res.status(400).json({
      error: "Couldn't reach LeetCode to verify the session. Check the values and try again.",
    });
  }

  const avatarUrl = await fetchAvatar(username);

  await prisma.settings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      leetcodeSession: session,
      leetcodeCsrf: csrf,
      leetcodeUsername: username,
      leetcodeAvatarUrl: avatarUrl,
    },
    update: {
      leetcodeSession: session,
      leetcodeCsrf: csrf,
      leetcodeUsername: username,
      leetcodeAvatarUrl: avatarUrl,
    },
  });

  res.json({ connected: true, username, avatarUrl });
});

// --- DELETE /api/settings/leetcode --------------------------------

settingsRouter.delete("/leetcode", async (_req: Request, res: Response) => {
  await prisma.settings.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {
      leetcodeSession: null,
      leetcodeCsrf: null,
      leetcodeUsername: null,
      leetcodeAvatarUrl: null,
    },
  });
  // Imported submissions and attempts are left in place on purpose.
  res.json({ connected: envHasCredentials() });
});

// --- POST /api/settings/leetcode/sync -----------------------------

settingsRouter.post("/leetcode/sync", async (_req: Request, res: Response) => {
  let auth;
  try {
    auth = await resolveLeetCodeAuth();
  } catch (err) {
    if (err instanceof LeetCodeAuthError) return res.status(400).json({ error: err.message });
    throw err;
  }

  try {
    const sync = await runSubmissionSync(auth);
    const seed = await seedBaselineAttempts();
    // Only overwrite the cached avatar if the refresh succeeded.
    const avatarUrl = (await fetchAvatar(auth.username)) ?? undefined;
    await prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1, submissionsSyncedAt: new Date(), leetcodeAvatarUrl: avatarUrl },
      update: { submissionsSyncedAt: new Date(), leetcodeAvatarUrl: avatarUrl },
    });
    res.json({ sync, seed });
  } catch (err) {
    if (err instanceof LeetCodeAuthError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});
