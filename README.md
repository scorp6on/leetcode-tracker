# leetcode-tracker

A personal tool that replaces LeetCode grinding with a system that
**diagnoses why you get problems wrong** and **recommends what to practice next**
based on that.

Instead of "do 5 problems a day", it tracks two things separately:

- **Pattern recognition** — can you tell it's a binary-search problem before you start?
- **Execution** — once you know the approach, do you implement it cleanly?

…then it builds a daily queue from your spaced-repetition schedule, your recent
failure modes, and how well those transfer across topics.

Single-user, runs locally.

---

## The four screens

| Screen | What it does |
|---|---|
| **Problems** | The full LeetCode catalog (~4,000 problems), scraped from their public GraphQL API. Search, filter by topic / difficulty / status, solved counter, per-row "Due" badge. Click a problem to log an attempt; hover for Predict / open-on-LeetCode. |
| **Today's queue** | The ranked "what to practice now" list. Each card opens the full problem statement with Predict / Log attempt / Open on LeetCode. |
| **Your patterns** | Failure-mode breakdown (last 30 days), clean-solve rate, pattern-ID accuracy, and a recognition-vs-execution table by topic. |
| **History** | Every logged and imported attempt, filterable by outcome and source, paged. |

---

## How the core loop works

1. **You solve a problem on LeetCode.** Auto-sync (every 5 min) pulls the
   submission into the app. First-time solves get a bare `IMPORTED` attempt and a
   review schedule.
2. **You log the attempt here** (Problems tab → click a problem, or from the
   queue). This records the diagnostic detail LeetCode doesn't have: outcome
   (solved / struggled / failed), time spent, confidence 1–5, which failure mode
   hit first, notes. Optionally you predict the pattern *before* attempting.
3. **Logging an attempt updates three things:**
   - **Spaced repetition** — SM-2 grades the attempt and sets the next review date.
   - **Failure-mode tags** — the problem gets tagged with the mode you hit, lazily.
   - **Prediction** — if you predicted a pattern, it's scored against LeetCode's
     real topic tags (hit = any overlap).
4. **The recommendation engine ranks the queue.** For each candidate problem:

   ```
   score = 0.5·dueness  +  0.3·failureRelevance  +  0.2·transfer
   ```

   - **dueness** — how overdue its SM-2 review is (`daysOverdue / 7`, clamped)
   - **failureRelevance** — does it exercise a failure mode you've hit a lot lately
     (last ~20 attempts, recency-weighted)
   - **transfer** — is it a *different* topic than where you usually hit that mode
     (tests genuine transfer, not memorization)

   Until your first manual attempt, the queue skips all of this and just shows
   your most recently solved problems ("recency mode").

The spaced-repetition math is plain **SM-2** (SuperMemo 2): grades 0–5, ease
factor from 2.5 (floored at 1.3), interval ladder 1 → 6 → `round(interval × EF)`,
lapses (< 3) reset to a 1-day interval.

---

## Tech stack

- **Server** — Node 20, TypeScript, Express 5, Prisma 6, PostgreSQL 16, zod 4
- **Client** — React 19, Vite, Tailwind CSS 4, React Router 7
- **Database** — PostgreSQL in Docker (`docker-compose.yml`)

`server/` and `client/` are standalone packages. The Vite dev server proxies
`/api/*` to the API, so the browser only ever talks to one origin.

---

## Getting started

**Prerequisites:** Node 20, Docker Desktop.

```bash
# 1. Database
docker compose up -d                 # Postgres on host port 5433

# 2. Server
cd server
cp .env.example .env                 # defaults work as-is
npm install
npx prisma migrate dev               # create the tables
npm run sync:catalog                 # pull ~4,000 problems from LeetCode (a few minutes)
npm run dev                          # API on http://localhost:4000

# 3. Client (separate terminal)
cd client
npm install
npm run dev                          # app on http://localhost:5173
```

Open **http://localhost:5173**. On first run you'll land on the Connect-LeetCode
screen — connect your account (below) to import your history, or skip and log
attempts by hand.

> Port 5433, not 5432: the compose file maps Postgres there because 5432 is
> often taken by a native install.

---

## Connecting your LeetCode account

LeetCode has no API keys, so the app reuses your logged-in browser session — two
cookies.

1. Log in to leetcode.com, open DevTools → **Application** → Cookies →
   `https://leetcode.com`.
2. Copy the values of `LEETCODE_SESSION` and `csrftoken`.
3. Paste them into the **Connect LeetCode** screen (or set `LEETCODE_SESSION` /
   `LEETCODE_CSRF` in `server/.env` for the CLI path).

The session is verified against LeetCode before it's stored, and lives in the
`settings` table (plaintext by default; encrypted at rest when `APP_SECRET_KEY`
is set — see **Deploying**). It expires every few weeks — reconnect when a sync
starts failing.

Once connected, an incremental sync runs every `SYNC_INTERVAL_MINUTES` (default 5).

---

## Deploying (use it across devices)

All app data lives in the one database, so "use it on my laptop and my desktop"
just means putting the database and the server somewhere both can reach. The
supported shape: **a managed Postgres + one hosted web service that serves the
API *and* the built client** (one origin, no CORS), behind HTTP Basic Auth.

```
  laptop / desktop / phone  ──▶  https://<your-app>.<host>  ──▶  managed Postgres
                                 Express: /api + client/dist
                                 Basic Auth · auto-sync
```

### 1. Managed Postgres

Create a database on [Neon](https://neon.tech) (or Supabase / Railway). Copy its
connection string — the **pooled** one if offered.

### 2. Host the web service

Any Node platform works (Render, Railway, Fly.io). A free tier that sleeps on
inactivity is fine — auto-sync just pauses while it's asleep and catches up on
the next request. Point it at this repo and set:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Pre-deploy / release command | `npm run migrate:deploy` |
| Start command | `npm start` |
| Node version | 20 (`.node-version` is committed) |

Environment variables:

| Var | Value |
|---|---|
| `DATABASE_URL` | the Neon connection string |
| `APP_USERNAME` / `APP_PASSWORD` | your login (Basic Auth covers the API *and* the client) |
| `APP_SECRET_KEY` | `openssl rand -base64 32` — encrypts the stored LeetCode cookies at rest |
| `NODE_ENV` | `production` |

`PORT` is provided by the platform. Leave `SYNC_INTERVAL_MINUTES` unset (default 5).

### 3. First data load

Once the tables exist (`migrate:deploy` ran), populate the catalog once from your
own machine, pointed at the cloud DB:

```bash
cd server
DATABASE_URL="<neon url>" npm run sync:catalog
```

### 4. Use it

Open `https://<your-app>.<host>`, log in, and **Connect LeetCode**. Every device
opens the same URL with the same login and sees the same data — an attempt logged
on one shows up on the next immediately (it's one database, queried live, not a
per-device copy). If you also run locally against the same cloud DB, set
`SYNC_INTERVAL_MINUTES=0` in your local `server/.env` so only the hosted instance
auto-syncs.

**Security:** Basic Auth + the platform's HTTPS + `APP_SECRET_KEY` encryption are
the mitigations for putting your LeetCode session on a hosted DB. It's still your
session on a third party — acceptable for a personal single-user deployment, not
something to share access to.

> Local development is unchanged and needs none of the `APP_*` vars — Basic Auth
> and static client-serving are inert unless `APP_PASSWORD` / a built `client/dist`
> are present.

---

## Scripts (`server/`)

| Command | |
|---|---|
| `npm run dev` | API with reload |
| `npm test` | unit tests (SM-2, predictions, recommendations, dashboard) |
| `npm run sync:catalog` | (re)import the problem catalog + topics + acceptance rates |
| `npm run sync:submissions` | import your LeetCode submission history (needs credentials) |
| `npm run seed:from-submissions` | create baseline `SOLVED` attempts from imported submissions |
| `npm run prisma:studio` | browse the database |
| `npm run build` / `npm start` | compile to `dist/` and run |

---

## Configuration (`server/.env`)

| Variable | Default | |
|---|---|---|
| `DATABASE_URL` | `…@localhost:5433/leetcode_tracker` | Postgres connection string (local or managed) |
| `PORT` | `4000` | API port |
| `SYNC_INTERVAL_MINUTES` | `5` | auto-sync cadence; `0` disables |
| `PRISMA_LOG_QUERIES` | unset | `true` logs every SQL statement |
| `LEETCODE_SESSION` / `LEETCODE_CSRF` / `LEETCODE_USERNAME` | unset | CLI-only fallback for the account connection |
| `APP_USERNAME` / `APP_PASSWORD` | unset | hosted only — turns on HTTP Basic Auth for the whole app |
| `APP_SECRET_KEY` | unset | hosted only — 32-byte base64 key; encrypts stored LeetCode cookies at rest |

---

## Project layout

```
docker-compose.yml            Postgres (local dev)
package.json                  deploy orchestration: build both, run the server
server/
  prisma/schema.prisma        data model + migrations
  src/
    index.ts                  Express app, router mounts, static client, auto-sync boot
    db.ts                     the shared PrismaClient
    middleware/basicAuth.ts   whole-app Basic Auth (off unless APP_PASSWORD set)
    routes/                   problems, attempts, predictions, recommendations,
                              dashboard, topics, settings
    services/
      sm2.ts                  pure SM-2 algorithm  (+ .test.ts)
      scheduling.ts           applies a graded attempt to a ReviewSchedule
      recommendations.ts      pure queue scorer    (+ .test.ts)
      predictions.ts          pure prediction scoring  (+ .test.ts)
      dashboard.ts            pure per-topic stat merge  (+ .test.ts)
    leetcode/
      client.ts               fetch wrappers for LeetCode's GraphQL / REST
      auth.ts                  resolves credentials (DB row, then .env)
      secretBox.ts             optional at-rest encryption for stored cookies
      syncCatalog.ts           catalog import
      syncSubmissions.ts       submission import (full + incremental)
      autoSync.ts              the interval job
client/
  src/
    App.tsx                   routing, nav, first-run gate
    api.ts / types.ts         typed API wrappers + hand-mirrored response shapes
    labels.ts                 shared enum → label maps
    components/               one file per screen + the modals
```

---

## Data model

| Table | |
|---|---|
| `problems` | the catalog: title, difficulty, acceptance rate, URL, cached statement HTML |
| `topics` / `problem_topics` | LeetCode's topic tags, many-to-many |
| `attempts` | every attempt — `MANUAL` (logged here, full detail) or `IMPORTED` (from a solved submission) |
| `review_schedule` | one row per problem: SM-2 ease factor, interval, repetitions, next review date |
| `predictions` | before-attempt pattern guesses, scored on the next attempt |
| `problem_failure_modes` | which failure modes you've hit on each problem, with counts (built lazily) |
| `submissions` | raw LeetCode submission cache (problem, status, timestamp, code) |
| `settings` | single row — the LeetCode connection + last sync time |

---

## Notes

- The LeetCode GraphQL / submissions endpoints are **unofficial**. Query shapes
  could change; `server/src/leetcode/` is the first place to look if a sync
  breaks.
- Problem statements are rendered from LeetCode's HTML via
  `dangerouslySetInnerHTML` — acceptable for a single-user tool reading a trusted
  source. Add sanitization before any multi-user use.
