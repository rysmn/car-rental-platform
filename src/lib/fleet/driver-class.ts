/**
 * Which set of driver requirements a car falls under.
 *
 * Three classes, decided by the owner on 2026-08-20: a RAV4 and a 9-seat
 * Trafic are not the same risk, and neither is a Panamera. The thresholds
 * themselves — how old the driver must be, how long they must have held a
 * licence — are NOT here. They live in Admin → Zasady wynajmu, because they
 * are a company decision that changes without a deployment. This module only
 * names the buckets.
 *
 * The class of a given car is stored on the car (`car_models.driver_class`),
 * not in the rule, so a model added in the fleet panel gets its class in the
 * same form that creates it and cannot quietly exist without one.
 *
 * Deliberately NOT a Postgres enum and deliberately importable by client
 * components: the column is plain text so a fourth class stays a data change,
 * and the fleet form needs these labels in the browser.
 */
export const DRIVER_CLASSES = ["standard", "premium", "van_bus"] as const;

export type DriverClass = (typeof DRIVER_CLASSES)[number];

export const DRIVER_CLASS_LABEL: Record<DriverClass, string> = {
  standard: "Standard",
  premium: "Premium",
  van_bus: "Van / Bus",
};

/** Wording for the public side, where "van_bus" would read as a database key. */
export const DRIVER_CLASS_PUBLIC: Record<DriverClass, { pl: string; en: string }> = {
  standard: { pl: "Standard", en: "Standard" },
  premium: { pl: "Premium", en: "Premium" },
  van_bus: { pl: "Van / Bus", en: "Van / Bus" },
};

export function isDriverClass(value: unknown): value is DriverClass {
  return (
    typeof value === "string" &&
    (DRIVER_CLASSES as readonly string[]).includes(value)
  );
}

/** A stored value that may predate the column, or be a stale key from a form. */
export function toDriverClass(value: unknown): DriverClass | null {
  return isDriverClass(value) ? value : null;
}
