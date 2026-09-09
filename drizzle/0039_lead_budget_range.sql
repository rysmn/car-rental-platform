ALTER TABLE "chat_leads" ADD COLUMN "budget_min_grosze" integer;--> statement-breakpoint
ALTER TABLE "chat_leads" ADD COLUMN "budget_kind" text;--> statement-breakpoint
ALTER TABLE "chat_leads" ADD COLUMN "budget_currency" text;--> statement-breakpoint
ALTER TABLE "chat_leads" ADD COLUMN "budget_pln_per_eur" numeric(10, 4);