import { describe, it, expect, beforeAll } from "vitest";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq, inArray, sql } from "drizzle-orm";
import * as schema from "@leads/db";
import { jobs, leads, leadContacts, knownPlaces, type Db } from "@leads/db";
import { deleteJobs, deleteLeads, ActiveJobsError } from "@leads/db";

let db: Db;

const migrationsFolder = fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url));

async function newJob(status: (typeof schema.jobStatus)[number] = "done") {
  const rows = await db
    .insert(jobs)
    .values({ keywords: ["dentist"], locations: ["Austin, TX"], status })
    .returning({ id: jobs.id });
  return rows[0]!.id;
}

async function newLead(jobId: number, placeId: string, name = `Business ${placeId}`) {
  const rows = await db
    .insert(leads)
    .values({ jobId, placeId, name })
    .returning({ id: leads.id });
  return rows[0]!.id;
}

/** Mirrors what the worker does when it collects a place: lead row + ledger row. */
async function collect(jobId: number, placeId: string) {
  const leadId = await newLead(jobId, placeId);
  await db.insert(knownPlaces).values({ placeId, leadId, jobId }).onConflictDoNothing();
  return leadId;
}

const ledgerRows = (placeId: string) =>
  db.select().from(knownPlaces).where(eq(knownPlaces.placeId, placeId));

beforeAll(async () => {
  const pg = new PGlite();
  const pdb = drizzle(pg, { schema });
  await migrate(pdb as unknown as Parameters<typeof migrate>[0], { migrationsFolder });
  db = pdb as unknown as Db;
}, 120_000);

describe("deleteJobs", () => {
  it("removes the job, its leads and their contacts", async () => {
    const jobId = await newJob();
    const leadId = await collect(jobId, "0x1000:0x1000");
    await db.insert(leadContacts).values({ leadId, emails: ["owner@example.com"] });

    const result = await deleteJobs(db, [jobId]);

    expect(result.deletedJobs).toBe(1);
    expect(result.deletedLeads).toBe(1);
    expect(await db.select().from(jobs).where(eq(jobs.id, jobId))).toHaveLength(0);
    expect(await db.select().from(leads).where(eq(leads.jobId, jobId))).toHaveLength(0);
    expect(await db.select().from(leadContacts).where(inArray(leadContacts.leadId, [leadId]))).toHaveLength(0);
  });

  it("releases a place from the ledger once nothing holds it", async () => {
    const jobId = await newJob();
    await collect(jobId, "0x2000:0x2000");

    const result = await deleteJobs(db, [jobId]);

    expect(result.releasedPlaces).toBe(1);
    expect(await ledgerRows("0x2000:0x2000")).toHaveLength(0);
  });

  it("keeps a ledger entry another surviving job still holds", async () => {
    const doomed = await newJob();
    const keeper = await newJob();
    // The ledger records the place against the job that first found it...
    await collect(doomed, "0x3000:0x3000");
    // ...but a second job legitimately holds its own lead for the same business.
    await newLead(keeper, "0x3000:0x3000", "Same business, other run");

    const result = await deleteJobs(db, [doomed]);

    expect(result.releasedPlaces).toBe(0);
    expect(await ledgerRows("0x3000:0x3000")).toHaveLength(1);
    expect(await db.select().from(leads).where(eq(leads.jobId, keeper))).toHaveLength(1);
  });

  it("refuses while a pending or running job is in the batch and deletes nothing", async () => {
    const finished = await newJob();
    const running = await newJob("running");
    const pending = await newJob("pending");
    await collect(finished, "0x4000:0x4000");
    await collect(running, "0x4001:0x4001");
    await collect(pending, "0x4002:0x4002");

    await expect(deleteJobs(db, [finished, running, pending])).rejects.toThrow(ActiveJobsError);

    for (const id of [finished, running, pending]) {
      expect(await db.select().from(jobs).where(eq(jobs.id, id))).toHaveLength(1);
    }
    const held = await db.select().from(leads).where(inArray(leads.jobId, [finished, running, pending]));
    const ledger = await db
      .select()
      .from(knownPlaces)
      .where(inArray(knownPlaces.jobId, [finished, running, pending]));
    expect(held).toHaveLength(3);
    expect(ledger).toHaveLength(3);
  });

  it("deletes every finished job in a mixed batch in one call", async () => {
    const a = await newJob("cancelled");
    const b = await newJob("error");
    await collect(a, "0x5000:0x5000");
    await collect(b, "0x5001:0x5001");

    const result = await deleteJobs(db, [a, b]);

    expect(result.deletedJobs).toBe(2);
    expect(await db.select({ id: jobs.id }).from(jobs).where(inArray(jobs.id, [a, b]))).toHaveLength(0);
  });

  it("ignores ids that no longer exist", async () => {
    const result = await deleteJobs(db, [987654]);
    expect(result.deletedJobs).toBe(0);
    expect(result.deletedLeads).toBe(0);
    expect(result.releasedPlaces).toBe(0);
  });
});

describe("deleteLeads", () => {
  it("removes leads and their contacts without touching the job", async () => {
    const jobId = await newJob();
    const doomed = await collect(jobId, "0x6000:0x6000");
    const kept = await collect(jobId, "0x6001:0x6001");
    await db.insert(leadContacts).values({ leadId: doomed, emails: ["gone@example.com"] });

    const result = await deleteLeads(db, [doomed]);

    expect(result.deletedLeads).toBe(1);
    expect(await db.select().from(leads).where(eq(leads.id, doomed))).toHaveLength(0);
    expect(await db.select().from(leads).where(eq(leads.id, kept))).toHaveLength(1);
    expect(await db.select().from(jobs).where(eq(jobs.id, jobId))).toHaveLength(1);
  });

  it("releases the ledger entry when its lead was the last holder", async () => {
    const jobId = await newJob();
    const leadId = await collect(jobId, "0x7000:0x7000");

    const result = await deleteLeads(db, [leadId]);

    expect(result.releasedPlaces).toBe(1);
    expect(await ledgerRows("0x7000:0x7000")).toHaveLength(0);
  });

  it("keeps the ledger entry while another lead holds the place", async () => {
    const jobA = await newJob();
    const jobB = await newJob();
    const first = await collect(jobA, "0x8000:0x8000");
    await newLead(jobB, "0x8000:0x8000");

    const result = await deleteLeads(db, [first]);

    expect(result.releasedPlaces).toBe(0);
    expect(await ledgerRows("0x8000:0x8000")).toHaveLength(1);
  });

  it("leaves a name-fallback lead deletable but the ledger untouched", async () => {
    const jobId = await newJob();
    const leadId = await newLead(jobId, "name:unstable");

    const result = await deleteLeads(db, [leadId]);

    expect(result.deletedLeads).toBe(1);
    expect(result.releasedPlaces).toBe(0);
  });

  it("accepts a batch mixing real and already-gone ids", async () => {
    const jobId = await newJob();
    const leadId = await collect(jobId, "0x9000:0x9000");

    // No throw on unknown ids, so this just reports what it removed.
    const result = await deleteLeads(db, [leadId, 987654]);

    expect(result.deletedLeads).toBe(1);
    expect(await db.select().from(leads).where(eq(leads.id, leadId))).toHaveLength(0);
  });

  it("does nothing for an empty batch", async () => {
    const before = await db.select({ n: sql<number>`count(*)::int` }).from(leads);

    const result = await deleteLeads(db, []);

    expect(result.deletedLeads).toBe(0);
    const after = await db.select({ n: sql<number>`count(*)::int` }).from(leads);
    expect(after[0]!.n).toBe(before[0]!.n);
  });
});
