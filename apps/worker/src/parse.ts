/**
 * Pure parsing helpers for Google Maps URLs and DOM text.
 * Kept browser-free so they are unit-testable.
 */

export interface PlaceCard {
  placeId: string;
  name: string;
  href: string;
  rating?: number;
  reviewCount?: number;
  category?: string;
  lat?: number;
  lng?: number;
}

const FEATURE_ID_RE = /!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/;
const COORDS_RE = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;
// Place panels often carry no @lat,lng in the URL; coords live in !3d..!4d..
const BARE_COORDS_RE = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;

/**
 * Google encodes the canonical place feature id in the detail link as
 * `!1s0x<hex>:0x<hex>`. That is the most stable dedupe key available without
 * the Places API. Falls back to the /maps/place/<name> path segment.
 */
export function extractPlaceId(href: string, fallbackName?: string): string {
  const feature = href.match(FEATURE_ID_RE);
  if (feature) return feature[1]!;

  const marker = href.indexOf("/maps/place/");
  if (marker !== -1) {
    const rest = href.slice(marker + "/maps/place/".length);
    const name = rest.split("/")[0] ?? "";
    const decoded = safeDecode(name);
    if (decoded) return `name:${decoded.toLowerCase()}`;
  }

  return `name:${(fallbackName ?? href).toLowerCase()}`;
}

const FEATURE_ID_SHAPE = /^0x[0-9a-fA-F]+:0x[0-9a-fA-F]+$/;

/** Only canonical feature ids are safe as a global dedupe key. */
export function isFeaturePlaceId(placeId: string): boolean {
  return FEATURE_ID_SHAPE.test(placeId);
}

/**
 * Splits scraped cards into places never captured and places the global ledger
 * already holds. `skipped` counts distinct known ids so the caller can report
 * "N new, M already known" without re-walking the list.
 */
export function dedupePlaces<T extends { placeId: string }>(
  cards: T[],
  known: ReadonlySet<string>,
  maxNew: number,
): { fresh: T[]; skipped: number } {
  const fresh: T[] = [];
  const counted = new Set<string>();
  let skipped = 0;

  for (const card of cards) {
    if (counted.has(card.placeId)) continue;
    counted.add(card.placeId);
    if (known.has(card.placeId)) skipped++;
    else if (fresh.length < maxNew) fresh.push(card);
  }

  return { fresh, skipped };
}

export function extractCoords(href: string): { lat: number; lng: number } | null {
  const m = href.match(COORDS_RE) ?? href.match(BARE_COORDS_RE);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * Search-result card text is unstructured, e.g.
 *   "Joe's Plumbing\n4.6(120)\nOpen ⋅ Closes 5 PM\nPlumber\nCall now"
 * Rating/reviews/category are pulled positionally with tolerant regexes.
 */
export function parseCardText(lines: string[], ariaName: string): Omit<PlaceCard, "placeId" | "href"> {
  const joined = lines.join("\n");
  const ratingMatch = joined.match(/(\d\.\d)\s*\((\d[\d,]*)\)/);
  const ratingIdx = lines.findIndex((l) => /\d\.\d\s*\(\d[\d,]*\)/.test(l));
  return {
    name: ariaName.trim() || (lines[0] ?? "").trim(),
    rating: ratingMatch ? Number(ratingMatch[1]) : undefined,
    reviewCount: ratingMatch ? Number(ratingMatch[2]!.replace(/,/g, "")) : undefined,
    category: guessCategory(lines, ratingIdx),
  };
}

function guessCategory(lines: string[], ratingIdx: number): string | undefined {
  if (ratingIdx === -1) return undefined;
  // Category usually follows the rating line; scan the next few lines for the
  // first entry that is not a status/hours/hype line.
  for (const raw of lines.slice(ratingIdx + 1, ratingIdx + 4)) {
    const value = raw.split("⋅")[0]?.trim();
    if (!value || isNoiseLine(value) || value.length > 60) continue;
    if (/\d\.\d/.test(raw)) continue;
    return value;
  }
  return undefined;
}

const NOISE =
  /^(open|clos|closed now|temporarily closed|permanently closed|call now|directions|website|menu|reserve a table|order online|service options|map|save|share|nearby|send to phone|add review|photo|\d(?:\.\d)?\s*stars)/i;

function isNoiseLine(value: string) {
  return NOISE.test(value.trim());
}
export { isNoiseLine };

/** Phones on the detail panel arrive as "Call +1 512-555-0123" etc. */
export function normalizePhone(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const match = raw.match(/(\+?\(?\d[\d\s().-]{7,}\d)/);
  if (!match) return undefined;
  const compact = match[1]!.replace(/[\s().-]+/g, "");
  if (compact.replace(/\D/g, "").length < 7) return undefined;
  return compact.startsWith("+") ? compact : match[1]!.trim();
}

export function absoluteUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

/** Google Maps redirects website links through /url?q= — unwrap it. */
export function unwrapGoogleRedirect(href: string): string {
  try {
    const u = new URL(href);
    const q = u.searchParams.get("q");
    if (q && (u.hostname === "www.google.com" || u.hostname === "google.com")) return q;
  } catch {
    /* not a URL */
  }
  return href;
}

export function normalizeWebsite(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = unwrapGoogleRedirect(raw).trim();
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  // Bare host like "www.acme.com" or "acme.com/contact" — nothing with
  // scheme-ish characters (mailto:, javascript:, @) qualifies.
  if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(\/[^\s]*)?$/i.test(cleaned)) {
    return `https://${cleaned}`;
  }
  return undefined;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s.replace(/\+/g, " ");
  }
}

/** Feed "end of list" marker Google shows after the last scrollable batch. */
export function isEndOfList(text: string | null | undefined): boolean {
  return !!text && /you(?:'|’)ve reached the end of the list/i.test(text);
}
