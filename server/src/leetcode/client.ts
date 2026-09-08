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

const LEETCODE_GRAPHQL_URL = "https://leetcode.com/graphql";

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
