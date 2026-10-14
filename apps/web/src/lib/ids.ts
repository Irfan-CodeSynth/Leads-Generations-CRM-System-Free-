/** Bounded so one click can't ask the database for a million-row transaction. */
export const MAX_DELETE_IDS = 500;

export type IdBatch = { ok: true; ids: number[] } | { ok: false; error: string };

/**
 * Validates a `{ ids: [...] }` delete body. Integers only: these go straight
 * into a `WHERE id IN (...)`, and the UI is the only caller.
 */
export function parseIdBatch(body: unknown): IdBatch {
  const ids = (body as { ids?: unknown })?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "Provide a non-empty ids array" };
  }
  if (ids.length > MAX_DELETE_IDS) {
    return { ok: false, error: `At most ${MAX_DELETE_IDS} ids per request` };
  }
  if (!ids.every((id) => Number.isInteger(id) && (id as number) > 0)) {
    return { ok: false, error: "Every id must be a positive integer" };
  }
  return { ok: true, ids: ids as number[] };
}
