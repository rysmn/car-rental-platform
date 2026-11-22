/**
 * Fleet axes — the independent properties a car has, and the chips the public
 * grid filters by.
 *
 * ## Why this file was rewritten (21.08.2026)
 *
 * It used to hold ONE list that mixed three unrelated things:
 *
 *     luxury, executive, premium-suv, electric, business, van
 *        ↑ commercial     ↑ intersection  ↑ fuel        ↑ body
 *
 * A single list forced every question through a single answer, and the fleet
 * paid for it: a Tiguan is a SUV and is sold on the business shelf, so whoever
 * filled the row had to pick one, picked `business`, and "szukam SUV-a" stopped
 * finding half the SUVs we own. The opposite failure came free with it — a
 * Panamera is `luxury` and is a sedan, so it answered "luksusowy SUV".
 *
 * The axes are now separate and each has exactly one source of truth:
 *
 *   1. **Body** — `car_models.category` (`suv | sedan | van`). A physical fact,
 *      already stored for every car, already shown on the card. Nothing here
 *      may override it.
 *   2. **Commercial segment** — `car_models.segments[]`, hand-assigned by an
 *      admin. `luxury | executive | business`, and nothing else.
 *   3. **Fuel** — `car_models.fuel`. `electric` is read from it, never ticked.
 *   4. Seats, gearbox, price, driver class — plain columns, read directly.
 *
 * `premium-suv` survives as a **derived** facet — `luxury` ∧ body `suv` — so
 * the marketing shelf keeps working without anybody maintaining it by hand.
 * That is the whole point: a car that is both is found by both, and no row has
 * to be rewritten to make a search behave.
 */

/** Axis 1: what the car physically is. Mirrors `car_models.category`. */
export const BODY_TYPES = [
  "mini",
  "economy",
  "compact",
  "intermediate",
  "estate",
  "convertible",
  "suv",
  "van",
] as const;

export type BodyType = (typeof BODY_TYPES)[number];

/**
 * Axis 2: which shelf it is sold from. The only values an admin assigns.
 *
 * Deliberately three. `premium-suv` left this list because it is an
 * intersection and not a shelf; `van` and `electric` left it because they are
 * facts about the car, and a fact nobody can forget to tick is worth more than
 * a checkbox somebody has to remember.
 */
export const COMMERCIAL_SEGMENTS = ["luxury", "executive", "business"] as const;

export type CommercialSegment = (typeof COMMERCIAL_SEGMENTS)[number];

/**
 * Everything the public filter can switch between, in chip order.
 *
 * Body first (that is how people describe a car), then the shelves, then the
 * two derived facets. A chip nobody's car matches is dropped by the component,
 * so this list may safely be wider than any one fleet.
 */
export const FLEET_SEGMENTS = [
  "mini",
  "economy",
  "compact",
  "intermediate",
  "estate",
  "convertible",
  "suv",
  "van",
  "business",
  "executive",
  "luxury",
  "premium-suv",
  "electric",
] as const;

export type FleetSegment = (typeof FLEET_SEGMENTS)[number];

/**
 * The segments an admin ticks by hand — axis 2 and only axis 2.
 *
 * Everything else in `FLEET_SEGMENTS` is derived from a column that already
 * exists, so nobody can tick "Electric" on a diesel, forget "SUV" on a SUV, or
 * put "Premium SUV" on a sedan.
 */
export const EDITABLE_SEGMENTS = COMMERCIAL_SEGMENTS;

export type EditableSegment = CommercialSegment;

export function isFleetSegment(v: unknown): v is FleetSegment {
  return (
    typeof v === "string" && (FLEET_SEGMENTS as readonly string[]).includes(v)
  );
}

export function isBodyType(v: unknown): v is BodyType {
  return typeof v === "string" && (BODY_TYPES as readonly string[]).includes(v);
}

export function isCommercialSegment(v: unknown): v is CommercialSegment {
  return (
    typeof v === "string" &&
    (COMMERCIAL_SEGMENTS as readonly string[]).includes(v)
  );
}

/**
 * The commercial shelves one car is on — axis 2 alone, legacy values dropped.
 *
 * Rows written before the axes were split still carry `premium-suv`, `van` or
 * `electric` in the array. They are ignored rather than migrated: each one is
 * re-derived below from the column that actually knows, so the stored copy is
 * redundant, and dropping it here means a stale value cannot contradict a
 * spec sheet. **No data is rewritten to make this true.**
 */
export function commercialSegments(
  car: { segments?: readonly string[] | null },
): CommercialSegment[] {
  const stored = new Set(car.segments ?? []);
  return COMMERCIAL_SEGMENTS.filter((s) => stored.has(s));
}

/**
 * Every facet one car answers to, across all axes, in `FLEET_SEGMENTS` order.
 *
 * This is what the public chips match against and what a card lists. It is a
 * *presentation* of the axes, never their storage — each entry traces back to
 * exactly one column:
 *
 *   suv/sedan/van → `category`      luxury/executive/business → `segments[]`
 *   electric      → `fuel`          premium-suv → `luxury` ∧ `category=suv`
 */
export function resolveSegments(car: {
  segments?: readonly string[] | null;
  fuel: string;
  category: string;
}): FleetSegment[] {
  const set = new Set<string>(commercialSegments(car));

  if (isBodyType(car.category)) set.add(car.category);
  if (car.fuel === "electric") set.add("electric");
  // The one intersection the marketing copy names, computed rather than typed.
  if (set.has("luxury") && car.category === "suv") set.add("premium-suv");

  return FLEET_SEGMENTS.filter((s) => set.has(s));
}
