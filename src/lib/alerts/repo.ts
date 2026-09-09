import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  ALERT_MODULES,
  ALERT_SEVERITIES,
  type AlertModule,
  type AlertSeverity,
  type AlertState,
} from "./types";

/**
 * Reading the register, for the panel.
 *
 * Every query here is bounded. An incident register is the one table that grows
 * without anybody deciding it should — a bad week writes more rows than a good
 * year — and a panel page that says `SELECT *` is fine until the day it is the
 * reason the panel will not load, which is the day of the outage.
 */

export type AlertRow = {
  id: string;
  fingerprint: string;
  severity: AlertSeverity;
  module: AlertModule;
  title: string;
  detail: string | null;
  context: Record<string, unknown> | null;
  firstSeen: Date;
  lastSeen: Date;
  occurrences: number;
  state: AlertState;
  reopenedAt: Date | null;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
};

function rowsOf<T>(result: unknown): T[] {
  const r = result as T[] | { rows?: T[] };
  return Array.isArray(r) ? r : (r.rows ?? []);
}

/** Whatever the row holds, coerced to a value the union actually contains. */
const asSeverity = (v: unknown): AlertSeverity =>
  ALERT_SEVERITIES.includes(v as AlertSeverity)
    ? (v as AlertSeverity)
    : "warning";

const asModule = (v: unknown): AlertModule =>
  ALERT_MODULES.includes(v as AlertModule) ? (v as AlertModule) : "public";

const toRow = (r: Record<string, unknown>): AlertRow => ({
  id: String(r.id),
  fingerprint: String(r.fingerprint),
  severity: asSeverity(r.severity),
  module: asModule(r.module),
  title: String(r.title),
  detail: r.detail == null ? null : String(r.detail),
  context:
    r.context && typeof r.context === "object"
      ? (r.context as Record<string, unknown>)
      : null,
  firstSeen: new Date(String(r.first_seen)),
  lastSeen: new Date(String(r.last_seen)),
  occurrences: Number(r.occurrences) || 1,
  state: (r.state as AlertState) ?? "active",
  reopenedAt: r.reopened_at ? new Date(String(r.reopened_at)) : null,
  acknowledgedAt: r.acknowledged_at ? new Date(String(r.acknowledged_at)) : null,
  resolvedAt: r.resolved_at ? new Date(String(r.resolved_at)) : null,
  resolvedBy: r.resolved_by == null ? null : String(r.resolved_by),
});

/**
 * The panel's list: unresolved first, worst first, freshest first.
 *
 * `include` decides whether resolved alerts are in it at all. They are hidden
 * by default — a resolved alert is history, and history on the page somebody
 * opens during an outage is noise — but reachable, because "did this happen
 * before" is the second question every incident raises.
 */
export async function listAlerts(opts?: {
  includeResolved?: boolean;
  limit?: number;
}): Promise<AlertRow[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);
  const rows = rowsOf<Record<string, unknown>>(
    await getDb().execute(sql`
      SELECT * FROM system_alerts
      ${opts?.includeResolved ? sql`` : sql`WHERE state <> 'resolved'`}
      ORDER BY
        CASE state WHEN 'active' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END,
        CASE severity
          WHEN 'critical' THEN 0 WHEN 'error' THEN 1
          WHEN 'warning' THEN 2 ELSE 3 END,
        last_seen DESC
      LIMIT ${limit}
    `),
  );
  return rows.map(toRow);
}

/**
 * How many unresolved alerts demand attention right now.
 *
 * Its own query rather than `list().length`, because the admin layout renders
 * this on EVERY page and must not pull two hundred rows with their contexts to
 * print one number.
 */
export async function countDemandingAlerts(): Promise<number> {
  const rows = rowsOf<{ n: number }>(
    await getDb().execute(sql`
      SELECT COUNT(*)::int AS n FROM system_alerts
      WHERE state <> 'resolved' AND severity IN ('critical', 'error')
    `),
  );
  return Number(rows[0]?.n) || 0;
}

/** Mark as seen. Idempotent: pressing it twice is not an error. */
export async function acknowledgeAlert(id: string): Promise<void> {
  await getDb().execute(sql`
    UPDATE system_alerts
       SET state = 'acknowledged', acknowledged_at = COALESCE(acknowledged_at, now())
     WHERE id = ${id}::uuid AND state = 'active'
  `);
}

/**
 * Mark as dealt with.
 *
 * Not a delete. The row stays, and if the fault happens again `recordAlert`
 * reopens this same row — which is how "we fixed this in July and it is back"
 * becomes visible instead of looking like a brand-new problem.
 */
export async function resolveAlert(id: string, by: string): Promise<void> {
  await getDb().execute(sql`
    UPDATE system_alerts
       SET state = 'resolved', resolved_at = now(), resolved_by = ${by.slice(0, 200)}
     WHERE id = ${id}::uuid
  `);
}

/** Back to the active list — for an alert closed by mistake. */
export async function reopenAlert(id: string): Promise<void> {
  await getDb().execute(sql`
    UPDATE system_alerts
       SET state = 'active', resolved_at = NULL, resolved_by = NULL,
           reopened_at = now()
     WHERE id = ${id}::uuid
  `);
}
