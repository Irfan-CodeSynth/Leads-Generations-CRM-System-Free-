import { describe, it, expect, beforeAll } from "vitest";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq, sql } from "drizzle-orm";
import * as schema from "@leads/db";
import { jobs, leads, knownPlaces, type Db } from "@leads/db";
import type { Page } from "playwright";
import type { PlaceCard } from "../src/parse.js";
import { loadKnownPlaceIds, saveLeadWithDetail, isCancelRequested } from "../src/job.js";

let db: Db;

const migrationsFolder = fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url));

/** Any property access means the worker navigated — which is what we're testing for. */
function untouchablePage(): Page {
  return new Proxy(
    {},
    {
      get() {
        throw new Error("page was touched: a detail navigation happened");
      },
    },
  ) as unknown as Page;
}

const card = (placeId: string, over: Partial<PlaceCard> = {}): PlaceCard => ({
  placeId,
  name: `Business ${placeId}`,
  href: `https://www.google.com/maps/place/x/data=!1s${placeId}`,
  ...over,
});

async function newJob() {
  const rows = await db
    .insert(jobs)
    .values({ keywords: ["dentist"], locations: ["Austin, TX"], status: "running" })
    .returning({ id: jobs.id });
  return rows[0]!.id;
}

beforeAll(async () => {
  const pg = new PGlite();
  const pdb = drizzle(pg, { schema });
  // Also proves migration 0001 (ledger + backfill) applies against a real engine.
  await migrate(pdb as unknown as Parameters<typeof migrate>[0], { migrationsFolder });
  db = pdb as unknown as Db;
}, 120_000);

describe("global ledger dedupe", () => {
  it("skips a known place without navigating to its detail page", async () => {
    const jobId = await newJob();
    const known = new Set(["0x1234:0x5678"]);

    const outcome = await saveLeadWithDetail(db, jobId, card("0x1234:0x5678"), untouchablePage(), known);

    expect(outcome).toBe("known");
    const rows = await db.select().from(leads).where(eq(leads.jobId, jobId));
    expect(rows).toHaveLength(0);
  });

  it("records a new place in the ledger and refuses to collect it twice", async () => {
    const jobId = await newJob();
    const known = new Set<string>();

    expect(await saveLeadWithDetail(db, jobId, card("0xdead:0xbeef"), untouchablePage(), known)).toBe(
      "added",
    );
    const ledger = await loadKnownPlaceIds(db);
    expect(ledger.has("0xdead:0xbeef")).toBe(true);

    const job = (await db.select().from(jobs).where(eq(jobs.id, jobId)))[0]!;
    expect(job.leadsFound).toBe(1);

    // Same card again, now that the in-memory set learned it.
    expect(await saveLeadWithDetail(db, jobId, card("0xdead:0xbeef"), untouchablePage(), known)).toBe(
      "known",
    );
    const ledgerRows = await db.select().from(knownPlaces).where(eq(knownPlaces.placeId, "0xdead:0xbeef"));
    expect(ledgerRows).toHaveLength(1);
  });

  it("reports duplicate when the per-job index rejects the insert", async () => {
    const jobId = await newJob();
    await db.insert(leads).values({ jobId, placeId: "0xfeed:0d00d", name: "Existing" });

    const outcome = await saveLeadWithDetail(
      db,
      jobId,
      card("0xfeed:0d00d"),
      untouchablePage(),
      new Set<string>(),
    );

    expect(outcome).toBe("duplicate");
  });

  it("keeps unstable name-fallback ids out of the ledger", async () => {
    const jobId = await newJob();

    expect(await saveLeadWithDetail(db, jobId, card("name:bob"), untouchablePage(), new Set())).toBe(
      "added",
    );

    const ledger = await loadKnownPlaceIds(db);
    expect(ledger.has("name:bob")).toBe(false);
  });

  it("backfills one ledger row per feature id from pre-existing leads", async () => {
    const jobA = await newJob();
    const jobB = await newJob();
    await db.insert(leads).values([
      { jobId: jobA, placeId: "0xaaaa:0xbbbb", name: "Chain A" },
      { jobId: jobB, placeId: "0xaaaa:0xbbbb", name: "Chain B (older cross-job dupe)" },
      { jobId: jobA, placeId: "name:legacy", name: "Legacy fallback" },
    ]);

    await db.execute(sql`
      INSERT INTO "known_places" ("place_id", "lead_id", "job_id")
      SELECT DISTINCT ON ("place_id") "place_id", "id", "job_id" FROM "leads"
      WHERE "place_id" LIKE '0x%' ORDER BY "place_id", "id" ASC
      ON CONFLICT ("place_id") DO NOTHING
    `);

    const dupes = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.placeId, "0xaaaa:0xbbbb"))
      .orderBy(leads.id);
    const ledger = await db.select().from(knownPlaces).where(eq(knownPlaces.placeId, "0xaaaa:0xbbbb"));

    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.leadId).toBe(dupes[0]!.id);

    const legacy = await db.select().from(knownPlaces).where(eq(knownPlaces.placeId, "name:legacy"));
    expect(legacy).toHaveLength(0);
  });
});

describe("cooperative stop", () => {
  it("reports no cancellation until the Stop button sets the flag", async () => {
    const jobId = await newJob();
    expect(await isCancelRequested(db, jobId)).toBe(false);

    await db.update(jobs).set({ cancelRequested: true }).where(eq(jobs.id, jobId));
    expect(await isCancelRequested(db, jobId)).toBe(true);
  });

  it("does not cancel when the job row is gone", async () => {
    expect(await isCancelRequested(db, 999999)).toBe(false);
  });
});
