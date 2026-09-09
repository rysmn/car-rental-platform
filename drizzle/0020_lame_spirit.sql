CREATE TABLE "ai_usage_daily" (
	"day" date PRIMARY KEY NOT NULL,
	"neurons" integer DEFAULT 0 NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"fallbacks" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
