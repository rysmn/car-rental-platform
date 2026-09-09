CREATE TYPE "public"."deposit_status" AS ENUM('to_take', 'held', 'blocked', 'to_return', 'returned', 'partially_kept');--> statement-breakpoint
CREATE TABLE "reservation_deposit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"status" "deposit_status" NOT NULL,
	"amount_grosze" integer DEFAULT 0 NOT NULL,
	"kept_grosze" integer DEFAULT 0 NOT NULL,
	"method" "payment_method",
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservation_deposit_events" ADD CONSTRAINT "reservation_deposit_events_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_deposit_events" ADD CONSTRAINT "reservation_deposit_events_created_by_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservation_deposit_events_reservation_idx" ON "reservation_deposit_events" USING btree ("reservation_id","created_at");