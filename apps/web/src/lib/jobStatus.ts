export const STATUS_STYLES: Record<string, string> = {
  pending: "bg-warn-bg text-warn-fg",
  running: "bg-info-bg text-info-fg",
  done: "bg-ok-bg text-ok-fg",
  error: "bg-bad-bg text-bad-fg",
  cancelled: "bg-idle-bg text-idle-fg",
};

export function statusBadge(status: string): string {
  return STATUS_STYLES[status] ?? "bg-idle-bg text-idle-fg";
}

/**
 * Scraping and enrichment differ hugely in runtime, so a bare "running" reads as a
 * job that ignored the cap. Name the phase and, where there is a total, the progress.
 */
export function statusLabel(job: {
  status: string;
  cancelRequested: boolean;
  phase: string | null;
  phaseTotal: number | null;
  phaseDone: number | null;
}): string {
  if (job.status !== "running") return job.status;
  if (job.cancelRequested) return "stopping…";
  if (!job.phase) return "running";
  return job.phaseTotal ? `${job.phase} ${job.phaseDone ?? 0}/${job.phaseTotal}` : job.phase;
}
