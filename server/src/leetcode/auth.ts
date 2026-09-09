/**
 * Credentials for talking to LeetCode as *you*.
 *
 * LeetCode has no official API keys or OAuth. The only way to read your own
 * submissions is to reuse a logged-in browser session (two cookies). Those come
 * from one of two places, checked in this order:
 *
 *   1. The `settings` row, written by the in-app "Connect LeetCode" screen.
 *   2. `LEETCODE_SESSION` / `LEETCODE_CSRF` in server/.env (the CLI-only path).
 *
 * Either way they're real credentials — anyone with `LEETCODE_SESSION` can act
 * as you on LeetCode. The session expires every few weeks; when a sync starts
 * returning 401/403, reconnect (or re-copy the cookies into .env).
 */

import { prisma } from "../db";
import { LeetCodeAuthError } from "./client";
import { decrypt } from "./secretBox";

export interface LeetCodeAuth {
  session: string;
  csrfToken: string;
  /** Display only. May be "" when it isn't known (e.g. the .env path). */
  username: string;
}

/**
 * Resolve stored credentials: the connected account first, then .env. Throws a
 * `LeetCodeAuthError` with a clear message when neither is set.
 */
export async function resolveLeetCodeAuth(): Promise<LeetCodeAuth> {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });

  // Row values may be encrypted (APP_SECRET_KEY); decrypt() passes plaintext
  // and .env values through untouched.
  const session = settings?.leetcodeSession
    ? decrypt(settings.leetcodeSession)
    : process.env.LEETCODE_SESSION?.trim();
  const csrfToken = settings?.leetcodeCsrf
    ? decrypt(settings.leetcodeCsrf)
    : process.env.LEETCODE_CSRF?.trim();
  const username =
    settings?.leetcodeUsername ?? process.env.LEETCODE_USERNAME?.trim() ?? "";

  if (!session || !csrfToken) {
    throw new LeetCodeAuthError(
      "LeetCode is not connected. Connect it from the app, or set " +
        "LEETCODE_SESSION and LEETCODE_CSRF in server/.env.",
    );
  }

  return { session, csrfToken, username };
}

/**
 * Build the HTTP headers that make a request look like it came from your
 * logged-in browser tab. LeetCode checks the cookie pair, the matching
 * `x-csrftoken` header, and a browser-like User-Agent / Referer.
 */
export function buildAuthHeaders(auth: LeetCodeAuth): Record<string, string> {
  return {
    Cookie: `LEETCODE_SESSION=${auth.session}; csrftoken=${auth.csrfToken}`,
    "x-csrftoken": auth.csrfToken,
    Referer: "https://leetcode.com/submissions/",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  };
}
