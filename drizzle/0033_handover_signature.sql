ALTER TABLE "reservation_handovers" ADD COLUMN "signature_url" text;--> statement-breakpoint
ALTER TABLE "reservation_handovers" ADD COLUMN "signed_by_name" text;--> statement-breakpoint
ALTER TABLE "reservation_handovers" ADD COLUMN "signed_at" timestamp with time zone;