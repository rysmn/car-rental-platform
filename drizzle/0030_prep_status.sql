CREATE TYPE "public"."prep_status" AS ENUM('inspection', 'cleaning', 'fueling', 'ready');--> statement-breakpoint
ALTER TABLE "cars" ADD COLUMN "prep_status" "prep_status";--> statement-breakpoint
ALTER TABLE "cars" ADD COLUMN "prep_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cars" ADD COLUMN "prep_note" text;