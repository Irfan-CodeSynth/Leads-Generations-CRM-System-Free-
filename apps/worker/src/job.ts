import type { Browser, Page } from "playwright";
import { launchBrowser, newMapsPage, closePage, scrapeSearch, scrapePlaceDetail, randomDelay } from "./scraper.js";
import { enrichFromPages, fetchSitePages } from "./enrich.js";
import type { PlaceCard } from "./parse.js";
import { isFeaturePlaceId } from "./parse.js";
import type { Db } from "@leads/db";
import { jobs, leads, leadContacts, knownPlaces, type Job } from "@leads/db";
import { and, eq, isNull, sql } from "drizzle-orm";

// Google's own practical cap; MAX_RESULTS env lets you run cheap smoke jobs.
export const MAX_RESULTS_PER_SEARCH = Number(process.env.MAX_RESULTS ?? 100);

/**
 * The whole ledger in memory: ~150 B per entry, so 100k known places cost ~15 MB
 * against Render's 512 MB. If that ever stops being true, swap this for batched
 * `WHERE place_id = ANY(...)` existence checks against the scraped card list.
 */
export async function loadKnownPlaceIds(db: Db): Promise<Set<string>> {
  const rows = await db.select({ placeId: knownPlaces.placeId }).from(knownPlaces);
  return new Set(rows.map((r) => r.placeId));
}

/**
 * Atomically claims the oldest pending job. FOR UPDATE SKIP LOCKED keeps this
 * safe if more than one worker replica ever runs.
 */
export async function claimNextJob(db: Db): Promise<Job | null> {
  const rows = await db.execute(sql`
    UPDATE jobs SET status = 'running', started_at = now()
    WHERE id = (
      SELECT id FROM jobs WHERE status = 'pending'
      ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);
  return (rows as unknown as Job[])[0] ?? null;
}

/** Thrown by the cooperative Stop check and turned into a `cancelled` job in processJob. */
class JobCancelled extends Error {}

/**
 * One indexed single-row read, called at each ~9s yield point, so a Stop click
 * lands within a single lead rather than at the end of the job.
 */
export async function isCancelRequested(db: Db, jobId: number): Promise<boolean> {
  const [row] = await db
    .select({ v: jobs.cancelRequested })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  return Boolean(row?.v);
}

export async function processJob(db: Db, job: Job) {
  let browser: Browser | null = null;
  let inserted = 0;
  let skippedTotal = 0;
  try {
    browser = await launchBrowser();
    const page = await newMapsPage(browser);
    await db
      .update(jobs)
      .set({ phase: "scraping", phaseTotal: null, phaseDone: null })
      .where(eq(jobs.id, job.id));

    const known = await loadKnownPlaceIds(db);
    console.log(`Job ${job.id}: ${known.size} places already in the global ledger`);

    const abortIfStopped = async () => {
      if (await isCancelRequested(db, job.id)) {
        console.log(`Job ${job.id}: stop flag set — aborting at a checkpoint`);
        throw new JobCancelled();
      }
    };

    for (const location of job.locations) {
      for (const keyword of job.keywords) {
        console.log(`Job ${job.id}: searching "${keyword}" in "${location}"`);
        const found = await scrapeSearch(
          page,
          keyword,
          location,
          MAX_RESULTS_PER_SEARCH,
          known,
          abortIfStopped,
        );
        let skipped = found.skipped;
        console.log(
          `Job ${job.id}: "${keyword}" x "${location}" -> ${found.cards.length} new, ${skipped} already known`,
        );

        for (const card of found.cards) {
          await abortIfStopped();
          const outcome = await saveLeadWithDetail(db, job.id, card, page, known);
          if (outcome === "added") inserted++;
          if (outcome === "known") skipped++;
          // A place we never opened costs nothing, including the politeness wait.
          if (outcome !== "known") await page.waitForTimeout(randomDelay(2000, 4500));
        }

        skippedTotal += skipped;
        await db
          .update(jobs)
          .set({ leadsSkipped: sql`${jobs.leadsSkipped} + ${skipped}` })
          .where(eq(jobs.id, job.id));
      }
    }
    await closePage(page);
    await browser.close().catch(() => {});
    browser = null;

    await enrichLeads(db, job.id);

    await db
      .update(jobs)
      .set({
        status: "done",
        phase: null,
        phaseTotal: null,
        phaseDone: null,
        cancelRequested: false,
        finishedAt: new Date(),
        errorMsg: null,
      })
      .where(eq(jobs.id, job.id));
    console.log(`Job ${job.id} done (${inserted} new leads, ${skippedTotal} already known)`);
  } catch (err) {
    if (err instanceof JobCancelled) {
      // Leads already saved stay saved, and enrichment resumes from `enriched = false`,
      // so Re-run picks this up without re-scraping a single place.
      await db
        .update(jobs)
        .set({
          status: "cancelled",
          phase: null,
          phaseTotal: null,
          phaseDone: null,
          cancelRequested: false,
          finishedAt: new Date(),
        })
        .where(eq(jobs.id, job.id));
      console.log(`Job ${job.id} cancelled (${inserted} new leads kept)`);
      return;
    }
    const msg = err instanceof Error ? err.message.slice(0, 500) : String(err);
    await db
      .update(jobs)
      .set({ status: "error", errorMsg: msg, finishedAt: new Date() })
      .where(eq(jobs.id, job.id));
    console.error(`Job ${job.id} failed: ${msg}`);
  } finally {
    // 512 MB ceiling: never leak a browser between jobs.
    await browser?.close().catch(() => {});
  }
}

export type SaveOutcome = "added" | "known" | "duplicate";

export async function saveLeadWithDetail(
  db: Db,
  jobId: number,
  card: PlaceCard,
  page: Page,
  known: Set<string>,
): Promise<SaveOutcome> {
  // The whole point of the ledger: never pay a detail navigation for a place we have.
  if (known.has(card.placeId)) return "known";

  let detail: Awaited<ReturnType<typeof scrapePlaceDetail>> = {};
  try {
    detail = await scrapePlaceDetail(page, card.href);
  } catch (err) {
    console.warn(`detail failed for ${card.name}: ${String(err).slice(0, 120)}`);
  }

  const inserted = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(leads)
      .values({
        jobId,
        placeId: card.placeId,
        name: card.name.slice(0, 300),
        phone: detail.phone,
        address: detail.address,
        website: detail.website,
        category: detail.category ?? card.category,
        rating: detail.rating ?? card.rating,
        reviewCount: detail.reviewCount ?? card.reviewCount,
        lat: detail.lat ?? card.lat,
        lng: detail.lng ?? card.lng,
        mapsUrl: detail.mapsUrl ?? card.href,
      })
      .onConflictDoNothing({ target: [leads.jobId, leads.placeId] })
      .returning({ id: leads.id });

    if (!rows.length) return null;

    // name:-fallback ids aren't globally stable, so they never enter the ledger.
    if (isFeaturePlaceId(card.placeId)) {
      await tx
        .insert(knownPlaces)
        .values({ placeId: card.placeId, leadId: rows[0]!.id, jobId })
        .onConflictDoNothing({ target: knownPlaces.placeId });
    }

    await tx.update(jobs).set({ leadsFound: sql`${jobs.leadsFound} + 1` }).where(eq(jobs.id, jobId));
    return rows[0]!.id;
  });

  if (inserted === null) return "duplicate";
  known.add(card.placeId);
  return "added";
}

/** Visits each lead's website over plain HTTP; a dead site must not fail the job. */
export async function enrichLeads(db: Db, jobId: number) {
  const targets = await db
    .select({ id: leads.id, website: leads.website, name: leads.name })
    .from(leads)
    .where(and(eq(leads.jobId, jobId), eq(leads.enriched, false), sql`${leads.website} IS NOT NULL`));

  if (!targets.length) return;

  await db
    .update(jobs)
    .set({ phase: "enriching", phaseTotal: targets.length, phaseDone: 0 })
    .where(eq(jobs.id, jobId));

  for (const [i, lead] of targets.entries()) {
    if (await isCancelRequested(db, jobId)) {
      console.log(`Job ${jobId}: stop flag set — aborting enrichment at ${i}/${targets.length}`);
      throw new JobCancelled();
    }
    try {
      const pages = await fetchSitePages(lead.website!);
      const result = enrichFromPages(pages);
      await db
        .insert(leadContacts)
        .values({ leadId: lead.id, emails: result.emails, ...socialColumns(result) })
        .onConflictDoUpdate({
          target: leadContacts.leadId,
          set: { emails: result.emails, ...socialColumns(result), updatedAt: new Date() },
        });
    } catch (err) {
      console.warn(`enrich failed for ${lead.name}: ${String(err).slice(0, 100)}`);
    }
    await db.update(leads).set({ enriched: true }).where(eq(leads.id, lead.id));
    await db.update(jobs).set({ phaseDone: i + 1 }).where(eq(jobs.id, jobId));
    await sleep(randomDelay(500, 1500));
  }
}

function socialColumns(r: ReturnType<typeof enrichFromPages>) {
  return {
    instagram: r.instagram ?? null,
    facebook: r.facebook ?? null,
    linkedin: r.linkedin ?? null,
    twitter: r.twitter ?? null,
    youtube: r.youtube ?? null,
  };
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}
