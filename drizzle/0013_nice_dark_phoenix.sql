CREATE TYPE "public"."payment_method" AS ENUM('cash', 'card', 'transfer', 'online');--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"phone_display" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "payment_method" "payment_method";--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("name");--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;