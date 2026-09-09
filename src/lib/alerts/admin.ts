import "server-only";
import { reportAlert } from "./record";

/**
 * One admin Server Action failed. Log it exactly as before, and record it.
 *
 * This exists because there were fifty-seven `console.error("<action> failed:",
 * err)` sites across the panel and not one of them left a trace an operator
 * could see. The panel's own failure mode is the quiet one: an administrator
 * presses Save, gets "Wystąpił błąd. Spróbuj ponownie.", tries once more,
 * gives up, and nobody finds out until somebody notices the price never
 * changed. The console line is in a container log that nobody reads on the day
 * it matters.
 *
 * Deliberately a drop-in for the line it replaces rather than a wrapper around
 * every action. Wrapping fifty-seven functions would be a refactor of working
 * code for the sake of instrumentation; replacing the log line changes nothing
 * about control flow, keeps the identical console output, and can be read at
 * every call site as "this failed" without following an abstraction.
 *
 * ERROR, not CRITICAL: the panel is up, one operation is not.
 */
export function adminActionFailed(
  action: string,
  err: unknown,
  context?: Record<string, unknown>,
): void {
  console.error(`${action} failed:`, err);
  reportAlert({
    module: "admin",
    severity: "error",
    // Per action, not per attempt — the twentieth failed save of the same
    // form is the same fault, and should read as "20×", not as twenty cards.
    key: `admin:${action}`,
    title: `Operacja w panelu nie powiodła się: ${action}`,
    error: err,
    context,
  });
}
