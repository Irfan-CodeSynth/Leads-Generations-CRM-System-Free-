import { describe, it, expect } from "vitest";
import {
  extractPlaceId,
  extractCoords,
  parseCardText,
  normalizePhone,
  normalizeWebsite,
  unwrapGoogleRedirect,
  isEndOfList,
  isFeaturePlaceId,
  dedupePlaces,
} from "../src/parse.js";

describe("extractPlaceId", () => {
  it("pulls the canonical feature id from a place URL", () => {
    const url =
      "https://www.google.com/maps/place/Rodney+Evers+Plumbing/@30.2672,-97.7431,17z/data=!3m1!4b1!4m6!3m5!1s0x8644b599f6c3c6c1:0x2a9d0a2ff5f0e5a1!8m2!3d30.2672!4d-97.7431?hl=en";
    expect(extractPlaceId(url)).toBe("0x8644b599f6c3c6c1:0x2a9d0a2ff5f0e5a1");
  });

  it("falls back to the place name segment when no feature id exists", () => {
    const url = "https://www.google.com/maps/place/Bob%27s+Shop/data=!4m2";
    expect(extractPlaceId(url)).toBe("name:bob's shop");
  });

  it("falls back to the provided name as last resort", () => {
    expect(extractPlaceId("https://maps.google.com/?q=123", "Joe Plumbers")).toBe("name:joe plumbers");
  });
});

describe("extractCoords", () => {
  it("reads @lat,lng", () => {
    expect(extractCoords("https://x/maps/place/A/@40.7128,-74.006,14z")).toEqual({ lat: 40.7128, lng: -74.006 });
  });
  it("rejects out-of-range or missing coords", () => {
    expect(extractCoords("https://x/maps/place/A")).toBeNull();
    expect(extractCoords("@200,50")).toBeNull();
  });
});

describe("parseCardText", () => {
  it("extracts name, rating, review count and category", () => {
    const lines = ["Rodney Evers Plumbing", "4.6(120)", "Open ⋅ Closes 5 PM", "Plumber", "Call now"];
    expect(parseCardText(lines, "Rodney Evers Plumbing")).toEqual({
      name: "Rodney Evers Plumbing",
      rating: 4.6,
      reviewCount: 120,
      category: "Plumber",
    });
  });

  it("handles thousands-separated review counts", () => {
    const lines = ["Shop", "4.8(1,234)"];
    const out = parseCardText(lines, "Shop");
    expect(out.reviewCount).toBe(1234);
    expect(out.category).toBeUndefined();
  });

  it("survives cards with no rating", () => {
    const lines = ["New Biz", "Electrician"];
    const out = parseCardText(lines, "New Biz");
    expect(out.rating).toBeUndefined();
    expect(out.category).toBeUndefined(); // line after "New Biz" isn't reliably a category
  });
});

describe("normalizePhone", () => {
  it("extracts and compacts a phone from label text", () => {
    expect(normalizePhone("Call +1 512-555-0123")).toBe("+15125550123");
    expect(normalizePhone("(512) 555 0123")).toBe("(512) 555 0123");
    expect(normalizePhone("no digits here")).toBeUndefined();
    expect(normalizePhone(null)).toBeUndefined();
  });
});

describe("website normalization", () => {
  it("unwraps google redirect links", () => {
    expect(unwrapGoogleRedirect("https://www.google.com/url?q=https://acme.com/&sa=D")).toBe("https://acme.com/");
  });
  it("adds scheme and rejects junk", () => {
    expect(normalizeWebsite("www.acme.com")).toBe("https://www.acme.com");
    expect(normalizeWebsite("mailto:x@y.com")).toBeUndefined();
    expect(normalizeWebsite(undefined)).toBeUndefined();
  });
});

describe("isEndOfList", () => {
  it("detects Google's feed end marker", () => {
    expect(isEndOfList("You've reached the end of the list.")).toBe(true);
    expect(isEndOfList("Results")).toBe(false);
    expect(isEndOfList(null)).toBe(false);
  });
});

describe("isFeaturePlaceId", () => {
  it("accepts only Google's canonical feature id", () => {
    expect(isFeaturePlaceId("0x8644b599f6c3c6c1:0x2a9d0a2ff5f0e5a1")).toBe(true);
  });

  it("rejects the name fallback, which is not globally stable", () => {
    expect(isFeaturePlaceId("name:bob's shop")).toBe(false);
    expect(isFeaturePlaceId("")).toBe(false);
    expect(isFeaturePlaceId("0xabc:0xdef:0x1")).toBe(false);
  });
});

describe("dedupePlaces", () => {
  const card = (placeId: string) => ({ placeId, name: placeId });

  it("skips every place already in the global ledger", () => {
    const known = new Set(["0x1:0x1", "0x2:0x2"]);
    const out = dedupePlaces([card("0x1:0x1"), card("0x2:0x2")], known, 100);
    expect(out.fresh).toEqual([]);
    expect(out.skipped).toBe(2);
  });

  it("counts known places separately from the new ones it keeps", () => {
    const known = new Set(["0x1:0x1"]);
    const out = dedupePlaces(
      [card("0x1:0x1"), card("0x9:0x9"), card("0x2:0x2")],
      known,
      100,
    );
    expect(out.fresh.map((c) => c.placeId)).toEqual(["0x9:0x9", "0x2:0x2"]);
    expect(out.skipped).toBe(1);
  });

  it("caps fresh at maxNew", () => {
    const out = dedupePlaces(
      [card("0x1:0x1"), card("0x2:0x2"), card("0x3:0x3")],
      new Set(["0x1:0x1"]),
      1,
    );
    expect(out.fresh.map((c) => c.placeId)).toEqual(["0x2:0x2"]);
    expect(out.skipped).toBe(1);
  });

  it("never skips a name-fallback id on ledger grounds", () => {
    const out = dedupePlaces([card("name:bob's shop")], new Set(["0x1:0x1"]), 100);
    expect(out.fresh).toHaveLength(1);
    expect(out.skipped).toBe(0);
  });

  it("counts a repeated place once", () => {
    const out = dedupePlaces([card("0x1:0x1"), card("0x1:0x1")], new Set(["0x1:0x1"]), 100);
    expect(out.skipped).toBe(1);
  });
});
