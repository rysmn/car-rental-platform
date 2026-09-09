CREATE TABLE "reservation_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"amount_grosze" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"paid_on" date NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cars" ADD COLUMN "service_interval_km" integer;--> statement-breakpoint
ALTER TABLE "cars" ADD COLUMN "last_service_km" integer;--> statement-breakpoint
ALTER TABLE "reservation_payments" ADD CONSTRAINT "reservation_payments_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_payments" ADD CONSTRAINT "reservation_payments_created_by_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservation_payments_reservation_idx" ON "reservation_payments" USING btree ("reservation_id");