import { desc, sql } from "drizzle-orm";
import { jobs } from "@leads/db";
import { getDb } from "@/lib/db";
import { currentUserId } from "@/lib/auth";
import { redirect } from "next/navigation";
import JobsList from "@/components/JobsList";
import { PAGE_SIZE, normalizePage, totalPages } from "@/lib/pagination";
import type { JobSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: { page?: string | string[] };
}) {
  const uid = currentUserId();
  if (!uid) redirect("/login");

  const db = getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(jobs);
  const pageCount = totalPages(n);
  const raw = Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page;
  const page = normalizePage(Number(raw), pageCount);

  const rows = await db
    .select()
    .from(jobs)
    .orderBy(desc(jobs.createdAt), desc(jobs.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const initialJobs: JobSummary[] = rows.map((j) => ({
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold tracking-tight text-ink">Jobs</h1>
        <p className="mt-1 text-sm text-muted">
          Status refreshes automatically every 5 seconds.
        </p>
      </div>
      <JobsList initialJobs={initialJobs} page={page} pageCount={pageCount} total={n} />
    </div>
  );
}
