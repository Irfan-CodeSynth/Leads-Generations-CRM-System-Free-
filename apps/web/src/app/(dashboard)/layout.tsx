import { redirect } from "next/navigation";
import { desc, inArray, sql } from "drizzle-orm";
import { jobs } from "@leads/db";
import { getDb } from "@/lib/db";
import { currentUserId } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import Link from "next/link";
import { Plus, Sparkles, Activity } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const uid = currentUserId();
  if (!uid) redirect("/login");

  const db = getDb();

  const [latest] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .orderBy(desc(jobs.createdAt), desc(jobs.id))
    .limit(1);

  const [activeJobsRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(inArray(jobs.status, ["pending", "running"]));

  const activeJobsCount = activeJobsRow?.n ?? 0;
  const resultsHref = latest ? `/jobs/${latest.id}` : "/jobs";

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Modern Left Sidebar */}
      <Sidebar
        resultsHref={resultsHref}
        latestJobId={latest?.id}
        activeJobsCount={activeJobsCount}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-72">
        {/* Desktop Top Sub-Header */}
        <header className="hidden lg:flex sticky top-0 z-20 items-center justify-between border-b border-line/60 bg-surface/75 px-8 py-3.5 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 rounded-full border border-line bg-surface2/60 px-3 py-1 text-xs font-semibold text-muted">
              <span className="flex h-2 w-2 rounded-full bg-ok-fg animate-pulse-dot" />
              Scraper Engine Online
            </span>
            {activeJobsCount > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">
                <Activity className="h-3 w-3" />
                {activeJobsCount} Running Run{activeJobsCount === 1 ? "" : "s"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/new"
              className="inline-flex items-center gap-2 rounded-xl bg-accent-strong px-4 py-2 text-xs font-semibold text-white shadow-accent transition hover:bg-accent-dark hover:shadow-lift active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              Launch Scrape
            </Link>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <main className="flex-1 px-4 sm:px-8 py-6 sm:py-8 max-w-[1600px] w-full mx-auto animate-fade-in">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-line/50 bg-surface/30 py-5 text-center text-xs text-muted backdrop-blur-sm">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-5 sm:flex-row sm:px-8">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              <span>Maps Leads &middot; Google Maps B2B Lead Generation & CRM</span>
            </div>
            <div>All leads deduplicated via Global Canonical Place Ledger</div>
          </div>
        </footer>
      </div>
    </div>
  );
}
