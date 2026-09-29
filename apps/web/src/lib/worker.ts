import "server-only";

const WORKER_URL = process.env.WORKER_URL ?? "http://localhost:8080";

// Fire-and-forget ping so a scale-to-zero / sleeping worker wakes to claim the job.
export function wakeWorker(): void {
  void fetch(`${WORKER_URL}/health`, { method: "GET" }).catch(() => {});
}
