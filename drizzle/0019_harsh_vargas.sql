CREATE TYPE "public"."chat_role" AS ENUM('user', 'bot');--> statement-breakpoint
CREATE TYPE "public"."chat_status" AS ENUM('active', 'handoff', 'closed');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contact', 'offer', 'reservation', 'closed');--> statement-breakpoint
CREATE TYPE "public"."reservation_source" AS ENUM('website', 'chatbot', 'admin', 'phone', 'other');--> statement-breakpoint
CREATE TABLE "chat_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"locale" text DEFAULT 'pl' NOT NULL,
	"topic" text,
	"car_model_id" uuid,
	"date_from" date,
	"date_to" date,
	"location_id" uuid,
	"lead_created" boolean DEFAULT false NOT NULL,
	"went_to_booking" boolean DEFAULT false NOT NULL,
	"reservation_id" uuid,
	"message_count" integer DEFAULT 0 NOT NULL,
	"unanswered_count" integer DEFAULT 0 NOT NULL,
	"status" "chat_status" DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid,
	"name" text,
	"phone" text,
	"email" text,
	"car_model_id" uuid,
	"date_from" date,
	"date_to" date,
	"location_id" uuid,
	"topic" text,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"note" text,
	"consent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "chat_role" NOT NULL,
	"body" text NOT NULL,
	"intent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_unanswered" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"normalized" text NOT NULL,
	"locale" text DEFAULT 'pl' NOT NULL,
	"category" text,
	"times" integer DEFAULT 1 NOT NULL,
	"last_asked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "source" "reservation_source" DEFAULT 'website' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_car_model_id_car_models_id_fk" FOREIGN KEY ("car_model_id") REFERENCES "public"."car_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_location_id_pickup_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."pickup_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_leads" ADD CONSTRAINT "chat_leads_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_leads" ADD CONSTRAINT "chat_leads_car_model_id_car_models_id_fk" FOREIGN KEY ("car_model_id") REFERENCES "public"."car_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_leads" ADD CONSTRAINT "chat_leads_location_id_pickup_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."pickup_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_conversations_started_idx" ON "chat_conversations" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "chat_conversations_status_idx" ON "chat_conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "chat_leads_status_idx" ON "chat_leads" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "chat_leads_created_idx" ON "chat_leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_idx" ON "chat_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_unanswered_unique" ON "chat_unanswered" USING btree ("normalized","locale");--> statement-breakpoint
CREATE INDEX "chat_unanswered_times_idx" ON "chat_unanswered" USING btree ("times");