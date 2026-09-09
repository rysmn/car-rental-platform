CREATE TYPE "public"."damage_status" AS ENUM('reported', 'assessment', 'repair', 'insurer', 'closed');--> statement-breakpoint
CREATE TABLE "damage_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"damage_id" uuid NOT NULL,
	"url" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "damages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"car_id" uuid NOT NULL,
	"reservation_id" uuid,
	"customer_id" uuid,
	"occurred_on" date NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "damage_status" DEFAULT 'reported' NOT NULL,
	"repair_cost_grosze" integer DEFAULT 0 NOT NULL,
	"excess_grosze" integer DEFAULT 0 NOT NULL,
	"insurer" text,
	"claim_number" text,
	"closed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "damage_photos" ADD CONSTRAINT "damage_photos_damage_id_damages_id_fk" FOREIGN KEY ("damage_id") REFERENCES "public"."damages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damages" ADD CONSTRAINT "damages_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damages" ADD CONSTRAINT "damages_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damages" ADD CONSTRAINT "damages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damages" ADD CONSTRAINT "damages_created_by_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "damage_photos_damage_idx" ON "damage_photos" USING btree ("damage_id");--> statement-breakpoint
CREATE INDEX "damages_car_idx" ON "damages" USING btree ("car_id");--> statement-breakpoint
CREATE INDEX "damages_status_idx" ON "damages" USING btree ("status");