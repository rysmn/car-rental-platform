import "server-only";
import type { FleetCar } from "@/lib/fleet/types";
import { DRIVER_CLASSES } from "@/lib/fleet/driver-class";
import {
  effectiveDriverLimits,
  type RentalRules,
} from "@/lib/admin/rental-rules";
import type { LandingFacts } from "./types";

/**
 * The figures a landing page fills its placeholders with.
 *
 * The driver age is worked out from THE CARS THIS PAGE ACTUALLY SHOWS, not
 * from a class written next to the page in a registry. The premium page states
 * 25 because every car in its strip is a Premium car; the Warsaw page states
 * the lowest age in the fleet and adds a sentence naming the classes that ask
 * for more. Nobody has to remember to update a second list when a car changes
 * class — the sentence follows the strip, because it is generated from it.
 *
 * Every number comes through `effectiveDriverLimits`, the same function the
 * booking form refuses on. A page therefore cannot advertise a threshold the
 * form does not apply, in either direction.
 */
export function landingFacts(
  rules: RentalRules,
  cars: FleetCar[],
  locale: string,
  hours: { office: string; phone: string },
  /**
   * CAŁA flota — nie pasek tej strony.
   *
   * `cars` to auta, które ta strona pokazuje, i na nich liczy się wiek
   * kierowcy. Zdania typu „flota liczy N aut" mówią jednak o firmie, nie
   * o pasku, więc biorą swoją liczbę stąd. Parametr opcjonalny, bo wywołania
   * bez bazy (karta OG, testy) używają wyłącznie `h1` i `eyebrow`.
   */
  calaFlota: FleetCar[] = cars,
): LandingFacts {
  const en = locale === "en";
  const ages = cars.map((c) => effectiveDriverLimits(rules, c.driverClass).minAge);

  // An empty strip is possible only in a fleet with no published cars at all —
  // `landingFleet` otherwise falls back to everything. Fall back to the floor
  // rather than to `Math.min()` of nothing, which is Infinity.
  const minAge = ages.length
    ? Math.min(...ages)
    : effectiveDriverLimits(rules, null).minAge;

  /**
   * Which classes on this page ask for more than the number the page prints.
   *
   * Iterated over `DRIVER_CLASSES` rather than over the cars so the order is
   * the panel's order and the same two classes always read the same way round.
   */
  const higher = DRIVER_CLASSES.filter((cls) =>
    cars.some((c) => c.driverClass === cls),
  )
    .map((cls) => ({
      label: rules.driverAge.classes[cls]?.label ?? cls,
      age: effectiveDriverLimits(rules, cls).minAge,
    }))
    .filter((c) => c.age > minAge);

  const minAgeNote = higher.length
    ? en
      ? ` A higher minimum applies to some of these cars: ${higher
          .map((c) => `${c.label} — ${c.age}`)
          .join(", ")}.`
      : ` Przy części z tych aut obowiązuje wyższy próg: ${higher
          .map((c) => `${c.label} — ${c.age} lat`)
          .join(", ")}.`
    : "";

  return {
    ...hours,
    minAge,
    minAgeNote,
    fleetCount: calaFlota.length,
    electricCount: calaFlota.filter((c) => c.fuel === "electric").length,
  };
}
