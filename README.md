# Maps Leads — Google Maps lead generation tool

Scrapes Google Maps for businesses matching your keywords + cities, enriches each
lead by visiting its website (emails + social profiles), and stores everything in
a shared database you can browse on a map, tag with CRM statuses, and export to CSV.

**How it works**

```
┌────────────   create job   ┌──────────────┐   claim + scrape   ┌───────────────┐
│  apps/web  │ ─────────────▶ │   Postgres   │ ◀───────────────── │  apps/worker  │
│ (Vercel UI)│ ◀── read ───── │ (Neon / PG)  │ ──── write ──────▶ │ (Render,      │
└────────────   results      └──────────────┘                    │  Playwright)  │
                                   ▲                              └───────────────┘
                                   └──── jobs table is the queue ────┘
```

- **`apps/web`** — Next.js 14 UI (deploy to Vercel). Auth, job creation, live job
  list, map + CRM table, CSV export.
- **`apps/worker`** — Node + Playwright (deploy to Render as a Docker web service).
  Polls the `jobs` table, scrapes Google Maps, visits each website for emails/socials.
- **`packages/db`** — shared Drizzle schema + client + migrations.

The two apps never talk directly; the Postgres `jobs`/`leads` tables are the only
integration point. This is why the scraper can't live on Vercel — Vercel serverless
functions can't run a persistent headless browser, so it's a separate always-on worker.

> ⚠️ **Read before deploying.** Scraping Google Maps violates Google's Terms of
> Service and is actively throttled. Expect occasional failed jobs (there is a
> one-click Re-run). Keep volumes low. This is not a high-throughput or
> long-term-guaranteed data source. For production-grade data use the official
> Google Places API.

## Requirements

- Node.js 18.18+ (20/22 recommended), npm 9+
- A Postgres 14+ database (Neon free tier works)

## Local development

```bash
# 1. Install everything (workspaces)
npm install
npx playwright install chromium          # one-time browser download for the worker

# 2. Bring up a local Postgres
#    Option A — you have Postgres/Docker: point DATABASE_URL at it
#    Option B — no Postgres handy: use the bundled PGlite dev server
npm i -D @electric-sql/pglite @electric-sql/pglite-socket   # already in devDeps
node scripts/devdb.mjs 5432              # leaves a terminal running

# 3. Configure environment
cp .env.example .env                     # edit DATABASE_URL + secrets
#    If using the PGlite dev server, also set in .env:
#      POOL_MAX=1
#      PIPELINE=1
cp .env apps/web/.env.local              # Next.js only reads env inside apps/web

# 4. Create tables + seed the team login
npm run db:generate -w @leads/db
npm run db:migrate    -w @leads/db
npm run db:seed       -w @leads/db        # uses ADMIN_EMAIL / ADMIN_PASSWORD

# 5. Run both apps (two terminals)
npm run worker                            # terminal A
npm run web                               # terminal B → http://localhost:3000
```

Log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`, create a job (one keyword
per line × one location per line), and watch leads appear.

### Smoke-test the scraper without the UI or DB

```bash
cd apps/worker
npx tsx src/cli.ts "plumber" "Austin, TX" 5 enrich
```

## Configuration (env vars)

| Var | Used by | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | web, worker | Postgres connection string |
| `SESSION_SECRET` | web | Long random string; signs the login cookie |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | db seed | The single team login |
| `WORKER_URL` | web | Worker base URL, pinged to wake it after a job is created |
| `POLL_INTERVAL_MS` | worker | How often to check for pending jobs (default 5000) |
| `MAX_RESULTS` | worker | New businesses to collect per keyword x location search (Google's own cap is ~120) |
| `POOL_MAX` / `PIPELINE` | web, worker | Set to `1` only for the PGlite dev server |
| `PORT` | worker | Render injects this; health endpoint listens on it |

## Deploy

### 1. Database — Neon (free)
Create a project at [neon.tech](https://neon.tech), copy the **pooled** connection
string. This is `DATABASE_URL` for both apps.

### 2. Worker — Render (Docker)
Push this repo to GitHub, then in Render choose **New → Blueprint** (it reads
`render.yaml`) or **New → Web Service** with:
- Environment: **Docker**, Image path / Dockerfile: `apps/worker/Dockerfile`, Build context: repo root
- Plan: **Free** (512 MB — see caveats), Health check path: `/health`
- Env vars: `DATABASE_URL`, `POLL_INTERVAL_MS`, optional `MAX_RESULTS`

After deploy, note the service URL (e.g. `https://leads-worker.onrender.com`) —
that becomes `WORKER_URL` in the web app.

**Free-tier caveat:** Render free services sleep after ~15 min idle. The web app
pings `WORKER_URL/health` right after you create a job to wake it, and you can add
an external cron (e.g. UptimeRobot hitting `/health` every 10 min) to keep it warm.
Chromium needs ~750 MB–1 GB to be reliable; on the 512 MB free instance expect
occasional OOM job failures (the Re-run button recovers, and because the
`known_places` ledger records every business ever scraped, a re-run skips what it
already has and only pays for the gaps). Upgrading to a 1 GB instance removes most
of this.

### 3. Web — Vercel
Import the repo in Vercel and set **Root Directory = `apps/web`**. Add env vars:
`DATABASE_URL`, `SESSION_SECRET`, `WORKER_URL`. Deploy.

### 4. Finalize
Run migrations + seed against the production DB once (from your machine):
```bash
DATABASE_URL="<neon url>" npm run db:migrate -w @leads/db
DATABASE_URL="<neon url>" ADMIN_EMAIL="you@team.com" ADMIN_PASSWORD="strong-pass" npm run db:seed -w @leads/db
```
Open the Vercel URL, log in, create a real job, and confirm leads appear.

## Tests

```bash
npm test                     # both workspaces
npm test -w @leads/worker    # parser, enrichment + ledger unit tests (no network)
npm test -w @leads/web       # pagination helpers
```

## Interface

Light and dark themes are CSS custom properties (`globals.css` tokens mapped in
`tailwind.config.ts`), so a component never writes a `dark:` variant — the `.dark`
block just redefines the variables. Animations are plain keyframes and all sit behind
`prefers-reduced-motion`.

Jobs paginate **server-side** at 10 per page via `?page=`, because that table grows with
every run. Leads paginate **client-side** at 10 per page, deliberately: search, status
filter, cross-page selection and Export-selected must keep spanning the whole job, and
the map plots every pin regardless of page.

## Data model (packages/db/src/schema.ts)

- `jobs` — keywords[], locations[], status `pending|running|done|error|cancelled`,
  leadsFound, leadsSkipped, and the live progress fields the Jobs list polls:
  `phase` (`scraping|enriching`), `phaseTotal`/`phaseDone` (enrichment walks one
  website per lead, so it needs its own counter), and `cancelRequested` — set by the
  Stop button and read by the worker at each yield point, including between scroll
  rounds. Cancelling keeps every lead already committed.
- `leads` — name, phone, address, website, category, rating, reviewCount, lat/lng,
  mapsUrl, CRM status `new|contacted|replied|won|lost`, notes; unique (jobId, placeId)
- `known_places` — global never-scrape-it-twice ledger: place_id PK, leadId, jobId.
  Holds only Google feature ids (`0x…:0x…`), because the `name:…` fallback key is not
  stable across cities. Deliberately a separate table rather than a unique index on
  `leads.place_id`: leads must stay job-scoped for the UI, and pruning cross-job
  duplicates would cascade into `lead_contacts` and destroy CRM notes.
- `lead_contacts` — emails[], instagram, facebook, linkedin, twitter, youtube
- `users` — the single seeded team account

## Notes on reliability
- Scraper selectors are best-effort with fallbacks; a missing field is `null`, not a crash.
- Jobs are claimed with `SELECT … FOR UPDATE SKIP LOCKED`, so running a second
  worker replica is safe if you ever need throughput.
- To reduce blocks: keep `MAX_RESULTS` modest, run fewer concurrent jobs, and (if
  you scale) route Playwright through a residential proxy by editing `launchBrowser()`.
- Repeat searches are the cheapest thing you can run: known places are recognised from
  the results feed itself, so no detail page is ever opened for them.
