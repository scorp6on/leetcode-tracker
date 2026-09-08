/**
 * Minimal client for LeetCode's GraphQL endpoint.
 *
 * IMPORTANT: this endpoint is not officially documented or supported by
 * LeetCode. It's what their own website uses. The query shapes here could break
 * if they change their frontend. For a personal tool that's an acceptable risk;
 * if a sync suddenly fails, this file is the first place to look.
 *
 * Node 20 has `fetch` built in, so there's no HTTP library to install.
 */

const LEETCODE_ORIGIN = "https://leetcode.com";
const LEETCODE_GRAPHQL_URL = `${LEETCODE_ORIGIN}/graphql`;

/** Raised when LeetCode rejects our credentials — usually an expired session. */
export class LeetCodeAuthError extends Error {}

export interface GraphQLRequest {
  query: string;
  /** Values substituted into `$variables` in the query string. */
  variables?: Record<string, unknown>;
}

/**
 * POST a GraphQL query and return its `data` payload.
 *
 * The generic `T` is the shape you expect back under `data`. There's no
 * validation that the response actually matches `T` — we trust LeetCode here
 * and let a mismatch surface as a normal runtime error downstream.
 *
 * Throws on: network failure, non-2xx HTTP status, or a GraphQL `errors` array.
 */
export async function leetcodeGraphQL<T>(body: GraphQLRequest): Promise<T> {
  const res = await fetch(LEETCODE_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // LeetCode rejects requests that look like bare scripts. A plain
      // User-Agent and Referer are enough to be treated as a normal caller.
      "User-Agent": "leetcode-tracker/0.1 (personal practice tracker)",
      Referer: "https://leetcode.com",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`LeetCode GraphQL request failed: HTTP ${res.status} ${res.statusText}`);
  }

  // GraphQL always returns 200 even for query-level errors, so we check the body.
  const json = (await res.json()) as { data?: T; errors?: unknown };

  if (json.errors) {
    throw new Error(`LeetCode GraphQL returned errors: ${JSON.stringify(json.errors)}`);
  }
  if (json.data === undefined) {
    throw new Error("LeetCode GraphQL response contained no data");
  }

  return json.data;
}

/**
 * GET a LeetCode REST endpoint (path like "/api/submissions/?offset=0&limit=20")
 * with the given headers, and parse the JSON body as `T`.
 *
 * `headers` is where the caller passes the authenticated Cookie / x-csrftoken
 * set from auth.ts. This helper stays credential-agnostic.
 *
 * Throws `LeetCodeAuthError` on 401/403 (bad or expired session) and a plain
 * Error on other failures, including 429 (rate limited).
 */
export async function leetcodeRestGet<T>(
  path: string,
  headers: Record<string, string>,
): Promise<T> {
  const res = await fetch(`${LEETCODE_ORIGIN}${path}`, { headers });

  if (res.status === 401 || res.status === 403) {
    throw new LeetCodeAuthError(
      `LeetCode rejected the request (HTTP ${res.status}). Your LEETCODE_SESSION / ` +
        "LEETCODE_CSRF cookies are probably expired — re-copy them from your browser.",
    );
  }
  if (res.status === 429) {
    throw new Error("LeetCode rate limited the request (HTTP 429). Wait a bit and retry.");
  }
  if (!res.ok) {
    throw new Error(`LeetCode REST request failed: HTTP ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as T;
}
