CREATE TYPE "public"."tyre_set" AS ENUM('summer', 'winter', 'all_season');--> statement-breakpoint
ALTER TABLE "cars" ADD COLUMN "oil_interval_km" integer;--> statement-breakpoint
ALTER TABLE "cars" ADD COLUMN "last_oil_km" integer;--> statement-breakpoint
ALTER TABLE "cars" ADD COLUMN "tyres_fitted" "tyre_set";--> statement-breakpoint
ALTER TABLE "cars" ADD COLUMN "tyres_changed_on" date;