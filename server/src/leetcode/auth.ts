/**
 * Credentials for talking to LeetCode as *you*.
 *
 * LeetCode has no official API keys or OAuth. The only way to read your own
 * submissions is to reuse a logged-in browser session:
 *
 *   1. Log in to leetcode.com in your browser.
 *   2. Open dev tools -> Application (or Storage) -> Cookies -> https://leetcode.com
 *   3. Copy the values of `LEETCODE_SESSION` and `csrftoken`.
 *   4. Paste them into server/.env as LEETCODE_SESSION and LEETCODE_CSRF.
 *
 * These are real credentials — anyone with `LEETCODE_SESSION` can act as you on
 * LeetCode. `.env` is gitignored; keep it that way. The session expires every
 * few weeks; when a sync starts returning 401/403, re-copy the cookies.
 */

import { LeetCodeAuthError } from "./client";

export interface LeetCodeAuth {
  session: string;
  csrfToken: string;
  username: string;
}

/**
 * Read the three required values from the environment, or throw a message that
 * says exactly what to do. Call this once at the start of an authenticated
 * script.
 */
export function loadLeetCodeAuth(): LeetCodeAuth {
  const session = process.env.LEETCODE_SESSION?.trim();
  const csrfToken = process.env.LEETCODE_CSRF?.trim();
  const username = process.env.LEETCODE_USERNAME?.trim();

  const missing = [
    !session && "LEETCODE_SESSION",
    !csrfToken && "LEETCODE_CSRF",
    !username && "LEETCODE_USERNAME",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new LeetCodeAuthError(
      `Missing ${missing.join(", ")} in server/.env.\n` +
        "See server/.env.example for how to get these from your browser cookies.",
    );
  }

  return { session: session!, csrfToken: csrfToken!, username: username! };
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
