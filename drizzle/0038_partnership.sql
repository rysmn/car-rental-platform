ALTER TYPE "public"."lead_reason" ADD VALUE 'partnership' BEFORE 'general';--> statement-breakpoint
ALTER TABLE "chat_leads" ADD COLUMN "company" text;--> statement-breakpoint
ALTER TABLE "chat_leads" ADD COLUMN "partner_model" text;--> statement-breakpoint
ALTER TABLE "chat_leads" ADD COLUMN "invest_range" text;