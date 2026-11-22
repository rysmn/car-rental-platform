-- Car categories: replace suv/sedan/van with the rental segments.
-- Existing sedans become intermediate (owner decision, 2026-11-22).
CREATE TYPE "public"."car_category_new" AS ENUM('mini', 'economy', 'compact', 'intermediate', 'estate', 'convertible', 'suv', 'van');--> statement-breakpoint
ALTER TABLE "car_models" ALTER COLUMN "category" TYPE "public"."car_category_new" USING (CASE WHEN "category"::text = 'sedan' THEN 'intermediate' ELSE "category"::text END)::"public"."car_category_new";--> statement-breakpoint
DROP TYPE "public"."car_category";--> statement-breakpoint
ALTER TYPE "public"."car_category_new" RENAME TO "car_category";
