import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  real,
  doublePrecision,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const jobStatus = ["pending", "running", "done", "error", "cancelled"] as const;
export const jobPhase = ["scraping", "enriching"] as const;
export const leadStatus = ["new", "contacted", "replied", "won", "lost"] as const;

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobs = pgTable(
  "jobs",
  {
    id: serial("id").primaryKey(),
    keywords: text("keywords").array().notNull(),
    locations: text("locations").array().notNull(),
    status: text("status", { enum: jobStatus }).notNull().default("pending"),
    /**
     * Which stage a running job is in. Scraping and enrichment have wildly
     * different runtimes, and "running" alone read as a hung cap breach.
     */
    phase: text("phase", { enum: jobPhase }),
    phaseTotal: integer("phase_total"),
    phaseDone: integer("phase_done"),
    /** Set by the Stop button; the worker notices at its next yield point. */
    cancelRequested: boolean("cancel_requested").notNull().default(false),
    errorMsg: text("error_msg"),
    leadsFound: integer("leads_found").notNull().default(0),
    leadsSkipped: integer("leads_skipped").notNull().default(0),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("jobs_status_idx").on(t.status)],
);

export const leads = pgTable(
  "leads",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    placeId: text("place_id").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    address: text("address"),
    website: text("website"),
    category: text("category"),
    rating: real("rating"),
    reviewCount: integer("review_count"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    mapsUrl: text("maps_url"),
    status: text("status", { enum: leadStatus }).notNull().default("new"),
    notes: text("notes"),
    enriched: boolean("enriched").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("leads_job_place_uniq").on(t.jobId, t.placeId),
    index("leads_job_idx").on(t.jobId),
    index("leads_status_idx").on(t.status),
  ],
);

export const leadContacts = pgTable("lead_contacts", {
  leadId: integer("lead_id").primaryKey().references(() => leads.id, { onDelete: "cascade" }),
  emails: text("emails").array(),
  instagram: text("instagram"),
  facebook: text("facebook"),
  linkedin: text("linkedin"),
  twitter: text("twitter"),
  youtube: text("youtube"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Global "never scrape this business twice" ledger. Deliberately not a unique
 * index on leads.place_id: leads must stay job-scoped for the UI's reads, and
 * pruning cross-job duplicates would cascade into lead_contacts (CRM notes/status).
 * No FKs either — a place stays known even after its job is deleted.
 */
export const knownPlaces = pgTable("known_places", {
  placeId: text("place_id").primaryKey(),
  leadId: integer("lead_id").notNull(),
  jobId: integer("job_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Job = typeof jobs.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type LeadContact = typeof leadContacts.$inferSelect;
export type User = typeof users.$inferSelect;
export type KnownPlace = typeof knownPlaces.$inferSelect;
