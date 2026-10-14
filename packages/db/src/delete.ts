import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { jobs, knownPlaces, leads } from "./schema.js";
import type { Db } from "./index.js";

/** A postgres.js / PGlite transaction handle — same query surface as Db. */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface DeleteResult {
  deletedJobs: number;
  deletedLeads: number;
  /** Ledger entries given back, so those businesses can be collected again. */
  releasedPlaces: number;
}

/** Thrown when a batch contains a job the worker may still be writing to. */
export class ActiveJobsError extends Error {
  constructor(readonly ids: number[]) {
    super(`Job ${ids.join(", ")} still ${ids.length === 1 ? "is" : "are"} active`);
    this.name = "ActiveJobsError";
  }
}

/** A job the worker owns or will own: its rows can still change underneath us. */
const ACTIVE = inArray(jobs.status, ["pending", "running"]);

/**
 * Frees ledger entries whose only holders are inside the doomed set.
 *
 * Runs before the rows go, because "is anything still holding this place?" can
 * only be answered against a table that still contains them. Scoped by place_id
 * rather than by known_places.job_id/lead_id: the ledger remembers whoever found
 * a place *first*, so a second job's duplicate lead would otherwise free an
 * entry it is still holding — or keep one that nothing holds any more.
 */
async function releaseUnheldPlaces(tx: Tx, heldByDoomed: SQL, heldBySurvivors: SQL) {
  const correlation = eq(knownPlaces.placeId, leads.placeId);
  const released = await tx
    .delete(knownPlaces)
    .where(
      and(
        sql`EXISTS (${tx.select({ one: sql`1` }).from(leads).where(and(correlation, heldByDoomed))})`,
        sql`NOT EXISTS (${tx.select({ one: sql`1` }).from(leads).where(and(correlation, heldBySurvivors))})`,
      ),
    )
    .returning({ placeId: knownPlaces.placeId });

  return released.length;
}

/**
 * Deletes finished jobs. Their leads go through the `leads_job_id_fkey` cascade
 * and contact rows through the cascade below that, so nothing else to clean up.
 */
export async function deleteJobs(db: Db, ids: number[]): Promise<DeleteResult> {
  if (!ids.length) return { deletedJobs: 0, deletedLeads: 0, releasedPlaces: 0 };
  return db.transaction(async (tx) => {
    const active = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(inArray(jobs.id, ids), ACTIVE));
    if (active.length) throw new ActiveJobsError(active.map((r) => r.id));

    const held = await releaseUnheldPlaces(
      tx,
      inArray(leads.jobId, ids),
      notInArray(leads.jobId, ids),
    );
    const doomedLeads = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(leads)
      .where(inArray(leads.jobId, ids));
    const removedJobs = await tx.delete(jobs).where(inArray(jobs.id, ids)).returning({ id: jobs.id });

    return {
      deletedJobs: removedJobs.length,
      deletedLeads: doomedLeads[0]?.n ?? 0,
      releasedPlaces: held,
    };
  });
}

/** Deletes individual leads, leaving their job and every other job alone. */
export async function deleteLeads(db: Db, ids: number[]): Promise<DeleteResult> {
  if (!ids.length) return { deletedJobs: 0, deletedLeads: 0, releasedPlaces: 0 };
  return db.transaction(async (tx) => {
    const held = await releaseUnheldPlaces(tx, inArray(leads.id, ids), notInArray(leads.id, ids));
    const removedLeads = await tx.delete(leads).where(inArray(leads.id, ids)).returning({ id: leads.id });

    return { deletedJobs: 0, deletedLeads: removedLeads.length, releasedPlaces: held };
  });
}
