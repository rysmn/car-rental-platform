import "server-only";
import { sql } from "drizzle-orm";
import { existsSync } from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db";
import { uploadDir } from "@/lib/storage/media";
import { recordAlert } from "./record";
import { describeError } from "./redact";
import type { AlertSeverity } from "./types";
import { doba, zajetoscRezerwacji } from "@/lib/booking/bufor";

/**
 * A cheap look at whether the moving parts still move.
 *
 * The constraint that shaped this file is the instruction not to spend money
 * proving the system is alive. So: no AI call, no image processing, no full
 * table scan, and no request to the site's own HTTP surface. Every check is a
 * bounded query or a stat() — the whole sweep is a handful of milliseconds —
 * and the chatbot check verifies its **configuration and data**, never its
 * model. Whether the assistant can reach Cloudflare is a question that costs
 * tokens to ask, and the answer is already recorded for free by the chat route
 * itself, which reports an alert when a call actually fails.
 *
 * What "fail" means here is deliberately narrow: something is broken, not
 * something is unset. An empty NIP is a business decision; a fleet table that
 * cannot be read is an outage. Only the second kind raises an alert, because an
 * alert system that fires on unfinished configuration trains its reader to
 * ignore it.
 */

export type CheckResult = {
  key: string;
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
};

const ok = (key: string, label: string, detail: string): CheckResult => ({
  key,
  label,
  status: "ok",
  detail,
});

/**
 * Where uploaded media actually lives.
 *
 * Read from `lib/storage/media` rather than from an env var of this module's
 * own choosing: a health check that looks in a different directory from the
 * route that serves the files would report a healthy library while every image
 * on the site 404s, which is worse than having no check at all.
 */
const mediaDir = () => uploadDir();

async function checkDatabase(): Promise<CheckResult> {
  try {
    const t0 = Date.now();
    await getDb().execute(sql`SELECT 1`);
    const ms = Date.now() - t0;
    return {
      key: "db",
      label: "Baza danych",
      // A database answering `SELECT 1` in over a second is not down, but it is
      // not well either, and it is the shape every outage here has started as.
      status: ms > 1000 ? "warn" : "ok",
      detail: `odpowiedź w ${ms} ms`,
    };
  } catch (e) {
    return {
      key: "db",
      label: "Baza danych",
      status: "fail",
      detail: describeError(e),
    };
  }
}

async function checkFleet(): Promise<CheckResult> {
  try {
    const rows = (await getDb().execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE published)::int AS published,
        COUNT(*) FILTER (WHERE published AND daily_price_grosze <= 0)::int AS unpriced
      FROM car_models
    `)) as unknown as { published: number; unpriced: number }[];
    const r = (Array.isArray(rows) ? rows : []).at(0);
    const published = Number(r?.published) || 0;
    const unpriced = Number(r?.unpriced) || 0;

    if (published === 0) {
      return {
        key: "fleet",
        label: "Flota",
        status: "fail",
        detail: "żaden model nie jest opublikowany — strona floty byłaby pusta",
      };
    }
    if (unpriced > 0) {
      return {
        key: "fleet",
        label: "Flota",
        status: "warn",
        detail: `${unpriced} opublikowanych modeli bez ceny dobowej`,
      };
    }
    return ok(
      "fleet",
      "Flota",
      `${published} opublikowanych modeli, wszystkie z ceną`,
    );
  } catch (e) {
    return {
      key: "fleet",
      label: "Flota",
      status: "fail",
      detail: describeError(e),
    };
  }
}

/**
 * Stany floty, które **przeczą same sobie** — nie te, które są tylko nieładne.
 *
 * Ta kontrola powstała po sondzie na kopii produkcji i różnica między pierwszą
 * a ostateczną wersją jest jej najważniejszą częścią, więc zostaje zapisana:
 *
 *   · „egzemplarz `rented` bez rezerwacji na dziś" **nie jest** usterką. Panel
 *     pozwala ustawić ten status ręcznie, więc jest to wspierany sposób zdjęcia
 *     auta z rynku przy wynajmie poza systemem. Na kopii produkcji takich aut
 *     jest dziś dwa — alert dzwoniłby od pierwszego dnia.
 *   · „egzemplarz `available`, a ma potwierdzoną rezerwację na dziś" też **nie
 *     jest** sprzecznością: status opisuje EGZEMPLARZ (czy nadaje się do
 *     jazdy), a rezerwacja opisuje TERMIN. Auto sprawne i zajęte na dziś jest
 *     w obu wymiarach opisane poprawnie.
 *   · „model opublikowany, ale żaden egzemplarz nie jest `available`" —
 *     odrzucone świadomie. Model wynajęty w całości to zwykły dzień pracy
 *     wypożyczalni, a system nie odróżni go od zapomnianej flagi. Alert
 *     dzwoniący przy normalnej pracy zostaje wyciszony i przestaje znaczyć
 *     cokolwiek.
 *
 * Odpadła też kontrola „potwierdzona rezerwacja bez przypisanego egzemplarza":
 * `reservations.car_id` jest `NOT NULL`, więc ten warunek nie odezwałby się
 * nigdy. Kontrola, która nie może zwrócić prawdy, to nie zabezpieczenie, tylko
 * ozdobnik sugerujący pokrycie, którego nie ma.
 *
 * Zostaje to, czego nie da się obronić żadnym scenariuszem pracy. Każdy z tych
 * warunków zwracał **zero** na kopii produkcji, więc kontrola wchodzi cicho —
 * a kiedy się odezwie, będzie miała rację.
 */
async function checkFleetIntegrity(): Promise<CheckResult> {
  try {
    const rows = (await getDb().execute(sql`
      SELECT
        -- Podwójna rezerwacja. Baza ma na to ograniczenie EXCLUDE
        -- (reservations_no_double_booking), wiec to straznik straznika:
        -- gdyby kiedyś zniknęło przy migracji, cisza byłaby najgorsza.
        (SELECT COUNT(*)::int FROM reservations a
           JOIN reservations b ON b.car_id = a.car_id AND b.id > a.id
          WHERE a.status = 'confirmed' AND b.status = 'confirmed'
            AND ${zajetoscRezerwacji("a")} && ${zajetoscRezerwacji("b")}) AS podwojne,
        -- Klient ma potwierdzoną rezerwację na auto, które stoi w serwisie albo
        -- jest uszkodzone. Silnik rezerwacji przydziela wyłącznie egzemplarze
        -- available, wiec ten stan powstaje tylko wtedy, gdy ktos zmienil
        -- status PO potwierdzeniu — i nikomu tego nie powiedział. Klient
        -- przyjedzie po auto, którego nie ma.
        (SELECT COUNT(*)::int FROM reservations r JOIN cars c ON c.id = r.car_id
          WHERE r.status = 'confirmed' AND r.end_date >= CURRENT_DATE
            AND c.status IN ('service', 'damaged')) AS na_niesprawnym,
        -- Braki danych, które widać na stronie: model bez zdjęć albo bez
        -- egzemplarzy jest ofertą, której nie da się zrealizować.
        (SELECT COUNT(*)::int FROM car_models cm
          WHERE cm.published
            AND NOT EXISTS (SELECT 1 FROM cars c WHERE c.model_id = cm.id)) AS bez_egzemplarzy,
        (SELECT COUNT(*)::int FROM car_models
          WHERE published AND COALESCE(array_length(images, 1), 0) = 0) AS bez_zdjec,
        (SELECT COUNT(*)::int FROM car_models
          WHERE published AND seats <= 0) AS bez_miejsc
    `)) as unknown as {
      podwojne: number;
      na_niesprawnym: number;
      bez_egzemplarzy: number;
      bez_zdjec: number;
      bez_miejsc: number;
    }[];
    const r = (Array.isArray(rows) ? rows : []).at(0);
    const n = (v: unknown) => Number(v) || 0;

    const powazne: string[] = [];
    if (n(r?.podwojne) > 0)
      powazne.push(
        `${n(r?.podwojne)}× to samo auto w dwóch potwierdzonych rezerwacjach`,
      );
    if (n(r?.na_niesprawnym) > 0)
      powazne.push(
        `${n(r?.na_niesprawnym)} potwierdzonych rezerwacji na aucie w serwisie lub uszkodzonym`,
      );

    const braki: string[] = [];
    if (n(r?.bez_egzemplarzy) > 0)
      braki.push(
        `${n(r?.bez_egzemplarzy)} opublikowanych modeli bez ani jednego egzemplarza`,
      );
    if (n(r?.bez_zdjec) > 0)
      braki.push(`${n(r?.bez_zdjec)} opublikowanych modeli bez zdjęć`);
    if (n(r?.bez_miejsc) > 0)
      braki.push(`${n(r?.bez_miejsc)} opublikowanych modeli bez liczby miejsc`);

    if (powazne.length) {
      return {
        key: "fleet-spojnosc",
        label: "Spójność floty",
        status: "fail",
        detail: powazne.join("; "),
      };
    }
    if (braki.length) {
      return {
        key: "fleet-spojnosc",
        label: "Spójność floty",
        status: "warn",
        detail: braki.join("; "),
      };
    }
    return ok(
      "fleet-spojnosc",
      "Spójność floty",
      "rezerwacje i egzemplarze zgodne",
    );
  } catch (e) {
    return {
      key: "fleet-spojnosc",
      label: "Spójność floty",
      status: "fail",
      detail: describeError(e),
    };
  }
}

async function checkBooking(): Promise<CheckResult> {
  try {
    // The availability predicate itself, on a one-day window. If this query
    // cannot run, nothing on the site can be booked — which is the single most
    // expensive failure the system has, and the one least likely to be noticed
    // from the outside, because every page still renders.
    const today = new Date().toISOString().slice(0, 10);
    await getDb().execute(sql`
      SELECT COUNT(*)::int FROM cars c
      WHERE c.status = 'available'
        AND NOT EXISTS (
          SELECT 1 FROM reservations r
          WHERE r.car_id = c.id AND r.status IN ('confirmed','completed')
            AND ${zajetoscRezerwacji("r")} && ${doba(sql`${today}::date`)}
        )
    `);
    const bookable = (await getDb().execute(sql`
      SELECT COUNT(*)::int AS n FROM cars WHERE status = 'available'
    `)) as unknown as { n: number }[];
    const n = Number((Array.isArray(bookable) ? bookable : []).at(0)?.n) || 0;
    return n === 0
      ? {
          key: "booking",
          label: "Rezerwacje",
          status: "warn",
          detail: "żaden egzemplarz nie ma statusu „dostępny”",
        }
      : ok(
          "booking",
          "Rezerwacje",
          `zapytanie dostępności działa, ${n} egzemplarzy dostępnych`,
        );
  } catch (e) {
    return {
      key: "booking",
      label: "Rezerwacje",
      status: "fail",
      detail: describeError(e),
    };
  }
}

/**
 * Does every picture the database points at still exist on disk?
 *
 * Bounded to the published fleet and the hero, which is the set a visitor can
 * actually hit. Checking every historical upload would be a directory walk on
 * every health check for information nobody acts on.
 */
async function checkMedia(): Promise<CheckResult> {
  try {
    const rows = (await getDb().execute(sql`
      SELECT DISTINCT unnest(images) AS url FROM car_models WHERE published
    `)) as unknown as { url: string }[];
    const urls = (Array.isArray(rows) ? rows : [])
      .map((r) => String(r.url ?? ""))
      .filter((u) => u.startsWith("/api/media/"));

    const dir = mediaDir();
    if (!existsSync(dir)) {
      return {
        key: "media",
        label: "Media",
        // Not "fail": the panel runs in a container that may legitimately not
        // mount the volume in a local or test run, and crying outage in that
        // case is how a check gets ignored in production too.
        status: "warn",
        detail: `katalog mediów niedostępny w tym kontenerze`,
      };
    }

    const missing = urls.filter(
      (u) => !existsSync(path.join(dir, path.basename(u))),
    );
    return missing.length === 0
      ? ok("media", "Media", `${urls.length} plików floty na miejscu`)
      : {
          key: "media",
          label: "Media",
          status: "warn",
          detail: `${missing.length} z ${urls.length} plików floty nie istnieje na dysku`,
        };
  } catch (e) {
    return {
      key: "media",
      label: "Media",
      status: "fail",
      detail: describeError(e),
    };
  }
}

/**
 * The assistant's own preconditions — not the model.
 *
 * It can answer only if it is switched on and has a fleet and a price list to
 * read. Everything past that (does Cloudflare respond, is the token valid) is
 * reported by the chat route when a real conversation hits it, at no cost.
 */
async function checkChat(): Promise<CheckResult> {
  try {
    const rows = (await getDb().execute(sql`
      SELECT value FROM site_settings WHERE key = 'chatbot'
    `)) as unknown as { value: unknown }[];
    const raw = (Array.isArray(rows) ? rows : []).at(0)?.value as
      { enabled?: boolean; mode?: string } | undefined;

    if (!raw)
      return ok(
        "chat",
        "Asystent",
        "brak konfiguracji — działa na wartościach domyślnych",
      );
    if (raw.enabled === false) {
      return {
        key: "chat",
        label: "Asystent",
        status: "ok",
        detail: "wyłączony w ustawieniach (decyzja, nie awaria)",
      };
    }
    return ok("chat", "Asystent", `włączony, tryb „${raw.mode ?? "?"}”`);
  } catch (e) {
    return {
      key: "chat",
      label: "Asystent",
      status: "fail",
      detail: describeError(e),
    };
  }
}

/**
 * Run everything, record what failed, return the whole picture.
 *
 * A failing check writes an alert with a fingerprint that depends only on the
 * check's key, so a database that has been down for an hour is one row with a
 * high `occurrences` count, not one row per sweep. A check that recovers does
 * NOT auto-resolve its alert: an operator closes it, having looked. Silent
 * self-resolution would erase a nightly five-minute outage nobody was awake
 * for, which is exactly the fault worth keeping.
 */
export async function runHealthChecks(): Promise<CheckResult[]> {
  const results = await Promise.all([
    checkDatabase(),
    checkFleet(),
    checkFleetIntegrity(),
    checkBooking(),
    checkMedia(),
    checkChat(),
  ]);

  for (const r of results) {
    if (r.status === "ok") continue;
    const severity: AlertSeverity =
      r.status === "fail"
        ? r.key === "db" || r.key === "booking"
          ? "critical"
          : "error"
        : "warning";
    await recordAlert({
      module: "health",
      severity,
      key: `health:${r.key}`,
      title: `Kontrola techniczna: ${r.label}`,
      detail: r.detail,
    });
  }

  return results;
}
