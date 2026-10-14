import { describe, it, expect } from "vitest";
import { parseIdBatch, MAX_DELETE_IDS } from "./ids";

describe("parseIdBatch", () => {
  it("accepts a batch of positive integers", () => {
    expect(parseIdBatch({ ids: [1, 2, 30] })).toEqual({ ok: true, ids: [1, 2, 30] });
  });

  it("rejects a missing, empty or non-array ids field", () => {
    expect(parseIdBatch({}).ok).toBe(false);
    expect(parseIdBatch({ ids: [] }).ok).toBe(false);
    expect(parseIdBatch({ ids: "5" }).ok).toBe(false);
    expect(parseIdBatch(null).ok).toBe(false);
  });

  it("rejects anything that is not a positive integer", () => {
    for (const bad of [[1.5], ["7"], [0], [-3], [null], [NaN]]) {
      expect(parseIdBatch({ ids: bad }).ok).toBe(false);
    }
  });

  it("rejects an oversized batch", () => {
    const ids = Array.from({ length: MAX_DELETE_IDS + 1 }, (_, i) => i + 1);
    expect(parseIdBatch({ ids }).ok).toBe(false);
    expect(parseIdBatch({ ids: ids.slice(0, MAX_DELETE_IDS) }).ok).toBe(true);
  });
});
