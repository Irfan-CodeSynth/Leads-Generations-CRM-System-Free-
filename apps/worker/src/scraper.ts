import type { Browser, Page, Locator } from "playwright";
import { chromium } from "playwright";
import {
  extractPlaceId,
  extractCoords,
  parseCardText,
  normalizePhone,
  normalizeWebsite,
  isEndOfList,
  isNoiseLine,
  dedupePlaces,
  type PlaceCard,
} from "./parse.js";

// Reaching 100 *new* places takes more scroll passes than 100 seen ones.
const MAX_SCROLL_ROUNDS = 24;

export type ScrapeResult = { cards: PlaceCard[]; skipped: number };

/**
 * Google blocks automated traffic aggressively. These flags + a real UA keep a
 * single worker within modest-request territory; scale needs proxies, not speed.
 */
export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--js-flags=--max-old-space-size=256",
      "--window-size=1280,900",
    ],
  });
}

export async function newMapsPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
    timezoneId: "UTC",
  });

  // 512 MB guard: Maps without images/fonts is still parseable and ~3x lighter.
  await context.route(
    "**/*",
    (route) => {
      const type = route.request().resourceType();
      if (type === "image" || type === "font" || type === "media") {
        return route.abort();
      }
      return route.continue();
    },
  );

  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return page;
}

export async function closePage(page: Page) {
  await page.context().close().catch(() => {});
}

async function dismissConsent(page: Page) {
  for (const label of ["Accept all", "Reject all", "I agree"]) {
    const btn = page.locator(`button:has-text("${label}")`).first();
    if (await btn.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await btn.click({ timeout: 3_000 }).catch(() => {});
      await page.waitForTimeout(500);
      return;
    }
  }
}

/**
 * Scrape one keyword+location search, collecting up to maxResults places the
 * global ledger has never seen. Google caps its own feed at ~120 results, so a
 * previously-mined query can legitimately yield far fewer new ones.
 *
 * `checkpoint` runs before every scroll round and may throw to abort: a full
 * scroll costs minutes, and the Stop button must not wait for it to finish.
 */
export async function scrapeSearch(
  page: Page,
  keyword: string,
  location: string,
  maxResults = 100,
  known: ReadonlySet<string> = new Set(),
  checkpoint: () => Promise<void> = async () => {},
): Promise<ScrapeResult> {
  const query = encodeURIComponent(`${keyword} ${location}`);
  const url = `https://www.google.com/maps/search/${query}?hl=en`;

  await gotoWithRetry(page, url);
  await dismissConsent(page);

  const feed = page.locator('div[role="feed"]');
  try {
    await feed.waitFor({ state: "visible", timeout: 20_000 });
  } catch {
    throw new Error(`No results feed for "${keyword} ${location}" (blocked or empty search)`);
  }

  const cards = new Map<string, PlaceCard>();
  let picked: { fresh: PlaceCard[]; skipped: number } = { fresh: [], skipped: 0 };
  let stop = "scroll budget";
  let lastSize = -1;
  let stalledRounds = 0;

  for (let round = 0; round < MAX_SCROLL_ROUNDS && picked.fresh.length < maxResults; round++) {
    await checkpoint();
    for (const card of await readCards(feed)) {
      if (!cards.has(card.placeId)) cards.set(card.placeId, card);
    }
    picked = dedupePlaces([...cards.values()], known, maxResults);
    if (picked.fresh.length >= maxResults) {
      stop = "cap reached";
      break;
    }

    // Every round here is measured after a settle wait, so a batch that renders
    // late gets several chances before we believe the feed is really exhausted.
    if (cards.size === lastSize) stalledRounds++;
    else {
      stalledRounds = 0;
      lastSize = cards.size;
    }
    if (stalledRounds >= 5) {
      stop = "feed stopped loading";
      break;
    }

    const endMarker = await feed.locator('[role="heading"]').last().textContent().catch(() => null);
    if (isEndOfList(endMarker)) {
      stop = "end-of-list marker";
      break;
    }

    await scrollFeed(feed);
  }

  picked = dedupePlaces([...cards.values()], known, maxResults);
  console.log(
    `  seen ${cards.size} · new ${picked.fresh.length} · known ${picked.skipped} · stopped: ${stop}`,
  );
  return { cards: picked.fresh, skipped: picked.skipped };
}

/**
 * One round-trip for the whole feed. The per-locator version cost 3 CDP calls per
 * card, and with ~120 cards over 24 scroll rounds that dominated the job (~13 min
 * of pure overhead on a repeat search).
 */
async function readCards(feed: Locator): Promise<PlaceCard[]> {
  const raw = await feed
    .evaluate((el) =>
      Array.from(el.querySelectorAll('a[href*="/maps/place/"]')).map((a) => ({
        href: a.getAttribute("href") ?? "",
        ariaName: a.getAttribute("aria-label") ?? "",
        text: a.textContent ?? "",
      })),
    )
    .catch(() => [] as { href: string; ariaName: string; text: string }[]);

  const out: PlaceCard[] = [];
  for (const { href, ariaName, text } of raw) {
    if (!href) continue;

    const lines = text
      .split(/[\n⋅]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const parsed = parseCardText(lines, ariaName);
    if (!parsed.name) continue;

    out.push({
      placeId: extractPlaceId(href, parsed.name),
      href,
      ...parsed,
      ...extractCoords(href),
    });
  }
  return out;
}

async function scrollFeed(feed: Locator) {
  // Pin to the bottom instead of stepping by a fixed height: Google virtualises the
  // feed, so a partial scroll can stop short of the sentinel that triggers the next batch.
  await feed.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await feed.page()!.waitForTimeout(randomDelay(2200, 3600));
}

export interface PlaceDetail {
  phone?: string;
  website?: string;
  address?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
  lat?: number;
  lng?: number;
  mapsUrl?: string;
}

/**
 * Open one place panel and read the fields the search card does not carry.
 * Every selector is best-effort: a missing field yields undefined, not an error.
 */
export async function scrapePlaceDetail(page: Page, href: string): Promise<PlaceDetail> {
  await gotoWithRetry(page, cleanPlaceUrl(href));

  const detailUrl = page.url();
  const coords = extractCoords(detailUrl);

  const [phone, website, address, header] = await Promise.all([
    readAttribute(page, ['button[data-item-id^="phone:tel:"]'], "data-item-id").then((v) =>
      v ? normalizePhone(v.replace("phone:tel:", "")) : undefined,
    ),
    readAttribute(page, ['a[data-item-id="authority"]', 'a[aria-label^="Visit"]'], "href").then(
      (v) => normalizeWebsite(v ?? undefined),
    ),
    readText(page, ['div[data-item-id="address"]', 'button[data-item-id="address"]']),
    readHeaderInfo(page),
  ]);

  return {
    phone,
    website,
    address: address?.replace(/^Address:/i, "").replace(/\s+/g, " ").trim(),
    category: header.category,
    rating: header.rating,
    reviewCount: header.reviewCount,
    lat: coords?.lat,
    lng: coords?.lng,
    mapsUrl: detailUrl,
  };
}

/**
 * The place header line is like "4.7(1,675) · Plumber". We read the whole
 * block once, pull the numeric rating/reviews and the first non-noise segment
 * (the category) from it. Avoids grabbing the "Map" toggle button by mistake.
 */
interface HeaderInfo {
  rating?: number;
  reviewCount?: number;
  category?: string;
}

async function readHeaderInfo(page: Page): Promise<HeaderInfo> {
  const container = page.locator("div.F7nice").first();
  if (!(await container.isVisible({ timeout: 2_000 }).catch(() => false))) return {};
  const text = (await container.textContent().catch(() => "")) ?? "";

  const ratingMatch = text.match(/(\d\.\d)[\s\S]*?\(([\d,]+)\)/);
  const out: HeaderInfo = {};
  if (ratingMatch) {
    out.rating = Number(ratingMatch[1]);
    out.reviewCount = Number(ratingMatch[2]!.replace(/,/g, ""));
  }

  // Category = first "·"-separated segment that isn't the rating or a UI label.
  for (const seg of text.split(/[·⋅]/)) {
    const value = seg.trim();
    if (!value || /\d\.\d|\(([\d,]+)\)/.test(value)) continue;
    if (isNoiseLine(value) || value.length > 60) continue;
    out.category = value;
    break;
  }
  return out;
}

async function readText(page: Page, selectors: string[]): Promise<string | null> {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    if (await loc.isVisible({ timeout: 1_200 }).catch(() => false)) {
      const aria = await loc.getAttribute("aria-label").catch(() => null);
      const text = await loc.textContent().catch(() => null);
      const value = aria ?? text;
      if (value?.trim()) return value.trim();
    }
  }
  return null;
}

async function readAttribute(page: Page, selectors: string[], name: string): Promise<string | null> {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    if (await loc.count().catch(() => 0)) {
      const value = await loc.getAttribute(name).catch(() => null);
      if (value) return value;
    }
  }
  return null;
}

/** Strip tracking query noise so the panel loads the canonical place URL. */
function cleanPlaceUrl(href: string): string {
  const [path] = href.split("?");
  let url = path ?? href;
  if (!url.includes("hl=")) url += (url.includes("?") ? "&" : "?") + "hl=en";
  return url;
}

async function gotoWithRetry(page: Page, url: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      if (await looksBlocked(page)) {
        throw new Error("Google served a consent/error/captcha interstitial");
      }
      await page.waitForTimeout(randomDelay(900, 1600));
      return;
    } catch (err) {
      lastError = err;
      await page.waitForTimeout(randomDelay(2500, 5000) * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Navigation failed: ${url}`);
}

async function looksBlocked(page: Page): Promise<boolean> {
  const title = await page.title().catch(() => "");
  if (/sorry/i.test(title)) return true;
  return page
    .locator('form[action*="Captcha"], iframe[src*="recaptcha"]')
    .first()
    .isVisible({ timeout: 800 })
    .catch(() => false);
}

export function randomDelay(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

export async function politeWait() {
  await new Promise((r) => setTimeout(r, randomDelay(2000, 5000)));
}
