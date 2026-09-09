CREATE TYPE "public"."recurring_interval" AS ENUM('monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TABLE "recurring_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"car_id" uuid NOT NULL,
	"category" "expense_category" NOT NULL,
	"amount_grosze" integer NOT NULL,
	"interval" "recurring_interval" NOT NULL,
	"start_on" date NOT NULL,
	"end_on" date,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "car_expenses" ADD COLUMN "period_start" date;--> statement-breakpoint
ALTER TABLE "car_expenses" ADD COLUMN "period_end" date;--> statement-breakpoint
ALTER TABLE "car_expenses" ADD COLUMN "recurring_id" uuid;--> statement-breakpoint
ALTER TABLE "car_expenses" ADD COLUMN "invoice_path" text;--> statement-breakpoint
ALTER TABLE "cars" ADD COLUMN "residual_value_grosze" integer;--> statement-breakpoint
ALTER TABLE "cars" ADD COLUMN "depreciation_months" integer;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "start_odometer_km" integer;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "end_odometer_km" integer;--> statement-breakpoint
ALTER TABLE "recurring_costs" ADD CONSTRAINT "recurring_costs_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_costs" ADD CONSTRAINT "recurring_costs_created_by_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_costs_car_id_idx" ON "recurring_costs" USING btree ("car_id");--> statement-breakpoint
ALTER TABLE "car_expenses" ADD CONSTRAINT "car_expenses_recurring_id_recurring_costs_id_fk" FOREIGN KEY ("recurring_id") REFERENCES "public"."recurring_costs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "car_expenses_recurring_period_unique" ON "car_expenses" USING btree ("recurring_id","period_start") WHERE recurring_id IS NOT NULL;