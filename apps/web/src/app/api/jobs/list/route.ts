import { NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { jobs } from "@leads/db";
import { getDb } from "@/lib/db";
import { currentUserId } from "@/lib/auth";
import { PAGE_SIZE, normalizePage, totalPages } from "@/lib/pagination";
import type { JobSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const uid = currentUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const url = new URL(request.url);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(jobs);
  const pageCount = totalPages(n);
  const page = normalizePage(Number(url.searchParams.get("page")), pageCount);

  const rows = await db
    .select()
    .from(jobs)
    .orderBy(desc(jobs.createdAt), desc(jobs.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const data: JobSummary[] = rows.map((j) => ({
    id: j.id,
    status: j.status,
    phase: j.phase,
    phaseTotal: j.phaseTotal,
    phaseDone: j.phaseDone,
    cancelRequested: j.cancelRequested,
    keywords: j.keywords,
    locations: j.locations,
    leadsFound: j.leadsFound,
    leadsSkipped: j.leadsSkipped,
    errorMsg: j.errorMsg,
    createdAt: j.createdAt.toISOString(),
  }));

  return NextResponse.json({ jobs: data, total: n, page, pageCount });
}
