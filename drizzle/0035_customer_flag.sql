CREATE TYPE "public"."customer_flag" AS ENUM('none', 'deposit_only', 'blocked');--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "flag" "customer_flag" DEFAULT 'none' NOT NULL;