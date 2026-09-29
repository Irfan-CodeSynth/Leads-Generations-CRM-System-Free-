CREATE TABLE IF NOT EXISTS "known_places" (
	"place_id" text PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL,
	"job_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "leads_skipped" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
INSERT INTO "known_places" ("place_id", "lead_id", "job_id")
SELECT DISTINCT ON ("place_id") "place_id", "id", "job_id" FROM "leads"
WHERE "place_id" LIKE '0x%' ORDER BY "place_id", "id" ASC
ON CONFLICT ("place_id") DO NOTHING;