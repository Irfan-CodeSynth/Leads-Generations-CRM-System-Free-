ALTER TABLE "jobs" ADD COLUMN "phase" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "phase_total" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "cancel_requested" boolean DEFAULT false NOT NULL;