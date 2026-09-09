import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export type AdminBlock = {
  id: string;
  carId: string;
  plate: string | null;
  startDate: string;
  endDate: string;
  reason: string | null;
};

/**
 * Blackout windows for one model's units, soonest first.
 *
 * Past blocks are kept — they are a maintenance record, and hiding them would
 * make a car look permanently free in hindsight — but the caller decides what
 * to show; this returns everything for the model.
 */
export async function listModelBlocks(modelId: string): Promise<AdminBlock[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.availabilityBlocks.id,
      carId: schema.availabilityBlocks.carId,
      plate: schema.cars.plate,
      startDate: schema.availabilityBlocks.startDate,
      endDate: schema.availabilityBlocks.endDate,
      reason: schema.availabilityBlocks.reason,
    })
    .from(schema.availabilityBlocks)
    .innerJoin(schema.cars, eq(schema.availabilityBlocks.carId, schema.cars.id))
    .where(eq(schema.cars.modelId, modelId))
    .orderBy(
      asc(schema.availabilityBlocks.startDate),
      asc(schema.availabilityBlocks.endDate),
    );

  return rows;
}
