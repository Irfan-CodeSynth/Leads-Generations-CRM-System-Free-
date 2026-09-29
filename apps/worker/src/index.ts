import "./env.js";
import { createServer } from "node:http";
import { makeDb, type Db } from "@leads/db";
import { sql } from "drizzle-orm";
import { claimNextJob, processJob } from "./job.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const PORT = Number(process.env.PORT ?? 8080);
const POLL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5000);

const db: Db = makeDb(DATABASE_URL);
let currentJobId: number | null = null;
let stopping = false;

// Crash recovery: a job stuck in "running" from a previous process is requeued
// so the user's Re-run flow (or the poller) picks it up fresh.
async function recoverStaleJobs() {
  await db.execute(sql`UPDATE jobs SET status = 'pending' WHERE status = 'running'`);
}

function serveHealth() {
  createServer((req, res) => {
    if (req.url === "/health" || req.url === "/") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, busy: currentJobId !== null, currentJob: currentJobId }));
    } else {
      res.writeHead(404);
      res.end();
    }
  }).listen(PORT, () => console.log(`Health endpoint on :${PORT}/health`));
}

async function main() {
  await recoverStaleJobs();
  serveHealth();
  console.log(`Worker started (poll every ${POLL_MS}ms)`);

  while (!stopping) {
    const job = await claimNextJob(db).catch((err) => {
      console.error("claim failed:", String(err).slice(0, 200));
      return null;
    });
    if (job) {
      currentJobId = job.id;
      try {
        await processJob(db, job);
      } finally {
        currentJobId = null;
      }
    } else {
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }
}

process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});

main().catch((err) => {
  console.error("worker crashed", err);
  process.exit(1);
});
