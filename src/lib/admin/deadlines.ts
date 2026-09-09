import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export * from "./deadline-options";

/** Every obligation on one car, open ones first, oldest deadline at the top. */
export async function listDeadlines(carId: string) {
  return getDb()
    .select()
    .from(schema.carDeadlines)
    .where(eq(schema.carDeadlines.carId, carId))
    .orderBy(asc(schema.carDeadlines.doneAt), asc(schema.carDeadlines.dueOn));
}

/** Open obligations across the fleet — what the alert list reads. */
export async function openDeadlines() {
  return getDb()
    .select()
    .from(schema.carDeadlines)
    .where(isNull(schema.carDeadlines.doneAt))
    .orderBy(asc(schema.carDeadlines.dueOn));
}

export async function markDone(id: string, carId: string) {
  await getDb()
    .update(schema.carDeadlines)
    .set({ doneAt: new Date() })
    .where(
      and(eq(schema.carDeadlines.id, id), eq(schema.carDeadlines.carId, carId)),
    );
}
