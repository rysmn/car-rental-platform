import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { isoDay } from "@/lib/booking/availability";
import { DOCUMENT_KIND_LABEL, type DocumentKind } from "@/lib/admin/stats";
import { pickFrom } from "@/lib/i18n-pick";
import { notifyExpiringDocuments } from "@/lib/email/notify";

/**
 * Expiry reminders for insurance, roadworthiness and the next service.
 *
 * The job is deliberately dumb and idempotent: find every dated obligation
 * inside the notice period that has not already been mailed about, send ONE
 * digest, then write a row per item. Re-running it five minutes later sends
 * nothing, which is what makes it safe to put on a cron and forget.
 */

/** How much notice the operator asked for. */
export const REMINDER_LEAD_DAYS = 5;

/**
 * How far past the date an unanswered obligation keeps being reported.
 *
 * An expired policy is more urgent than one expiring on Friday, so overdue
 * items stay in the digest — but only for a month. Beyond that the car has
 * either been dealt with off-system or parked, and a daily email about a
 * policy that lapsed last spring is how people learn to filter these away.
 * Each (car, kind, date) is still mailed once and once only.
 */
const OVERDUE_GRACE_DAYS = 30;

export type ReminderItem = {
  carId: string;
  plate: string;
  carName: string;
  kind: DocumentKind;
  /** The date being warned about — "YYYY-MM-DD". */
  date: string;
  /** Negative once the date has passed. */
  daysLeft: number;
};

function rowsOf<T>(result: unknown): T[] {
  const r = result as T[] | { rows?: T[] };
  return Array.isArray(r) ? r : (r.rows ?? []);
}

/**
 * What is due and has not been mailed about yet.
 *
 * The anti-join against `reminder_log` is the whole design: the query returns
 * an item exactly once in its life, unless the date itself changes — renewing
 * a policy to a new expiry makes it a new row, and it will be chased again in
 * a year, which is precisely what the operator wants.
 */
export async function findDueReminders(
  leadDays = REMINDER_LEAD_DAYS,
): Promise<ReminderItem[]> {
  const rows = rowsOf<{
    car_id: string;
    plate: string;
    car_name: string;
    kind: DocumentKind;
    date: string | Date;
    days_left: number;
  }>(
    await getDb().execute(sql`
      SELECT c.id AS car_id, c.plate,
             cm.brand || ' ' || cm.model AS car_name,
             k.kind, k.date,
             (k.date - CURRENT_DATE) AS days_left
      FROM cars c
      JOIN car_models cm ON cm.id = c.model_id
      CROSS JOIN LATERAL (
        VALUES ('insurance', c.insurance_expiry),
               ('inspection', c.inspection_expiry),
               ('service', c.service_due)
      ) AS k(kind, date)
      WHERE k.date IS NOT NULL
        -- The casts are load-bearing: drizzle sends these as untyped
        -- parameters, and date plus unknown has no operator, so without them
        -- the statement fails at plan time rather than returning nothing.
        AND k.date <= CURRENT_DATE + ${leadDays}::int
        AND k.date >= CURRENT_DATE - ${OVERDUE_GRACE_DAYS}::int
        AND NOT EXISTS (
          SELECT 1 FROM reminder_log rl
          WHERE rl.car_id = c.id
            AND rl.kind::text = k.kind
            AND rl.due_date = k.date
        )
      ORDER BY k.date ASC, c.plate ASC
    `),
  );

  return rows.map((r) => ({
    carId: r.car_id,
    plate: r.plate,
    carName: r.car_name,
    kind: r.kind,
    date: r.date instanceof Date ? isoDay(r.date) : String(r.date).slice(0, 10),
    daysLeft: Number(r.days_left),
  }));
}

/** Record that these items have been mailed about, so tomorrow's run skips them. */
async function markSent(items: ReminderItem[]): Promise<void> {
  if (items.length === 0) return;
  const values = sql.join(
    items.map(
      (i) => sql`(${i.carId}::uuid, ${i.kind}::reminder_kind, ${i.date}::date)`,
    ),
    sql`, `,
  );
  await getDb().execute(sql`
    INSERT INTO reminder_log (car_id, kind, due_date)
    VALUES ${values}
    ON CONFLICT (car_id, kind, due_date) DO NOTHING
  `);
}

export type ReminderRun = {
  found: number;
  sent: boolean;
  items: ReminderItem[];
};

/**
 * Find, mail, record — in that order, and the order matters.
 *
 * Nothing is marked as sent unless the mail actually left, so a mail outage
 * delays the reminder by a day instead of silently swallowing it. The reverse
 * order would lose the only warning the operator gets.
 */
export async function runDueReminders(
  leadDays = REMINDER_LEAD_DAYS,
): Promise<ReminderRun> {
  const items = await findDueReminders(leadDays);
  if (items.length === 0) return { found: 0, sent: false, items: [] };

  const sent = await notifyExpiringDocuments(
    items.map((i) => ({
      plate: i.plate,
      carName: i.carName,
      kindLabel: reminderLabel(i.kind),
      date: i.date,
      daysLeft: i.daysLeft,
    })),
    leadDays,
  );
  if (sent) await markSent(items);

  return { found: items.length, sent, items };
}

/**
 * "OC/AC", "Przegląd", "Serwis". The reminder mail is Polish-only (see
 * lib/email), so this is pinned to "pl" rather than the request locale.
 */
export const reminderLabel = (kind: DocumentKind) =>
  pickFrom(DOCUMENT_KIND_LABEL, kind, "pl");
