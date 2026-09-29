import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { jobs, knownPlaces, leadContacts, leads } from "@leads/db";
import { getDb } from "./db";
import type { DashboardStats, JobSummary, LeadRow } from "./types";

export async function getLeadsForJob(jobId: number, onlyIds?: number[]): Promise<LeadRow[]> {
  const db = getDb();
  const base = eq(leads.jobId, jobId);
  const where = onlyIds && onlyIds.length ? and(base, inArray(leads.id, onlyIds)) : base;

  const rows = await db
    .select({
      id: leads.id,
      name: leads.name,
      phone: leads.phone,
      address: leads.address,
      website: leads.website,
      category: leads.category,
      rating: leads.rating,
      reviewCount: leads.reviewCount,
      lat: leads.lat,
      lng: leads.lng,
      mapsUrl: leads.mapsUrl,
      status: leads.status,
      notes: leads.notes,
      emails: leadContacts.emails,
      instagram: leadContacts.instagram,
      facebook: leadContacts.facebook,
      linkedin: leadContacts.linkedin,
      twitter: leadContacts.twitter,
      youtube: leadContacts.youtube,
    })
    .from(leads)
    .leftJoin(leadContacts, eq(leadContacts.leadId, leads.id))
    .where(where)
    .orderBy(asc(leads.name));

  return rows as LeadRow[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const db = getDb();

  const [
    leadsCountRow,
    knownCountRow,
    jobsCountRow,
    activeJobsRow,
    enrichedCountRow,
    emailsCountRow,
    statusRows,
    categoryRows,
    recentJobRows,
    recentLeadRows,
  ] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(leads),
    db.select({ n: sql<number>`count(*)::int` }).from(knownPlaces),
    db.select({ n: sql<number>`count(*)::int` }).from(jobs),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(jobs)
      .where(inArray(jobs.status, ["pending", "running"])),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(leads)
      .where(eq(leads.enriched, true)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(leadContacts)
      .where(sql`cardinality(emails) > 0`),
    db
      .select({ status: leads.status, n: sql<number>`count(*)::int` })
      .from(leads)
      .groupBy(leads.status),
    db
      .select({ category: leads.category, n: sql<number>`count(*)::int` })
      .from(leads)
      .where(sql`${leads.category} IS NOT NULL AND ${leads.category} != ''`)
      .groupBy(leads.category)
      .orderBy(desc(sql`count(*)::int`))
      .limit(6),
    db
      .select()
      .from(jobs)
      .orderBy(desc(jobs.createdAt), desc(jobs.id))
      .limit(5),
    db
      .select({
        id: leads.id,
        jobId: leads.jobId,
        name: leads.name,
        category: leads.category,
        rating: leads.rating,
        website: leads.website,
        phone: leads.phone,
        status: leads.status,
        createdAt: leads.createdAt,
        emails: leadContacts.emails,
      })
      .from(leads)
      .leftJoin(leadContacts, eq(leadContacts.leadId, leads.id))
      .orderBy(desc(leads.createdAt), desc(leads.id))
      .limit(6),
  ]);

  const totalLeads = leadsCountRow[0]?.n ?? 0;
  const totalKnownPlaces = knownCountRow[0]?.n ?? 0;
  const totalJobs = jobsCountRow[0]?.n ?? 0;
  const activeJobs = activeJobsRow[0]?.n ?? 0;
  const enrichedCount = enrichedCountRow[0]?.n ?? 0;
  const emailsCount = emailsCountRow[0]?.n ?? 0;
  const enrichmentRate = totalLeads > 0 ? Math.round((enrichedCount / totalLeads) * 100) : 0;

  const statusBreakdown: Record<string, number> = {
    new: 0,
    contacted: 0,
    replied: 0,
    won: 0,
    lost: 0,
  };
  for (const row of statusRows) {
    if (row.status) {
      statusBreakdown[row.status] = row.n;
    }
  }

  const topCategories = categoryRows
    .filter((r) => Boolean(r.category))
    .map((r) => ({ category: r.category as string, count: r.n }));

  const recentJobs: JobSummary[] = recentJobRows.map((j) => ({
    id: j.id,
    status: j.status,
    phase: j.phase,
    phaseTotal: j.phaseTotal,
    phaseDone: j.phaseDone,
    cancelRequested: j.cancelRequested,
    keywords: j.keywords,
    locations: j.locations,
    leadsFound: j.leadsFound,
    leadsSkipped: j.leadsSkipped,
    errorMsg: j.errorMsg,
    createdAt: j.createdAt.toISOString(),
  }));

  const recentLeads = recentLeadRows.map((l) => ({
    id: l.id,
    jobId: l.jobId,
    name: l.name,
    category: l.category,
    rating: l.rating,
    website: l.website,
    phone: l.phone,
    status: l.status,
    createdAt: l.createdAt.toISOString(),
    emails: l.emails,
  }));

  return {
    totalLeads,
    totalKnownPlaces,
    totalJobs,
    activeJobs,
    enrichedCount,
    emailsCount,
    enrichmentRate,
    statusBreakdown,
    topCategories,
    recentJobs,
    recentLeads,
  };
}
