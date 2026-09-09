CREATE TYPE "public"."expense_category" AS ENUM('oil', 'filters', 'tyres', 'brakes', 'service', 'mechanical', 'electrical', 'bodywork', 'inspection', 'insurance', 'leasing', 'tax', 'parking', 'fuel', 'cleaning', 'equipment', 'fine', 'other');--> statement-breakpoint
CREATE TABLE "car_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"car_id" uuid NOT NULL,
	"category" "expense_category" NOT NULL,
	"amount_grosze" integer NOT NULL,
	"incurred_on" date NOT NULL,
	"odometer_km" integer,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cars" ADD COLUMN "purchase_price_grosze" integer;--> statement-breakpoint
ALTER TABLE "cars" ADD COLUMN "purchased_on" date;--> statement-breakpoint
ALTER TABLE "car_expenses" ADD CONSTRAINT "car_expenses_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_expenses" ADD CONSTRAINT "car_expenses_created_by_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "car_expenses_car_id_incurred_idx" ON "car_expenses" USING btree ("car_id","incurred_on");--> statement-breakpoint
CREATE INDEX "car_expenses_incurred_idx" ON "car_expenses" USING btree ("incurred_on");