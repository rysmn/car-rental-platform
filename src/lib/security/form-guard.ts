import "server-only";
import { clientIp } from "./client-ip";
import { headers } from "next/headers";
import { z } from "zod";
import { limit, type Regula } from "./rate-limit";
import { recordSecurityEvent, type SecurityEventKind } from "./events";
import { verifyTurnstile } from "./turnstile";

/**
 * Jedna brama dla KAŻDEGO formularza publicznego — rozdział 13.1.
 *
 * Trzy warstwy, w kolejności od najtańszej do najdroższej, bo najtańsza
 * odsiewa najwięcej:
 *
 *   1. **Pułapka** (`website`) — pole ukryte przed człowiekiem. Automat, który
 *      czyta HTML i wypełnia wszystko, co znajdzie, wpada w nią bez wyjątku.
 *      Kosztuje zero i nie dotyka nikogo prawdziwego.
 *   2. **Czas wypełniania** (`startedAt`) — formularz z ośmioma polami wysłany
 *      w dwie sekundy nie został wypełniony przez człowieka. Próg jest niski
 *      celowo: klient, który wraca do porzuconej karty i klika „wyślij", ma
 *      zegar sprzed kwadransa, a nie sprzed dwóch sekund.
 *   3. **Limit częstotliwości** po kilku kluczach naraz i **Turnstile** —
 *      dopiero to kosztuje żądanie sieciowe.
 *
 * ## Co odpowiadamy robotowi
 *
 * Przy pułapce i przy zbyt szybkim wysłaniu — SUKCES. Nic nie zapisujemy, ale
 * odpowiedź wygląda tak samo jak udana. Komunikat „wykryto spam" jest
 * instrukcją obsługi dla autora robota: mówi mu dokładnie, które pole ma
 * zostawić puste. Przy limicie odpowiadamy wprost, bo tam po drugiej stronie
 * bywa człowiek, który naprawdę wysłał trzy zapytania z jednego biura.
 *
 * ## Czego tu NIE ma
 *
 * Nie ma tu adresu IP w postaci jawnej nigdzie poza pamięcią procesu.
 * Do dziennika idzie wyłącznie skrót (patrz `security/events`).
 */

/** Pola, które każdy chroniony formularz dokłada do wysyłki. */
export const poleOchronne = {
  /** Pułapka: ukryta przed człowiekiem, kusząca dla automatu. */
  website: z.string().max(200).optional(),
  /** Znacznik czasu otwarcia formularza (ms). Podpowiedź, nie dowód. */
  startedAt: z.number().int().positive().optional(),
  /** Token z widgetu Turnstile. */
  turnstileToken: z.string().max(4096).optional(),
};

export type PolaOchronne = {
  website?: string;
  startedAt?: number;
  turnstileToken?: string;
};

/** Najkrótszy czas, w jakim człowiek jest w stanie wypełnić formularz. */
const MIN_CZAS_MS = 2500;

/**
 * Co dokładnie powiedziała weryfikacja Cloudflare.
 *
 * Trzy różne zdarzenia, które do 29.08.2026 wychodziły z bramy pod jedną
 * nazwą „antybot" — a klient dostawał wtedy jedno zdanie: „Odśwież stronę
 * i spróbuj jeszcze raz". Dla dwóch z tych trzech przypadków była to zła rada:
 * odświeżenie strony KASUJE wypełniony formularz, a wystarczyło kliknąć
 * jeszcze raz.
 *
 *   · `brak_tokenu`  — token nie dojechał (widget się nie narysował, klient
 *                      wysłał zanim wyzwanie się skończyło, ktoś woła akcję
 *                      z pominięciem formularza),
 *   · `odrzucony`    — token dojechał, ale Cloudflare go nie uznaje: wygasł
 *                      (ważność 300 s), został już raz zużyty albo jest
 *                      podrobiony,
 *   · `niedostepny`  — sam `siteverify` nie odpowiedział. To NIE jest wina
 *                      klienta i nie mówi nic o tym, czy jest człowiekiem.
 */
export type PowodTurnstile = "brak_tokenu" | "odrzucony" | "niedostepny";

export type WynikBramy =
  | { ok: true }
  /** Cicho odrzucone — wołający ma UDAWAĆ SUKCES i nic nie zapisywać. */
  | { ok: false; cicho: true }
  /** Odrzucone jawnie — wołający pokazuje komunikat. */
  | {
      ok: false;
      cicho: false;
      powod: "rate" | "antybot";
      zaSekund?: number;
      /** Wypełnione tylko przy `powod: "antybot"` — patrz `PowodTurnstile`. */
      szczegol?: PowodTurnstile;
    };

/**
 * Co zrobić, gdy `siteverify` NIE ODPOWIADA.
 *
 * To jest decyzja biznesowa, nie techniczna, i dlatego jest parametrem
 * formularza, a nie stałą w tym pliku:
 *
 *   · `przepusc` — awaria dostawcy nie może zamykać kanału. Tak działa
 *     „Napisz do nas": zapytanie klienta, które przepadnie, przepada
 *     bezpowrotnie, a pułapka, pomiar czasu i limit działają dalej i nie
 *     zależą od nikogo z zewnątrz.
 *   · `odrzuc` — bez potwierdzenia weryfikacji nie powstaje nic. Tak działa
 *     REZERWACJA, na wyraźne polecenie właściciela (29.08.2026): rezerwacja
 *     tworzy zobowiązanie i zajmuje auto, więc ma być fail-closed. Klient
 *     dostaje zdanie „spróbuj za chwilę", jego dane zostają w formularzu,
 *     a przycisk wraca do stanu aktywnego.
 *
 * W obu wariantach zdarzenie ląduje w dzienniku, więc cicha awaria trwająca
 * tydzień będzie widoczna jako seria, a nie jako brak zdarzeń.
 */
export type PolitykaAwarii = "przepusc" | "odrzuc";

export async function clientIpFromHeaders(): Promise<string> {
  // Jedno miejsce na całą aplikację — patrz `lib/security/client-ip`. Do
  // 02.09.2026 stała tu własna kopia, która brała PIERWSZY element
  // `X-Forwarded-For`, czyli wartość podaną przez klienta.
  return clientIp(await headers());
}

/**
 * Sprawdź formularz.
 *
 * @param nazwa   nazwa akcji do dziennika, np. `booking.create`
 * @param pola    pola ochronne przysłane z formularza
 * @param reguly  limity do sprawdzenia — zwykle jeden godzinny i jeden minutowy
 * @param dodatkoweKlucze inne wymiary limitu niż adres, np. skrót e-maila
 */
export async function sprawdzFormularz({
  nazwa,
  pola,
  reguly,
  dodatkoweKlucze = [],
  awariaDostawcy = "przepusc",
}: {
  nazwa: string;
  pola: PolaOchronne;
  reguly: Regula[];
  dodatkoweKlucze?: (string | null | undefined)[];
  /** Co zrobić, gdy `siteverify` nie odpowiada — patrz `PolitykaAwarii`. */
  awariaDostawcy?: PolitykaAwarii;
}): Promise<WynikBramy> {
  const ip = await clientIpFromHeaders();

  const zapisz = (kind: SecurityEventKind, detail?: Record<string, unknown>) =>
    void recordSecurityEvent({ kind, endpoint: nazwa, subject: ip, detail });

  // 1. Pułapka
  if (pola.website && pola.website.trim()) {
    zapisz("honeypot");
    return { ok: false, cicho: true };
  }

  // 2. Czas wypełniania
  if (typeof pola.startedAt === "number") {
    const uplynelo = Date.now() - pola.startedAt;
    // Ujemny czas znaczy zegar klienta przestawiony w przód — to nie jest powód
    // do odrzucenia, bo zdarza się prawdziwym ludziom. Liczy się tylko „za
    // szybko".
    if (uplynelo >= 0 && uplynelo < MIN_CZAS_MS) {
      zapisz("form_too_fast", { uplyneloMs: uplynelo });
      return { ok: false, cicho: true };
    }
  }

  // 3a. Limity — po adresie i po każdym dodatkowym wymiarze
  const klucze = [ip, ...dodatkoweKlucze];
  for (const regula of reguly) {
    const wynik = limit(regula, klucze);
    if (wynik.przekroczony) {
      zapisz("form_rate_limited", { regula: regula.nazwa });
      return {
        ok: false,
        cicho: false,
        powod: "rate",
        zaSekund: wynik.zaSekund,
      };
    }
  }

  // 3b. Turnstile — ostatni, bo jedyny, który wychodzi w internet
  const t = await verifyTurnstile(pola.turnstileToken, ip);
  if (!t.ok) {
    zapisz(
      t.powod === "brak_tokenu" ? "turnstile_missing" : "turnstile_invalid",
      {
        powod: t.powod,
      },
    );
    /*
      „Niedostępny" — czyli Cloudflare nie odpowiedziało. Co dalej, decyduje
      WOŁAJĄCY, bo to on wie, co powstaje po drugiej stronie bramy: zapytanie,
      którego stratą jest cisza, czy rezerwacja, która zajmuje auto.
      Patrz `PolitykaAwarii`.
    */
    if (t.powod === "niedostepny" && awariaDostawcy === "przepusc") {
      return { ok: true };
    }
    return { ok: false, cicho: false, powod: "antybot", szczegol: t.powod };
  }

  return { ok: true };
}
