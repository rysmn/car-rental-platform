CREATE TYPE "public"."health_status" AS ENUM('ok', 'warn', 'fail');--> statement-breakpoint
CREATE TABLE "system_health" (
	"check_key" text PRIMARY KEY NOT NULL,
	"status" "health_status" NOT NULL,
	"detail" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "phone" text;