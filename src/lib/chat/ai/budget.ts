import "server-only";
// Pisze i czyta `ai_usage_daily` — bezpiecznik kosztowy darmowego limitu.
// Nie ma czego szukać po stronie klienta.
import { sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { FREE_NEURONS_PER_DAY } from "./cloudflare";

/**
 * The daily ceiling, held in the database so every container shares one.
 *
 * Cloudflare stops at 10,000 neurons a day by returning 429, and a 429 is
 * already handled — the deterministic parser takes over and nobody is billed,
 * because billing would require Workers Paid. So this is not what protects the
 * money; the plan is.
 *
 * What this protects is the customer. Running until the provider slams the door
 * means the last visitors of the day each pay a wasted network round-trip
 * before the fallback answers them. Stopping early, on our own terms, means the
 * AI layer switches off while it is still working and the assistant simply gets
 * faster. The reserve also leaves room for the day's traffic to be mismeasured
 * without the estimate turning into an outage.
 *
 * ## Why it lives in Postgres
 *
 * The first version counted in process memory. That is correct for exactly one
 * container and wrong the moment there are two: each gets its own private
 * allowance, and together they spend twice the cap. It also forgot everything
 * on restart, so a container that crashed at 19:00 would happily start the
 * evening again from zero.
 *
 * Postgres is already in the stack, already backed up, and already the thing
 * every container agrees with. No new service, no new cost.
 *
 * ## Why reserve-then-settle
 *
 * The obvious shape — read the counter, decide, call, add the cost — has a race
 * in the gap between reading and adding. Two containers both read 7,990, both
 * decide there is room, and the day ends at 8,060.
 *
 * So nothing is ever read before deciding. `reserve()` is a single statement
 * that adds the estimated cost **and** enforces the cap in the same breath; if
 * the row would exceed the cap, the statement matches nothing and returns
 * nothing. Postgres serialises concurrent upserts on the same primary key, so
 * the losing container simply sees "no room" and falls back. `settle()` then
 * corrects the reservation to what the call really cost.
 */

/** 80% of the free allocation. The remaining fifth is never spent on purpose. */
export const DAILY_NEURON_CAP = Math.floor(FREE_NEURONS_PER_DAY * 0.8);

/**
 * What one call is assumed to cost before we know.
 *
 * Measured, not guessed: 70B averaged ~35 neurons across the 200-sentence
 * suite. It is deliberately a little generous — an estimate that is too low
 * lets more calls through the gate than the cap intends, and only the
 * settlement afterwards would notice.
 */
export const ESTIMATED_NEURONS_PER_CALL = 35;

/** The UTC day, decided by Postgres so every container agrees. */
const TODAY = sql`(now() AT TIME ZONE 'utc')::date`;

export type Reservation =
  | { granted: true; reserved: number; spentAfter: number }
  | { granted: false; reason: "daily_cap" };

/**
 * Claim room for one call, or find out there is none.
 *
 * Returns `granted: false` when today's spending would pass the cap. The caller
 * must then use the deterministic parser — which it was going to do anyway on
 * any other failure, so there is no new path to get wrong.
 */
export async function reserve(
  db: Database,
  estimate: number = ESTIMATED_NEURONS_PER_CALL,
): Promise<Reservation> {
  const cost = Math.max(1, Math.ceil(estimate));
  // A single call that cannot fit under the cap on an empty day would otherwise
  // slip through on the INSERT branch, where there is no previous row to test.
  if (cost > DAILY_NEURON_CAP) return { granted: false, reason: "daily_cap" };

  const rows = await db.execute<{ neurons: number }>(sql`
    INSERT INTO ai_usage_daily AS u (day, neurons, calls, fallbacks)
    VALUES (${TODAY}, ${cost}, 0, 0)
    ON CONFLICT (day) DO UPDATE
      SET neurons = u.neurons + ${cost}, updated_at = now()
      WHERE u.neurons + ${cost} <= ${DAILY_NEURON_CAP}
    RETURNING neurons
  `);

  const row = rows[0];
  if (!row) return { granted: false, reason: "daily_cap" };
  return {
    granted: true,
    reserved: cost,
    spentAfter: Number(row.neurons),
  };
}

/**
 * Correct a reservation to what the call actually cost, and count it.
 *
 * `actualNeurons` is `null` when the call failed without reporting usage. The
 * reservation is then KEPT rather than refunded, which is deliberate: we cannot
 * know whether Cloudflare did the work before the timeout, and a provider that
 * is failing repeatedly should be allowed to exhaust its own budget and stop
 * being called. Refunding would turn a broken provider into an infinite retry
 * loop against a third party.
 */
export async function settle(
  db: Database,
  reserved: number,
  actualNeurons: number | null,
  usedFallback: boolean,
): Promise<void> {
  const actual = actualNeurons === null ? reserved : Math.ceil(actualNeurons);
  const delta = actual - reserved;
  await db.execute(sql`
    UPDATE ai_usage_daily
    SET neurons = GREATEST(0, neurons + ${delta}),
        calls = calls + 1,
        fallbacks = fallbacks + ${usedFallback ? 1 : 0},
        updated_at = now()
    WHERE day = ${TODAY}
  `);
}

/** Give the room back. Only for calls we are certain never left this process. */
export async function release(
  db: Database,
  reserved: number,
  usedFallback: boolean,
): Promise<void> {
  await db.execute(sql`
    UPDATE ai_usage_daily
    SET neurons = GREATEST(0, neurons - ${reserved}),
        fallbacks = fallbacks + ${usedFallback ? 1 : 0},
        updated_at = now()
    WHERE day = ${TODAY}
  `);
}

export type UsageToday = {
  day: string;
  neurons: number;
  calls: number;
  fallbacks: number;
  cap: number;
  remaining: number;
};

/** What the admin panel shows. Read-only; never creates the day's row. */
export async function usageToday(db: Database): Promise<UsageToday> {
  const rows = await db.execute<{
    day: string;
    neurons: number;
    calls: number;
    fallbacks: number;
  }>(sql`
    SELECT to_char(day, 'YYYY-MM-DD') AS day, neurons, calls, fallbacks
    FROM ai_usage_daily
    WHERE day = ${TODAY}
  `);
  const row = rows[0];
  const neurons = row ? Number(row.neurons) : 0;
  return {
    day: row?.day ?? new Date().toISOString().slice(0, 10),
    neurons,
    calls: row ? Number(row.calls) : 0,
    fallbacks: row ? Number(row.fallbacks) : 0,
    cap: DAILY_NEURON_CAP,
    remaining: Math.max(0, DAILY_NEURON_CAP - neurons),
  };
}

/**
 * When the allowance comes back.
 *
 * Cloudflare resets at 00:00 UTC and so do we, so the answer is the next
 * midnight UTC — stated rather than computed from a local clock, because the
 * admin panel is read by people in Warsaw and "resets at midnight" would be two
 * hours wrong for half the year.
 */
export function nextResetUtc(now: Date): Date {
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}
