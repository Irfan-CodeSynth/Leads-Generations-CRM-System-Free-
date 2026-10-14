"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JobSummary } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { PAGE_SIZE, rangeText } from "@/lib/pagination";
import { statusBadge } from "@/lib/jobStatus";
import Pagination from "@/components/Pagination";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  Layers,
  Search,
  RotateCcw,
  Square,
  ArrowUpRight,
  Sparkles,
  AlertCircle,
  Plus,
  Trash2,
} from "lucide-react";

const ACTIVE = new Set(["pending", "running"]);

function statusLabel(j: JobSummary): string {
  if (j.status !== "running") return j.status;
  if (j.cancelRequested) return "stopping…";
  if (!j.phase) return "running";
  return j.phaseTotal ? `${j.phase} ${j.phaseDone ?? 0}/${j.phaseTotal}` : j.phase;
}

function Badge({ job }: { job: JobSummary }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(
        job.status,
      )}`}
    >
      {ACTIVE.has(job.status) && (
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-current" aria-hidden />
      )}
      {statusLabel(job)}
    </span>
  );
}

function ProgressBar({ job }: { job: JobSummary }) {
  const total = job.phase === "enriching" ? job.phaseTotal ?? 0 : 0;
  const pct = total ? Math.round(((job.phaseDone ?? 0) / total) * 100) : 0;

  return (
    <div className="mt-2 h-1.5 w-44 overflow-hidden rounded-full bg-surface2">
      {total ? (
        <div
          className="bar-fill h-full rounded-full bg-gradient-to-r from-accent to-accent-dark transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      ) : (
        <div className="bar-indeterminate h-full w-full rounded-full bg-accent/70" />
      )}
    </div>
  );
}

export default function JobsList({
  initialJobs,
  page: initialPage,
  pageCount: initialPageCount,
  total: initialTotal,
}: {
  initialJobs: JobSummary[];
  page: number;
  pageCount: number;
  total: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<JobSummary[]>(initialJobs);
  const [page, setPage] = useState(initialPage);
  const [pageCount, setPageCount] = useState(initialPageCount);
  const [total, setTotal] = useState(initialTotal);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  /** Job ids awaiting confirmation, or null when the dialog is closed. */
  const [target, setTarget] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);

  const pageRef = useRef(page);
  pageRef.current = page;

  const refresh = useCallback(async (pageNo = pageRef.current) => {
    try {
      const res = await fetch(`/api/jobs/list?page=${pageNo}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        jobs: JobSummary[];
        total: number;
        page: number;
        pageCount: number;
      };
      setRows(data.jobs);
      setTotal(data.total);
      setPageCount(data.pageCount);
      setPage(data.page);
      // A job can vanish between polls (deleted elsewhere); stale ticks would
      // otherwise ride into the next batch.
      setSelected((prev) => {
        const here = new Set(data.jobs.map((j) => j.id));
        const next = new Set([...prev].filter((id) => here.has(id)));
        return next.size === prev.size ? prev : next;
      });
      setError(null);
    } catch {
      setError("Live updates paused: cannot reach the server");
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => refresh(), 5000);
    return () => clearInterval(id);
  }, [refresh]);

  function go(next: number) {
    setPage(next);
    void refresh(next);
    router.push(next === 1 ? "/jobs" : `/jobs?page=${next}`, { scroll: false });
  }

  async function stop(id: number) {
    await fetch(`/api/jobs/${id}/stop`, { method: "POST" }).catch(() => {});
    await refresh();
  }

  async function rerun(id: number) {
    await fetch(`/api/jobs/${id}/rerun`, { method: "POST" }).catch(() => {});
    await refresh();
  }

  const filteredRows = useMemo(() => {
    return rows.filter((j) => {
      if (filterStatus === "active" && !ACTIVE.has(j.status)) return false;
      if (filterStatus === "done" && j.status !== "done") return false;
      if (filterStatus === "error" && j.status !== "error" && j.status !== "cancelled") return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        j.keywords.some((k) => k.toLowerCase().includes(q)) ||
        j.locations.some((l) => l.toLowerCase().includes(q)) ||
        String(j.id).includes(q)
      );
    });
  }, [rows, filterStatus, search]);

  // Active jobs are ticked out of the batch on purpose: the server rejects a
  // batch containing one, so a tick that can never delete is a false promise.
  const deletableIds = useMemo(
    () => filteredRows.filter((j) => !ACTIVE.has(j.status)).map((j) => j.id),
    [filteredRows],
  );
  const allDeletableSelected =
    deletableIds.length > 0 && deletableIds.every((id) => selected.has(id));

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      allDeletableSelected ? new Set() : new Set([...prev, ...deletableIds]),
    );
  }

  async function deleteNow(ids: number[]) {
    setBusy(true);
    const res = await fetch("/api/jobs/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!res || !res.ok) {
      setError(data?.error ?? "Delete failed: the server could not be reached");
      return;
    }
    setError(null);
    setSelected(new Set());
    setTarget(null);
    await refresh();
  }

  if (total === 0) {
    return (
      <div className="glass-card flex flex-col items-center justify-center rounded-3xl p-12 text-center shadow-card">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent mb-4">
          <Layers className="h-7 w-7" />
        </div>
        <h3 className="text-lg font-bold text-ink">No Scraping Jobs Yet</h3>
        <p className="mt-1 max-w-sm text-sm text-muted">
          Launch your first Google Maps search campaign to start finding verified local business leads.
        </p>
        <Link
          href="/new"
          className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-accent-strong px-5 py-2.5 text-sm font-semibold text-white shadow-accent transition hover:bg-accent-dark active:scale-95"
        >
          <Plus className="h-4 w-4" />
          Create First Job
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: "all", label: "All Runs" },
            { id: "active", label: "Active / Running" },
            { id: "done", label: "Completed" },
            { id: "error", label: "Failed / Stopped" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${
                filterStatus === tab.id
                  ? "bg-accent text-white shadow-accent"
                  : "border border-line bg-surface text-muted hover:border-accent/40 hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-soft" />
          <input
            type="text"
            placeholder="Search keywords or cities…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface py-2 pl-9 pr-3 text-xs text-ink outline-none transition placeholder:text-soft focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-warn-bg bg-warn-bg/40 p-3 text-xs text-warn-fg">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Batch Selection Banner */}
      {selected.size > 0 && (
        <div className="animate-fade-in flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-bad-fg/25 bg-bad-bg/40 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2 font-semibold text-bad-fg">
            <Trash2 className="h-4 w-4" />
            <span>
              {selected.size} job{selected.size === 1 ? "" : "s"} selected
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-lg border border-line bg-surface px-2.5 py-1 font-medium text-muted transition hover:text-ink active:scale-95"
            >
              Clear
            </button>
            <button
              onClick={() => setTarget([...selected])}
              className="inline-flex items-center gap-1.5 rounded-lg bg-bad-fg px-3 py-1 font-semibold text-page transition hover:opacity-90 active:scale-95"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete selected
            </button>
          </div>
        </div>
      )}

      {/* Modern Table Container */}
      <div
        key={page}
        className="glass-card overflow-hidden rounded-3xl border border-line shadow-card"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-line bg-surface2/70 text-[11px] font-semibold uppercase tracking-wider text-soft">
              <tr>
                <th className="w-9 px-5 py-3.5">
                  <input
                    type="checkbox"
                    checked={allDeletableSelected}
                    onChange={toggleAll}
                    disabled={deletableIds.length === 0}
                    aria-label="Select all deletable jobs on this page"
                  />
                </th>
                <th className="px-5 py-3.5">Job ID</th>
                <th className="px-5 py-3.5">Keywords × Locations</th>
                <th className="px-5 py-3.5">Status & Phase</th>
                <th className="px-5 py-3.5 text-right">New Leads</th>
                <th className="px-5 py-3.5 text-right">Ledger Deduped</th>
                <th className="px-5 py-3.5">Created</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-muted">
                    No jobs match your search or filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((j, i) => (
                  <tr
                    key={j.id}
                    className="row-in transition-colors hover:bg-surface2/50"
                    style={{ animationDelay: `${Math.min(i, 9) * 25}ms` }}
                  >
                    <td className="px-5 py-4">
                      <input
                        type="checkbox"
                        checked={selected.has(j.id)}
                        onChange={() => toggle(j.id)}
                        disabled={ACTIVE.has(j.status)}
                        title={ACTIVE.has(j.status) ? "Stop this job before deleting it" : undefined}
                        aria-label={`Select job ${j.id}`}
                      />
                    </td>
                    <td className="px-5 py-4 font-mono text-xs font-semibold text-soft">
                      #{j.id}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 font-semibold text-ink">
                        <span>{j.keywords.length} keywords</span>
                        <span className="text-soft">&times;</span>
                        <span>{j.locations.length} locations</span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted truncate max-w-sm">
                        {j.keywords.join(", ")}
                      </div>
                      <div className="text-[11px] text-soft truncate max-w-sm">
                        📍 {j.locations.join(", ")}
                      </div>
                      {j.errorMsg && (
                        <div className="mt-1.5 max-w-sm truncate text-xs text-bad-fg" title={j.errorMsg}>
                          {j.errorMsg}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <Badge job={j} />
                      {ACTIVE.has(j.status) && <ProgressBar job={j} />}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums font-bold text-ink">
                      {j.leadsFound.toLocaleString()}
                    </td>
                    <td
                      className="px-5 py-4 text-right tabular-nums text-muted"
                      title="Skipped at zero cost because an earlier job already captured them"
                    >
                      {j.leadsSkipped > 0 ? j.leadsSkipped.toLocaleString() : "—"}
                    </td>
                    <td className="px-5 py-4 text-xs text-muted">
                      {formatDate(j.createdAt)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/jobs/${j.id}`}
                          className="inline-flex items-center gap-1 rounded-xl bg-accent-strong px-3 py-1.5 text-xs font-semibold text-white shadow-accent transition hover:bg-accent-dark active:scale-95"
                        >
                          Results
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                        {ACTIVE.has(j.status) ? (
                          <button
                            onClick={() => stop(j.id)}
                            disabled={j.cancelRequested}
                            title="Stop after current lead. Already collected leads are saved."
                            className="inline-flex items-center gap-1 rounded-xl border border-bad-fg/40 px-3 py-1.5 text-xs font-medium text-bad-fg transition hover:bg-bad-bg/50 active:scale-95 disabled:opacity-50"
                          >
                            <Square className="h-3 w-3 fill-current" />
                            {j.cancelRequested ? "Stopping…" : "Stop"}
                          </button>
                        ) : (
                          <button
                            onClick={() => rerun(j.id)}
                            className="inline-flex items-center gap-1 rounded-xl border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent hover:text-accent active:scale-95"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Re-run
                          </button>
                        )}
                        <button
                          onClick={() => setTarget([j.id])}
                          disabled={ACTIVE.has(j.status)}
                          title={
                            ACTIVE.has(j.status)
                              ? "Stop this job before deleting it"
                              : "Delete this job and its leads"
                          }
                          className="inline-flex items-center justify-center rounded-xl border border-line p-1.5 text-muted transition hover:border-bad-fg hover:text-bad-fg active:scale-95 disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Footer */}
      <div className="mt-6 flex flex-col items-center gap-2">
        <p className="text-xs text-soft">
          {rangeText(total, page, PAGE_SIZE)} · {total} job{total === 1 ? "" : "s"} total
        </p>
        <Pagination page={page} pageCount={pageCount} onChange={go} noun="pages" />
      </div>

      <ConfirmDialog
        open={target !== null}
        title={`Delete ${target?.length ?? 0} job${target?.length === 1 ? "" : "s"}?`}
        body={
          target?.length === 1
            ? "Every lead this run collected goes with it, and any business no other run holds is released from the ledger — a later search can collect it again."
            : "Every lead these runs collected goes with them, and any business no other run holds is released from the ledger — a later search can collect it again."
        }
        confirmLabel={`Delete job${target?.length === 1 ? "" : "s"}`}
        busy={busy}
        onConfirm={() => target && void deleteNow(target)}
        onCancel={() => setTarget(null)}
      />
    </div>
  );
}
