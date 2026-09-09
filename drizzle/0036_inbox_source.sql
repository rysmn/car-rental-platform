CREATE TYPE "public"."request_source" AS ENUM('chat', 'b2b', 'car', 'contact', 'reservation');--> statement-breakpoint
ALTER TABLE "chat_leads" ADD COLUMN "source" "request_source" DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_leads" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_leads" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "chat_leads" ADD COLUMN "reservation_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_leads" ADD CONSTRAINT "chat_leads_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_leads_unread_idx" ON "chat_leads" USING btree ("read_at","created_at");--> statement-breakpoint
CREATE INDEX "chat_leads_source_idx" ON "chat_leads" USING btree ("source","created_at");