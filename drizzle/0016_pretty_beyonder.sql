CREATE TYPE "public"."deadline_kind" AS ENUM('fine', 'damage', 'deposit_take', 'deposit_return', 'prep', 'other');--> statement-breakpoint
CREATE TABLE "car_deadlines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"car_id" uuid NOT NULL,
	"kind" "deadline_kind" NOT NULL,
	"title" text NOT NULL,
	"due_on" date NOT NULL,
	"amount_grosze" integer,
	"note" text,
	"done_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cars" ADD COLUMN "ac_expiry" date;--> statement-breakpoint
ALTER TABLE "car_deadlines" ADD CONSTRAINT "car_deadlines_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_deadlines" ADD CONSTRAINT "car_deadlines_created_by_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "car_deadlines_due_idx" ON "car_deadlines" USING btree ("due_on");