ALTER TABLE "car_models" ADD COLUMN "driver_class" text;--> statement-breakpoint
-- Assignment approved by the owner on 2026-08-20 (three classes: Standard,
-- Premium, Van/Bus). Written here rather than left to the panel so the same
-- fleet ends up in the same classes on every environment, and so the state the
-- owner approved is reproducible from the repository.
--
-- Volvo XC60 is Premium on the strength of the owner's earlier message; the
-- later list omitted it entirely. Flagged in the report — one click in
-- Admin → Zasady wynajmu changes it, and no code knows about it.
--
-- Matched by slug and only where the class is still unset, so a class an
-- administrator has already chosen is never overwritten.
UPDATE "car_models" SET "driver_class" = 'standard'
 WHERE "driver_class" IS NULL AND "slug" IN ('toyota-rav4', 'volkswagen-tiguan-highline');--> statement-breakpoint
UPDATE "car_models" SET "driver_class" = 'premium'
 WHERE "driver_class" IS NULL AND "slug" IN (
   'tesla-model-s', 'bmw-740d', 'jaguar-i-pace', 'porsche-panamera-turbo-4s',
   'tesla-model-x', 'mercedes-gle-350-de-4matic', 'volvo-xc60'
 );--> statement-breakpoint
UPDATE "car_models" SET "driver_class" = 'van_bus'
 WHERE "driver_class" IS NULL AND "slug" IN ('renault-trafic');
