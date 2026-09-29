/**
 * Smoke test the scraper without Postgres:
 *   npx tsx src/cli.ts "plumber" "Austin, TX"
 */
import { launchBrowser, newMapsPage, scrapeSearch, scrapePlaceDetail, closePage, randomDelay, type PlaceDetail } from "./scraper.js";
import { enrichFromPages, fetchSitePages } from "./enrich.js";

const [keyword, location] = process.argv.slice(2);
if (!keyword || !location) {
  console.error('usage: tsx src/cli.ts "<keyword>" "<location>" [maxResults] [enrich]');
  process.exit(1);
}
const max = Number(process.argv[4] ?? 8);
const doEnrich = process.argv[5] === "enrich";

const browser = await launchBrowser();
try {
  const page = await newMapsPage(browser);
  const { cards } = await scrapeSearch(page, keyword, location, max);
  console.log(`feed returned ${cards.length} places\n`);

  for (const card of cards) {
    let detail: PlaceDetail = {};
    try {
      detail = await scrapePlaceDetail(page, card.href);
    } catch (err) {
      console.warn(`  detail failed: ${String(err).slice(0, 100)}`);
    }
    const row = { ...card, ...detail };
    let contacts: unknown;
    if (doEnrich && row.website) {
      try {
        contacts = enrichFromPages(await fetchSitePages(row.website));
      } catch (err) {
        contacts = { error: String(err).slice(0, 80) };
      }
    }
    console.log(JSON.stringify({ ...row, contacts }, null, 2));
    await page.waitForTimeout(randomDelay(1500, 3000));
  }
  await closePage(page);
} finally {
  await browser.close().catch(() => {});
}
