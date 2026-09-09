import "server-only";
import { getSetting, setSetting } from "@/lib/admin/settings";
import { isPlausibleRate, type EurRate } from "./convert";

/**
 * The EUR/PLN rate: where it comes from, how long it is kept, and what happens
 * when it cannot be had.
 *
 * ## Zero cost, and it stays zero cost
 *
 * Two official, free, key-less sources, in this order:
 *
 *   1. **ECB** — the euro foreign exchange reference rates, published once a
 *      working day around 16:00 CET as a small XML file. This is the reference
 *      rate, which is what "orientacyjna cena w euro" means; no registration,
 *      no key, no quota, no invoice.
 *   2. **NBP** — table A, the Polish central bank's own mid rate, same terms.
 *      A second free official source rather than a paid safety net: the whole
 *      point of having a fallback is that it must not be the thing that starts
 *      costing money the day the first one has an outage.
 *
 * No usage-based currency API, no SaaS, no key in the environment. Adding one
 * would break the standing rule in CLAUDE.md §12 and there is nothing here that
 * needs it.
 *
 * ## Fetched at most once a day, never during a render the visitor waits on
 *
 * The value lives in `site_settings` — the same key/value store as the hero
 * photo and the opening hours, so this costs **no migration and no table**. It
 * is shared by every container and it survives a restart and a deployment,
 * which an in-process variable would not.
 *
 * A page render READS that row and returns. When the row is more than a day old
 * a refresh is started and **not awaited**: the visitor gets the rate we already
 * had, and the next visitor gets the new one. Nothing on the public site — not
 * the fleet, not the booking form, not the assistant, not availability — can be
 * delayed or broken by a slow or missing central bank.
 *
 * The one exception is a system that has never held a rate at all. There the
 * first request waits, briefly and once, because the alternative is showing a
 * price switch that does nothing until somebody happens to load a second page.
 * The wait is capped, the attempt is rate-limited per container, and a failure
 * simply means the site stays in złoty — which is the correct answer, not a
 * degraded one.
 *
 * ## The rate is never invented
 *
 * There is no hardcoded fallback number anywhere in this file. If both sources
 * fail and nothing was ever cached, `getEurRate()` returns `null`, the switch
 * does not render, and every price on the site is in złoty exactly as it was
 * before this feature existed. A made-up rate would put a wrong number in front
 * of a customer and look identical to a right one.
 */

/** How old a cached rate may get before a refresh is started behind it. */
const STALE_AFTER_MS = 20 * 60 * 60 * 1000;

/**
 * How long a container waits before trying a source that just failed.
 *
 * Per process, not in the database: this exists to stop a dead source being
 * dialled once per request, and a process that has just started has no reason
 * to inherit another one's bad luck.
 */
const RETRY_GAP_MS = 5 * 60 * 1000;

/** The cap on the one wait a first-ever request is allowed to pay. */
const FIRST_FETCH_TIMEOUT_MS = 1500;

/** Per-source network timeout. Both files are a few kilobytes. */
const SOURCE_TIMEOUT_MS = 2500;

const ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const NBP_URL =
  "https://api.nbp.pl/api/exchangerates/rates/a/eur/?format=json";

/** The stored shape. `plnPerEur: 0` is the "never had one" marker. */
export type EurRateSetting = {
  plnPerEur: number;
  date: string;
  source: "ecb" | "nbp" | "";
  fetchedAt: string;
};

let inFlight: Promise<void> | null = null;
let lastAttemptMs = 0;

/** ISO day (`YYYY-MM-DD`) or "" — never a `Date`, so it survives JSON intact. */
function isoDay(value: string | null | undefined): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

/**
 * ECB's daily file, read with a regular expression rather than an XML parser.
 *
 * The document is a fixed, machine-generated list of `<Cube currency='XXX'
 * rate='n'/>` elements that has not changed shape in twenty years, and pulling
 * in a parser to read one attribute would be a dependency for a substring. The
 * match is anchored on `currency='PLN'` so it cannot pick up a neighbouring
 * currency's rate, and the value still has to clear `isPlausibleRate`.
 */
async function fetchEcb(signal: AbortSignal): Promise<EurRate | null> {
  const res = await fetch(ECB_URL, { signal, cache: "no-store" });
  if (!res.ok) return null;
  const xml = await res.text();

  const rate = xml.match(/currency=['"]PLN['"]\s+rate=['"]([\d.]+)['"]/);
  if (!rate) return null;
  const plnPerEur = Number(rate[1]);
  if (!isPlausibleRate(plnPerEur)) return null;

  // The reference date is on the inner Cube that holds the day's rates.
  const time = xml.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/);
  return { plnPerEur, date: isoDay(time?.[1]), source: "ecb" };
}

/** NBP table A — the mid rate, as JSON. */
async function fetchNbp(signal: AbortSignal): Promise<EurRate | null> {
  const res = await fetch(NBP_URL, { signal, cache: "no-store" });
  if (!res.ok) return null;
  const body: unknown = await res.json();

  const rates = (body as { rates?: unknown })?.rates;
  const first = Array.isArray(rates) ? rates[0] : null;
  const plnPerEur = (first as { mid?: unknown })?.mid;
  if (!isPlausibleRate(plnPerEur)) return null;

  const date = (first as { effectiveDate?: unknown })?.effectiveDate;
  return {
    plnPerEur,
    date: isoDay(typeof date === "string" ? date : ""),
    source: "nbp",
  };
}

/**
 * Try both sources in order and store whatever the first one to answer says.
 *
 * Never throws and never rejects — it is called without `await` from a render
 * path, and an unhandled rejection there would be a crashed request for a page
 * that did not need this value to be correct.
 */
async function refresh(): Promise<void> {
  lastAttemptMs = Date.now();

  for (const fetchOne of [fetchEcb, fetchNbp]) {
    try {
      const rate = await fetchOne(AbortSignal.timeout(SOURCE_TIMEOUT_MS));
      if (!rate) continue;
      await setSetting("eurRate", {
        plnPerEur: rate.plnPerEur,
        date: rate.date,
        source: rate.source,
        fetchedAt: new Date().toISOString(),
      } satisfies EurRateSetting);
      return;
    } catch {
      // Network error, timeout, malformed body, or a database that would not
      // take the write. The next request tries again after RETRY_GAP_MS; until
      // then the last good rate — or złoty — is what visitors see.
    }
  }
}

/** One refresh at a time per container, and not more often than the retry gap. */
function startRefresh(): Promise<void> {
  if (inFlight) return inFlight;
  if (Date.now() - lastAttemptMs < RETRY_GAP_MS) return Promise.resolve();
  inFlight = refresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

function toRate(stored: EurRateSetting): EurRate | null {
  return isPlausibleRate(stored.plnPerEur)
    ? {
        plnPerEur: stored.plnPerEur,
        date: stored.date,
        source: stored.source === "nbp" ? "nbp" : "ecb",
      }
    : null;
}

/**
 * The rate to render prices with, or `null` when there has never been one.
 *
 * `null` is a complete answer: callers show złoty and hide the switch. It is
 * not an error and nothing logs it as one — a site with no euro price is the
 * site as it was last week.
 */
export async function getEurRate(): Promise<EurRate | null> {
  let stored: EurRateSetting;
  try {
    stored = await getSetting("eurRate");
  } catch {
    return null;
  }

  const current = toRate(stored);
  const age = Date.now() - Date.parse(stored.fetchedAt || "");
  const stale = !Number.isFinite(age) || age > STALE_AFTER_MS;

  if (!stale) return current;

  if (current) {
    // Behind the answer, not in front of it. `void` plus a refresh that cannot
    // reject is what keeps this off the visitor's critical path.
    void startRefresh();
    return current;
  }

  // Nothing has ever been stored. Wait — once, briefly — so the first visitor
  // to a freshly deployed system is not the one who has to reload to see the
  // switch appear.
  try {
    await Promise.race([
      startRefresh(),
      new Promise<void>((resolve) =>
        setTimeout(resolve, FIRST_FETCH_TIMEOUT_MS),
      ),
    ]);
    return toRate(await getSetting("eurRate"));
  } catch {
    return null;
  }
}

/** What the admin panel shows about the rate. Read-only; never fetches. */
export async function getEurRateStatus(): Promise<EurRateSetting> {
  try {
    return await getSetting("eurRate");
  } catch {
    return { plnPerEur: 0, date: "", source: "", fetchedAt: "" };
  }
}
