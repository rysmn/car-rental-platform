ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_phone_unique";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_phone_idx" ON "customers" ("phone");
