ALTER TABLE "chat_conversations" ALTER COLUMN "booking_form_started" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "chat_conversations" ALTER COLUMN "booking_form_started" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "car_opened" boolean;--> statement-breakpoint
-- Every row that already exists was written before anything watched these two
-- stages, so its `false` is not an observation — it is the column's default
-- standing in for a measurement nobody took. Setting them to NULL is what makes
-- "nie mierzyliśmy" distinguishable from "zmierzone i nie nastąpiło", and it is
-- the only direction that is safe to be wrong in: a row wrongly marked
-- unmeasured shrinks a denominator, while a row wrongly marked measured invents
-- a drop in conversion that never happened.
--
-- Only `booking_form_started` needs it. `car_opened` arrives NULL for existing
-- rows already, and new conversations are inserted with `false` in both.
UPDATE "chat_conversations" SET "booking_form_started" = NULL;
