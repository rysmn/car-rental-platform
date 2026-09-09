import type { GoogleSettings } from "@/lib/admin/settings";
import { siteConfig } from "@/lib/config/site";

/**
 * What the public site is allowed to render from the Google settings.
 *
 * The single decision point, on purpose. A switch is a statement of intent
 * ("I want a map here"), never a promise that the data behind it exists — the
 * administrator can tick "show map" months before anyone fills in a Place ID,
 * and can paste a review link and forget to turn the button on. Every
 * combination of the two has to end in something coherent, and the page must
 * never be the place where that is worked out: a component deciding for itself
 * is how one page ends up with a button to nowhere while another quietly hides
 * a link that works.
 *
 * So: a field is rendered only when the switch is ON **and** the data behind it
 * is present and usable. Anything else yields `null`, and `null` means the
 * element is not rendered at all — not rendered disabled, not rendered empty,
 * not rendered with `href=""`.
 */

export type GoogleView = {
  /** `src` for the map frame, or null when no map may be shown. */
  mapSrc: string | null;
  /** "Zobacz nas w Google" — the Business Profile. */
  profileHref: string | null;
  /**
   * „Zobacz na mapie" — `company.mapsUrl`, czyli lokalizacja w Mapach.
   *
   * Mieszka w wierszu `company`, nie w `google`, i tak zostaje: czyta go
   * stopka i strona kontaktowa, obie od miesięcy. Tutaj tylko przechodzi przez
   * `safeUrl`, żeby blok na stronie głównej podejmował decyzje w tym samym
   * jednym miejscu, co reszta modułu, zamiast oglądać adres samodzielnie.
   */
  mapsHref: string | null;
  /** "Dodaj opinię" — the direct review form. */
  reviewHref: string | null;
  /** Pasek opinii, albo null gdy nie ma czego pokazać. */
  reviews: GoogleReviews | null;
  /** Coordinates for structured data. Null when neither setting nor fallback holds a pair. */
  geo: { lat: number; lng: number } | null;
  /** Place ID, empty string when unknown. Never rendered to visitors. */
  placeId: string;
};

/**
 * Pasek opinii. `null` znaczy: nie rysuj paska w ogóle.
 *
 * Dwie rzeczy w środku i obie mogą być puste niezależnie od siebie, bo
 * odpowiadają na dwa różne pytania:
 *
 *   `score`   — „ILE mamy gwiazdek". Wymaga liczb, których nikt nie zgaduje.
 *   `allHref` — „GDZIE są te opinie". Wymaga wyłącznie wizytówki.
 *
 * Wizytówka bez ani jednej opinii — dokładnie stan A&A z 02.09.2026 — daje
 * `score: null` i działający `allHref`. Pasek pokazuje wtedy odnośnik i ani
 * jednej liczby, zamiast pięciu gwiazdek, których nikt nie wystawił.
 */
export type GoogleReviews = {
  /** Ocena i liczba opinii. Zawsze obie naraz albo żadna. */
  score: { rating: number; count: number } | null;
  /** „Przeczytaj wszystkie opinie" — pełna lista opinii TEJ wizytówki. */
  allHref: string | null;
};

/**
 * Only `http(s)`. The Zod schema already enforces this on write, so this is
 * defence in depth for values that never went through it — a hand-edited row,
 * or a fallback shipped in code. A `javascript:` URL reaching an `href` is the
 * one failure in this file that would be a security bug rather than a cosmetic
 * one.
 */
function safeUrl(value: string | undefined | null): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : null;
}

/**
 * A pair, or nothing.
 *
 * Half a coordinate is not a location: latitude alone puts the pin on the
 * Greenwich meridian, which for Warsaw is roughly the Atlantic. Both or
 * neither.
 */
function coordinates(
  google: Pick<GoogleSettings, "lat" | "lng">,
): { lat: number; lng: number } | null {
  const { lat, lng } = google;
  if (typeof lat === "number" && typeof lng === "number") {
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

/**
 * The embedded map, built without an API key and without an account.
 *
 * `https://www.google.com/maps?q=<lat>,<lng>&output=embed` is the keyless
 * embed: Google 301s it to its own `/maps/embed` renderer and serves the map.
 * It costs nothing, needs no Cloud project, no billing card and no key in the
 * environment — which is the whole reason it is used here instead of the Maps
 * Embed API, whose free tier still requires a billed project to issue a key.
 *
 * The trade-off is stated plainly: this URL is not a documented, versioned API,
 * so Google could change it. If that ever happens the frame goes blank — it
 * cannot break the page around it, because it is an `<iframe>` with a fixed box
 * and the address link beside it is a separate, ordinary anchor.
 *
 * ⚠️ Requires `frame-src https://www.google.com` in the CSP, and that policy is
 * frozen into `routes-manifest.json` at **build** time — see the comment in
 * `next.config.ts`. Changing the setting does not change the header; only a
 * rebuild does.
 */
function mapEmbedSrc(
  geo: { lat: number; lng: number },
  locale: string,
): string {
  const q = `${geo.lat},${geo.lng}`;
  const hl = locale === "en" ? "en" : "pl";
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=15&hl=${hl}&output=embed`;
}

/**
 * „Przeczytaj wszystkie opinie" — pełna lista opinii jednej wizytówki.
 *
 * `https://search.google.com/local/reviews?placeid=<id>` to udokumentowany
 * adres Google, bez klucza, bez konta i bez kosztu. Sprawdzony przeglądarką
 * 02.09.2026 na Place ID A&A: otwiera stronę zatytułowaną „Opinie A&A
 * Corporation" — czyli tę jedną firmę, a nie wyszukiwarkę, nie adres i nie
 * cudzy lokal.
 *
 * TU wyprowadzamy adres z Place ID, choć `reviewUrl` (dodawanie opinii)
 * celowo wyprowadzany nie jest — i to nie jest niekonsekwencja. Link do
 * DODAWANIA opinii Google wydaje właścicielowi w kilku równoprawnych
 * postaciach (`g.page/r/…`), więc pole musi przyjąć to, co dostał. Lista
 * opinii ma jeden adres i jedno źródło prawdy: identyfikator, który i tak
 * musi być wpisany, żeby cokolwiek innego w tym module działało.
 *
 * Bez Place ID cofamy się do wizytówki: to nadal opinie tej firmy, tylko
 * o jedno kliknięcie dalej. Bez obu — brak paska.
 */
function reviewsUrl(placeId: string, profile: string | null): string | null {
  const id = placeId.trim();
  if (id) return `https://search.google.com/local/reviews?placeid=${id}`;
  return profile;
}

/**
 * Ocena — albo nic.
 *
 * Trzy warunki i każdy z nich ma za sobą konkretny fałsz, którego nie
 * wpuszczamy na stronę:
 *
 *   ocena bez liczby opinii  → „5,0" bez żadnej podstawy,
 *   liczba opinii bez oceny  → „12 opinii" i pusty rząd gwiazdek,
 *   zero opinii              → średnia z pustego zbioru.
 *
 * Pierwszy klient A&A zobaczy pasek dopiero wtedy, gdy będzie co pokazać.
 */
function reviewScore(
  google: Pick<GoogleSettings, "rating" | "reviewCount">,
): { rating: number; count: number } | null {
  const { rating, reviewCount } = google;
  if (typeof rating !== "number" || !Number.isFinite(rating)) return null;
  if (typeof reviewCount !== "number" || !Number.isFinite(reviewCount)) {
    return null;
  }
  if (rating < 1 || rating > 5 || reviewCount < 1) return null;
  return { rating, count: reviewCount };
}

/**
 * Resolve the settings into renderable values.
 *
 * `profileUrl` is `social.googleBusiness` and stays in that row — it is passed
 * in rather than read here so this function has no database of its own and can
 * be exercised directly by the test script.
 */
export function googleView({
  google,
  profileUrl,
  mapsUrl = "",
  locale,
}: {
  google: GoogleSettings;
  profileUrl: string;
  /**
   * `company.mapsUrl`. Domyślnie pusty, bo nie każde wywołanie go potrzebuje —
   * dane strukturalne na stronie głównej pytają tę funkcję wyłącznie
   * o współrzędne.
   */
  mapsUrl?: string;
  locale: string;
}): GoogleView {
  /*
    Two different questions, deliberately answered from two different places.

    "May we DRAW a map?" is answered by the settings alone — `own`. The
    administrator ticks a box and types two numbers; if the numbers are not
    there, no map is drawn. That is the rule the owner stated twice ("switch on
    + missing data ⇒ the element stays invisible") and it is what makes this
    screen the single source of truth for the public page: no constant hidden
    in the repository gets to decide that a map appears at coordinates nobody
    entered here.

    "Where IS the business?" is answered by `geo`, which keeps falling back to
    `siteConfig.geo`. That value has been in the structured data for months and
    a cleared settings row must not quietly delete the company from the map in
    Google's index — an SEO regression nobody would notice for weeks.
  */
  const own = coordinates(google);
  const geo = own ?? siteConfig.geo;

  const profile = safeUrl(profileUrl);
  const review = safeUrl(google.reviewUrl);

  /*
    Pasek opinii, ta sama reguła co wszędzie indziej w tym pliku: przełącznik
    JEST warunkiem koniecznym, ale nie wystarczającym. Włączony pasek bez
    wizytówki i bez liczb nie ma czego pokazać, więc go nie ma — zamiast ramki
    z samym słowem „Google".
  */
  const score = reviewScore(google);
  const allHref = reviewsUrl(google.placeId, profile);
  const reviews =
    google.showReviewBar && (score || allHref) ? { score, allHref } : null;

  return {
    // Test 1 (switch off) and test 2 (switch on, no coordinates in the
    // settings) both land here, and both produce null — no empty frame, no
    // broken map, and no map at a location the administrator never confirmed.
    mapSrc: google.showMap && own ? mapEmbedSrc(own, locale) : null,
    profileHref: google.showGoogleButton ? profile : null,
    /*
      Bez własnego przełącznika, i to jest zgodne z tym, co robi strona od
      miesięcy: stopka pokazuje „Zobacz na mapie" zawsze, gdy adres jest
      wpisany. Dokładanie tu czwartego przełącznika dałoby ekran, na którym
      ten sam odnośnik raz podlega przełącznikowi, a raz nie.
    */
    mapsHref: safeUrl(mapsUrl),
    reviewHref: google.showReviewButton ? review : null,
    reviews,
    geo,
    placeId: google.placeId,
  };
}
