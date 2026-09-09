CREATE TYPE "public"."cleanliness" AS ENUM('clean', 'acceptable', 'dirty');--> statement-breakpoint
CREATE TYPE "public"."handover_kind" AS ENUM('pickup', 'return');--> statement-breakpoint
CREATE TABLE "handover_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handover_id" uuid NOT NULL,
	"code" text NOT NULL,
	"present" boolean NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "reservation_handovers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"kind" "handover_kind" NOT NULL,
	"odometer_km" integer NOT NULL,
	"fuel_eighths" integer NOT NULL,
	"cleanliness" "cleanliness" NOT NULL,
	"keys_count" integer DEFAULT 1 NOT NULL,
	"damage_note" text,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "handover_items" ADD CONSTRAINT "handover_items_handover_id_reservation_handovers_id_fk" FOREIGN KEY ("handover_id") REFERENCES "public"."reservation_handovers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_handovers" ADD CONSTRAINT "reservation_handovers_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_handovers" ADD CONSTRAINT "reservation_handovers_created_by_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "handover_items_one_per_code" ON "handover_items" USING btree ("handover_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_handovers_one_per_kind" ON "reservation_handovers" USING btree ("reservation_id","kind");