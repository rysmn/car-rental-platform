CREATE TYPE "public"."business_expense_category" AS ENUM('ads_google', 'ads_facebook', 'ads_instagram', 'ads_tiktok', 'marketing_other', 'parking', 'rent', 'utilities', 'office', 'accounting', 'legal', 'phone', 'software', 'domain', 'website', 'cleaning', 'fuel', 'tools', 'salary', 'contractor', 'training', 'bank', 'insurance', 'tax', 'zus', 'other');--> statement-breakpoint
CREATE TABLE "business_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "business_expense_category" NOT NULL,
	"amount_grosze" integer NOT NULL,
	"incurred_on" date NOT NULL,
	"period_start" date,
	"period_end" date,
	"recurring_id" uuid,
	"vendor" text,
	"invoice_path" text,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_recurring_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "business_expense_category" NOT NULL,
	"amount_grosze" integer NOT NULL,
	"interval" "recurring_interval" NOT NULL,
	"start_on" date NOT NULL,
	"end_on" date,
	"vendor" text,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_expenses" ADD CONSTRAINT "business_expenses_recurring_id_business_recurring_costs_id_fk" FOREIGN KEY ("recurring_id") REFERENCES "public"."business_recurring_costs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_expenses" ADD CONSTRAINT "business_expenses_created_by_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_recurring_costs" ADD CONSTRAINT "business_recurring_costs_created_by_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_expenses_incurred_idx" ON "business_expenses" USING btree ("incurred_on");--> statement-breakpoint
CREATE INDEX "business_expenses_category_idx" ON "business_expenses" USING btree ("category","incurred_on");--> statement-breakpoint
CREATE UNIQUE INDEX "business_expenses_recurring_period_unique" ON "business_expenses" USING btree ("recurring_id","period_start") WHERE recurring_id IS NOT NULL;