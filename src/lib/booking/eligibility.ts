import type { DriverLimits } from "@/lib/admin/rental-rules";

/**
 * Does this driver meet the requirements for this car?
 *
 * Its own module, outside the Zod schema, for one reason that decides the
 * shape of everything else: **the thresholds depend on the car**, and the
 * schema cannot know which class a car belongs to until the model has been
 * read from the database. So Zod keeps checking the shape of the data, and
 * this runs afterwards in `createReservation`, next to availability and price.
 *
 * The limits come from Admin → Zasady wynajmu via `effectiveDriverLimits`,
 * which has already applied the floor of 21. Nothing here has an opinion about
 * what the numbers should be — but it does have an opinion about unreadable
 * input: a date it cannot parse is a refusal, not a pass. A driver whose age
 * cannot be established is not a driver who meets the requirement.
 */

export type EligibilityIssue = {
  /** The form field the message belongs beside. */
  field: "dateOfBirth" | "licenceIssuedOn";
  /** Translation key under `Booking.errors`. */
  code: "under_age" | "licence_too_new";
  /** Interpolated into the message, so no translation carries a number. */
  values: { years: number };
};

/**
 * Completed years between two ISO dates, counted the way a person counts them.
 *
 * Calendar arithmetic rather than the old `days / 365.25`, which was wrong at
 * exactly the boundary the rule is about: twenty-one years spans 7 670 days
 * (five leap days), 21 × 365.25 is 7 670.25, so a driver whose twenty-first
 * birthday fell on the first day of the rental was refused. "Ukończone 21 lat"
 * includes the birthday itself.
 *
 * Returns `null` when either date is not a real calendar date. Callers must
 * treat that as "cannot be established", never as zero and never as a pass.
 */
export function completedYears(
  fromIso: string,
  toIso: string,
): number | null {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!from || !to) return null;
  let years = to.y - from.y;
  if (to.m < from.m || (to.m === from.m && to.d < from.d)) years -= 1;
  return years;
}

/**
 * `YYYY-MM-DD` and nothing else, rejecting dates the calendar does not have.
 *
 * `new Date("2026-02-30")` rolls over to 2 March rather than failing, and
 * `Number("")` is 0, so both of the obvious shortcuts turn rubbish into a
 * plausible age. This checks the round trip instead: a date that does not
 * survive being rebuilt from its own parts was never a date.
 */
function parseIsoDate(
  value: string,
): { y: number; m: number; d: number } | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== mo - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }
  return { y, m: mo, d };
}

export function checkDriverEligibility(
  input: {
    /** ISO date, already validated for shape by the booking schema. */
    dateOfBirth: string;
    /** Rental start — the day the requirements are measured against. */
    startDate: string;
    /**
     * Date the driver first obtained the licence. Not collected by the booking
     * form yet, which is why `LICENCE_TENURE_ENFORCEABLE` is false and
     * `effectiveDriverLimits` always hands this function a null tenure limit —
     * so the branch below is unreachable until that field exists. It is
     * written and tested now so that adding the field is one flag and one
     * form input, not a redesign.
     */
    licenceIssuedOn?: string | null;
  },
  limits: DriverLimits,
): EligibilityIssue[] {
  const issues: EligibilityIssue[] = [];

  /**
   * Fail closed. A missing or unparseable date of birth reaches this line only
   * if something upstream broke — the booking schema requires a real one — and
   * the safe reading of "we do not know how old this driver is" is a refusal,
   * beside the field that would fix it.
   */
  const age = completedYears(input.dateOfBirth, input.startDate);
  if (age === null || age < limits.minAge) {
    issues.push({
      field: "dateOfBirth",
      code: "under_age",
      values: { years: limits.minAge },
    });
  }

  if (limits.minLicenceYears !== null) {
    const held = input.licenceIssuedOn
      ? completedYears(input.licenceIssuedOn, input.startDate)
      : null;
    if (held === null || held < limits.minLicenceYears) {
      issues.push({
        field: "licenceIssuedOn",
        code: "licence_too_new",
        values: { years: limits.minLicenceYears },
      });
    }
  }

  return issues;
}
