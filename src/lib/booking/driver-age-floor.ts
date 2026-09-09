/**
 * The two constants that decide how far the driver rules may bend.
 *
 * Their own module, with no `server-only` marker, for one dull reason: the
 * admin panel is a client component and has to print the same numbers the
 * server enforces. Copying them into the form would put the floor in two
 * places, which is the whole failure mode this area of the code was built to
 * remove. `lib/admin/rental-rules` re-exports both, so server code carries on
 * importing them from where the rest of the rules live.
 */

/**
 * The age the booking form refuses below, whatever the settings say.
 *
 * A floor, not a default. The form has rejected drivers under 21 since the
 * site opened, and no combination of switches, no missing key, no failed
 * settings read and no car without a class may take that away — the failure
 * would be silent (a nineteen-year-old is simply accepted) and discovered at
 * the counter, or after a crash.
 *
 * Deliberately NOT a business rule anybody approves in the panel. The panel
 * decides what applies ABOVE this line; it cannot go below it.
 */
export const FALLBACK_MIN_AGE = 21;

/**
 * Whether a licence-tenure requirement can be applied at all. It cannot, yet.
 *
 * The booking form collects a licence NUMBER and no issue date, and
 * `reservations` has no `licence_issued_on` column, so there is nothing to
 * compare a tenure rule against. Until that field exists — a separate piece of
 * work, to be done together with the insurer's answer on what tenure they
 * actually require — tenure is forced off everywhere: not checked by the form,
 * not stated by the FAQ, not printed on a landing page, not quoted by the
 * assistant.
 *
 * One constant rather than four scattered checks, so switching it on later is
 * one edit, and there is exactly one place to look for why a tenure rule is
 * being ignored.
 */
export const LICENCE_TENURE_ENFORCEABLE = false;
