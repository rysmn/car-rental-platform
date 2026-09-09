CREATE TYPE "public"."alert_severity" AS ENUM('critical', 'error', 'warning', 'info');--> statement-breakpoint
CREATE TYPE "public"."alert_state" AS ENUM('active', 'acknowledged', 'resolved');--> statement-breakpoint
CREATE TABLE "system_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" text NOT NULL,
	"severity" "alert_severity" NOT NULL,
	"module" text NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"context" jsonb,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"state" "alert_state" DEFAULT 'active' NOT NULL,
	"reopened_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	CONSTRAINT "system_alerts_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE INDEX "system_alerts_state_idx" ON "system_alerts" USING btree ("state","last_seen");--> statement-breakpoint
CREATE INDEX "system_alerts_module_idx" ON "system_alerts" USING btree ("module","last_seen");