CREATE TYPE "public"."lead_reason" AS ENUM('human_request', 'b2b', 'long_term', 'non_fleet', 'car_enquiry', 'booking_help', 'price_offer', 'rules_question', 'emergency', 'reservation_question', 'general');--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'waiting_customer' BEFORE 'closed';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'spam';--> statement-breakpoint
ALTER TABLE "chat_leads" ADD COLUMN "reason" "lead_reason";--> statement-breakpoint
ALTER TABLE "chat_leads" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "chat_leads_conversation_idx" ON "chat_leads" USING btree ("conversation_id");