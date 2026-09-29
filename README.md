# WebCraft Leads Giant — Automated B2B Lead Engine

A full-stack lead generation system and modern B2B CRM. Scrapes Google Maps for targeted local businesses matching your keywords and locations, enriches each company with verified email addresses and social handles, deduplicates against a global ledger, and displays everything in an interactive dashboard with map visualizer and RFC4180 CSV export.

---

## ⚡ Architecture Overview

```
┌─────────────────┐        1. Create Job        ┌────────────────────┐
│    apps/web     │ ──────────────────────────▶ │      Postgres      │
│ (Next.js 14 UI) │                             │   (Neon / PGlite)  │
│                 │ ◀────────────────────────── │                    │
└─────────────────┘       Read Leads & CRM      └────────────────────┘
         │                                                ▲
         │ (Wake ping to /health)                         │ 2. Claim & Scrape
         ▼                                                │    (SKIP LOCKED)
┌─────────────────┐                                       │
│   apps/worker   │ ──────────────────────────────────────┘
│ (Node/Playwright│
│  + HTTP fetch)  │ ──▶ Scrapes Google Maps ──▶ Visits business websites
└─────────────────┘
```

- **`apps/web`** — Modern Next.js 14 App Router dashboard with responsive Left Sidebar, KPI metric cards, CRM pipeline funnel, interactive MapLibre GL map, and CSV exports.
- **`apps/worker`** — Node + Playwright Chromium scraper service. Polls PostgreSQL using atomic `FOR UPDATE SKIP LOCKED` claims, scrapes Google Maps, and crawls business websites via lightweight HTTP fetch for emails and social handles.
- **`packages/db`** — Shared PostgreSQL schema, migrations, and Drizzle ORM client.
- **`scripts/devdb.mjs`** — Zero-install local Postgres database using PGlite (PostgreSQL compiled to WebAssembly with file persistence in `./data/pgdata`).

---

## 🚀 Quickstart & Local Setup

Follow these steps to run the complete stack locally in under 2 minutes:

### 1. Prerequisites
- **Node.js**: v18.18+ (Node 20 or 22 recommended)
- **npm**: v9+
- **Git**

### 2. Clone the Repository
```bash
git clone https://github.com/Irfan-CodeSynth/Leads-Generations-CRM-System-Free-.git
cd Leads-Generations-CRM-System-Free-
```

### 3. Install Dependencies
```bash
npm install
npx playwright install chromium
```

### 4. Configure Environment Files

**macOS / Linux:**
```bash
cp .env.example .env
cp .env apps/web/.env.local
```

**Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
Copy-Item .env apps/web/.env.local
```

*(The default `.env.example` is pre-configured to connect to the bundled zero-install local database).*

### 5. Start Local Database & Run Migrations

Open a terminal and start the persistent local database:
```bash
npm run db:dev
```
*(Leave this terminal running. It listens on `127.0.0.1:5432` and stores data in `./data/pgdata`).*

In a second terminal, apply migrations and seed the initial admin account:
```bash
npm run db:migrate -w @leads/db
npm run db:seed -w @leads/db
```

### 6. Run the Worker & Web Dashboard

In your terminal, start the worker and web app:

**Terminal A (Scraper & Enrichment Worker):**
```bash
npm run worker
```

**Terminal B (Next.js Dashboard UI):**
```bash
npm run web
```

### 7. Open the App & Sign In
Open [http://localhost:3000](http://localhost:3000) in your browser:
- **Email**: `team@example.com`
- **Password**: `devpassword`
*(Or click **"Fill dev credentials"** on the login page).*

---

## 🌟 Key Features

1. **Executive Command Dashboard**:
   - 6 Live animated KPI cards: Total Leads, Verified Emails, Enrichment Rate, Deduplication Ledger, Scrape Runs, and CRM Win Rate.
   - Real-time CRM Pipeline Stage Funnel (`New` → `Contacted` → `Replied` → `Won` → `Lost`).
   - Category distribution analysis and live recent activity feeds.

2. **Left Sidebar Navigation**:
   - Modern, collapsible sidebar with active glow pills, active job badges, and live worker health indicator.
   - Responsive mobile drawer with touch backdrop.

3. **Search Studio with Industry Presets**:
   - 1-click presets for **Home Services**, **Healthcare**, and **Real Estate & Legal**.
   - Live search multiplier calculator showing estimated lead yield.

4. **Canonical Place Deduplication Ledger (`known_places`)**:
   - Tracks Google place feature IDs (`0x...:0x...`).
   - Repeat searches automatically skip previously captured businesses at zero network/browser cost.

5. **Cooperative Stop & Resumability**:
   - Click "Stop" at any time. Leads collected up to that point remain saved in the database.
   - Re-running a job resumes enrichment where it left off without duplicate scraping.

6. **Lead Management & Interactive Map**:
   - Interactive MapLibre GL map with coordinate clustering and place popups.
   - Zero-horizontal-scroll CRM table with inline status dropdown, notes, and 1-click email copy.
   - Multi-select batch actions and RFC4180 CSV export.

---

## 🧪 Testing

Run the full automated test suite (44 unit tests):
```bash
npm test
```
- Worker unit tests: Parser heuristics, email extraction, social links, deduplication ledger.
- Web unit tests: Pagination slicing and range calculations.

---

## 🚢 Production Deployment

### 1. Database (Neon - Free Tier)
1. Create a PostgreSQL project on [neon.tech](https://neon.tech).
2. Copy the pooled connection string into `DATABASE_URL` in both web and worker environments.

### 2. Scraper Worker (Render - Docker)
1. Connect your repository to [Render](https://render.com).
2. Create a new **Web Service** with:
   - **Environment**: Docker
   - **Dockerfile Path**: `apps/worker/Dockerfile`
   - **Build Context**: `.` (repo root)
   - **Health Check Path**: `/health`
   - **Environment Variables**: `DATABASE_URL`, `POLL_INTERVAL_MS=5000`, `MAX_RESULTS=100`
3. Note the service URL (e.g. `https://leads-worker.onrender.com`) — this is your `WORKER_URL`.

### 3. Web Dashboard (Vercel)
1. Import the repository in [Vercel](https://vercel.com).
2. Set **Root Directory** to `apps/web`.
3. Add Environment Variables:
   - `DATABASE_URL`: Your Neon connection string
   - `SESSION_SECRET`: A long random secret string
   - `WORKER_URL`: Your Render worker URL

### 4. Run Migrations on Production
From your local machine:
```bash
DATABASE_URL="<neon-url>" npm run db:migrate -w @leads/db
DATABASE_URL="<neon-url>" ADMIN_EMAIL="admin@yourdomain.com" ADMIN_PASSWORD="your-strong-password" npm run db:seed -w @leads/db
```

---

## 📄 License
MIT
