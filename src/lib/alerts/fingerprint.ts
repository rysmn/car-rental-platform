import { createHash } from "node:crypto";
import type { AlertModule, AlertSeverity } from "./types";

/**
 * The identity of a failure — the one thing that decides whether the hundredth
 * occurrence is a counter or a hundredth card.
 *
 * Everything about deduplication reduces to a single judgement: which parts of
 * a failure are the failure, and which parts are the occasion. Module,
 * severity and what broke are the failure. The time, the request, the customer
 * and the id of the row being written are the occasion. Put an occasion in the
 * fingerprint and the register fills with near-identical rows; leave the
 * failure out and two unrelated faults merge into one and the second becomes
 * invisible.
 *
 * The caller passes `key` — a short, stable description of what broke, chosen
 * by hand at the call site. Hand-chosen rather than derived from the error
 * message, because messages carry ids ("car 7f3a… not found") and a derived
 * fingerprint would then be per-car. Where per-car IS the right grain — a
 * specific missing photo file — the caller puts that id in `key` deliberately.
 *
 * Hashed rather than stored raw so the column has a bounded width whatever the
 * caller passes, and prefixed with the module so a row is still readable in a
 * database dump without joining anything.
 */
export function fingerprintOf(input: {
  module: AlertModule;
  severity: AlertSeverity;
  key: string;
}): string {
  const canonical = `${input.module}|${input.severity}|${input.key
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")}`;
  const digest = createHash("sha256")
    .update(canonical)
    .digest("hex")
    .slice(0, 24);
  return `${input.module}:${digest}`;
}
