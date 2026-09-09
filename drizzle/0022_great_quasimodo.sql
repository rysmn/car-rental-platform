CREATE TYPE "public"."demand_kind" AS ENUM('model', 'brand', 'segment');--> statement-breakpoint
CREATE TYPE "public"."faq_draft_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "chat_demand" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid,
	"kind" "demand_kind" NOT NULL,
	"brand" text,
	"model" text,
	"segment" text,
	"seats" integer,
	"gearbox" text,
	"fuel" text,
	"label" text NOT NULL,
	"normalized" text NOT NULL,
	"in_fleet" boolean DEFAULT false NOT NULL,
	"unavailable" boolean DEFAULT false NOT NULL,
	"alternatives_shown" boolean DEFAULT false NOT NULL,
	"date_from" date,
	"date_to" date,
	"locale" text DEFAULT 'pl' NOT NULL,
	"times" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_faq" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"locale" text DEFAULT 'pl' NOT NULL,
	"question" text NOT NULL,
	"answer" text DEFAULT '' NOT NULL,
	"status" "faq_draft_status" DEFAULT 'draft' NOT NULL,
	"source_question" text,
	"created_by" text,
	"published_by" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "searched_car" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "matched_car" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "saw_price" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "alternatives_shown" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "ai_used" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "ai_fallback" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_unanswered" ADD COLUMN "intent" text;--> statement-breakpoint
ALTER TABLE "chat_unanswered" ADD COLUMN "answered_later" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_unanswered" ADD COLUMN "went_to_human" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_demand" ADD CONSTRAINT "chat_demand_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_demand_unique" ON "chat_demand" USING btree ("conversation_id","normalized");--> statement-breakpoint
CREATE INDEX "chat_demand_created_idx" ON "chat_demand" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chat_demand_fleet_idx" ON "chat_demand" USING btree ("in_fleet","created_at");--> statement-breakpoint
CREATE INDEX "chat_demand_normalized_idx" ON "chat_demand" USING btree ("normalized");--> statement-breakpoint
CREATE INDEX "chat_faq_status_idx" ON "chat_faq" USING btree ("status","locale");