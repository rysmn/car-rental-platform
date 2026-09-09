import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/admin/settings";
import { pickModelState, resolveFleetState, type FleetState } from "./status";

/**
 * Today's state of every model, for the public cards.
 *
 * ## The same facts the panel reads, asked once
 *
 * The predicate below is `getFleetStatus`'s, unit for unit: a confirmed or
 * completed reservation covering today makes a car rented, an availability
 * block covering today blocks it, a confirmed reservation starting inside the
 * next fortnight reserves it, and `cars.status` in ('service','damaged') puts it
 * in the garage ahead of all of that. What is different is only the shape of the
 * answer — the panel wants a row per physical car, a card wants one line per
 * model — and the folding is `pickModelState`, not a second set of rules.
 *
 * One query for the whole grid. A fleet page renders a dozen cards and asking
 * per card would be a dozen round trips for a line of text.
 *
 * ## What this is NOT
 *
 * It is not availability. It says nothing about any date except today, and the
 * fleet grid already filters by the Availability Engine when a visitor has
 * chosen dates. Reading a green dot as "free on the 12th" is the mistake §36
 * exists to prevent, so the two never travel as one value: `PublicModelState`
 * keeps them in separate fields.
 */

/** How far ahead a confirmed booking makes a car "reserved" rather than free. */
const RESERVED_SOON_DAYS = 14;

function rowsOf<T>(result: unknown): T[] {
  const r = result as T[] | { rows?: T[] };
  return Array.isArray(r) ? r : (r.rows ?? []);
}

/**
 * `modelId → state`. Models with no units are absent rather than present with a
 * guess, and the cards show nothing for them.
 *
 * Never throws: a status line is the least important thing on a car card, and a
 * database hiccup must not be able to take the fleet page down for it. On any
 * failure the map comes back empty and every card renders exactly as it did
 * before this feature existed.
 */
export async function getPublicModelStates(): Promise<Map<string, FleetState>> {
  try {
    const rows = rowsOf<{
      model_id: string;
      in_garage: boolean;
      rented: boolean;
      blocked: boolean;
      reserved: boolean;
    }>(
      await getDb().execute(sql`
        SELECT c.model_id::text AS model_id,
               (c.status IN ('service','damaged')) AS in_garage,
               EXISTS (
                 SELECT 1 FROM reservations r
                 WHERE r.car_id = c.id
                   AND r.status IN ('confirmed','completed')
                   AND CURRENT_DATE BETWEEN r.start_date AND r.end_date
               ) AS rented,
               EXISTS (
                 SELECT 1 FROM availability_blocks ab
                 WHERE ab.car_id = c.id
                   AND CURRENT_DATE BETWEEN ab.start_date AND ab.end_date
               ) AS blocked,
               EXISTS (
                 SELECT 1 FROM reservations r
                 WHERE r.car_id = c.id
                   AND r.status = 'confirmed'
                   AND r.start_date > CURRENT_DATE
                   AND r.start_date <= CURRENT_DATE + ${RESERVED_SOON_DAYS}::int
               ) AS reserved
        FROM cars c
      `),
    );

    const byModel = new Map<string, FleetState[]>();
    for (const r of rows) {
      const state = resolveFleetState({
        inGarage: Boolean(r.in_garage),
        rented: Boolean(r.rented),
        blocked: Boolean(r.blocked),
        reserved: Boolean(r.reserved),
      });
      const list = byModel.get(r.model_id);
      if (list) list.push(state);
      else byModel.set(r.model_id, [state]);
    }

    const out = new Map<string, FleetState>();
    for (const [modelId, states] of byModel) {
      const picked = pickModelState(states);
      if (picked) out.set(modelId, picked);
    }
    return out;
  } catch {
    return new Map();
  }
}

/**
 * The statuses the public site may render, or an empty map when the operator has
 * switched the display off.
 *
 * The switch is read HERE rather than at each of the four places that draws a
 * status, so "off" cannot mean "off everywhere except the one surface somebody
 * forgot". It hides a line of text and nothing else: the availability filter on
 * the fleet grid, the booking form's own checks and the assistant all read the
 * Availability Engine directly and never come through this function. Turning it
 * off cannot produce a booking that should not have been possible — §45.
 */
export async function getVisiblePublicModelStates(): Promise<
  Map<string, FleetState>
> {
  const setting = await getSetting("publicStatus");
  if (!setting.enabled) return new Map();
  return getPublicModelStates();
}
