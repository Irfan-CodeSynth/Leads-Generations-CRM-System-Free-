import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { jobs } from "@leads/db";
import { getDb } from "@/lib/db";
import { currentUserId } from "@/lib/auth";
import { wakeWorker } from "@/lib/worker";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const uid = currentUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [existing] = await getDb().select({ id: jobs.id }).from(jobs).where(eq(jobs.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Re-running is cheap: known_places holds every feature id ever scraped, so the
  // worker skips those before loading the place panel. leads_found tracks the leads
  // this job actually owns, so it persists; leads_skipped describes the run you just
  // asked for, so it resets.
  await getDb()
    .update(jobs)
    .set({
      status: "pending",
      errorMsg: null,
      startedAt: null,
      finishedAt: null,
      leadsSkipped: 0,
      // A stale flag would make the worker cancel this run on its first yield point.
      cancelRequested: false,
      phase: null,
      phaseTotal: null,
      phaseDone: null,
    })
    .where(eq(jobs.id, id));

  wakeWorker();
  return NextResponse.json({ ok: true });
}
