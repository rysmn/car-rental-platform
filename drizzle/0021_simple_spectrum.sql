CREATE TYPE "public"."cache_request_state" AS ENUM('idle', 'pending', 'running');--> statement-breakpoint
CREATE TABLE "cache_maintenance" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"disk_percent" integer,
	"disk_free" text,
	"cache_bytes" text,
	"threshold_percent" integer DEFAULT 70 NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_cleanup_at" timestamp with time zone,
	"last_freed_bytes" text,
	"last_result" text,
	"last_message" text,
	"request_state" "cache_request_state" DEFAULT 'idle' NOT NULL,
	"requested_at" timestamp with time zone,
	"requested_by" text
);
--> statement-breakpoint
INSERT INTO "cache_maintenance" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
