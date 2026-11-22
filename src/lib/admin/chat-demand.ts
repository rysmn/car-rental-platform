import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import type { Bilingual } from "@/lib/i18n-pick";

/**
 * The demand reports.
 *
 * Everything here reads `chat_demand`, which holds one row per interest per
 * conversation — see the table's own comment for why that grain matters. The
 * consequence for these queries is that **a count of rows is a count of
 * conversations**, so nothing needs `COUNT(DISTINCT …)` gymnastics to avoid
 * reporting one insistent visitor as a crowd.
 *
 * Two facts are kept apart throughout, because they lead to opposite decisions:
 *
 *   · `in_fleet = false`  — A&A does not own such a car. Buy one, or stop
 *                           advertising in a way that suggests we have it.
 *   · `unavailable`       — A&A owns it and it was booked. Buy a SECOND one,
 *                           or accept the loss.
 *
 * Merging them produces a report that recommends buying cars already in the
 * car park, which is the single most expensive mistake this page could make.
 */

export type DemandRange = "today" | "7d" | "30d" | "month" | "custom";

export type DemandFilters = {
  range: DemandRange;
  /** Only for `range: "custom"`; ISO dates. */
  from?: string | null;
  to?: string | null;
  locale?: "pl" | "en" | null;
  /** model | brand | segment — what sort of interest was expressed. */
  kind?: "model" | "brand" | "segment" | null;
  /** Restrict to a named model or a segment, as stored. */
  model?: string | null;
  segment?: string | null;
  /** true = only conversations that reached the booking form, false = only those that did not. */
  booked?: boolean | null;
};

export const EMPTY_FILTERS: DemandFilters = { range: "30d" };

const RANGES: DemandRange[] = ["today", "7d", "30d", "month", "custom"];

export const RANGE_LABEL: Record<DemandRange, Bilingual> = {
  today: { pl: "Dzisiaj", en: "Today" },
  "7d": { pl: "7 dni", en: "7 days" },
  "30d": { pl: "30 dni", en: "30 days" },
  month: { pl: "Ten miesiąc", en: "This month" },
  custom: { pl: "Zakres własny", en: "Custom range" },
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Read the filters out of the query string.
 *
 * Everything is validated against a closed set or a date shape, and anything
 * unrecognised falls back to the default rather than reaching a query. The URL
 * is a public input even on an authenticated page.
 */
export function parseFilters(
  q: Record<string, string | string[] | undefined>,
): DemandFilters {
  const one = (k: string): string | null => {
    const v = q[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const range = (one("okres") ?? "30d") as DemandRange;
  const locale = one("jezyk");
  const kind = one("rodzaj");
  const booked = one("rezerwacja");
  const from = one("od");
  const to = one("do");

  return {
    range: RANGES.includes(range) ? range : "30d",
    from: from && ISO.test(from) ? from : null,
    to: to && ISO.test(to) ? to : null,
    locale: locale === "pl" || locale === "en" ? locale : null,
    kind:
      kind === "model" || kind === "brand" || kind === "segment" ? kind : null,
    model: one("model")?.slice(0, 120) ?? null,
    segment: one("segment")?.slice(0, 60) ?? null,
    booked: booked === "tak" ? true : booked === "nie" ? false : null,
  };
}

/** The filters back as a query object, for building links. */
export function filtersToQuery(
  f: DemandFilters,
  override: Record<string, string | null> = {},
): Record<string, string> {
  const base: Record<string, string | null> = {
    okres: f.range === "30d" ? null : f.range,
    od: f.from ?? null,
    do: f.to ?? null,
    jezyk: f.locale ?? null,
    rodzaj: f.kind ?? null,
    model: f.model ?? null,
    segment: f.segment ?? null,
    rezerwacja: f.booked === true ? "tak" : f.booked === false ? "nie" : null,
    ...override,
  };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) if (v) out[k] = v;
  return out;
}

/**
 * The period, as a SQL condition on `chat_demand.created_at`.
 *
 * Written with parameters rather than interpolation even though the values come
 * from a closed set — the day somebody adds a free-text field to this filter,
 * the query should already be safe.
 */
function periodWhere(f: DemandFilters, column: SQL = sql`d.created_at`): SQL {
  switch (f.range) {
    case "today":
      return sql`${column} >= date_trunc('day', now())`;
    case "7d":
      return sql`${column} >= now() - interval '7 days'`;
    case "month":
      return sql`${column} >= date_trunc('month', now())`;
    case "custom": {
      const from = f.from ? sql`${column} >= ${f.from}::date` : sql`true`;
      // The end date is inclusive: somebody asking for "do 19.08" means the
      // whole of the 19th, and an exclusive bound silently drops a day.
      const to = f.to ? sql`${column} < (${f.to}::date + 1)` : sql`true`;
      return sql`${from} AND ${to}`;
    }
    case "30d":
    default:
      return sql`${column} >= now() - interval '30 days'`;
  }
}

function filterWhere(f: DemandFilters): SQL {
  const parts: SQL[] = [periodWhere(f)];
  if (f.locale) parts.push(sql`d.locale = ${f.locale}`);
  if (f.kind) parts.push(sql`d.kind = ${f.kind}::demand_kind`);
  if (f.model) parts.push(sql`d.label = ${f.model}`);
  if (f.segment) parts.push(sql`d.segment = ${f.segment}`);
  if (f.booked === true) parts.push(sql`c.went_to_booking`);
  if (f.booked === false) parts.push(sql`(c.went_to_booking IS NOT TRUE)`);
  return parts.reduce((acc, p) => sql`${acc} AND ${p}`);
}

const rows = <T>(result: unknown): T[] =>
  (Array.isArray(result) ? result : []) as T[];

/* ── Model-by-model, the headline table ──────────────────────────────────── */

export type DemandRow = {
  label: string;
  brand: string | null;
  model: string | null;
  /** Conversations in which this was asked for. */
  enquiries: number;
  /** …of which A&A owns no such car. */
  notInFleet: number;
  /** …of which A&A owns it but it was taken. */
  unavailable: number;
  /** …that went on to the booking form. */
  toBooking: number;
  lastAt: Date | null;
};

export async function getDemandByModel(
  f: DemandFilters,
  limit = 40,
): Promise<DemandRow[]> {
  const result = await getDb().execute(sql`
    SELECT d.label,
           MAX(d.brand) AS brand,
           MAX(d.model) AS model,
           COUNT(*)::int AS enquiries,
           COUNT(*) FILTER (WHERE NOT d.in_fleet)::int AS not_in_fleet,
           COUNT(*) FILTER (WHERE d.unavailable)::int AS unavailable,
           COUNT(*) FILTER (WHERE c.went_to_booking)::int AS to_booking,
           MAX(d.last_seen_at) AS last_at
      FROM chat_demand d
      LEFT JOIN chat_conversations c ON c.id = d.conversation_id
     WHERE ${filterWhere(f)}
     GROUP BY d.label
     ORDER BY enquiries DESC, last_at DESC
     LIMIT ${limit}
  `);
  return rows<{
    label: string;
    brand: string | null;
    model: string | null;
    enquiries: number;
    not_in_fleet: number;
    unavailable: number;
    to_booking: number;
    last_at: string | Date | null;
  }>(result).map((r) => ({
    label: r.label,
    brand: r.brand,
    model: r.model,
    enquiries: Number(r.enquiries) || 0,
    notInFleet: Number(r.not_in_fleet) || 0,
    unavailable: Number(r.unavailable) || 0,
    toBooking: Number(r.to_booking) || 0,
    lastAt: r.last_at ? new Date(r.last_at) : null,
  }));
}

/* ── Rankings ────────────────────────────────────────────────────────────── */

export type Ranked = { name: string; n: number };

async function rank(
  f: DemandFilters,
  column: SQL,
  limit: number,
): Promise<Ranked[]> {
  const result = await getDb().execute(sql`
    SELECT ${column} AS name, COUNT(*)::int AS n
      FROM chat_demand d
      LEFT JOIN chat_conversations c ON c.id = d.conversation_id
     WHERE ${filterWhere(f)} AND ${column} IS NOT NULL
     GROUP BY 1 ORDER BY n DESC LIMIT ${limit}
  `);
  return rows<{ name: string; n: number }>(result).map((r) => ({
    name: String(r.name),
    n: Number(r.n) || 0,
  }));
}

export const getTopBrands = (f: DemandFilters, limit = 8) =>
  rank(f, sql`d.brand`, limit);
export const getTopSegments = (f: DemandFilters, limit = 8) =>
  rank(f, sql`d.segment`, limit);
export const getTopSeats = (f: DemandFilters, limit = 8) =>
  rank(f, sql`d.seats::text`, limit);

/* ── "What we do not have" ───────────────────────────────────────────────── */

export type MissingRow = {
  model: string | null;
  brand: string | null;
  label: string;
  enquiries: number;
  lastAt: Date | null;
  last7: number;
  last30: number;
};

/**
 * The buying list.
 *
 * Ignores the period filter on purpose for its 7- and 30-day columns: those two
 * numbers ARE the trend, and recomputing them inside a filtered window would
 * make "popularność 30 dni" mean "30 days, unless you picked today, in which
 * case today" — a column that changes meaning with a dropdown is a column
 * nobody can quote in a meeting.
 */
export async function getMissingFromFleet(
  f: DemandFilters,
  limit = 30,
): Promise<MissingRow[]> {
  const result = await getDb().execute(sql`
    SELECT d.label,
           MAX(d.brand) AS brand,
           MAX(d.model) AS model,
           COUNT(*)::int AS enquiries,
           MAX(d.last_seen_at) AS last_at,
           COUNT(*) FILTER (WHERE d.created_at >= now() - interval '7 days')::int AS last7,
           COUNT(*) FILTER (WHERE d.created_at >= now() - interval '30 days')::int AS last30
      FROM chat_demand d
      LEFT JOIN chat_conversations c ON c.id = d.conversation_id
     WHERE ${filterWhere(f)} AND NOT d.in_fleet
     GROUP BY d.label
     ORDER BY enquiries DESC, last_at DESC
     LIMIT ${limit}
  `);
  return rows<{
    label: string;
    brand: string | null;
    model: string | null;
    enquiries: number;
    last_at: string | Date | null;
    last7: number;
    last30: number;
  }>(result).map((r) => ({
    label: r.label,
    brand: r.brand,
    model: r.model,
    enquiries: Number(r.enquiries) || 0,
    lastAt: r.last_at ? new Date(r.last_at) : null,
    last7: Number(r.last7) || 0,
    last30: Number(r.last30) || 0,
  }));
}

/** Cars A&A owns that were asked for and were not free. */
export async function getUnavailableDemand(
  f: DemandFilters,
  limit = 30,
): Promise<DemandRow[]> {
  const all = await getDemandByModel(f, 200);
  return all
    .filter((r) => r.unavailable > 0)
    .sort((a, b) => b.unavailable - a.unavailable)
    .slice(0, limit);
}

/* ── The funnel ──────────────────────────────────────────────────────────── */

/**
 * The moment the funnel's facts started being recorded.
 *
 * Every conversation older than this has `searched_car`, `matched_car` and
 * `saw_price` sitting at their column defaults — false — because the columns
 * did not exist while those conversations were happening. Counting them
 * produced a funnel in which more people clicked "Rezerwuj" than were ever
 * shown a car: 34 against 15, a shape that is not merely wrong but visibly
 * impossible, which is the only reason it was caught.
 *
 * `false` cannot be told apart from "not measured" after the fact, so the
 * population is cut instead: the first conversation that ever set any of these
 * flags is the first one this funnel can honestly describe. Self-calibrating,
 * with nothing to configure and nothing to forget — and `null` while no
 * conversation has set one, which the page reports as "no data yet" rather
 * than as zeros.
 */
export async function measurableSince(): Promise<Date | null> {
  const result = await getDb().execute(sql`
    SELECT MIN(started_at) AS since
      FROM chat_conversations
     WHERE searched_car OR matched_car OR saw_price
        OR alternatives_shown OR ai_used OR ai_fallback
  `);
  const r = rows<{ since: string | Date | null }>(result)[0];
  return r?.since ? new Date(r.since) : null;
}

export type Funnel = {
  conversations: number;
  searched: number;
  matched: number;
  sawPrice: number;
  clickedBook: number;
  /**
   * The visitor opened one of the cars shown. Measured from 22.08.2026.
   *
   * `null` means the step was not being measured for any conversation in this
   * window — see `measuredSteps` below.
   */
  carOpened: number | null;
  /** The booking page really opened — reported by the form, not by the click. */
  startedForm: number | null;
  /** Reservations carrying `source = 'chatbot'`, in the same window. */
  reservations: number;
  noCar: number;
  unavailable: number;
  handoff: number;
  leads: number;
};

/**
 * The steps. The gap between the click and the booking is closed as of
 * 2026-08-21.
 *
 * "Rozpoczęli formularz" used to be missing because nothing measured it: the
 * click handed the visitor to the booking page and the page reported nothing
 * back, so any number there would have been the click count under another
 * name. `BookingPanel` now reports its own mount, so the stage counts a real
 * event that genuinely differs from the click — somebody who closes the tab on
 * the way is in `clickedBook` and not in `startedForm`. `reservations` stays
 * counted from `reservations.source`, an independent record again.
 */
export async function getFunnel(
  f: DemandFilters,
): Promise<Funnel & { since: Date | null }> {
  const since = await measurableSince();
  if (!since) {
    return {
      conversations: 0,
      searched: 0,
      matched: 0,
      sawPrice: 0,
      clickedBook: 0,
      carOpened: null,
      startedForm: null,
      reservations: 0,
      noCar: 0,
      unavailable: 0,
      handoff: 0,
      leads: 0,
      since: null,
    };
  }
  const period = sql`${periodWhere({ ...f, range: f.range })} AND d.started_at >= ${since.toISOString()}::timestamptz`;
  // The conversation-side query aliases `chat_conversations` as `d` so the
  // shared period condition (written against `d.created_at`) still applies.
  const result = await getDb().execute(sql`
    WITH d AS (
      SELECT c.*, c.started_at AS created_at FROM chat_conversations c
    )
    SELECT COUNT(*)::int AS conversations,
           COUNT(*) FILTER (WHERE d.searched_car)::int AS searched,
           COUNT(*) FILTER (WHERE d.matched_car)::int AS matched,
           COUNT(*) FILTER (WHERE d.saw_price)::int AS saw_price,
           COUNT(*) FILTER (WHERE d.went_to_booking)::int AS clicked,
           COUNT(*) FILTER (WHERE d.booking_form_started)::int AS started_form,
           COUNT(*) FILTER (WHERE d.car_opened)::int AS car_opened,
           /*
            * How many conversations in this window were actually WATCHED for
            * each of the two newest stages.
            *
            * A FALSE written by the code means "we looked and it did not
            * happen"; a NULL means "nobody was looking yet". Counting the
            * non-nulls is what lets the panel print "nie mierzone" instead of a
            * zero that reads as a collapse in conversion — which is exactly how
            * 39 clicks and 0 forms looked on the day the column was one day old.
            */
           COUNT(*) FILTER (WHERE d.booking_form_started IS NOT NULL)::int AS form_watched,
           COUNT(*) FILTER (WHERE d.car_opened IS NOT NULL)::int AS car_watched,
           COUNT(*) FILTER (WHERE d.status = 'handoff')::int AS handoff,
           COUNT(*) FILTER (WHERE d.lead_created)::int AS leads
      FROM d
     WHERE ${period}
       ${f.locale ? sql`AND d.locale = ${f.locale}` : sql``}
  `);
  const c = rows<{
    conversations: number;
    searched: number;
    matched: number;
    saw_price: number;
    clicked: number;
    started_form: number;
    car_opened: number;
    form_watched: number;
    car_watched: number;
    handoff: number;
    leads: number;
  }>(result)[0];

  const missed = await getDb().execute(sql`
    SELECT COUNT(DISTINCT d.conversation_id) FILTER (WHERE NOT d.in_fleet)::int AS no_car,
           COUNT(DISTINCT d.conversation_id) FILTER (WHERE d.unavailable)::int AS unavailable
      FROM chat_demand d
      LEFT JOIN chat_conversations c ON c.id = d.conversation_id
     WHERE ${filterWhere({ ...f, booked: null })}
  `);
  const m = rows<{ no_car: number; unavailable: number }>(missed)[0];

  // The one number on this page that is not the assistant's own bookkeeping:
  // a row in `reservations` exists because somebody completed a booking, and it
  // says `source = 'chatbot'` because the assistant sent them. Counted over the
  // same window as everything else, on the reservation's own timestamp.
  const res = await getDb().execute(sql`
    SELECT COUNT(*)::int AS n FROM reservations r
     WHERE r.source = 'chatbot' AND ${periodWhere(f, sql`r.created_at`)}
  `);
  const r = rows<{ n: number }>(res)[0];

  return {
    since,
    conversations: Number(c?.conversations ?? 0) || 0,
    searched: Number(c?.searched ?? 0) || 0,
    matched: Number(c?.matched ?? 0) || 0,
    sawPrice: Number(c?.saw_price ?? 0) || 0,
    clickedBook: Number(c?.clicked ?? 0) || 0,
    // Reported only when something in this window was measured for the stage.
    startedForm:
      Number(c?.form_watched ?? 0) > 0 ? Number(c?.started_form ?? 0) || 0 : null,
    carOpened:
      Number(c?.car_watched ?? 0) > 0 ? Number(c?.car_opened ?? 0) || 0 : null,
    reservations: Number(r?.n ?? 0) || 0,
    noCar: Number(m?.no_car ?? 0) || 0,
    unavailable: Number(m?.unavailable ?? 0) || 0,
    handoff: Number(c?.handoff ?? 0) || 0,
    leads: Number(c?.leads ?? 0) || 0,
  };
}

/* ── Why it did not become a booking ─────────────────────────────────────── */

export type ReasonRow = { reason: string; label: Bilingual; n: number };

/**
 * Reasons, derived from evidence, with "not enough evidence" as a real answer.
 *
 * The order is the order of certainty, not of frequency: a conversation where
 * a named car was missing from the fleet has a known reason, and one where the
 * visitor typed two messages and left has none. `brak_danych` is not a failure
 * of this query — it is the honest bucket, and a report that never used it
 * would be assigning motives to people who never stated one.
 *
 * Notably absent: "cena". Nothing observable distinguishes "saw the price and
 * balked" from "saw the price and went to compare". The bucket exists in the
 * spec; the evidence does not, so the page shows the price-seen count as a
 * separate figure instead of dressing it up as a reason.
 */
export async function getNoBookingReasons(
  f: DemandFilters,
): Promise<ReasonRow[]> {
  // Same cut as the funnel, for the same reason: before the facts were
  // recorded every conversation looks like somebody who left without a word.
  const since = await measurableSince();
  if (!since) return [];
  const result = await getDb().execute(sql`
    WITH d AS (
      SELECT c.*, c.started_at AS created_at,
             EXISTS (SELECT 1 FROM chat_demand x
                      WHERE x.conversation_id = c.id AND NOT x.in_fleet) AS want_missing,
             EXISTS (SELECT 1 FROM chat_demand x
                      WHERE x.conversation_id = c.id AND x.unavailable) AS want_taken
        FROM chat_conversations c
       WHERE NOT c.went_to_booking
    )
    SELECT CASE
             WHEN d.status = 'handoff' THEN 'pracownik'
             WHEN d.want_missing THEN 'brak_auta'
             WHEN d.want_taken THEN 'brak_dostepnosci'
             WHEN d.lead_created THEN 'lead'
             WHEN d.unanswered_count > 0 AND NOT d.matched_car THEN 'nie_rozpoznano'
             WHEN d.saw_price THEN 'tylko_sprawdzal'
             WHEN d.matched_car THEN 'tylko_sprawdzal'
             WHEN d.message_count <= 2 THEN 'zamknieto'
             ELSE 'brak_danych'
           END AS reason,
           COUNT(*)::int AS n
      FROM d
     WHERE ${periodWhere(f)}
       AND d.started_at >= ${since.toISOString()}::timestamptz
       ${f.locale ? sql`AND d.locale = ${f.locale}` : sql``}
     GROUP BY 1 ORDER BY n DESC
  `);
  const LABELS: Record<string, Bilingual> = {
    brak_auta: {
      pl: "Brak odpowiedniego auta we flocie",
      en: "No suitable car in the fleet",
    },
    brak_dostepnosci: {
      pl: "Brak dostępności w terminie",
      en: "Not available on the dates",
    },
    pracownik: {
      pl: "Przekazanie do pracownika",
      en: "Handed over to a member of staff",
    },
    lead: { pl: "Zostawił kontakt (lead)", en: "Left contact details (lead)" },
    nie_rozpoznano: { pl: "Nie rozpoznano pytania", en: "Question not recognised" },
    tylko_sprawdzal: { pl: "Klient tylko sprawdzał", en: "Customer was only checking" },
    zamknieto: {
      pl: "Zamknięto rozmowę po pierwszej wiadomości",
      en: "Conversation closed after the first message",
    },
    brak_danych: {
      pl: "Brak danych — za mało śladów, żeby orzec",
      en: "No data — too few traces to decide",
    },
  };
  return rows<{ reason: string; n: number }>(result).map((r) => ({
    reason: r.reason,
    label: LABELS[r.reason] ?? { pl: r.reason, en: r.reason },
    n: Number(r.n) || 0,
  }));
}

/** Enquiries that never reached the booking form, newest first. */
export async function getDemandWithoutBooking(
  f: DemandFilters,
  limit = 25,
): Promise<DemandRow[]> {
  return getDemandByModel({ ...f, booked: false }, limit);
}
