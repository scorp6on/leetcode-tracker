/**
 * HTTP Basic Auth for the whole app (API + the static client).
 *
 * Enabled ONLY when `APP_PASSWORD` is set — so local development, where nothing
 * is set, is completely unaffected. It's meant for the single-user hosted
 * deployment, which sits behind the platform's HTTPS.
 *
 * Mount it as the very first middleware so it covers every route and every
 * static file. The browser caches the credentials for the tab session after the
 * first prompt.
 */

import type { RequestHandler } from "express";
import { timingSafeEqual } from "node:crypto";

/** Length-safe, timing-safe string compare. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function basicAuth(): RequestHandler {
  const password = process.env.APP_PASSWORD;
  const username = process.env.APP_USERNAME || "me";

  if (!password) {
    // Disabled — pass everything through.
    return (_req, _res, next) => next();
  }

  return (req, res, next) => {
    const [scheme, encoded] = (req.headers.authorization ?? "").split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = Buffer.from(encoded, "base64").toString("utf8");
      const sep = decoded.indexOf(":");
      const user = decoded.slice(0, sep);
      const pass = decoded.slice(sep + 1);
      if (safeEqual(user, username) && safeEqual(pass, password)) {
        return next();
      }
    }
    res.set("WWW-Authenticate", 'Basic realm="leetcode-tracker", charset="UTF-8"');
    res.status(401).send("Authentication required.");
  };
}
