import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fingerprintOf } from "./fingerprint";
import { describeError, redactText, redactValue } from "./redact";
import type { AlertModule, AlertSeverity } from "./types";

/**
 * The single door into the alert register.
 *
 * Everything that reports a failure comes through here, and the shape of this
 * function is decided by one rule: **recording a failure must never cause
 * one.** It is called from inside catch blocks — from the reservation handler,
 * from the chat route, from a media request — and if it could throw, the alert
 * system would turn a handled error into an unhandled one, taking down the
 * exact path it exists to observe. So every failure inside it is swallowed and
 * the original error keeps propagating to its own handler.
 *
 * That is also why it is fire-and-forget by default: an alert is not part of
 * the customer's transaction and must not add a round trip to their wait. The
 * caller may await it (the tests do, and the health check does) but nothing on
 * a request path should.
 *
 * ## Recurrence
 *
 * One row per fingerprint, always. A repeat bumps `last_seen` and
 * `occurrences`, and — this is the part worth being deliberate about — a repeat
 * of an alert somebody had already RESOLVED reopens it and stamps
 * `reopened_at`. Any other behaviour is worse:
 *
 *   · leaving it resolved hides a fault that came back, which is the single
 *     most dangerous state an incident register can be in;
 *   · inserting a second row loses the history of the first, so nobody can see
 *     that this is the third time this month.
 *
 * An ACKNOWLEDGED alert ("I've seen it, I'm working on it") is left
 * acknowledged: it recurring is not news, it is the thing being worked on.
 *
 * The whole update is one statement with `ON CONFLICT`, so two requests failing
 * in the same instant are counted twice rather than racing to insert.
 */
export type AlertInput = {
  module: AlertModule;
  severity: AlertSeverity;
  /**
   * Stable identity of the failure — see `fingerprintOf`. Two different faults
   * must not share one; the same fault recurring must not vary it.
   */
  key: string;
  /** One line an operator can act on. Shown as the card's heading. */
  title: string;
  /** Free text: a message, a path, a query. Redacted before storage. */
  detail?: string;
  /** Structured extras. Redacted, depth-limited, secret keys dropped. */
  context?: Record<string, unknown>;
  /** Convenience: an unknown thrown thing, reduced to `detail`. */
  error?: unknown;
};

/**
 * Write, or count. Resolves to the alert's id, or null when it could not be
 * recorded — which is itself never an error the caller has to handle.
 */
export async function recordAlert(input: AlertInput): Promise<string | null> {
  try {
    const fingerprint = fingerprintOf(input);
    const detail = redactText(
      [input.detail, input.error !== undefined ? describeError(input.error) : ""]
        .filter(Boolean)
        .join(" · "),
    );
    const context = input.context
      ? (redactValue(input.context) as Record<string, unknown>)
      : null;

    const rows = (await getDb().execute(sql`
      INSERT INTO system_alerts
        (fingerprint, severity, module, title, detail, context)
      VALUES (
        ${fingerprint},
        ${input.severity}::alert_severity,
        ${input.module},
        ${redactText(input.title, 300)},
        ${detail || null},
        ${context ? JSON.stringify(context) : null}::jsonb
      )
      ON CONFLICT (fingerprint) DO UPDATE SET
        last_seen   = now(),
        occurrences = system_alerts.occurrences + 1,
        -- Freshest detail wins: the latest failure is the one an operator is
        -- about to investigate, and the older text is still in the log.
        detail      = EXCLUDED.detail,
        context     = EXCLUDED.context,
        severity    = EXCLUDED.severity,
        title       = EXCLUDED.title,
        -- Resolved → active again, and stamped. Acknowledged stays acknowledged.
        state       = CASE WHEN system_alerts.state = 'resolved'
                           THEN 'active'::alert_state ELSE system_alerts.state END,
        reopened_at = CASE WHEN system_alerts.state = 'resolved'
                           THEN now() ELSE system_alerts.reopened_at END,
        resolved_at = CASE WHEN system_alerts.state = 'resolved'
                           THEN NULL ELSE system_alerts.resolved_at END,
        resolved_by = CASE WHEN system_alerts.state = 'resolved'
                           THEN NULL ELSE system_alerts.resolved_by END
      RETURNING id
    `)) as unknown as { id: string }[] | { rows?: { id: string }[] };

    const list = Array.isArray(rows) ? rows : (rows.rows ?? []);
    return list[0]?.id ?? null;
  } catch (e) {
    // The register is down. Say so where it cannot make things worse — the
    // container log — and let the caller carry on with its own error.
    console.error("[alerts] nie udało się zapisać alertu:", e);
    return null;
  }
}

/**
 * Fire-and-forget wrapper for request paths.
 *
 * Same contract, no await, no rejection. Exists so a call site inside a catch
 * block reads as one line and cannot be accidentally left unawaited in a way
 * that produces an unhandled rejection warning.
 */
export function reportAlert(input: AlertInput): void {
  void recordAlert(input).catch(() => {});
}
