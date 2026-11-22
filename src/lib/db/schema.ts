import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  date,
  time,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Money convention: store amounts as integer **grosze** (1/100 PLN) everywhere to
 * avoid floating-point rounding. Never store prices as floats.
 *
 * Reservations, clients, documents, contracts and invoices arrive in later phases.
 * The no-double-booking rule is enforced with a Postgres EXCLUDE constraint over
 * car_id + the occupancy range `aa_zajetosc()` returns (GiST) — not in the UI.
 */

// ── Enums ────────────────────────────────────────────────────────────────────
export const carCategory = pgEnum("car_category", ["mini", "economy", "compact", "intermediate", "estate", "convertible", "suv", "van"]);
export const gearbox = pgEnum("gearbox", ["automatic", "manual"]);
export const fuel = pgEnum("fuel", ["petrol", "diesel", "hybrid", "electric"]);
/**
 * Which set of tyres is physically on the car right now.
 *
 * Not derived from the date: the whole point of the alert is that the season
 * has turned and somebody has NOT yet swapped them. A field that computed
 * itself from the calendar would always say the right thing and never warn
 * anybody.
 */
export const tyreSet = pgEnum("tyre_set", ["summer", "winter", "all_season"]);

/**
 * Anything with a date that somebody has to act on, attached to one car.
 *
 * The fixed alerts above cover what the system can work out for itself —
 * expiries, mileages, bookings. This covers everything it cannot know: a fine
 * with a payment deadline, a damage claim waiting on an insurer, a deposit to
 * take or to give back, a car that has to be washed before Friday. One table
 * rather than a column per idea, because the list of things an operator has
 * to remember is open-ended and a migration per obligation is not a plan.
 */
export const deadlineKind = pgEnum("deadline_kind", [
  "fine",
  "damage",
  "deposit_take",
  "deposit_return",
  "prep",
  "other",
]);

export const carStatus = pgEnum("car_status", [
  "available",
  "rented",
  "service",
  "damaged",
]);

/**
 * Where a car is in the turnaround between coming back and going out again.
 *
 * The operator's chain, verbatim from the order: zwrot → kontrola → mycie →
 * tankowanie → gotowy → wydany. Only the four middle links live here. "Zwrot"
 * is an event, not a state, and "wydany" is `carStatus.rented` — duplicating it
 * would create two columns that can disagree about whether a car is out.
 *
 * SEPARATE from `carStatus` on purpose. `carStatus` answers "may this car be
 * rented at all" (roadworthy, in service, written off); this answers "is it
 * presentable right now". A car can be `available` and still be sitting dirty
 * with a quarter tank, and folding that into one column would force a choice
 * between hiding it from the fleet — losing bookings for a car that needs
 * twenty minutes of work — and pretending it is ready.
 */
export const prepStatus = pgEnum("prep_status", [
  "inspection", // kontrola po zwrocie
  "cleaning", // mycie / detailing
  "fueling", // tankowanie
  "ready", // gotowy do wydania
]);

// ── Pickup locations (admin-editable) ────────────────────────────────────────
export const pickupLocations = pgTable("pickup_locations", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(), // stable key: office | airport | delivery
  name: text("name").notNull(), // PL label
  nameEn: text("name_en"), // EN label
  address: text("address"),
  // Delivery/pickup fee in grosze. Office pickup = 0.
  feeGrosze: integer("fee_grosze").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Car models = one public listing ──────────────────────────────────────────
// Prices/specs live here and are admin-editable; never hardcode them in the UI.
export const carModels = pgTable("car_models", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  brand: text("brand").notNull(),
  model: text("model").notNull(),
  year: integer("year").notNull(),
  category: carCategory("category").notNull(),
  seats: integer("seats").notNull(),
  gearbox: gearbox("gearbox").notNull(),
  fuel: fuel("fuel").notNull(),
  // Daily included-km allowance; 0 means unlimited.
  kmPerDayLimit: integer("km_per_day_limit").notNull().default(0),
  /**
   * Opłata za każdy kilometr ponad limit, w groszach za kilometr.
   *
   * NULL-owalna świadomie i to jest cała jej semantyka: `null` znaczy „stawki
   * nie ustawiono", więc strona nic nie pokazuje i nic się nie nalicza. `0`
   * jest odcięte ograniczeniem CHECK w migracji 0050, bo znaczyłoby, że
   * nadprzebieg jest DARMOWY — a to obietnica, nie brak danych.
   *
   * To jedyne miejsce w projekcie, w którym ta stawka istnieje. Karta auta,
   * flota, porównywarka, formularz rezerwacji, asystent, panel i rozliczenie
   * zwrotu czytają ją stąd; reguła limitu, po którego przekroczeniu opłata
   * działa, mieszka w `lib/booking/mileage`.
   */
  extraMileageFeeGrosze: integer("extra_mileage_fee_grosze"),
  // Length-of-rental price tiers. `dailyPriceGrosze` is the base (1–2 day) rate;
  // the three columns below are the longer-stay rates from the published price
  // list, and `monthlyPriceGrosze` covers 30+ days.
  //
  // They are NULLABLE on purpose: a model with no tiers configured falls back to
  // the base daily rate for every length, which is exactly the flat-rate
  // behaviour that existed before tiers were introduced. See lib/booking/pricing.
  dailyPriceGrosze: integer("daily_price_grosze").notNull(),
  dailyPrice3to6Grosze: integer("daily_price_3_6_grosze"),
  dailyPrice7to13Grosze: integer("daily_price_7_13_grosze"),
  dailyPrice14to29Grosze: integer("daily_price_14_29_grosze"),
  monthlyPriceGrosze: integer("monthly_price_grosze").notNull(),
  depositGrosze: integer("deposit_grosze").notNull().default(0),
  descriptionPl: text("description_pl"),
  descriptionEn: text("description_en"),
  // Public image paths (or storage keys once photos move to object storage).
  images: text("images").array().notNull().default([]),
  /**
   * Equipment shown on the car page — "Apple CarPlay", "uchwyt na telefon".
   * Free text rather than an enum: what is worth advertising changes with every
   * car and every season, and an enum would mean a migration each time somebody
   * wants to mention a roof box. Shown as typed in both locales, because these
   * are mostly proper nouns.
   */
  features: text("features").array().notNull().default([]),
  /**
   * Marketing classes the car is offered under — "luxury", "executive",
   * "premium-suv", "business". These drive the filter chips above the public
   * fleet grid, and a car can sit in more than one (a Panamera is both luxury
   * and executive), which is why this is an array and not a second enum column.
   *
   * Only the judgement calls live here. "electric" and "van" are derived from
   * `fuel` and `category` at read time (see lib/fleet/segments), so the filter
   * can never disagree with the spec sheet on the same page.
   */
  segments: text("segments").array().notNull().default([]),
  /**
   * Which driver-requirement class this model belongs to — "standard",
   * "premium" or "van_bus". See `lib/fleet/driver-class`.
   *
   * The thresholds themselves (minimum age, minimum licence tenure) are NOT
   * here: they are a company decision and live in `site_settings.rentalRules`,
   * where an administrator changes them without a deployment. This column only
   * says which set of thresholds applies to this car.
   *
   * Plain text rather than a pgEnum on purpose — adding a fourth class must be
   * a data change, not a migration. NULL means "not assigned yet": a real,
   * visible state, not a quiet fallback to Standard. Nothing enforces a
   * threshold for a car in that state, and the panel counts them.
   */
  driverClass: text("driver_class"),
  sortOrder: integer("sort_order").notNull().default(0),
  published: boolean("published").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Cars = physical units of a model ─────────────────────────────────────────
// Units of the same model share one listing but are distinct cars (plate/VIN/
// mileage/insurance). Availability & bookings (Phase 3) attach to a unit, not a model.
export const cars = pgTable(
  "cars",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    modelId: uuid("model_id")
      .notNull()
      .references(() => carModels.id, { onDelete: "restrict" }),
    plate: text("plate").notNull().unique(),
    vin: text("vin").notNull().unique(),
    mileageKm: integer("mileage_km").notNull().default(0),
    registeredOn: date("registered_on"),
    insuranceExpiry: date("insurance_expiry"),
    inspectionExpiry: date("inspection_expiry"),
    /**
     * When the next service is booked to happen — a plan, not a legal deadline.
     *
     * Kept beside the two expiry dates because the reminder job treats all
     * three the same way: something with a date that is about to arrive. It
     * differs from them in what a lapse costs (a missed service is a bill; a
     * missed inspection is a car that may not legally drive), which is why the
     * alert says which kind it is rather than merging them into "documents".
     */
    serviceDue: date("service_due"),
    /**
     * Service by distance, not only by date.
     *
     * `serviceIntervalKm` is how far the car goes between services and
     * `lastServiceKm` is the odometer reading at the last one. Together with
     * `mileageKm` they answer "serwis za 1 200 km", which a date alone cannot:
     * a car doing 4 000 km a month and one doing 400 reach the same wear at
     * wildly different dates. Both nullable — with either missing, no
     * distance-based alert is claimed at all.
     */
    serviceIntervalKm: integer("service_interval_km"),
    lastServiceKm: integer("last_service_km"),
    /** Oil runs on its own clock, shorter than the full service interval. */
    oilIntervalKm: integer("oil_interval_km"),
    lastOilKm: integer("last_oil_km"),
    /** What is fitted, and when it was last swapped. */
    tyresFitted: tyreSet("tyres_fitted"),
    tyresChangedOn: date("tyres_changed_on"),
    /**
     * AC separately from OC.
     *
     * They are two policies with two dates that lapse independently —
     * `insuranceExpiry` is the compulsory OC, this is the voluntary AC — and
     * one field for both meant whichever expired second was invisible.
     */
    acExpiry: date("ac_expiry"),
    status: carStatus("status").notNull().default("available"),
    /**
     * Turnaround state — NULLABLE, and null is the answer for every car today.
     *
     * Null means "nie śledzone": nobody has started a turnaround on this car,
     * so the panel says nothing about it and nothing is claimed. That is the
     * only safe default for a signal switched on mid-life. A default of `ready`
     * would assert thirteen cars are clean and fuelled on the word of a
     * migration that never looked at one; a default of `inspection` would
     * invent a queue of work that does not exist and drown the real one.
     *
     * The chain starts when somebody sets it — normally at a return.
     *
     * It deliberately does NOT gate availability. A car mid-turnaround stays
     * bookable, because turning "needs a wash" into "cannot be rented" would
     * silently withdraw cars from the fleet, and that is a commercial decision
     * belonging to the owner, not a side effect of adding a column.
     */
    prepStatus: prepStatus("prep_status"),
    /** When the turnaround state last moved — how long a car has been waiting. */
    prepUpdatedAt: timestamp("prep_updated_at", { withTimezone: true }),
    /** Free text for the one thing the four states cannot say ("brak kluczyka zapasowego"). */
    prepNote: text("prep_note"),
    notes: text("notes"),
    /**
     * What the car cost to acquire, and when the money went out.
     *
     * This is the capital the rentals have to earn back, so it is the
     * denominator of every payback figure in `lib/admin/economics`. Nullable:
     * a car whose purchase price nobody has entered gets utilisation and margin
     * like any other, but reports "no payback date" rather than a number
     * derived from a zero it was never told.
     *
     * NOT an entry in `car_expenses`. Capital and running costs answer different
     * questions — mixing them makes a car look catastrophically unprofitable in
     * its first month and quietly flatters every margin thereafter.
     */
    purchasePriceGrosze: integer("purchase_price_grosze"),
    purchasedOn: date("purchased_on"),
    /**
     * Straight-line depreciation: what the car is expected to be worth after
     * `depreciationMonths`, and how long that takes.
     *
     * Depreciation is usually the single largest cost of owning a car and it
     * appears on no invoice, so a fleet that only counts receipts reports a
     * margin that does not exist. It is reported SEPARATELY from
     * `marginGrosze` rather than folded into it — margin stays "revenue minus
     * money actually spent", and the depreciated figure sits beside it as TCO.
     * Both nullable: with either missing, no depreciation is claimed at all.
     */
    residualValueGrosze: integer("residual_value_grosze"),
    depreciationMonths: integer("depreciation_months"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("cars_model_id_idx").on(t.modelId)],
);

// ── Customers ────────────────────────────────────────────────────────────────
/**
 * A person who has rented, or is about to.
 *
 * Reservations still carry their own `customer_name` / `customer_email` /
 * `customer_phone` columns and always will: those are a SNAPSHOT of what was
 * agreed on that rental, and they must not change retroactively because
 * somebody later corrected a spelling or moved house. This table is the
 * directory — one row per person, found by phone number, so the second call
 * from the same customer does not mean typing their details again.
 *
 * The phone number is the key because that is what an operator has in hand
 * when the phone rings. It is stored normalised (digits and a leading +) so
 * "+48 601 100 200" and "601100200" find the same person.
 */
export const customerFlag = pgEnum("customer_flag", [
  "none",
  "deposit_only",
  "blocked",
]);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /**
     * Digits only, optionally leading "+". A lookup aid, NOT the identity:
     * the customer is identified by `id`. Not unique, because a number can
     * change hands or be typed wrong, and correcting it must not be blocked.
     */
    phone: text("phone").notNull(),
    /** As dialled/typed, for display — the normalised form is above. */
    phoneDisplay: text("phone_display").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    notes: text("notes"),
    /**
     * The internal flag: what the office knows and the customer does not see.
     *
     * An enum with three values rather than two booleans, because the two
     * useful states are mutually exclusive by meaning — "only against a
     * deposit" says yes with a condition, "do not rent" says no — and a pair
     * of flags can be set to both at once, which is an instruction nobody can
     * follow. `none` is the default and covers everybody.
     *
     * NEVER rendered outside /admin: this is an opinion about a person, and it
     * belongs in the office, not in an email, an invoice or a page they can
     * open.
     */
    flag: customerFlag("flag").notNull().default("none"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("customers_name_idx").on(t.name),
    index("customers_phone_idx").on(t.phone),
  ],
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;

/** How a rental was settled. Not a status — a rental can be paid or not at any status. */
export const paymentMethod = pgEnum("payment_method", [
  "cash",
  "card",
  "transfer",
  "online",
]);

// ── Booking enums ────────────────────────────────────────────────────────────
export const depositVariant = pgEnum("deposit_variant", [
  "with_deposit",
  "no_deposit",
]);

/**
 * Where the customer's security money currently stands.
 *
 * Six states because the operator named six, and each one is a different
 * answer to "whose money is it and where is it": `to_take` nobody has taken
 * it yet, `held` it is in our till, `blocked` it is frozen on the customer's
 * card and was never ours to spend, `to_return` the rental is over and it is
 * owed back, `returned` it is back with the customer, `partially_kept` some
 * of it paid for damage and the rest went back.
 *
 * `blocked` is NOT a synonym for `held`. A pre-authorisation on a card expires
 * on its own and can never be part-kept without a fresh charge, so an operator
 * looking at the list has to be able to tell the two apart at a glance.
 */
export const depositStatus = pgEnum("deposit_status", [
  "to_take",
  "held",
  "blocked",
  "to_return",
  "returned",
  "partially_kept",
]);
export const feeUnit = pgEnum("fee_unit", ["per_day", "per_rental"]);
export const reservationStatus = pgEnum("reservation_status", [
  /**
   * Formularz wysłany, klient NIE potwierdził jeszcze adresu e-mail.
   *
   * Stan PRZED `pending`, nie zamiast niego — i to jest cała decyzja
   * z rozdziału 13.4. `pending` znaczy „czeka na potwierdzenie PRZEZ
   * ADMINISTRATORA" i tak czyta go cały panel: skrzynka, statystyki,
   * przypomnienia. Wciśnięcie w to samo słowo drugiego znaczenia — „czeka na
   * potwierdzenie PRZEZ KLIENTA" — kosztowałoby przegląd każdego miejsca,
   * które dziś to słowo interpretuje. Nowa wartość na początku listy nie rusza
   * żadnego z nich: dla panelu to po prostu status, którego jeszcze nie było.
   *
   * Kalendarza nie blokuje (patrz `BLOCKING_STATUSES`) i nie może zacząć —
   * to jest powód, dla którego ten stan w ogóle powstał.
   */
  "pending_verification",
  "pending", // request submitted, does NOT block the calendar
  "confirmed", // admin-confirmed, BLOCKS the calendar (enforced by EXCLUDE)
  "cancelled",
  /**
   * Klient nie zjawił się po auto — inny fakt niż „anulowana".
   *
   * Anulowanie znaczy, że klient dał znać. Nieodebranie znaczy, że auto stało
   * i czekało. Dla kalendarza skutek jest ten sam (oba są POZA
   * `BLOCKING_STATUSES`, więc auto wraca do puli), ale dla statystyk, dla
   * obsługi i dla rozmowy z klientem to dwie różne sprawy — i tylko jedna
   * z nich niesie opłatę za nieodebranie.
   *
   * Ustawiane WYŁĄCZNIE ręcznie przez obsługę, po upływie tolerancji
   * z polityki anulowania. Żaden automat nie obciąża klienta bez spojrzenia
   * człowieka.
   */
  "no_show",
  "completed",
  "rejected",
]);

/**
 * Where the booking came in from.
 *
 * Defaults to `website`, which is what every existing row is and what the
 * public form keeps producing — so adding this column changed no history and
 * no behaviour. It exists so "how much did the assistant actually sell" is a
 * question the database can answer rather than one somebody estimates.
 */
export const reservationSource = pgEnum("reservation_source", [
  "website",
  "chatbot",
  "admin",
  "phone",
  "other",
]);

// Statuses that occupy a car and must not overlap. Kept in sync with the SQL
// EXCLUDE constraint's WHERE clause (see drizzle/0001_no_double_booking.sql).
export const BLOCKING_STATUSES = ["confirmed", "completed"] as const;

// ── Extras / fees (admin-editable) ───────────────────────────────────────────
// Location fees (office/airport/delivery) live on pickup_locations. This table
// holds the optional extras from the price calculator.
export const fees = pgTable("fees", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(), // extra_driver | child_seat | protection_package | no_deposit
  amountGrosze: integer("amount_grosze").notNull(),
  unit: feeUnit("unit").notNull().default("per_rental"),
  /**
   * Górna granica naliczenia tej opłaty, w groszach. NULL = bez granicy.
   *
   * Istnieje dla jednej reguły biznesowej: dodatkowy kierowca to 50 zł za dobę,
   * ale nie więcej niż 400 zł za cały wynajem. Trzymanie tego jako drugiej
   * stawki („do 7 dni tyle, od 8 dni tyle") oznaczałoby dwie liczby, które
   * przy pierwszej zmianie cennika rozjadą się o jeden dzień.
   */
  capGrosze: integer("cap_grosze"),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Reservations ─────────────────────────────────────────────────────────────
// A reservation is attached to a physical car unit and a [start,end] date range.
// No-double-booking is enforced in the DB by a GiST EXCLUDE constraint over
// (car_id, aa_zajetosc(...)) for BLOCKING_STATUSES — not in application code.
// The full price breakdown is snapshotted (server-computed) so it can never be
// altered by re-reading current prices, and for audit/invoicing.
export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reference: text("reference").notNull().unique(),
    carModelId: uuid("car_model_id")
      .notNull()
      .references(() => carModels.id, { onDelete: "restrict" }),
    carId: uuid("car_id")
      .notNull()
      .references(() => cars.id, { onDelete: "restrict" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    // Handover times. CZESC reguly podwojnej rezerwacji — od migracji 0045.
    //
    // Do 30.08.2026 stalo tu: „Deliberately NOT part of the no-double-booking
    // rule: a booked day is a whole booked day, so a car returned at 10:00 is
    // not re-let that afternoon". To bylo prawda i bylo kosztowne — auto
    // zwrocone 12-go o 10:00 stalo do 13-go rana. Punkt 18 zamowienia skrocil
    // ten bufor do trzech godzin liczonych od GODZINY zwrotu, wiec obie te
    // kolumny wchodza teraz do `aa_zajetosc()`, a przez nia do ograniczenia
    // EXCLUDE.
    //
    // Nullable, bo rezerwacje sprzed ich wprowadzenia zadnej nie maja — i dla
    // NICH regula zostaje dokladnie taka jak dawniej: cala doba zwrotu zajeta,
    // bez bufora. Patrz `lib/booking/bufor.ts`.
    pickupTime: time("pickup_time"),
    returnTime: time("return_time"),
    /**
     * Odometer at handover and at return.
     *
     * The only way to get a cost-per-kilometre, which is the one figure that
     * compares a cheap car with an expensive one honestly. Nullable, and
     * everything derived from them is computed over the rentals that have BOTH
     * — a partially filled column must never be silently averaged as though it
     * covered the whole fleet.
     */
    startOdometerKm: integer("start_odometer_km"),
    endOdometerKm: integer("end_odometer_km"),
    days: integer("days").notNull(),
    /**
     * Język, w którym klient wypełniał formularz — „pl" albo „en".
     *
     * Potrzebny, bo wiadomości wychodzą także PÓŹNIEJ niż samo zgłoszenie:
     * admin potwierdza rezerwację nazajutrz, klient przesuwa termin za tydzień.
     * Wtedy kontekst żądania dawno nie istnieje i `useLocale()` nie ma czego
     * odczytać. Bez tej kolumny każdy taki mail szedłby po polsku — także do
     * kogoś, kto całą stronę oglądał po angielsku.
     *
     * `default('pl')` opisuje prawdę historyczną: do 30.08.2026 wszystkie
     * wiadomości i tak wychodziły po polsku.
     */
    locale: text("locale").notNull().default("pl"),
    pickupLocationId: uuid("pickup_location_id")
      .notNull()
      .references(() => pickupLocations.id, { onDelete: "restrict" }),
    extraDriver: boolean("extra_driver").notNull().default(false),
    childSeat: boolean("child_seat").notNull().default(false),
    protectionPackage: boolean("protection_package").notNull().default(false),
    depositVariant: depositVariant("deposit_variant")
      .notNull()
      .default("with_deposit"),
    // Server-computed price snapshot (grosze). `quote` holds the full line-item
    // breakdown as JSON for audit; the columns below are the headline figures.
    totalGrosze: integer("total_grosze").notNull(),
    depositGrosze: integer("deposit_grosze").notNull().default(0),
    quote: text("quote").notNull(), // JSON string of the QuoteBreakdown
    // Client details captured with the request. Document scans + the most sensitive
    // IDs (PESEL/passport) are deliberately NOT stored yet — deferred until private
    // storage, field encryption and a RODO basis are in place (see SECURITY.md).
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerPhone: text("customer_phone").notNull(),
    dateOfBirth: date("date_of_birth"),
    addressStreet: text("address_street"),
    addressPostcode: text("address_postcode"),
    addressCity: text("address_city"),
    licenceNumber: text("licence_number"),
    status: reservationStatus("status").notNull().default("pending"),
    /** Which channel produced this booking — see `reservationSource`. */
    source: reservationSource("source").notNull().default("website"),
    /**
     * The directory entry this rental belongs to, when there is one.
     *
     * Nullable and ON DELETE SET NULL on purpose: every reservation ever made
     * through the public site predates the customer directory, and deleting a
     * customer record must never take their rental history with it. The
     * `customer_*` columns above remain the authoritative record of what was
     * agreed on THIS rental.
     */
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    /**
     * How it was paid, and when it was marked paid.
     *
     * Deliberately NOT a reservation status. "Opłacona" is not a stage between
     * confirmed and completed — a rental can be paid up front, on handover, or
     * after return, and folding that into the status enum would break the
     * state machine that decides whether a car is blocked in the calendar.
     * Payment is a second, independent fact about the same booking.
     */
    paymentMethod: paymentMethod("payment_method"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    // Free-text reason an admin gives when rejecting a request. Nullable: only a
    // rejection carries one, and it is optional even then. Stored (not just
    // emailed) so the reason survives on the record and shows on the detail page.
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("reservations_car_id_idx").on(t.carId),
    index("reservations_car_model_id_idx").on(t.carModelId),
    index("reservations_status_idx").on(t.status),
  ],
);

export type PickupLocation = typeof pickupLocations.$inferSelect;
export type NewPickupLocation = typeof pickupLocations.$inferInsert;
export type CarModel = typeof carModels.$inferSelect;
export type NewCarModel = typeof carModels.$inferInsert;
export type Car = typeof cars.$inferSelect;
export type NewCar = typeof cars.$inferInsert;
export type Fee = typeof fees.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;

/**
 * Potwierdzenie rezerwacji przez klienta — rozdział 13.4.
 *
 * Jeden wiersz na jedną wysłaną wiadomość. W bazie leży WYŁĄCZNIE skrót tokenu
 * (sha-256), nigdy sam token: link z maila jest hasłem na okaziciela i wyciek
 * kopii bazy nie może dawać możliwości potwierdzania cudzych rezerwacji.
 *
 * `used_at` zamiast kasowania wiersza — bo „ten link został już użyty" to inna
 * odpowiedź niż „takiego linku nie ma", a klient, który kliknął dwa razy
 * (albo któremu program pocztowy odwiedził link z podglądu), zasługuje na
 * zdanie, które mu coś mówi.
 *
 * `attempts` liczy nieudane trafienia w ten sam wiersz — po to, żeby zgadywanie
 * tokenów zostawiało ślad, a nie tylko ciszę.
 */
export const reservationVerifications = pgTable(
  "reservation_verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => reservations.id, { onDelete: "cascade" }),
    /** sha-256 z tokenu, zapisany szesnastkowo. */
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    /** Ile razy wysłaliśmy ten sam link ponownie — limit na prośby „wyślij jeszcze raz". */
    resendCount: integer("resend_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("reservation_verifications_reservation_idx").on(t.reservationId),
    index("reservation_verifications_expires_idx").on(t.expiresAt),
  ],
);

export type ReservationVerification =
  typeof reservationVerifications.$inferSelect;

/**
 * Klucz do ZARZĄDZANIA własną rezerwacją — samodzielna zmiana i anulowanie.
 *
 * ## Dlaczego numer rezerwacji tu nie wystarcza
 *
 * `AA-` plus osiem znaków szesnastkowych to około czterech miliardów wartości.
 * Do PODGLĄDU to wystarcza i tak zostało zaprojektowane w `booking/lookup.ts`:
 * kto zna numer, widzi termin i auto, ale nie dowiaduje się, KTO rezerwował.
 * Zmiana terminu i anulowanie to inna kategoria — operacje NIEODWRACALNE dla
 * cudzej sprawy. Trzydzieści dwa bity, numery wysyłane mailem, wklejane
 * w wiadomościach i leżące w `localStorage` przeglądarki, nie są podstawą,
 * na której wolno na to pozwolić.
 *
 * Dlatego zarządzanie stoi na osobnym kluczu: 32 bajty z generatora
 * kryptograficznego (256 bitów), wydawane raz przy tworzeniu rezerwacji.
 * W bazie leży WYŁĄCZNIE skrót sha-256 — tak samo jak przy weryfikacji
 * e-maila i przy kodach zapasowych panelu. Wyciek zrzutu bazy nie daje
 * nikomu władzy nad rezerwacjami.
 *
 * ## Unieważnianie
 *
 * `revokedAt` istnieje, żeby dało się klucz odciąć bez kasowania wiersza:
 * po anulowaniu rezerwacji, po zmianie właściciela sprawy albo na prośbę
 * klienta, który wysłał komuś link przez pomyłkę. Wiersz zostaje, bo historia
 * dostępu jest częścią audytu.
 *
 * `lastUsedAt` odpowiada na jedno pytanie przy reklamacji: czy z tego klucza
 * ktokolwiek korzystał i kiedy. Nie zapisujemy adresu IP — do niczego, co ten
 * moduł robi, nie jest potrzebny, a byłby kolejną daną osobową do pilnowania.
 */
export const reservationAccess = pgTable(
  "reservation_access",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => reservations.id, { onDelete: "cascade" }),
    /** sha-256 z klucza, zapisany szesnastkowo. Klucz jawny nie istnieje nigdzie poza przeglądarką klienta. */
    tokenHash: text("token_hash").notNull().unique(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("reservation_access_reservation_idx").on(t.reservationId)],
);

export type ReservationAccess = typeof reservationAccess.$inferSelect;

// ── Admin accounts (no public registration) ──────────────────────────────────
/**
 * Role kont panelu.
 *
 * `operator` (PRACOWNIK) dochodzi w rozdziale 13.6 i jest NAJWĘŻSZA: obsługa
 * bieżąca — rezerwacje, wydania i zwroty, skrzynka — bez kont, bez cen, bez
 * ustawień i bez bezpieczeństwa. Sama wartość w enumie niczego nie pilnuje;
 * pilnuje tego mapa uprawnień w `lib/auth/permissions.ts`, a kod pyta
 * „czy wolno TĘ operację", a nie „czy to superadmin".
 *
 * Kolejność wartości jest od najsłabszej do najmocniejszej i tak też czyta ją
 * `ROLE_RANK`; dopisanie czwartej roli w środku tej listy wymaga przejrzenia
 * tamtej stałej.
 */
export const adminRole = pgEnum("admin_role", [
  "operator",
  "admin",
  "superadmin",
]);

export const admins = pgTable("admins", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(), // argon2
  name: text("name").notNull(),
  /**
   * Contact number for the person, not for the company.
   *
   * Nothing publishes it — the public site reads its numbers from the `company`
   * setting. This is who to ring when the monitor fires at 3am, and the future
   * per-person notification routing will read it.
   */
  phone: text("phone"),
  role: adminRole("role").notNull().default("admin"),
  /**
   * Sekret TOTP — base32, zapisany dopiero po UDANYM sprawdzeniu pierwszego
   * kodu. Do tej chwili siedzi w krótkotrwałym ciasteczku rejestracji, więc
   * konto nigdy nie ma w bazie sekretu, którego właściciel nie potrafi użyć.
   * Nigdy nie trafia do logów ani do alertów (patrz `alerts/redact`).
   */
  totpSecret: text("totp_secret"),
  /** Kiedy 2FA zostało włączone. `null` = nieaktywne, niezależnie od sekretu. */
  totpConfirmedAt: timestamp("totp_confirmed_at", { withTimezone: true }),
  /**
   * Granica ważności sesji — „wyloguj ze wszystkich urządzeń".
   *
   * Sesje są w JWT, więc nie ma czego skasować po stronie serwera. Zamiast
   * przebudowywać całe logowanie na sesje w bazie, konto niesie znacznik:
   * token wydany PRZED tą chwilą jest nieważny, a `currentAdmin()` i tak czyta
   * ten wiersz przy każdym wejściu, więc sprawdzenie nic nie kosztuje.
   */
  sessionsValidFrom: timestamp("sessions_valid_from", { withTimezone: true }),
  /**
   * Skrót ostatniego znanego urządzenia (przeglądarka + system + sieć).
   * Służy WYŁĄCZNIE do rozpoznania „to logowanie jest z nowego urządzenia";
   * nie da się z niego odtworzyć nagłówka ani adresu.
   */
  lastDeviceHash: text("last_device_hash"),
  // Brute-force protection: lock after repeated failures.
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Audit log — every admin action + auth event (who/what/before→after/when) ──
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminId: uuid("admin_id").references(() => admins.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(), // login.success | login.fail | reservation.confirm | price.update | car.delete …
    entity: text("entity"), // reservation | car_model | car | fee | pickup_location | admin
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_log_admin_idx").on(t.adminId),
    index("audit_log_created_idx").on(t.createdAt),
  ],
);

/**
 * Kody zapasowe do 2FA — jedyna droga z powrotem, gdy telefon przepadnie.
 *
 * Zapisujemy WYŁĄCZNIE skrót (argon2, ten sam co przy hasłach). Kod widać raz,
 * przy generowaniu; potem nie da się go odtworzyć z bazy i nikt — łącznie
 * z administratorem bazy — nie odczyta go z tej tabeli. Kod jednorazowy:
 * `used_at` stemplowane w tej samej transakcji, w której następuje logowanie.
 */
export const adminRecoveryCodes = pgTable(
  "admin_recovery_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => admins.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("admin_recovery_admin_idx").on(t.adminId)],
);

/**
 * Dziennik zdarzeń bezpieczeństwa — surowy, obszerny, bez scalania.
 *
 * Osobno od `audit_log` i osobno od rejestru alertów, bo odpowiada na inne
 * pytanie. `audit_log` mówi „kto co zmienił". Rejestr alertów mówi „co jest
 * zepsute i wymaga uwagi człowieka". Ten dziennik mówi „co system ODRZUCIŁ" —
 * pułapka na roboty, przekroczony limit, brak tokenu antybotowego. Takich
 * wpisów bywa tysiąc dziennie i nie każdy jest wart obudzenia kogokolwiek;
 * dopiero ich GĘSTOŚĆ bywa warta.
 *
 * `subject` jest z założenia SKRÓCONYM identyfikatorem (osiem znaków skrótu),
 * nie adresem i nie e-mailem: do policzenia „ile razy ten sam ktoś" wystarczy,
 * a dziennik nie staje się drugim zbiorem danych osobowych. Rozdział 13.1
 * wymaga wprost, żeby nie zapisywać tu zbędnych danych osobowych.
 */
export const securityEvents = pgTable(
  "security_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /**
     * Rodzaj blokady. Tekst, nie `pgEnum`, i to jest świadome: dopisanie
     * czwartego rodzaju blokady nie może wymagać migracji bazy, bo wtedy nikt
     * nowej blokady nie doda. Zamknięty zbiór pilnuje typ `SecurityEventKind`
     * po stronie kodu, gdzie jest tani.
     */
    kind: text("kind").notNull(),
    /** Trasa albo akcja, na której doszło do odrzucenia. */
    endpoint: text("endpoint").notNull(),
    /** Skrócony identyfikator sprawcy — patrz `shortSubject`. Nigdy adres IP wprost. */
    subject: text("subject"),
    /** Konto panelu, jeżeli zdarzenie dotyczy administratora. */
    adminId: uuid("admin_id").references(() => admins.id, {
      onDelete: "set null",
    }),
    /** Techniczne szczegóły. Bez danych osobowych i bez sekretów. */
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("security_events_kind_idx").on(t.kind),
    index("security_events_created_idx").on(t.createdAt),
    index("security_events_subject_idx").on(t.subject),
  ],
);

export type SecurityEvent = typeof securityEvents.$inferSelect;
export type AdminRecoveryCode = typeof adminRecoveryCodes.$inferSelect;

export type Admin = typeof admins.$inferSelect;
export type NewAdmin = typeof admins.$inferInsert;
export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;

// ── Availability blocks — admin-created blackout ranges per car unit ──────────
// Distinct from reservations (which are customer bookings): a block is an
// INTERNAL unavailability window — maintenance, an offline/phone booking, owner
// use, the car being sold, seasonal downtime. A unit is unavailable for a date
// range if it has a block whose whole-day range overlaps it (`aa_zajetosc_bloku`,
// migracja 0045 — blokady operatora zostaja dobowe); the public
// allocation query (see lib/booking/actions.ts) excludes blocked units, so no
// online booking can land on those dates. "Block a whole model" is expressed as
// one row per unit of the model — storage stays per-unit, matching the way
// reservations and the no-double-booking constraint already work.
export const availabilityBlocks = pgTable(
  "availability_blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    carId: uuid("car_id")
      .notNull()
      .references(() => cars.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    reason: text("reason"),
    createdBy: uuid("created_by").references(() => admins.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("availability_blocks_car_id_idx").on(t.carId),
    index("availability_blocks_dates_idx").on(t.startDate, t.endDate),
  ],
);

export type AvailabilityBlock = typeof availabilityBlocks.$inferSelect;
export type NewAvailabilityBlock = typeof availabilityBlocks.$inferInsert;

// ── Car running costs ────────────────────────────────────────────────────────
/**
 * What a car costs to keep, by kind.
 *
 * An enum rather than free text because these figures are summed, charted and
 * compared between cars — "opony", "Opony" and "wymiana opon" typed on three
 * different days are one cost category to an accountant and three to a
 * `GROUP BY`. The free-text `note` is where the detail goes.
 *
 * Deliberately absent: the purchase price. That lives on `cars` — see the note
 * there on why capital is not a running cost.
 */
export const expenseCategory = pgEnum("expense_category", [
  // Servicing and wear
  "oil", // olej / wymiana oleju
  "filters", // filtry
  "tyres", // opony
  "brakes", // hamulce
  "service", // przegląd okresowy
  "mechanical", // naprawa mechaniczna
  "electrical", // naprawa elektryczna
  "bodywork", // blacharka / lakiernictwo
  "inspection", // badanie techniczne
  // Standing costs — these accrue whether or not the car moves, which is what
  // makes an idle day expensive rather than merely unproductive.
  "insurance", // OC / AC
  "leasing", // rata leasingu lub kredytu
  "tax", // podatki i opłaty urzędowe
  "parking", // parking / garaż
  // Per-rental running costs
  "fuel", // paliwo / ładowanie
  "cleaning", // mycie / detailing
  "equipment", // wyposażenie, akcesoria
  "fine", // mandaty i kary
  "other",
]);

export const carExpenses = pgTable(
  "car_expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /**
     * The physical car, not the model. Two units of the same model wear out at
     * different rates, and the whole point of this table is to show which one.
     * Cascades: an expense outlives nothing, and a deleted car cannot leave
     * orphaned costs skewing fleet totals.
     */
    carId: uuid("car_id")
      .notNull()
      .references(() => cars.id, { onDelete: "cascade" }),
    category: expenseCategory("category").notNull(),
    amountGrosze: integer("amount_grosze").notNull(),
    /** The day the cost was incurred — NOT the day it was typed in. */
    incurredOn: date("incurred_on").notNull(),
    /**
     * Odometer reading at the time, when known. Turns the expense list into a
     * service history you can act on ("olej ostatnio przy 82 000 km").
     */
    odometerKm: integer("odometer_km"),
    /**
     * The period the cost COVERS, when it is not a single day.
     *
     * An annual insurance premium entered against one date draws a cliff in the
     * daily chart and makes one month look catastrophic while eleven look
     * cheap. With a period, the same amount is spread across the days it buys.
     * The TOTAL never changes — only which day and month it is attributed to.
     *
     * Both null (the default, and every row that existed before this column)
     * means "belongs to `incurredOn` alone", so nothing had to be migrated.
     */
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    /**
     * Set when this row was generated from a `recurringCosts` definition.
     * Together with the unique index below it is what makes "fill in the
     * missing months" safe to press twice.
     */
    recurringId: uuid("recurring_id").references(
      // Arrow, not a direct reference: `recurringCosts` is declared further
      // down the file and drizzle resolves this lazily.
      (): typeof recurringCosts.id => recurringCosts.id,
      { onDelete: "set null" },
    ),
    /**
     * Path to the invoice or receipt, served ONLY through the authenticated
     * admin route. Invoices carry counterparty names and amounts and must
     * never go through the public `/api/media` reader.
     */
    invoicePath: text("invoice_path"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => admins.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Every query here is "this car, newest first" or "this car, in this date
    // window" — one composite index serves both.
    index("car_expenses_car_id_incurred_idx").on(t.carId, t.incurredOn),
    index("car_expenses_incurred_idx").on(t.incurredOn),
    // One generated row per definition per period. This is the constraint that
    // makes the generator idempotent — not a check in the action, which two
    // concurrent clicks would both pass.
    uniqueIndex("car_expenses_recurring_period_unique")
      .on(t.recurringId, t.periodStart)
      .where(sql`recurring_id IS NOT NULL`),
  ],
);

export type CarExpense = typeof carExpenses.$inferSelect;
export type NewCarExpense = typeof carExpenses.$inferInsert;

/** How often a standing cost falls due. */
export const recurringInterval = pgEnum("recurring_interval", [
  "monthly",
  "quarterly",
  "yearly",
]);

/**
 * A standing cost that repeats — a leasing instalment, an annual premium.
 *
 * This table holds the DEFINITION only. Pressing "fill in the missing periods"
 * writes real `car_expenses` rows from it, rather than the economics engine
 * accruing them invisibly at read time. That costs a button, and buys:
 *
 *   · every cost stays visible and editable in one list, so an operator is
 *     never looking at a total they cannot drill into;
 *   · no double counting when somebody also enters the instalment by hand —
 *     they can see it is already there;
 *   · an audit-log entry for money appearing in the books.
 *
 * Idempotence is enforced by the unique index on
 * (`car_expenses.recurring_id`, `period_start`), not by a check in the action.
 */
export const recurringCosts = pgTable(
  "recurring_costs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    carId: uuid("car_id")
      .notNull()
      .references(() => cars.id, { onDelete: "cascade" }),
    category: expenseCategory("category").notNull(),
    /** Amount of ONE occurrence, not the annual total. */
    amountGrosze: integer("amount_grosze").notNull(),
    interval: recurringInterval("interval").notNull(),
    /** First period starts on this day. */
    startOn: date("start_on").notNull(),
    /** Last day the cost applies; null means "still running". */
    endOn: date("end_on"),
    note: text("note"),
    /**
     * Switched off rather than deleted, so the rows it already generated keep
     * a definition to point back at.
     */
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => admins.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("recurring_costs_car_id_idx").on(t.carId)],
);

export type RecurringCost = typeof recurringCosts.$inferSelect;
export type NewRecurringCost = typeof recurringCosts.$inferInsert;

// ── Business running costs — the company, not the cars ───────────────────────
/**
 * What the COMPANY costs to run: advertising, the accountant, the office, the
 * phones, the domain. Everything that is spent to keep the business trading and
 * that no single car is responsible for.
 *
 * A separate table from `car_expenses` rather than a nullable `car_id` on that
 * one, for two reasons that are worth the extra table:
 *
 *   · Every per-car figure — margin, break-even against the purchase price, the
 *     cost of an idle day — is computed by joining on `car_expenses.car_id`. A
 *     nullable column there would either need `IS NOT NULL` added to a dozen
 *     queries or would quietly charge a month of Instagram ads to whichever car
 *     the join happened to reach. The Porsche does not owe TikTok anything.
 *   · The vocabularies genuinely differ. "Wymiana oleju" is meaningless for a
 *     company cost and "ZUS" is meaningless for a car, so one shared enum would
 *     be a picker where two thirds of the entries are always wrong.
 *
 * The two tables meet exactly once, in the company result:
 *   przychód − koszty aut − koszty firmowe.
 *
 * Categories that appear in BOTH enums (parking, fuel, cleaning, insurance,
 * tax) are the judgement call an operator has to make once: attributable to a
 * registration plate → enter it at the car, so its margin is honest; shared
 * across the fleet or the office → enter it here.
 */
export const businessExpenseCategory = pgEnum("business_expense_category", [
  // Marketing — the money that buys phone calls.
  "ads_google", // Google Ads
  "ads_facebook", // Facebook
  "ads_instagram", // Instagram
  "ads_tiktok", // TikTok
  "marketing_other", // ulotki, sesja zdjęciowa, współpraca
  // Premises
  "parking", // parking / garaż wynajmowany na flotę, nie na jedno auto
  "rent", // czynsz biura
  "utilities", // prąd, woda, ogrzewanie, śmieci
  "office", // wyposażenie i materiały biurowe
  // Services and technology
  "accounting", // księgowa / biuro rachunkowe
  "legal", // obsługa prawna
  "phone", // telefony i internet
  "software", // oprogramowanie i subskrypcje
  "domain", // domena i hosting
  "website", // strona www — rozwój i utrzymanie
  // Fleet costs that no single car owns
  "cleaning", // myjnia, sprzątanie
  "fuel", // paliwo nieprzypisane do egzemplarza
  "tools", // narzędzia, wyposażenie warsztatowe
  // People
  "salary", // wynagrodzenia
  "contractor", // zlecenia i podwykonawcy
  "training", // szkolenia
  // Money and the state
  "bank", // opłaty bankowe, prowizje, terminal
  "insurance", // ubezpieczenie firmy — nie OC/AC auta
  "tax", // podatki i opłaty urzędowe
  "zus", // ZUS i składki
  "other",
]);

export const businessExpenses = pgTable(
  "business_expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    category: businessExpenseCategory("category").notNull(),
    amountGrosze: integer("amount_grosze").notNull(),
    /** The day the cost was incurred — NOT the day it was typed in. */
    incurredOn: date("incurred_on").notNull(),
    /**
     * The period the cost COVERS, when it is not a single day. Identical rule
     * to `car_expenses`: a year of hosting paid in January is spread over the
     * twelve months it buys, so January does not look like a disaster and the
     * other eleven do not look free. The TOTAL never changes.
     */
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    /** Set when the row was generated from a `businessRecurringCosts` definition. */
    recurringId: uuid("recurring_id").references(
      (): typeof businessRecurringCosts.id => businessRecurringCosts.id,
      { onDelete: "set null" },
    ),
    /**
     * Who was paid — "Meta Platforms", "Biuro Rachunkowe Kowalska". Free text
     * on purpose: the category is what gets summed, this is what gets
     * recognised on a bank statement three months later.
     */
    vendor: text("vendor"),
    /** Served ONLY through the authenticated admin route, as with car invoices. */
    invoicePath: text("invoice_path"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => admins.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("business_expenses_incurred_idx").on(t.incurredOn),
    index("business_expenses_category_idx").on(t.category, t.incurredOn),
    // Same idempotence mechanism as car expenses: one generated row per
    // definition per period, enforced by the database rather than by a check
    // in the action that two quick clicks would both pass.
    uniqueIndex("business_expenses_recurring_period_unique")
      .on(t.recurringId, t.periodStart)
      .where(sql`recurring_id IS NOT NULL`),
  ],
);

export type BusinessExpense = typeof businessExpenses.$inferSelect;
export type NewBusinessExpense = typeof businessExpenses.$inferInsert;

/**
 * A company cost that repeats — the accountant every month, the domain every
 * year, the ad budget every month.
 *
 * Matters more here than it does for cars: almost every company cost IS a
 * subscription. The definition is stored; pressing "uzupełnij" writes real
 * `business_expenses` rows, for the same reasons set out on `recurringCosts` —
 * every złoty stays visible, editable and auditable rather than accruing
 * invisibly at read time.
 */
export const businessRecurringCosts = pgTable("business_recurring_costs", {
  id: uuid("id").defaultRandom().primaryKey(),
  category: businessExpenseCategory("category").notNull(),
  /** Amount of ONE occurrence, not the annual total. */
  amountGrosze: integer("amount_grosze").notNull(),
  interval: recurringInterval("interval").notNull(),
  startOn: date("start_on").notNull(),
  /** Last day the cost applies; null means "still running". */
  endOn: date("end_on"),
  vendor: text("vendor"),
  note: text("note"),
  /** Switched off rather than deleted, so generated rows keep a definition. */
  active: boolean("active").notNull().default(true),
  createdBy: uuid("created_by").references(() => admins.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type BusinessRecurringCost = typeof businessRecurringCosts.$inferSelect;
export type NewBusinessRecurringCost =
  typeof businessRecurringCosts.$inferInsert;

// ── Site settings — admin-editable content that isn't a first-class entity ────
// A single key/value store rather than a column per setting: these are sparse,
// unrelated blobs (social URLs, hero image, page visibility flags, legal
// documents) that the operator edits from the admin panel and the public site
// reads. Adding a setting means adding a key, not a migration.
//
// `value` is jsonb so each key defines its own shape; the typed accessors in
// lib/admin/settings.ts are the only place that shape is interpreted, and they
// fall back to a built-in default whenever a key is absent or malformed.
export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedBy: uuid("updated_by").references(() => admins.id, {
    onDelete: "set null",
  }),
});

export type SiteSetting = typeof siteSettings.$inferSelect;
export type NewSiteSetting = typeof siteSettings.$inferInsert;

// ── System health — what the cron jobs report about themselves ───────────────
/**
 * The panel runs inside a container that mounts nothing but `/app/media`. It
 * cannot see the backup directory, the TLS certificate or the host's disk, so
 * it cannot check any of them itself. This table is how the scripts that CAN
 * see them report back, and the security page reads it.
 *
 * The design point is `checkedAt`. A status column alone would keep showing a
 * green light forever after the monitor stopped running — the exact failure the
 * page exists to catch. The page therefore renders the age of the report beside
 * the status, and treats anything stale as unknown rather than as good. A check
 * that has never run has no row at all, which reads as "nie wiadomo", not "OK".
 */
export const healthStatus = pgEnum("health_status", ["ok", "warn", "fail"]);

export const systemHealth = pgTable("system_health", {
  /**
   * Stable key: backup | backup_offsite | monitor | disk | cert | app.
   *
   * `check_key`, not `check`: CHECK is a reserved word in SQL, and the cron
   * scripts write here with raw psql. A column that needs quoting in every
   * hand-written statement is a syntax error waiting for the one query someone
   * forgets to quote.
   */
  checkKey: text("check_key").primaryKey(),
  status: healthStatus("status").notNull(),
  /** One human sentence: "kopia z dziś 03:00, 84 KB, zweryfikowana". */
  detail: text("detail"),
  checkedAt: timestamp("checked_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SystemHealth = typeof systemHealth.$inferSelect;

// ── System alerts — what broke, not what needs doing ─────────────────────────
/**
 * The technical incident register.
 *
 * Deliberately NOT the same thing as `/admin/alerty`'s existing list. That list
 * is operational — overdue returns, unpaid rentals, an inspection running out —
 * and it is computed live from the business tables, so it needs no storage and
 * has no history. This table holds the other half of the question: what FAILED.
 * A 500 on the fleet page, a reservation that threw, an upload that died, a
 * media file the database still points at. Nobody can derive those from the
 * business data afterwards, so if they are not written down as they happen they
 * are gone.
 *
 * Both halves render on the same page. Two pages would mean the operator has to
 * know which kind of problem they have before they know they have one.
 *
 * ## Why a fingerprint, and why it is unique
 *
 * The failure mode of every alert system is volume. One broken image referenced
 * by the fleet page produces an alert per request, which on a crawled site is
 * hundreds a day, and an operator who has scrolled past four hundred identical
 * cards has stopped reading the page. So identity is the fingerprint, not the
 * row: the same failure recurring UPDATEs `last_seen` and increments
 * `occurrences` instead of inserting. The unique index is what makes that
 * atomic under concurrency — two requests failing at the same instant race into
 * one `ON CONFLICT` and both are counted.
 *
 * The fingerprint must therefore contain only the stable part of a failure —
 * module, severity, what broke — and never a timestamp, a request id or a
 * customer id. `lib/alerts/fingerprint` is the only place allowed to build one.
 *
 * ## What must never be in here
 *
 * `detail` and `context` are rendered in the panel, so they are sanitised at
 * the door by `lib/alerts/redact`: no tokens, no passwords, no session cookies,
 * no API keys, no connection strings with credentials, no card numbers. The
 * rule is enforced where alerts are RECORDED rather than where they are shown,
 * because a secret that reaches the database has already leaked — every backup
 * of this table would carry it.
 */
export const alertSeverity = pgEnum("alert_severity", [
  "critical",
  "error",
  "warning",
  "info",
]);

/**
 * Which part of the system reported it. Text with a checked union in the
 * application rather than an enum: `payments` has to exist here before payments
 * are switched on, and a future module must not need a migration to report a
 * failure. Adding a value to a pgEnum is a schema change; adding one to a
 * string union is not.
 */
export const alertState = pgEnum("alert_state", [
  "active",
  "acknowledged",
  "resolved",
]);

export const systemAlerts = pgTable(
  "system_alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Identity. One row per distinct failure — see the note above. */
    fingerprint: text("fingerprint").notNull().unique(),
    severity: alertSeverity("severity").notNull(),
    /** `public | booking | chat | fleet | media | admin | payments | health`. */
    module: text("module").notNull(),
    /** One line an operator can act on: "Nie można wczytać floty". */
    title: text("title").notNull(),
    /** Technical context, already redacted. May be empty. */
    detail: text("detail"),
    /** Structured extras, already redacted. Never a customer record. */
    context: jsonb("context"),
    firstSeen: timestamp("first_seen", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeen: timestamp("last_seen", { withTimezone: true })
      .notNull()
      .defaultNow(),
    occurrences: integer("occurrences").notNull().default(1),
    state: alertState("state").notNull().default("active"),
    /**
     * When a resolved alert happened again.
     *
     * Kept separate from `first_seen` because they answer different questions:
     * "since when has this been broken at all" and "we thought we had fixed
     * this — when did it come back". A reopened alert that overwrote its own
     * first sighting would erase the evidence that it is a recurring fault.
     */
    reopenedAt: timestamp("reopened_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    /** Admin login, not an id: the row outlives the account that closed it. */
    resolvedBy: text("resolved_by"),
  },
  (t) => [
    // The panel's default view: everything unresolved, worst and freshest
    // first. Severity is not in the index because it is an enum whose order is
    // declaration order, which is exactly the order the panel wants.
    index("system_alerts_state_idx").on(t.state, t.lastSeen),
    index("system_alerts_module_idx").on(t.module, t.lastSeen),
  ],
);

export type SystemAlert = typeof systemAlerts.$inferSelect;
export type NewSystemAlert = typeof systemAlerts.$inferInsert;

// ── Chatbot ──────────────────────────────────────────────────────────────────
/**
 * The assistant's own records: what was said, who asked to be called back, and
 * which questions it could not answer.
 *
 * What is deliberately NOT here: any copy of a price, a deposit, a mileage
 * limit or an availability window. The assistant reads those from
 * `lib/booking/*` and `car_models` at the moment it answers, so an admin who
 * edits a price in the panel changes what the bot says on the next message. A
 * cached figure in this table would be a second source of truth, and the second
 * source is always the one that is wrong.
 *
 * `car_model_id` and `location_id` are stored because they are what the
 * conversation was ABOUT — pointers into the live data, not copies of it.
 */
export const chatRole = pgEnum("chat_role", ["user", "bot"]);

export const chatStatus = pgEnum("chat_status", [
  "active",
  "handoff", // customer asked for a human
  "closed",
]);

export const chatConversations = pgTable(
  "chat_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** "pl" | "en" — what the visitor was actually answered in. */
    locale: text("locale").notNull().default("pl"),
    /** Last recognised intent, for the "temat" column in the admin list. */
    topic: text("topic"),
    /** What the conversation was about — a pointer, never a copy. */
    carModelId: uuid("car_model_id").references(() => carModels.id, {
      onDelete: "set null",
    }),
    dateFrom: date("date_from"),
    dateTo: date("date_to"),
    locationId: uuid("location_id").references(() => pickupLocations.id, {
      onDelete: "set null",
    }),
    leadCreated: boolean("lead_created").notNull().default(false),
    /** The visitor pressed "Zarezerwuj" and was handed to the booking form. */
    wentToBooking: boolean("went_to_booking").notNull().default(false),
    /**
     * The booking page actually opened, carrying this conversation's id.
     *
     * The stage between the click and the finished reservation. Until this
     * column existed the funnel had a hole there and said so in words: the
     * click handed the visitor to the booking page and the page reported
     * nothing back, so any number under "rozpoczęli formularz" would have been
     * the click count wearing a different label. Reported by `BookingPanel`
     * when it mounts with a conversation id — a real event, independent of the
     * click, and the two genuinely differ whenever somebody closes the tab on
     * the way.
     *
     * NULLABLE, and that is the whole point of the column's second version.
     * `false` means "this conversation was watched and the form was not
     * reached"; `NULL` means "nobody was watching yet". Added as NOT NULL
     * DEFAULT false on 21.08.2026, it made all 444 existing conversations read
     * as failures — 39 clicks and zero forms — which looks exactly like a
     * broken funnel and was in fact a column one day old. The three states are
     * what stop a new measurement from being reported as a collapse in
     * conversion.
     */
    bookingFormStarted: boolean("booking_form_started"),
    /**
     * The visitor opened a car — the stage between "cars were shown" and "they
     * went to book".
     *
     * Separate from `wentToBooking`, which both buttons on a chat card used to
     * fire. "Zobacz samochód" and "Zarezerwuj" are different decisions, and
     * collapsing them meant the funnel could not tell browsing from intent to
     * book.
     */
    carOpened: boolean("car_opened"),
    /**
     * Set when a reservation was actually created from this conversation —
     * the far end of "chatbot → rezerwacja → płatność".
     */
    reservationId: uuid("reservation_id").references(() => reservations.id, {
      onDelete: "set null",
    }),
    messageCount: integer("message_count").notNull().default(0),
    /** How many times the assistant had to admit it did not understand. */
    unansweredCount: integer("unanswered_count").notNull().default(0),

    /*
     * Five facts, so the "why did this not become a booking" answer can be
     * DERIVED rather than guessed.
     *
     * Each is something that either observably happened or observably did not.
     * None of them is an interpretation — the interpretation happens once, on
     * read, in `noBookingReason()`, where it can also come back as "not enough
     * evidence". A stored guess would harden one reading of a conversation
     * into a fact and there would be no way to tell later which rows were
     * guesses.
     */
    /** The visitor was looking for a car at all (FIND_CAR / availability / price). */
    searchedCar: boolean("searched_car").notNull().default(false),
    /** At least one real car card was put in front of them. */
    matchedCar: boolean("matched_car").notNull().default(false),
    /** A price or a full quote was shown. */
    sawPrice: boolean("saw_price").notNull().default(false),
    /** Substitutes were offered after a miss or a clash. */
    alternativesShown: boolean("alternatives_shown").notNull().default(false),
    /**
     * The question the assistant failed on last turn, normalised.
     *
     * Server-side rather than in the slots the browser round-trips, because
     * this decides what gets counted in `chat_unanswered` and a counter a
     * visitor can edit is a counter nobody should read. Cleared as soon as the
     * next turn settles it.
     */
    pendingUnanswered: text("pending_unanswered"),
    /** Cloudflare read at least one message in this conversation. */
    aiUsed: boolean("ai_used").notNull().default(false),
    /** …and at least once it failed or was refused, so the rules answered. */
    aiFallback: boolean("ai_fallback").notNull().default(false),

    status: chatStatus("status").notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("chat_conversations_started_idx").on(t.startedAt),
    index("chat_conversations_status_idx").on(t.status),
  ],
);

export type ChatConversation = typeof chatConversations.$inferSelect;

/**
 * The transcript.
 *
 * No IP address and no browser fingerprint: the rate limiter needs an address
 * for a few minutes in memory, the transcript does not need one for months.
 * Retention is enforced by `purgeOldChats` — see `lib/chat/repo`.
 */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    role: chatRole("role").notNull(),
    body: text("body").notNull(),
    /** Which intent the parser assigned; null for bot messages. */
    intent: text("intent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("chat_messages_conversation_idx").on(t.conversationId, t.createdAt),
  ],
);

export type ChatMessage = typeof chatMessages.$inferSelect;

/**
 * Skąd przyszło zapytanie klienta.
 *
 * Ustawiane WYŁĄCZNIE po stronie serwera, nigdy z ciała żądania: dla leada
 * z czatu wyprowadzane z zapisanej intencji rozmowy (`chat_conversations.topic`),
 * dla formularza kontaktowego i pytania o konkretne auto — z trasy, która je
 * przyjęła. Klient nie ma jak podszyć się pod źródło, bo go nie podaje.
 *
 * `chat_leads.topic` NIE nadaje się na to miejsce, choć wygląda podobnie:
 * jest wpisywane na sztywno jako `"chat"` przy każdym leadzie od początku
 * istnienia czatu, więc niesie zero informacji i nie da się go odczytać
 * wstecz.
 */
export const requestSource = pgEnum("request_source", [
  /** Rozmowa z asystentem zakończona prośbą o kontakt. */
  "chat",
  /** Zapytanie firmowe — intencja B2B w rozmowie. */
  "b2b",
  /** Pytanie o konkretny samochód. */
  "car",
  /** Formularz kontaktowy na stronie publicznej. */
  "contact",
  /** Pytanie do istniejącej rezerwacji. */
  "reservation",
]);

export const leadStatus = pgEnum("lead_status", [
  "new",
  "contact",
  "offer",
  "reservation",
  /**
   * Piłka jest po stronie KLIENTA — obsługa odpisała i czeka.
   *
   * Dołożone w 44D, bo bez tego sprawa czekająca na odpowiedź klienta wygląda
   * dokładnie tak samo jak sprawa, której nikt nie tknął. Operator, który co
   * rano przegląda „W kontakcie", trzeci raz z rzędu otwiera to samo zgłoszenie
   * tylko po to, żeby przypomnieć sobie, że już zadzwonił.
   */
  "waiting_customer",
  "closed",
  /**
   * Śmieć. NIE kasujemy — oznaczamy.
   *
   * Skasowany wiersz nie da się odróżnić od zgłoszenia, które nigdy nie
   * dotarło, więc gdyby pułapka na roboty zaczęła łapać ludzi, nie byłoby po
   * czym tego poznać. Spam znika z licznika i z domyślnego widoku, ale zostaje
   * w bazie i da się go policzyć.
   */
  "spam",
]);

/**
 * PO CO klient dzwoni — druga oś, całkiem inna niż `requestSource`.
 *
 * `source` mówi, KTÓRYM KANAŁEM przyszło zapytanie (czat, formularz, strona
 * auta). `reason` mówi, CZEGO dotyczy i dlaczego potrzebny jest człowiek.
 * To są dwa niezależne pytania: zapytanie firmowe może przyjść czatem albo
 * formularzem, a prośba o kontakt może dotyczyć auta spoza floty albo wynajmu
 * na rok. Wciśnięte w jedną kolumnę przestają odpowiadać na którekolwiek —
 * `source` już raz to przerobił, bo `b2b` nie jest kanałem, tylko tematem,
 * i ta wartość zostaje wyłącznie ze względu na zgodność wstecz.
 *
 * Wyprowadzane po stronie SERWERA z intencji zapisanych przy wiadomościach
 * rozmowy — nigdy z ciała żądania, tak samo jak `source`.
 */
export const leadReason = pgEnum("lead_reason", [
  /** „Chcę porozmawiać z pracownikiem", „zadzwońcie do mnie". */
  "human_request",
  /** Zapytanie firmowe: flota, faktura VAT, stała współpraca. */
  "b2b",
  /** Wynajem długoterminowy — miesiąc i więcej. */
  "long_term",
  /** Auto, którego A&A NIE MA we flocie. */
  "non_fleet",
  /** Pytanie o konkretny samochód z floty. */
  "car_enquiry",
  /** Klient chce rezerwować, ale potrzebuje pomocy człowieka. */
  "booking_help",
  /** Termin bez stawki w cenniku — ofertę układa manager. */
  "price_offer",
  /** Warunek wynajmu, którego asystent nie ma potwierdzonego. */
  "rules_question",
  /** Szkoda, awaria, kolizja — sprawa pilna. */
  "emergency",
  /** Pytanie do rezerwacji, która już istnieje. */
  "reservation_question",
  /**
   * Ktoś chce z A&A WSPÓŁPRACOWAĆ, a nie wynająć auto.
   *
   * Świadomie osobna wartość, a nie `b2b`, choć obie dotyczą firm. `b2b` to
   * „potrzebuję trzech aut dla pracowników" — klient po stronie POPYTU.
   * `partnership` to „chcę wnieść auto do waszej floty" albo „interesuje mnie
   * udział w rozwoju floty" — druga strona stołu. Wrzucone do jednego worka
   * przestają się różnić dokładnie tam, gdzie różnica jest największa:
   * w tym, kto komu składa ofertę i kto ma oddzwonić z czym.
   */
  "partnership",
  /** Wartościowe zapytanie, którego nie da się przypisać wyżej. */
  "general",
]);

/**
 * A customer who asked to be called back.
 *
 * `consentAt` is not decoration: a phone number is only written here after the
 * visitor has been told what it will be used for and has pressed the button.
 * A row without it should not exist, which is why the column is NOT NULL.
 */
export const chatLeads = pgTable(
  "chat_leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id").references(
      () => chatConversations.id,
      { onDelete: "set null" },
    ),
    name: text("name"),
    phone: text("phone"),
    email: text("email"),
    carModelId: uuid("car_model_id").references(() => carModels.id, {
      onDelete: "set null",
    }),
    dateFrom: date("date_from"),
    dateTo: date("date_to"),
    locationId: uuid("location_id").references(() => pickupLocations.id, {
      onDelete: "set null",
    }),
    topic: text("topic"),
    /*
     * What the enquiry was ABOUT, beside who it was from.
     *
     * A lead that says only "klient chce kontaktu" makes the operator start the
     * conversation from nothing, with the customer having already explained
     * themselves once. These four columns are the rest of what the assistant
     * already knew at the moment the button was pressed.
     *
     * Note what is NOT here: no address, no age, no licence number, nothing the
     * visitor did not volunteer, and no second copy of a price. `question` is
     * the customer's own last message — the thing an operator most wants to
     * read before dialling — and nothing else free-text is stored.
     */
    /** Passengers, when the conversation established a number. */
    seats: integer("seats"),
    /**
     * The ceiling of a stated budget, in złoty grosze. Null when no figure was
     * given.
     *
     * Per day unless `budgetKind` says the figure was for the whole rental.
     * The column keeps its name and its unit, so every row written before
     * ranges existed still reads correctly: a null `budget_kind` is a per-day
     * ceiling, which is what those rows always were.
     */
    budgetGrosze: integer("budget_grosze"),
    /** The floor of a stated range, in złoty grosze; null when only a ceiling. */
    budgetMinGrosze: integer("budget_min_grosze"),
    /** `day` | `total` — what the two amounts are a budget for. */
    budgetKind: text("budget_kind"),
    /** `pln` | `eur` — the currency the customer named. */
    budgetCurrency: text("budget_currency"),
    /**
     * The rate the euro figures were converted at, in złoty per euro.
     *
     * Stored so an operator reading "budżet 90 EUR" a week later can see the
     * złoty number the assistant actually filtered on, and why. Without it the
     * two figures in the row look inconsistent the moment the rate moves.
     *
     * `numeric`, not a float and not grosze: a rate is not a price, four
     * decimal places is how both the ECB and the NBP publish it, and exact
     * decimal storage means the figure read back is the figure used.
     */
    budgetPlnPerEur: numeric("budget_pln_per_eur", { precision: 10, scale: 4 }),
    /** Which language to call back in. */
    locale: text("locale"),
    /** The visitor's last message before asking for a person. */
    question: text("question"),
    status: leadStatus("status").notNull().default("new"),
    /**
     * Skąd to przyszło. Domyślnie `chat`, bo wszystkie wiersze sprzed etapu
     * 44D pochodzą z czatu i innej możliwości wtedy nie było.
     */
    source: requestSource("source").notNull().default("chat"),
    /**
     * Kiedy ktoś z obsługi to OTWORZYŁ — oś zupełnie inna niż `status`.
     *
     * Przeczytane ≠ załatwione. Bez tego rozdzielenia licznik nowych spraw
     * musiałby liczyć status `new`, więc każde otwarcie zgłoszenia kasowałoby
     * je z licznika albo — gorzej — zmuszało obsługę do zmiany statusu tylko
     * po to, żeby odznaczyć, że przeczytała.
     */
    readAt: timestamp("read_at", { withTimezone: true }),
    /** Temat jednym zdaniem — z formularza; czat układa go z rozmowy. */
    subject: text("subject"),
    /**
     * Czego zapytanie DOTYCZY — patrz `leadReason`.
     *
     * Bez wartości domyślnej i `null`-owalne, bo wiersze sprzed 44D powstały,
     * zanim ta oś istniała, i nikt nie wie, czego dotyczyły. Wpisanie im
     * `general` udawałoby wiedzę, której nie ma; `null` mówi wprost „nie
     * odnotowano".
     */
    reason: leadReason("reason"),
    /**
     * Kiedy poszło powiadomienie do obsługi. ZASUWKA, nie znacznik czasu.
     *
     * Wysyłka podnosi ją warunkowo (`WHERE notified_at IS NULL`), więc dwa
     * równoległe zapisy tego samego zgłoszenia dają JEDEN e-mail, a nie dwa:
     * drugi `UPDATE` nie trafia w żaden wiersz i wysyłka się nie odbywa.
     * Aktualizacja istniejącego zgłoszenia jej NIE czyści — nowa informacja
     * w sprawie, którą obsługa już ma na biurku, nie jest nowym zgłoszeniem.
     */
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    /**
     * Pytanie DO ISTNIEJĄCEJ rezerwacji.
     *
     * `set null`, bo skasowanie rezerwacji nie może skasować pytania klienta
     * — treść zostaje, znika tylko odnośnik.
     */
    reservationId: uuid("reservation_id").references(() => reservations.id, {
      onDelete: "set null",
    }),
    /**
     * Firma, w imieniu której pisze klient.
     *
     * Kolumna OGÓLNA, nie „partnerska": nazwa firmy jest faktem o zgłoszeniu,
     * nie o jednym formularzu, i przyda się tak samo zapytaniu firmowemu.
     * Dlatego stoi obok `name`, a nie w bloku o partnerstwie.
     */
    company: text("company"),
    /**
     * Model współpracy wybrany przez zainteresowanego: `vehicle`, `fleet`,
     * `strategic` albo `unsure`.
     *
     * TEKST, nie enum bazodanowy, i to jest decyzja, nie niedbałość. Enum
     * w PostgreSQL jest obietnicą, że zbiór wartości jest ustalony; ten zbiór
     * jest pierwszą propozycją modułu, który ma zebrać zainteresowanie i na
     * jego podstawie zostać opisany. Zamknięcie go w typie bazy oznaczałoby
     * migrację przy każdej korekcie nazwy. Zbiór pilnowany jest tam, gdzie
     * naprawdę wchodzi do systemu — w schemacie Zod akcji serwerowej.
     */
    partnerModel: text("partner_model"),
    /**
     * Orientacyjny zakres zaangażowania, WPISANY PRZEZ KLIENTA, jako tekst.
     *
     * Świadomie nie liczba i świadomie nie `budget_grosze`: tamta kolumna
     * znaczy „ile klient chce płacić za dobę najmu" i wsadzenie tu kwoty
     * inwestycji zepsułoby każdą statystykę, która ją czyta. Tekst, bo na tym
     * etapie to deklaracja rzędu wielkości („jedno auto", „do 200 tys."),
     * a nie zobowiązanie do przeliczania.
     */
    investRange: text("invest_range"),
    /** Staff notes — the only free text an operator writes here. */
    note: text("note"),
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("chat_leads_status_idx").on(t.status, t.createdAt),
    index("chat_leads_created_idx").on(t.createdAt),
    /* Licznik nieprzeczytanych w nagłówku panelu liczy się przy każdym
       przeładowaniu strony admina, więc chodzi po indeksie, nie po tabeli. */
    index("chat_leads_unread_idx").on(t.readAt, t.createdAt),
    index("chat_leads_source_idx").on(t.source, t.createdAt),
    /* Odszukanie zgłoszenia tej samej rozmowy przy KAŻDYM naciśnięciu
       przycisku „Poproś o kontakt" — to jest zapytanie, które broni skrzynki
       przed duplikatami, więc nie może chodzić po całej tabeli. */
    index("chat_leads_conversation_idx").on(t.conversationId),
  ],
);

export type ChatLead = typeof chatLeads.$inferSelect;
/** Skąd przyszło zapytanie klienta — patrz `requestSource`. */
export type RequestSource = (typeof requestSource.enumValues)[number];
/** Jak daleko zaszła obsługa zgłoszenia — patrz `leadStatus`. */
export type LeadStatus = (typeof leadStatus.enumValues)[number];
/** Czego zapytanie dotyczy — patrz `leadReason`. */
export type LeadReason = (typeof leadReason.enumValues)[number];

/**
 * Questions the parser could not answer, grouped.
 *
 * The unique index on (`normalized`, `locale`) is what turns a pile of
 * transcripts into a to-do list: the same question asked forty times is one row
 * with `times = 40`, not forty rows nobody reads. `normalized` is the question
 * with case, punctuation and Polish diacritics stripped — see `lib/chat/nlu`.
 */
export const chatUnanswered = pgTable(
  "chat_unanswered",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** As typed, for the admin to read. */
    question: text("question").notNull(),
    /** As matched, for the grouping. Never shown. */
    normalized: text("normalized").notNull(),
    locale: text("locale").notNull().default("pl"),
    /** Best guess from the parser — "cena", "dostepnosc", "inne". */
    category: text("category"),
    /** Intent the parser assigned when it gave up — "UNKNOWN" most of the time. */
    intent: text("intent"),
    /**
     * Why this row is here.
     *
     * `unanswered` — the assistant said it did not know. That was the only kind
     * of row this table held until 2026-08-20, which made the admin list a
     * record of the harmless failures: the audit found twenty-six answers that
     * were confidently wrong, and not one of them appeared here, because by
     * this table's old definition they had been answered.
     *
     * `low_confidence` — an answer WAS given, from a match that only just
     * cleared the floor. The customer saw it; a person still needs to.
     */
    kind: text("kind").notNull().default("unanswered"),
    times: integer("times").notNull().default(1),
    /**
     * Of those times, how often the very next turn in the same conversation
     * DID get an answer, and how often the visitor asked for a person instead.
     *
     * Both are counted forward from the failure, not inferred from the shape
     * of the question: the route remembers which question went unanswered and
     * settles it on the next turn. That is what separates "asked once, badly
     * phrased, then rephrased and got help" from "asked, gave up, left".
     */
    answeredLater: integer("answered_later").notNull().default(0),
    wentToHuman: integer("went_to_human").notNull().default(0),
    lastAskedAt: timestamp("last_asked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("chat_unanswered_unique").on(t.normalized, t.locale),
    index("chat_unanswered_times_idx").on(t.times),
  ],
);

export type ChatUnanswered = typeof chatUnanswered.$inferSelect;

/**
 * What customers asked for — including everything A&A does not own.
 *
 * This is the table the fleet gets bought from. The assistant already knew how
 * to say "we don't have that"; what it did not do was write down WHAT it had
 * just failed to offer, so nineteen people asking for a Porsche Cayenne left
 * exactly as much trace as nobody asking. Here they leave nineteen rows.
 *
 * **One row per interest per conversation, not per message.** A visitor who
 * writes "macie Cayenne?", then "a Cayenne S?", then "na pewno nie ma
 * Cayenne?" wants ONE car, and three rows would read as three customers —
 * which is the precise way a demand report turns into a lie. `times` counts
 * the repeats; the unique index on (conversation_id, normalized) enforces it.
 *
 * `conversation_id` is ON DELETE SET NULL, deliberately different from every
 * other chat table. Transcripts are purged after ninety days because a
 * transcript is a liability once it stops being useful; "somebody wanted a
 * Cayenne in August" is not a liability — it carries no person in it at all —
 * and it is exactly what a fleet decision in January needs to look back at.
 */
export const demandKind = pgEnum("demand_kind", [
  /** A named car: brand and model, whether or not A&A has it. */
  "model",
  /** A brand with no model — "macie jakieś Porsche?". */
  "brand",
  /** A need with no name — "luksusowy SUV", "bus dla 9 osób". */
  "segment",
]);

export const chatDemand = pgTable(
  "chat_demand",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id").references(
      () => chatConversations.id,
      { onDelete: "set null" },
    ),
    kind: demandKind("kind").notNull(),

    /** As recognised, title-cased for display: "Porsche", "Cayenne". */
    brand: text("brand"),
    model: text("model"),
    /** One of the assistant's own segments: van | premium-suv | luxury | … */
    segment: text("segment"),
    seats: integer("seats"),
    gearbox: text("gearbox"),
    fuel: text("fuel"),

    /** Ready-made line for the reports: "Porsche Cayenne", "VAN · 9 osób". */
    label: text("label").notNull(),
    /** Lowercase, no diacritics — the dedup and grouping key. Never shown. */
    normalized: text("normalized").notNull(),

    /** Did A&A have such a car at the moment of asking? */
    inFleet: boolean("in_fleet").notNull().default(false),
    /**
     * It IS in the fleet and it was NOT free for the dates asked about.
     *
     * Separate from `in_fleet = false` on purpose: "we don't own it" is a
     * purchase decision and "we own it but it was booked" is a fleet-size
     * decision, and mixing the two produces a report that recommends buying
     * cars A&A already has.
     */
    unavailable: boolean("unavailable").notNull().default(false),
    /** Substitutes were offered in reply to this request. */
    alternativesShown: boolean("alternatives_shown").notNull().default(false),

    /** The dates the request was about, when any were given. */
    dateFrom: date("date_from"),
    dateTo: date("date_to"),
    locale: text("locale").notNull().default("pl"),
    /** Repeats within the one conversation. */
    times: integer("times").notNull().default(1),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("chat_demand_unique").on(t.conversationId, t.normalized),
    index("chat_demand_created_idx").on(t.createdAt),
    index("chat_demand_fleet_idx").on(t.inFleet, t.createdAt),
    index("chat_demand_normalized_idx").on(t.normalized),
  ],
);

export type ChatDemand = typeof chatDemand.$inferSelect;

/**
 * Answers an administrator wrote, for questions the assistant could not answer.
 *
 * The rule this table exists to enforce: **nothing here reaches a customer
 * until a person has approved the words.** A draft is created from an
 * unanswered question with an empty answer; the assistant does not read drafts.
 * Only `published` rows join the FAQ the matcher searches, and only an
 * administrator can publish one.
 *
 * No AI writes into this table. A generated answer about insurance or a deposit
 * that nobody checked is precisely the kind of confidently wrong sentence the
 * FAQ matcher's score floor exists to prevent, and letting one in through the
 * back door would undo that.
 */
export const faqDraftStatus = pgEnum("faq_draft_status", [
  "draft",
  "published",
]);

export const chatFaq = pgTable(
  "chat_faq",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    locale: text("locale").notNull().default("pl"),
    question: text("question").notNull(),
    /** Empty until somebody writes it. A published row must have one. */
    answer: text("answer").notNull().default(""),
    status: faqDraftStatus("status").notNull().default("draft"),
    /** The unanswered row this came from, for the panel's back-reference. */
    sourceQuestion: text("source_question"),
    createdBy: text("created_by"),
    publishedBy: text("published_by"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("chat_faq_status_idx").on(t.status, t.locale)],
);

export type ChatFaqEntry = typeof chatFaq.$inferSelect;

// ── Car deadlines ────────────────────────────────────────────────────────────
export const carDeadlines = pgTable(
  "car_deadlines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    carId: uuid("car_id")
      .notNull()
      .references(() => cars.id, { onDelete: "cascade" }),
    kind: deadlineKind("kind").notNull(),
    /** What it is, in the operator's own words: "mandat ITD", "kaucja Kowalski". */
    title: text("title").notNull(),
    dueOn: date("due_on").notNull(),
    /** Optional money: a fine, an excess, a deposit. */
    amountGrosze: integer("amount_grosze"),
    note: text("note"),
    /**
     * Set when it is dealt with. Kept rather than deleted: "paid on the 4th"
     * is the answer to a question somebody will ask later, and a row that
     * vanishes cannot answer it.
     */
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => admins.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("car_deadlines_due_idx").on(t.dueOn)],
);

export type CarDeadline = typeof carDeadlines.$inferSelect;
export type NewCarDeadline = typeof carDeadlines.$inferInsert;

// ── Payments ─────────────────────────────────────────────────────────────────
/**
 * Money actually received against a reservation, one row per payment.
 *
 * A separate table rather than a "paid" flag, because part-payment is the
 * normal case: a deposit on booking, the rest at handover. With a flag, a
 * rental with 1 000 zł of 2 850 zł taken is either a lie in one direction or
 * a lie in the other. The reservation's `paidAt` stays as the moment it became
 * fully settled — derived from these rows, not typed in.
 */
export const reservationPayments = pgTable(
  "reservation_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => reservations.id, { onDelete: "cascade" }),
    amountGrosze: integer("amount_grosze").notNull(),
    method: paymentMethod("method").notNull(),
    /** When the money arrived, which is not always when it was recorded. */
    paidOn: date("paid_on").notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => admins.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("reservation_payments_reservation_idx").on(t.reservationId)],
);

export type ReservationPayment = typeof reservationPayments.$inferSelect;
export type NewReservationPayment = typeof reservationPayments.$inferInsert;

// ── Należność za anulowanie / nieodebranie ───────────────────────────────────
/**
 * Jeden wiersz na rezerwację: ile naliczono, za co i co się z tym dalej stało.
 *
 * Kwota pierwotna NIGDY nie jest nadpisywana. Umorzenie dopisuje `waivedAt`
 * i powód, zapłata dopisuje `paidAt`, a `amountGrosze` zostaje takie, jakie
 * było w chwili naliczenia — zamówienie mówi o tym wprost.
 *
 * STATUSU NIE MA JAKO KOLUMNY. Wyprowadza go `feeStatus` z
 * `lib/booking/cancellation`, dokładnie tak samo jak kaucja wyprowadza swój
 * stan z ostatniego zdarzenia, a `reservations.paidAt` z wpłat pod spodem.
 * Czwarta kolumna, o której trzeba PAMIĘTAĆ przy każdej zmianie pozostałych,
 * rozjeżdża się przy pierwszej ścieżce, która o niej zapomni.
 */
export const reservationCancellationFees = pgTable(
  "reservation_cancellation_fees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reservationId: uuid("reservation_id")
      .notNull()
      .unique()
      .references(() => reservations.id, { onDelete: "cascade" }),
    /** `cancellation` albo `no_show`. */
    kind: text("kind").notNull(),
    /** `free` | `tier1` | `tier2` | `no_show` — który próg zadecydował. */
    tier: text("tier").notNull(),
    /** Naliczone, po sufcie „nie więcej niż wartość rezerwacji". */
    amountGrosze: integer("amount_grosze").notNull(),
    /** Z cennika, przed sufitem — żeby dało się pokazać, skąd wzięła się kwota. */
    policyGrosze: integer("policy_grosze").notNull(),
    reservationTotalGrosze: integer("reservation_total_grosze").notNull(),
    hoursToPickup: numeric("hours_to_pickup", { precision: 8, scale: 2 }),
    /** Migawka polityki użytej do naliczenia. */
    policy: jsonb("policy").notNull(),
    chargedAt: timestamp("charged_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** NULL = naliczyło się samo, przy anulowaniu przez klienta. */
    chargedBy: uuid("charged_by").references(() => admins.id, {
      onDelete: "set null",
    }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    waivedAt: timestamp("waived_at", { withTimezone: true }),
    waivedBy: uuid("waived_by").references(() => admins.id, {
      onDelete: "set null",
    }),
    waiveReason: text("waive_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("reservation_cancellation_fees_reservation_idx").on(t.reservationId),
  ],
);

export type ReservationCancellationFee =
  typeof reservationCancellationFees.$inferSelect;
export type NewReservationCancellationFee =
  typeof reservationCancellationFees.$inferInsert;

// ── Deposits ─────────────────────────────────────────────────────────────────
/**
 * The life of one security deposit, one row per step.
 *
 * A log rather than a `deposit_status` column on the reservation, for the
 * reason the owner gave when ordering it: a deposit is the customer's money,
 * so "who released it and when" has to survive the next change of status. A
 * single column answers "where is it now" and forgets everything else — and
 * the one question that actually gets asked, weeks later, is who let it go.
 *
 * The current state is therefore DERIVED: the latest row wins, and a
 * reservation with no rows at all and a deposit owed reads as `to_take`. The
 * same reasoning as `reservations.paid_at`, which is computed from the
 * payments beneath it rather than typed in.
 *
 * Money convention, so the arithmetic can be a plain sum:
 *   · `to_take` / `to_return` are markers and move nothing — amount 0;
 *   · `held` / `blocked` add what was secured;
 *   · `returned` subtracts what went back;
 *   · `partially_kept` subtracts BOTH: `amountGrosze` returned to the customer
 *     and `keptGrosze` retained by the firm. Together they release the hold,
 *     which is why the kept part is not silently folded into the returned one:
 *     retained money became income and has to be nameable as such.
 */
export const reservationDepositEvents = pgTable(
  "reservation_deposit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => reservations.id, { onDelete: "cascade" }),
    status: depositStatus("status").notNull(),
    /** Secured (held/blocked) or given back (returned/partially_kept). Never negative. */
    amountGrosze: integer("amount_grosze").notNull().default(0),
    /** Only `partially_kept` uses it: the part the firm keeps. */
    keptGrosze: integer("kept_grosze").notNull().default(0),
    /** Cash, card, transfer — how the money physically moved, when it did. */
    method: paymentMethod("method"),
    /** Why, in the operator's words. Mandatory in the UI for anything kept. */
    note: text("note"),
    createdBy: uuid("created_by").references(() => admins.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("reservation_deposit_events_reservation_idx").on(
      t.reservationId,
      t.createdAt,
    ),
  ],
);

export type ReservationDepositEvent =
  typeof reservationDepositEvents.$inferSelect;
export type NewReservationDepositEvent =
  typeof reservationDepositEvents.$inferInsert;

// ── Handover protocols ───────────────────────────────────────────────────────
export const handoverKind = pgEnum("handover_kind", ["pickup", "return"]);

/**
 * How clean the car was. Three grades, not five: the only decision this feeds
 * is "does somebody get charged for the wash", and a scale fine enough to
 * argue about is a scale nobody fills in honestly at 7 a.m. in the rain.
 */
export const cleanliness = pgEnum("cleanliness", [
  "clean",
  "acceptable",
  "dirty",
]);

/**
 * What was written down when the car changed hands — once out, once back.
 *
 * One row per direction, enforced by a unique key: a rental has exactly one
 * handover and one return, and a second row would mean two different accounts
 * of the same event with nothing to say which is true. Corrections edit the
 * row; the audit log keeps what it said before.
 *
 * Fuel is in eighths (0–8), because that is what the gauge shows and what two
 * people can agree on standing beside the car. A percentage invites 47%, which
 * nobody can read off a needle and nobody can dispute afterwards.
 *
 * The odometer here is the authority: `reservations.start_odometer_km` and
 * `end_odometer_km` are synced FROM these rows, the same direction of travel
 * as `paid_at` from payments. Two hands-on records of the same number that can
 * disagree is how a mileage charge becomes an argument.
 */
export const reservationHandovers = pgTable(
  "reservation_handovers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => reservations.id, { onDelete: "cascade" }),
    kind: handoverKind("kind").notNull(),
    odometerKm: integer("odometer_km").notNull(),
    /** 0 = pusty, 8 = do pełna. */
    fuelEighths: integer("fuel_eighths").notNull(),
    cleanliness: cleanliness("cleanliness").notNull(),
    /** How many sets of keys physically moved. Usually 1, sometimes 2. */
    keysCount: integer("keys_count").notNull().default(1),
    /** Dents, scratches, chips — in the operator's words, with the car in front of them. */
    damageNote: text("damage_note"),
    note: text("note"),
    /**
     * The customer's signature, drawn with a finger — a PNG behind the
     * authenticated reader, never in the public media directory.
     *
     * A URL and not the image itself: a signature is a few tens of kilobytes,
     * and a row that carries one turns every listing query into a download.
     * Nullable, because a protocol written before the customer arrives (or one
     * they refuse to sign) is still the only record of what the car looked
     * like, and refusing to save it would lose that.
     */
    signatureUrl: text("signature_url"),
    /** Who signed, in their own words — usually but not always the renter. */
    signedByName: text("signed_by_name"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => admins.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("reservation_handovers_one_per_kind").on(
      t.reservationId,
      t.kind,
    ),
  ],
);

/**
 * The tick-list beside the readings: equipment and documents, one row each.
 *
 * Rows rather than a JSON blob, because the question asked at the return is
 * "what was in the car when it went out" — and that has to survive the
 * catalogue changing. A blob keyed by code silently loses an item the day
 * somebody renames it; a row keeps saying what it always said.
 */
export const handoverItems = pgTable(
  "handover_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    handoverId: uuid("handover_id")
      .notNull()
      .references(() => reservationHandovers.id, { onDelete: "cascade" }),
    /** Code from `lib/admin/handover-options.ts` — the catalogue lives in code. */
    code: text("code").notNull(),
    present: boolean("present").notNull(),
    note: text("note"),
  },
  (t) => [uniqueIndex("handover_items_one_per_code").on(t.handoverId, t.code)],
);

// ── Damages ──────────────────────────────────────────────────────────────────
/**
 * Where a damage case stands.
 *
 * Five steps, and the order is the order money moves: somebody reports it,
 * somebody prices it, a garage fixes it, an insurer pays part of it, and only
 * then is it closed. `insurer` is a state of its own rather than a flag,
 * because a case waiting on an adjuster is not a case anybody at A&A can
 * advance — and a list that cannot tell those apart tells the operator to
 * chase the wrong things.
 */
export const damageStatus = pgEnum("damage_status", [
  "reported",
  "assessment",
  "repair",
  "insurer",
  "closed",
]);

/**
 * One damage case: the car, when it happened, what it cost and who pays.
 *
 * The rental and the customer are nullable and `ON DELETE SET NULL` on
 * purpose. A stone chip found during a turnaround belongs to no rental at all,
 * and deleting a customer record must never take the fleet's repair history
 * with it — the car is the one thing every damage certainly has.
 *
 * Money is split into what the repair cost and what A&A actually paid
 * (`excessGrosze`, the deductible). One "cost" column cannot answer both
 * "what did this car cost us" and "what was the claim worth", and both get
 * asked — the first by the fleet economics, the second by the insurer.
 */
export const damages = pgTable(
  "damages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    carId: uuid("car_id")
      .notNull()
      .references(() => cars.id, { onDelete: "cascade" }),
    reservationId: uuid("reservation_id").references(() => reservations.id, {
      onDelete: "set null",
    }),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    occurredOn: date("occurred_on").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: damageStatus("status").notNull().default("reported"),
    /** What the repair is worth in total, whoever ends up paying it. */
    repairCostGrosze: integer("repair_cost_grosze").notNull().default(0),
    /** The deductible — the part A&A pays out of its own pocket. */
    excessGrosze: integer("excess_grosze").notNull().default(0),
    insurer: text("insurer"),
    claimNumber: text("claim_number"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => admins.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("damages_car_idx").on(t.carId),
    index("damages_status_idx").on(t.status),
  ],
);

/**
 * Photographs of a damage, behind the same authenticated reader as invoices.
 *
 * One directory for admin-only attachments rather than one per feature: a
 * photograph of a dented wing and a scan of the repair invoice are the same
 * class of file — evidence about money, never public — and they already have a
 * reader that checks the session, blocks traversal and refuses to sniff types.
 */
export const damagePhotos = pgTable(
  "damage_photos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    damageId: uuid("damage_id")
      .notNull()
      .references(() => damages.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("damage_photos_damage_idx").on(t.damageId)],
);

export type Damage = typeof damages.$inferSelect;
export type NewDamage = typeof damages.$inferInsert;
export type DamagePhoto = typeof damagePhotos.$inferSelect;

export type ReservationHandover = typeof reservationHandovers.$inferSelect;
export type NewReservationHandover = typeof reservationHandovers.$inferInsert;
export type HandoverItem = typeof handoverItems.$inferSelect;
export type NewHandoverItem = typeof handoverItems.$inferInsert;

// ── Reminder log ─────────────────────────────────────────────────────────────
/** What a reminder was about. Mirrors `DocumentAlert["kind"]` in lib/admin/stats. */
export const reminderKind = pgEnum("reminder_kind", [
  "insurance",
  "inspection",
  "service",
]);

/**
 * One row per reminder that has actually been sent.
 *
 * This table exists to answer one question — "have we already told them about
 * THIS date?" — and the unique index is the answer. The job runs daily; without
 * it, a policy expiring on the 20th would generate a fresh email every morning
 * from the 15th onwards, and staff would learn to ignore the alerts, which is
 * the one failure mode a reminder system cannot survive.
 *
 * Keyed on the due date rather than on a timestamp, so renewing insurance to a
 * new date makes the next lapse a different row and it notifies again.
 */
export const reminderLog = pgTable(
  "reminder_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    carId: uuid("car_id")
      .notNull()
      .references(() => cars.id, { onDelete: "cascade" }),
    kind: reminderKind("kind").notNull(),
    /** The date being warned about, not the date the mail went out. */
    dueDate: date("due_date").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("reminder_log_unique").on(t.carId, t.kind, t.dueDate)],
);

export type ReminderLogRow = typeof reminderLog.$inferSelect;
export type NewReminderLogRow = typeof reminderLog.$inferInsert;

// ── AI usage — one row per UTC day, shared by every container ────────────────
/**
 * How much of the free Workers AI allocation today has already spent.
 *
 * A row per day, keyed by the UTC date, because Cloudflare's own allowance
 * resets at 00:00 UTC and two clocks that disagree about which day it is would
 * either overspend or refuse early. The date is computed by Postgres, never by
 * the application, so every container reads the same calendar.
 *
 * This table is the reason the cap actually holds. The counter used to live in
 * process memory, which works exactly until there are two app containers — then
 * each gets its own private allowance and together they spend twice the limit.
 *
 * `neurons` is whole units and every cost is rounded UP before it lands here.
 * Neurons are fractional in reality; rounding up costs us a rounding error's
 * worth of headroom and guarantees the error never points at overspending.
 *
 * Kept forever rather than trimmed: a row is three integers, and having last
 * month's usage is what turns "are we near the limit" into an answer rather
 * than a guess.
 */
export const aiUsageDaily = pgTable("ai_usage_daily", {
  /** UTC calendar day, `YYYY-MM-DD`. */
  day: date("day").primaryKey(),
  /** Reserved + settled neurons. Never negative. */
  neurons: integer("neurons").notNull().default(0),
  /** Completed model calls, successful or not. */
  calls: integer("calls").notNull().default(0),
  /** Calls that ended with the deterministic parser answering instead. */
  fallbacks: integer("fallbacks").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AiUsageRow = typeof aiUsageDaily.$inferSelect;

// ── Konserwacja dysku ────────────────────────────────────────────────────────
/**
 * The state of one very narrow janitor: the Docker **build cache**, and nothing
 * else on this machine.
 *
 * Why a table at all. The app runs in a container that mounts only `/app/media`
 * and has no Docker socket — deliberately, because a web process that can talk
 * to the daemon can delete the database volume. So the panel cannot measure the
 * disk, cannot see the cache and cannot prune it. The host script can do all
 * three; this row is the only channel between them. The script writes what it
 * measured and did, the panel reads it, and the manual button writes a REQUEST
 * that the script picks up on its next tick. Nothing in the container ever
 * executes a Docker command, which is what keeps the button from being an
 * arbitrary-command endpoint wearing a friendly label.
 *
 * One row, `id = 1`. This is a state, not a history — the history lives in
 * `/var/log/aa-docker-cache.log`, which rotates, and in `audit_log`, which
 * records who pressed the button.
 */
export const cacheRequestState = pgEnum("cache_request_state", [
  /** Nothing pending — the normal state. */
  "idle",
  /** An admin asked for a cleanup; the host script has not picked it up yet. */
  "pending",
  /** The host script is pruning right now. */
  "running",
]);

export const cacheMaintenance = pgTable("cache_maintenance", {
  id: integer("id").primaryKey().default(1),

  /* What the last check measured. */
  /** Root filesystem usage in percent — the `/dev/sda1` mounted at `/`. */
  diskPercent: integer("disk_percent"),
  /** Free space as `df -h` prints it, e.g. "18G". Display only. */
  diskFree: text("disk_free"),
  /**
   * Build cache size in bytes.
   *
   * `bigint` would be the pedantic type; `integer` caps at 2.1 GB and this
   * cache reached 14 GB. Stored as text and parsed in the reader — Postgres
   * `bigint` arrives as a string over the wire anyway, and the alternative is
   * a driver-dependent precision surprise on a number nobody does arithmetic
   * on beyond dividing by 2^30 for display.
   */
  cacheBytes: text("cache_bytes"),
  /** Usage at or above which the script prunes by itself. Default 70. */
  thresholdPercent: integer("threshold_percent").notNull().default(70),
  /** Refreshed on EVERY run, healthy or not — its age is what proves the job lives. */
  checkedAt: timestamp("checked_at", { withTimezone: true })
    .notNull()
    .defaultNow(),

  /* What the last cleanup did. Null until the first one happens. */
  lastCleanupAt: timestamp("last_cleanup_at", { withTimezone: true }),
  lastFreedBytes: text("last_freed_bytes"),
  /** "ok" | "error" — the outcome of that cleanup, not of the last check. */
  lastResult: text("last_result"),
  /** One Polish sentence for the panel: why it ran, or why it did not. */
  lastMessage: text("last_message"),

  /* The manual button's handshake. */
  requestState: cacheRequestState("request_state").notNull().default("idle"),
  requestedAt: timestamp("requested_at", { withTimezone: true }),
  /** `admins.id` of whoever pressed it, kept loose on purpose: a deleted admin
   *  must not block the janitor with a foreign-key violation. */
  requestedBy: text("requested_by"),
});

export type CacheMaintenanceRow = typeof cacheMaintenance.$inferSelect;

// ── Umowy i dokumenty (punkty 15 i 16) ───────────────────────────────────────
/**
 * JEDEN WIERSZ = JEDNA WERSJA dokumentu.
 *
 * Tożsamość dokumentu ponad wersjami niesie `slug`; kolejne wydania to kolejne,
 * NIEZMIENNE wiersze z rosnącym `version`. Nowa wersja regulaminu jest nowym
 * wierszem, nie UPDATE starego — bo klient, który dostał regulamin 12 września,
 * dostał konkretny tekst, a wersja dająca się nadpisać jest tym samym, co jej
 * brak.
 *
 * `active` mówi, która wersja obowiązuje dziś dla danego (`slug`, `locale`).
 * Pilnuje tego CZĘŚCIOWY indeks unikalny w migracji 0047, a nie kod panelu:
 * reguła, która żyje w formularzu, przestaje obowiązywać przy drugim formularzu.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    locale: text("locale").notNull().default("pl"),
    version: integer("version").notNull().default(1),
    /** `booking` = komplet pokazywany klientowi po potwierdzeniu rezerwacji. */
    category: text("category").notNull().default("other"),
    title: text("title").notNull(),
    description: text("description"),
    /** Nazwa pliku w magazynie, BEZ prefiksu adresu — czytnik jest jeden. */
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull().default(0),
    mime: text("mime").notNull().default("application/pdf"),
    /** Fakt z kalendarza, nie zdarzenie z zegara — stąd `date`, nie timestamp. */
    effectiveFrom: date("effective_from"),
    active: boolean("active").notNull().default(false),
    /**
     * Czy ten dokument ma iść do klienta AUTOMATYCZNIE po potwierdzeniu
     * rezerwacji — decyzja PER DOKUMENT, nie jeden przełącznik na wszystko.
     *
     * Jeden globalny przełącznik zmuszałby do wyboru między „wyślij wszystko"
     * a „nie wysyłaj nic", a prawdziwa odpowiedź jest zawsze pośrodku.
     *
     * To pole — i wyłącznie ono — decyduje o wysyłce. Do 30.08.2026 decydowała
     * KATEGORIA zapisana na sztywno w `przypnijDokumenty`, przez co dokument
     * z `auto_send = true` spoza kategorii `booking` nie docierał do nikogo,
     * a przełącznik w panelu wisiał nad mechanizmem, który go nie czytał.
     *
     * Domyślnie FALSE, także dla dokumentów wgranych przed tą kolumną:
     * włączenie wysyłki dziewięciu plików bez pytania właściciela byłoby
     * zmianą, której nikt nie zamawiał.
     */
    autoSend: boolean("auto_send").notNull().default(false),
    /**
     * Plik zawiera OBIE wersje językowe w jednym PDF, więc obsługuje zarówno
     * klienta polskiego, jak i angielskiego.
     *
     * Bez tej flagi `locale` znaczyłoby dwie różne rzeczy naraz: „w jakim
     * języku jest ten plik" i „któremu klientowi wolno go wysłać". Dla
     * dokumentu dwujęzycznego te odpowiedzi się rozjeżdżają — plik jest
     * zapisany jako `pl`, a angielski klient ma prawo dostać dokładnie ten sam.
     *
     * Ustawiane RĘCZNIE, po sprawdzeniu treści. Nigdy automatycznie: pomyłka
     * w tę stronę wysyła klientowi umowę w języku, którego on nie zna, a to
     * przy dokumencie prawnym nie jest drobiazg.
     */
    bilingual: boolean("bilingual").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: uuid("created_by").references(() => admins.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    uniqueIndex("documents_wersja_unique").on(t.slug, t.locale, t.version),
    index("documents_kategoria_idx").on(t.category, t.locale),
    index("documents_wysylka_idx").on(t.active, t.autoSend, t.effectiveFrom),
  ],
);

/**
 * Dowód udostępnienia: KTÓRA wersja trafiła do KTÓREJ rezerwacji i kiedy.
 *
 * Bez tej tabeli pytanie „którą wersję widział ten klient" nie ma odpowiedzi —
 * a w sporze jest to jedyne pytanie, które ma znaczenie.
 *
 * `document_id` na `restrict`, nie `cascade`: dokument, który ktoś dostał, nie
 * ma prawa zniknąć razem z porządkami w katalogu.
 *
 * Nie ma tu ani jednej kolumny udającej podpis. Zamówienie mówi wprost, żeby
 * nie udawać e-podpisu checkboxem; `accepted_at` przy checkboxie wyglądałoby
 * jak dowód zgody i nim nie jest. Zapisujemy tylko to, co naprawdę zaszło.
 */
export const reservationDocuments = pgTable(
  "reservation_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => reservations.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "restrict" }),
    sharedAt: timestamp("shared_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /**
     * Kiedy dokument NAPRAWDĘ wyszedł do klienta. `null` = nie wyszedł.
     *
     * Nie mylić z `sharedAt`, które mówi tylko „przypisano do tej rezerwacji".
     * Panel ma pokazywać SENT wtedy, gdy poczta przyjęła wiadomość — a nie
     * wtedy, gdy funkcja wysyłająca została zawołana. To są dwie różne rzeczy
     * i dokładnie ta różnica sprawiła, że właściciel zobaczył dokument
     * przypisany do rezerwacji i uznał, że klient go dostał.
     *
     * Jest też STRAŻNIKIEM przed podwójną wysyłką: raz ustawione, blokuje
     * kolejne automatyczne wysłanie tego samego dokumentu tej samej
     * rezerwacji — powtórzone potwierdzenie, odświeżona strona, ponowione
     * żądanie.
     */
    sentAt: timestamp("sent_at", { withTimezone: true }),
    /** Treść ostatniego niepowodzenia — dla obsługi, nigdy dla klienta. */
    sendError: text("send_error"),
    /** Odróżnia „nigdy nie próbowano" od „próbowano i nie wyszło". */
    sendAttempts: integer("send_attempts").notNull().default(0),
  },
  (t) => [
    uniqueIndex("reservation_documents_unique").on(
      t.reservationId,
      t.documentId,
    ),
    index("reservation_documents_rezerwacja_idx").on(t.reservationId),
  ],
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type ReservationDocument = typeof reservationDocuments.$inferSelect;
