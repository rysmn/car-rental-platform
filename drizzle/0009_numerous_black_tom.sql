ALTER TABLE "car_models" ADD COLUMN "segments" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- Opening values for the fleet filter, so the chips are not all empty on the
-- day they ship. Price- and category-based rather than per-slug, so a database
-- seeded with different cars still gets a sensible starting point; the admin
-- editor is the source of truth from here on and can override any of it.
--
-- "electric" and "van" are deliberately absent: those are derived from `fuel`
-- and `category` at read time and never stored.
UPDATE "car_models" SET "segments" = (
  SELECT COALESCE(array_agg(s), '{}')
  FROM (
    SELECT 'luxury' AS s WHERE "daily_price_grosze" >= 100000
    UNION ALL
    SELECT 'executive' WHERE "category" = 'sedan' AND "daily_price_grosze" >= 50000
    UNION ALL
    SELECT 'premium-suv' WHERE "category" = 'suv' AND "daily_price_grosze" >= 45000
    UNION ALL
    SELECT 'business' WHERE "daily_price_grosze" < 45000 AND "category" <> 'van'
  ) AS picked
) WHERE "segments" = '{}';
