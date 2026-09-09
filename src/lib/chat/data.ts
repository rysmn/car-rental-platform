import "server-only";
import { getFleet } from "@/lib/fleet/repo";
import { getFreeUnitsByModel } from "@/lib/booking/availability";
import {
  getAllLocations,
  getFeeCatalog,
  getLocations,
} from "@/lib/booking/repo";
import {
  computeQuote,
  rentalDays,
  rentalChargeGrosze,
  lowestDailyRateGrosze,
} from "@/lib/booking/pricing";
import { publicExtras } from "@/lib/booking/fees";
import { matchesFleetQuery } from "@/lib/fleet/query";
import { getEurRate } from "@/lib/currency/rate";
import { isBodyType } from "@/lib/fleet/segments";
import { getSetting } from "@/lib/admin/settings";
import { serviceHours } from "@/lib/company/service-hours";
import type { FleetCar } from "@/lib/fleet/types";
import type { DriverClass } from "@/lib/fleet/driver-class";
import type { Vocabulary } from "./nlu";
import type { ChatCar, ChatQuote, ContactPhone } from "./types";

/**
 * The assistant's entire view of the world.
 *
 * This module is the security boundary. Everything the chatbot can ever learn
 * passes through one of these functions, and every one of them is a READ of
 * data the public site already shows. There is no write, no admin table, no
 * customer record and no reservation lookup anywhere in this file — so no
 * prompt, no injected instruction and no future AI provider can reach them,
 * because the capability simply does not exist in the layer they are given.
 *
 * The second rule: **nothing is recomputed here.** Availability comes from
 * `getFreeUnitsByModel`, the same query the booking form and the calendar use.
 * Prices come from `computeQuote`, the same function the server runs at submit
 * time. If the assistant and the booking form ever disagreed about a price, it
 * would be because someone duplicated a formula — so nobody does.
 */

/* ── Vocabulary for the parser ────────────────────────────────────────────── */

/** Car names and locations the parser should recognise, built from live data. */
export async function getVocabulary(): Promise<Vocabulary> {
  const [fleet, locations, rate] = await Promise.all([
    getFleet(),
    getLocations(),
    // Cached in site_settings and refreshed behind the answer, so this costs
    // the conversation nothing — see `lib/currency/rate`.
    getEurRate(),
  ]);
  return {
    cars: fleet.map((c) => ({
      modelId: c.id,
      slug: c.slug,
      brand: c.brand,
      model: c.model,
      seats: c.seats,
      category: c.category,
      fuel: c.fuel,
      gearbox: c.gearbox,
      segments: c.segments,
      driverClass: c.driverClass,
    })),
    // What "do 90 euro" is worth in złoty today, or null — in which case a
    // euro budget is not filtered on at all rather than guessed at.
    plnPerEur: rate?.plnPerEur ?? null,
    // `getLocations` already filters to active ones — a customer is never
    // offered a pickup point the booking form would reject.
    locations: await Promise.all(
      locations.map(async (l) => ({
        id: await locationId(l.slug),
        slug: l.slug,
        name: l.name,
      })),
    ),
  };
}

/**
 * Locations are identified by slug everywhere in the booking flow, but the
 * conversation table stores a UUID foreign key. This resolves one to the other
 * once per request rather than making the caller carry both.
 */
let locationIdCache: Map<string, string> | null = null;

async function locationId(slug: string): Promise<string> {
  if (!locationIdCache) {
    const { getDb, schema } = await import("@/lib/db");
    const rows = await getDb()
      .select({
        id: schema.pickupLocations.id,
        slug: schema.pickupLocations.slug,
      })
      .from(schema.pickupLocations);
    locationIdCache = new Map(rows.map((r) => [r.slug, r.id]));
  }
  return locationIdCache.get(slug) ?? slug;
}

/** Slug for a location UUID — what the booking form's URL needs. */
export async function locationSlugById(id: string): Promise<string | null> {
  await locationId("office"); // primes the cache
  for (const [slug, uuid] of locationIdCache ?? []) {
    if (uuid === id) return slug;
  }
  return null;
}

/* ── Cars ─────────────────────────────────────────────────────────────────── */

/** The pickup points `bookingRequestSchema` accepts. Keep in step with it. */
const BOOKING_FORM_LOCATIONS: readonly string[] = [
  "office",
  "airport",
  "delivery",
];

const bookPath = (locale: string, slug: string) =>
  locale === "en" ? `/en/fleet/${slug}` : `/fleet/${slug}`;

/**
 * Turn a fleet row into the card the widget renders.
 *
 * `freeUnits` is only populated when a real date range was checked. Left null
 * the card says nothing about availability, which is the honest state — a card
 * that implied "available" because nobody asked would be the exact invention
 * this design forbids.
 */
function toCard(
  car: FleetCar,
  locale: string,
  freeUnits: number | null,
  range: { from: string; to: string } | null,
  locationSlug: string | null,
): ChatCar {
  const params = new URLSearchParams();
  if (range) {
    params.set("od", range.from);
    params.set("do", range.to);
  }
  // Only pass a pickup point the booking form can actually accept. Its request
  // schema is a closed enum of three slugs, while the fleet has four active
  // locations (Gdańsk airport is the extra one), so prefilling the fourth would
  // seed a form that the server then refuses to submit. Leaving it out costs
  // the customer one dropdown; sending it would cost them a failed booking.
  // The mismatch itself is a pre-existing booking-form issue, reported separately.
  if (locationSlug && BOOKING_FORM_LOCATIONS.includes(locationSlug)) {
    params.set("odbior", locationSlug);
  }
  params.set("zrodlo", "chatbot");
  const qs = params.toString();

  return {
    modelId: car.id,
    slug: car.slug,
    name: `${car.brand} ${car.model}`,
    year: car.year,
    seats: car.seats,
    gearbox: car.gearbox,
    fuel: car.fuel,
    fromDailyGrosze: lowestDailyRateGrosze(car),
    depositGrosze: car.depositGrosze,
    kmPerDayLimit: car.kmPerDayLimit,
    extraMileageFeeGrosze: car.extraMileageFeeGrosze,
    image: car.images?.[0] ?? null,
    segments: car.segments,
    freeUnits,
    bookableUnits: car.availableCount,
    bookHref: `${bookPath(locale, car.slug)}${qs ? `?${qs}` : ""}`,
  };
}

export type CarQuery = {
  /**
   * Models the customer named outright.
   *
   * When this is set it decides the result on its own and every other filter
   * is ignored: somebody who types "Pokaż Toyotę RAV4" is asking about that
   * car, not about the three cheapest cars that happen to seat as many. Before
   * this existed the named model was parsed correctly and then thrown away,
   * and the answer was a generic list with the requested car buried in it.
   */
  modelIds?: string[] | null;
  /** Axis 1 — body type, matched against `car_models.category`. */
  bodyType?: string | null;
  /** Axis 2 — commercial shelf, matched against the stored `segments[]`. */
  segment?: string | null;
  /** Axis 3 — driver-requirement class; what "premium" resolves to. */
  driverClass?: string | null;
  /** Axis 7 — the stated daily budget in grosze, or null when none was given. */
  maxDailyGrosze?: number | null;
  /** Axis 7b — the floor of a stated range, in grosze per day. */
  minDailyGrosze?: number | null;
  /**
   * Axis 8 — a budget for the WHOLE rental, in grosze.
   *
   * Answered from the Pricing Engine's charge for the chosen dates. With no
   * dates there is no total, and the axis narrows nothing rather than emptying
   * the answer — see `matchesFleetQuery`.
   */
  maxTotalGrosze?: number | null;
  minTotalGrosze?: number | null;
  seats?: number | null;
  gearbox?: string | null;
  fuel?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  locationSlug?: string | null;
  cheapestFirst?: boolean;
  limit?: number;
};

/**
 * Find cars matching what the customer described.
 *
 * When a date range is supplied the result is filtered to models with at least
 * one free unit — the customer is never shown a card they cannot book. Without
 * dates every published model is eligible and `freeUnits` stays null.
 */
export async function findCars(
  q: CarQuery,
  locale: string,
): Promise<ChatCar[]> {
  const fleet = await getFleet();

  // A named car answers for itself. The descriptive filters below are how we
  // guess at what somebody wants; they have no business narrowing a request
  // that was already specific.
  const named = q.modelIds?.length
    ? fleet.filter((c) => q.modelIds!.includes(c.id))
    : null;

  // How long the stay is, when the customer has said — the only thing that
  // turns a per-night price list into a total.
  const budgetDays =
    q.dateFrom && q.dateTo
      ? rentalDays(new Date(q.dateFrom), new Date(q.dateTo))
      : null;

  /*
   * Every stated axis narrows; none replaces another.
   *
   * `matchesFleetQuery` lives in `lib/fleet` rather than here because the
   * public grid asks the same question, and two answers to "is this a SUV" is
   * exactly how the assistant and the website drifted apart.
   */
  let matches = (named ?? fleet).filter(
    (c) =>
      named !== null ||
      matchesFleetQuery(
        c,
        {
          bodyType: isBodyType(q.bodyType) ? q.bodyType : null,
          segment: q.segment ?? null,
          driverClass: q.driverClass ?? null,
          seats: q.seats ?? null,
          gearbox: q.gearbox ?? null,
          fuel: q.fuel ?? null,
          maxDailyGrosze: q.maxDailyGrosze ?? null,
          minDailyGrosze: q.minDailyGrosze ?? null,
          maxTotalGrosze: q.maxTotalGrosze ?? null,
          minTotalGrosze: q.minTotalGrosze ?? null,
        },
        {
          // The advertised rate, so a budget filters on the number the customer
          // is about to read on the card rather than on a different one.
          fromDailyGrosze: lowestDailyRateGrosze(c),
          // And the real charge for the stay, from the same function the
          // booking form bills — a total budget is never the daily rate
          // multiplied out, because the tier changes with the length.
          totalGrosze:
            budgetDays == null
              ? undefined
              : rentalChargeGrosze(c, budgetDays),
        },
      ),
  );

  let free: Map<string, number> | null = null;
  const range =
    q.dateFrom && q.dateTo ? { from: q.dateFrom, to: q.dateTo } : null;

  if (range) {
    free = await getFreeUnitsByModel(range.from, range.to);
    matches = matches.filter((c) => (free?.get(c.id) ?? 0) > 0);
  }

  matches.sort((a, b) =>
    q.cheapestFirst
      ? lowestDailyRateGrosze(a) - lowestDailyRateGrosze(b)
      : // Otherwise: closest to the requested seat count first, then price.
        (q.seats ? a.seats - (q.seats ?? 0) - (b.seats - (q.seats ?? 0)) : 0) ||
        lowestDailyRateGrosze(a) - lowestDailyRateGrosze(b),
  );

  return matches
    .slice(0, q.limit ?? 3)
    .map((c) =>
      toCard(
        c,
        locale,
        free ? (free.get(c.id) ?? 0) : null,
        range,
        q.locationSlug ?? null,
      ),
    );
}

/** One car by model id, as a card. */
export async function getCar(
  modelId: string,
  locale: string,
  range: { from: string; to: string } | null = null,
  locationSlug: string | null = null,
): Promise<ChatCar | null> {
  const fleet = await getFleet();
  const car = fleet.find((c) => c.id === modelId);
  if (!car) return null;

  let freeUnits: number | null = null;
  if (range) {
    const free = await getFreeUnitsByModel(range.from, range.to);
    freeUnits = free.get(car.id) ?? 0;
  }
  return toCard(car, locale, freeUnits, range, locationSlug);
}

/**
 * "Mogę pokazać podobne" — real cars, really free, really similar.
 *
 * Ranked, not filtered down to nothing. The order encodes what actually
 * substitutes for a car somebody already chose:
 *
 *   1. free for the dates — a car that is not available is not an alternative,
 *      so this is a filter and not a score,
 *   2. enough seats — never fewer than the customer asked for, and never fewer
 *      than the car they were denied had; a five-seater is not an answer to a
 *      request for seven,
 *   3. the same class,
 *   4. the same body type,
 *   5. a comparable price.
 *
 * Nothing here is hardcoded: the candidates are the live fleet, the
 * availability is the reservation system's own answer, and the ranking reads
 * the reference car's real attributes. Swap a car in the admin panel and the
 * suggestions change with it.
 */
export async function findAlternatives(
  excludeModelId: string,
  range: { from: string; to: string },
  locale: string,
  seats: number | null,
  /**
   * What the customer said they would pay, when they said anything.
   *
   * It RANKS and never filters. A car 20 zł over a stated ceiling is still the
   * closest thing we have, and dropping it produces exactly the dead end this
   * function exists to prevent — the customer is told "nothing" when the truth
   * is "this, and it is a little more". Within budget comes first; outside it,
   * nearest to what they said comes next.
   */
  budget?: StatedBudget | null,
): Promise<ChatCar[]> {
  const fleet = await getFleet();
  const reference = fleet.find((c) => c.id === excludeModelId) ?? null;
  const days = rentalDays(new Date(range.from), new Date(range.to));

  // Never below what the customer needs, never below what the car they asked
  // about seats. `seats` alone would drop to zero the moment the customer never
  // stated a headcount, and then a 9-seat van would "substitute" for a coupé.
  const minSeats = Math.max(seats ?? 0, reference?.seats ?? 0);

  const free = await getFreeUnitsByModel(range.from, range.to);
  const referenceRate = reference ? lowestDailyRateGrosze(reference) : 0;

  const scored = fleet
    .filter(
      (c) =>
        c.id !== excludeModelId &&
        (free.get(c.id) ?? 0) > 0 &&
        c.seats >= minSeats,
    )
    .map((c) => {
      const sharedSegments = reference
        ? (c.segments as readonly string[]).filter((s) =>
            (reference.segments as readonly string[]).includes(s),
          ).length
        : 0;
      const sameCategory =
        reference && c.category === reference.category ? 1 : 0;
      const rate = lowestDailyRateGrosze(c);
      const gap = budgetGap(budget, rate, rentalChargeGrosze(c, days));
      return {
        car: c,
        // Class first, then body type — both are what a customer means by
        // "podobne". Price only breaks ties, and it breaks them by distance
        // from the car they wanted rather than by being cheap.
        score: sharedSegments * 3 + sameCategory * 2,
        priceGap:
          referenceRate > 0 && rate > 0 ? Math.abs(rate - referenceRate) : 0,
        seatGap: c.seats - minSeats,
        // 0 when it fits, or how far outside the stated budget it falls.
        budgetGap: gap,
      };
    })
    .sort(
      (a, b) =>
        // Affordability outranks similarity: a customer who named a figure is
        // telling us which of these two questions they are actually asking.
        (a.budgetGap === 0 ? 0 : 1) - (b.budgetGap === 0 ? 0 : 1) ||
        b.score - a.score ||
        a.seatGap - b.seatGap ||
        a.budgetGap - b.budgetGap ||
        a.priceGap - b.priceGap,
    );

  return scored
    .slice(0, 3)
    .map((s) => toCard(s.car, locale, free.get(s.car.id) ?? 0, range, null));
}

/**
 * A budget as the conversation holds it: both ends, in złoty grosze, and what
 * they are a budget for.
 */
export type StatedBudget = {
  minGrosze: number | null;
  maxGrosze: number | null;
  kind: "day" | "total";
};

/**
 * How far outside a stated budget a car falls — 0 when it fits.
 *
 * The figure compared is the one the budget was about: the advertised daily
 * rate for a per-day budget, the real charge for the stay for a total one.
 * Nothing is scaled from one to the other, because the tier table means the
 * total is never the daily rate multiplied out.
 */
function budgetGap(
  budget: StatedBudget | null | undefined,
  dailyGrosze: number,
  totalGrosze: number,
): number {
  if (!budget) return 0;
  const value = budget.kind === "total" ? totalGrosze : dailyGrosze;
  if (value <= 0) return 0;
  if (budget.maxGrosze !== null && value > budget.maxGrosze) {
    return value - budget.maxGrosze;
  }
  if (budget.minGrosze !== null && value < budget.minGrosze) {
    return budget.minGrosze - value;
  }
  return 0;
}

/**
 * The nearest thing we have to a budget nobody's car fits.
 *
 * ## Why an empty answer is the wrong answer
 *
 * "Nie mam nic do 200 zł" is true and useless. The customer cannot tell from it
 * whether they missed by ten złoty or by four hundred, and the only way to find
 * out is to guess again. This runs the SAME search with the budget lifted and
 * reports what came closest, together with the distance — so the reply can say
 * "najbliżej jest X, o 40 zł więcej", which is a decision they can actually
 * make.
 *
 * Every other criterion is kept. Widening the price is answering the question
 * they asked; quietly widening the seat count or the dates would be answering a
 * different one.
 */
export async function findNearestToBudget(
  q: CarQuery,
  budget: StatedBudget,
  locale: string,
  limit = 2,
): Promise<{ cars: ChatCar[]; gapGrosze: number } | null> {
  const withoutBudget: CarQuery = {
    ...q,
    maxDailyGrosze: null,
    minDailyGrosze: null,
    maxTotalGrosze: null,
    minTotalGrosze: null,
    // The gap decides the order here, not the price on its own, and the whole
    // matching set has to be looked at before "closest" means anything.
    cheapestFirst: false,
    // The whole matching set, because "closest" is meaningless if the closest
    // car was cut off by a limit of three.
    limit: 50,
  };

  const [cards, fleet] = await Promise.all([
    findCars(withoutBudget, locale),
    getFleet(),
  ]);
  if (cards.length === 0) return null;

  const days =
    q.dateFrom && q.dateTo
      ? rentalDays(new Date(q.dateFrom), new Date(q.dateTo))
      : null;

  const scored = cards
    .map((card) => {
      const car = fleet.find((c) => c.id === card.modelId);
      if (!car) return null;
      return {
        card,
        gap: budgetGap(
          budget,
          lowestDailyRateGrosze(car),
          days == null ? 0 : rentalChargeGrosze(car, days),
        ),
      };
    })
    .filter((x): x is { card: ChatCar; gap: number } => x !== null)
    .sort((a, b) => a.gap - b.gap);

  if (scored.length === 0) return null;
  return {
    cars: scored.slice(0, limit).map((x) => x.card),
    gapGrosze: scored[0].gap,
  };
}

/* ── Prices ───────────────────────────────────────────────────────────────── */

/**
 * A priced offer, computed by the same engine the booking form uses.
 *
 * Extras are deliberately NOT included: the assistant quotes the rental and the
 * pickup fee, and the booking form is where a customer ticks a child seat and
 * sees the total move. Quoting extras the customer never asked for produces a
 * number that will not match what they see next, and a number that changes
 * between the chat and the form destroys the trust the whole thing runs on.
 */
export async function quoteFor(
  modelId: string,
  dateFrom: string,
  dateTo: string,
  locationSlug: string | null,
  locale: string,
): Promise<ChatQuote | null> {
  const [fleet, locations, fees] = await Promise.all([
    getFleet(),
    getLocations(),
    getFeeCatalog(),
  ]);
  const car = fleet.find((c) => c.id === modelId);
  if (!car) return null;

  const location = locationSlug
    ? (locations.find((l) => l.slug === locationSlug) ?? null)
    : null;

  const days = rentalDays(new Date(dateFrom), new Date(dateTo));
  const breakdown = computeQuote({
    dailyPriceGrosze: car.dailyPriceGrosze,
    dailyPrice3to6Grosze: car.dailyPrice3to6Grosze,
    dailyPrice7to13Grosze: car.dailyPrice7to13Grosze,
    dailyPrice14to29Grosze: car.dailyPrice14to29Grosze,
    monthlyPriceGrosze: car.monthlyPriceGrosze,
    depositGrosze: car.depositGrosze,
    kmPerDayLimit: car.kmPerDayLimit,
    extraMileageFeeGrosze: car.extraMileageFeeGrosze,
    // Asystent NIE zapisuje rezerwacji — liczy podgląd. Politykę i tak bierze
    // z ustawień, żeby nie było w tym pliku drugiego zestawu zasad.
    cancellationPolicy: await getSetting("cancellation"),
    days,
    locationFeeGrosze: location?.feeGrosze ?? 0,
    extras: { extraDriver: false, childSeat: false, protectionPackage: false },
    depositVariant: "with_deposit",
    fees,
  });

  const free = await getFreeUnitsByModel(dateFrom, dateTo);
  const card = toCard(
    car,
    locale,
    free.get(car.id) ?? 0,
    { from: dateFrom, to: dateTo },
    locationSlug,
  );

  return {
    car: card,
    dateFrom,
    dateTo,
    days: breakdown.days,
    dailyGrosze: breakdown.dailyPriceGrosze,
    rentalGrosze: breakdown.rentalGrosze,
    locationName: location
      ? locale === "en"
        ? location.nameEn
        : location.name
      : null,
    locationFeeGrosze: location?.feeGrosze ?? 0,
    totalGrosze: breakdown.totalGrosze,
    depositGrosze: breakdown.depositGrosze,
    available: (free.get(car.id) ?? 0) > 0,
    onRequest: breakdown.onRequest,
  };
}

/**
 * Price for a stated LENGTH with no dates — "ile kosztuje Volvo na tydzień".
 *
 * Returns the rental charge only, and the caller must say so: with no dates
 * there is nothing to check availability against, and a total presented beside
 * an unchecked date range reads as a confirmed offer. The assistant follows
 * this with "podaj termin, sprawdzę dostępność".
 */
export async function priceForDays(
  modelId: string,
  days: number,
): Promise<{
  days: number;
  dailyGrosze: number;
  rentalGrosze: number;
  /** No rate for this length of stay — the assistant must not quote a number. */
  onRequest: boolean;
} | null> {
  const fleet = await getFleet();
  const car = fleet.find((c) => c.id === modelId);
  if (!car) return null;

  const fees = await getFeeCatalog();
  const breakdown = computeQuote({
    dailyPriceGrosze: car.dailyPriceGrosze,
    dailyPrice3to6Grosze: car.dailyPrice3to6Grosze,
    dailyPrice7to13Grosze: car.dailyPrice7to13Grosze,
    dailyPrice14to29Grosze: car.dailyPrice14to29Grosze,
    monthlyPriceGrosze: car.monthlyPriceGrosze,
    depositGrosze: car.depositGrosze,
    kmPerDayLimit: car.kmPerDayLimit,
    extraMileageFeeGrosze: car.extraMileageFeeGrosze,
    cancellationPolicy: await getSetting("cancellation"),
    days,
    locationFeeGrosze: 0,
    extras: { extraDriver: false, childSeat: false, protectionPackage: false },
    depositVariant: "with_deposit",
    fees,
  });
  return {
    days: breakdown.days,
    dailyGrosze: breakdown.dailyPriceGrosze,
    rentalGrosze: breakdown.rentalGrosze,
    onRequest: breakdown.onRequest,
  };
}

/* ── Reference data ───────────────────────────────────────────────────────── */

export async function getLocationOptions(locale: string) {
  const locations = await getLocations();
  return Promise.all(
    locations.map(async (l) => ({
      id: await locationId(l.slug),
      slug: l.slug,
      name: locale === "en" ? l.nameEn : l.name,
      // The street, when the panel holds one. "Where do I collect the car" is
      // a question about an address, and answering it with a label the
      // customer cannot navigate to is answering a different question.
      address: l.address ?? null,
      feeGrosze: l.feeGrosze,
    })),
  );
}

/**
 * Cennik dodatków dla asystenta — TA SAMA lista, którą drukuje strona.
 *
 * Wcześniej ta funkcja układała własną listę: te same opłaty, ale swoje
 * etykiety i swoja kolejność, a dostawa, lotnisko i zwrot poza godzinami nie
 * było w niej wcale. Asystent nie kłamał — po prostu nie wiedział. Teraz
 * kolejność, nazwy i komplet pozycji przychodzą z `publicExtras`, więc pytanie
 * zadane w czacie i cennik na stronie nie mają jak odpowiedzieć inaczej.
 */
export async function getExtras(locale: string) {
  const [fees, locations] = await Promise.all([
    getFeeCatalog(),
    getAllLocations(),
  ]);
  return publicExtras(fees, locations, locale);
}

/**
 * What the assistant may answer from: the site's own FAQ, plus anything an
 * administrator has written AND published.
 *
 * Published is the operative word. Entries start life as drafts created from a
 * question the assistant could not answer, with an empty answer; nothing
 * reaches this list until a person has written the words and pressed publish.
 * No model writes here — a generated sentence about insurance that nobody
 * checked is exactly what the FAQ matcher's score floor exists to keep out, and
 * letting one in through the admin panel would be the same mistake with extra
 * steps.
 */
export async function getFaqEntries(locale: string) {
  const { getMergedFaq } = await import("@/lib/marketing/faq-live");
  return getMergedFaq(locale);
}

/**
 * The rental rules, as approved in Admin → Zasady wynajmu.
 *
 * The assistant reads the rules the same way it reads the fleet: from the
 * database, on the turn it needs them. No handler holds its own copy, so a rule
 * the owner switches on is in force on the next message with no rebuild.
 */
export async function getRentalRules() {
  const { getSetting } = await import("@/lib/admin/settings");
  return getSetting("rentalRules");
}

/** Phone, WhatsApp, e-mail and opening hours — from the admin settings only. */
export async function getContact(locale: string): Promise<{
  phones: ContactPhone[];
  email: string;
  hours: string;
}> {
  const company = await getSetting("company");
  return {
    phones: company.phones
      .filter((p) => p.number)
      .map((p) => ({
        label: p.lang === "EN" ? "EN" : "PL",
        number: p.number,
        whatsapp: p.whatsapp,
      })),
    email: company.email,
    // The same three facts the contact page prints, on one line — worded once,
    // in `lib/company/service-hours`, so the assistant cannot quote an hour the
    // site does not.
    hours: serviceHours(company, locale).short,
  };
}

/**
 * Opening, telephone and handover hours, for the assistant's own answers.
 *
 * Read from the admin settings on every turn like everything else here: the
 * assistant states the hours that are configured, never hours it remembers.
 */
export async function getServiceHours(locale: string) {
  const company = await getSetting("company");
  return serviceHours(company, locale);
}

/**
 * Which driver-requirement class a model belongs to.
 *
 * Read from the same published fleet the rest of this module serves, so the
 * assistant can never quote a class for a car the site does not offer. Returns
 * null for an unknown id and for a car nobody has assigned — both mean "no
 * approved requirement", and the handler then refers to a person.
 */
export async function driverClassFor(
  modelId: string,
): Promise<DriverClass | null> {
  const fleet = await getFleet();
  return fleet.find((c) => c.id === modelId)?.driverClass ?? null;
}
