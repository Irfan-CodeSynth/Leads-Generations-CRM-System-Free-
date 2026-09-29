import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { jobs } from "@leads/db";
import { getDb } from "@/lib/db";
import { getLeadsForJob } from "@/lib/queries";
import { currentUserId } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { statusBadge } from "@/lib/jobStatus";
import MapView from "@/components/MapView";
import LeadsTable from "@/components/LeadsTable";
import {
  Users,
  ShieldCheck,
  Layers,
  MailCheck,
  ChevronLeft,
  Download,
  AlertCircle,
  MapPin,
  Calendar,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function JobResultsPage({ params }: { params: { id: string } }) {
  const uid = currentUserId();
  if (!uid) redirect("/login");

  const id = Number(params.id);
  if (!Number.isInteger(id)) notFound();

  const [job] = await getDb().select().from(jobs).where(eq(jobs.id, id)).limit(1);
  if (!job) notFound();

  const leads = await getLeadsForJob(id);
  const leadsWithEmail = leads.filter((l) => l.emails && l.emails.length > 0).length;

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Link
              href="/jobs"
              className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-accent transition"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              All Jobs
            </Link>
            <span className="text-soft">/</span>
            <span className="text-xs font-semibold text-ink">Job #{job.id}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              Job #{job.id} Leads
            </h1>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadge(job.status)}`}
            >
              {job.status}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
            <span className="font-medium text-ink">
              {job.keywords.join(", ")}
            </span>
            <span>&middot;</span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-soft" />
              {job.locations.join(", ")}
            </span>
            <span>&middot;</span>
            <span className="flex items-center gap-1 text-soft">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(job.createdAt)} UTC
            </span>
          </div>

          {job.errorMsg && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-bad-bg bg-bad-bg/30 p-3 text-xs text-bad-fg">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{job.errorMsg}</span>
            </div>
          )}
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-2">
          <a
            href={`/api/export?jobId=${job.id}`}
            className="inline-flex items-center gap-2 rounded-2xl bg-accent-strong px-4 py-2.5 text-xs font-semibold text-white shadow-accent transition hover:bg-accent-dark active:scale-95"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV ({leads.length})
          </a>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1 */}
        <div className="glass-card glass-card-hover rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-soft">New Leads</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-ink tabular-nums">
            {leads.length.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-muted">Captured in this campaign</div>
        </div>

        {/* KPI 2 */}
        <div className="glass-card glass-card-hover rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-soft">Verified Emails</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-ok-fg/10 text-ok-fg">
              <MailCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-ok-fg tabular-nums">
            {leadsWithEmail.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-muted">
            {leads.length > 0 ? Math.round((leadsWithEmail / leads.length) * 100) : 0}% verified contact rate
          </div>
        </div>

        {/* KPI 3 */}
        <div className="glass-card glass-card-hover rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-soft">Ledger Deduped</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-ink tabular-nums">
            {job.leadsSkipped.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-muted">Bypassed at zero cost</div>
        </div>

        {/* KPI 4 */}
        <div className="glass-card glass-card-hover rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-soft">Total Searched</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-info-fg/10 text-info-fg">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-ink tabular-nums">
            {(leads.length + job.leadsSkipped).toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-muted">Google Maps places evaluated</div>
        </div>
      </div>

      {/* Map View */}
      <div className="glass-card rounded-3xl p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-ink">Geographic Distribution</h2>
          </div>
          <span className="text-xs text-muted">
            {leads.filter((l) => l.lat != null && l.lng != null).length} mapped coordinates
          </span>
        </div>
        <MapView leads={leads} skipped={job.leadsSkipped} />
      </div>

      {/* Leads CRM Table */}
      <LeadsTable leads={leads} jobId={job.id} skipped={job.leadsSkipped} />
    </div>
  );
}
