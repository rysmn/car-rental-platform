import type { Metadata } from "next";
import { siteConfig } from "@/lib/config/site";
import type { CompanySettings } from "@/lib/admin/settings";
import type { GoogleView } from "@/lib/company/google";
import { openingHoursSpecification } from "@/lib/company/hours";
import { routing } from "@/i18n/routing";
import { getPathname, type AppHref } from "@/i18n/navigation";

/**
 * Canonical URL construction and shared page metadata.
 *
 * Routing is `as-needed`: Polish is served at the root (`/faq`) and English is
 * prefixed (`/en/faq`). Every canonical and hreflang below has to respect that
 * asymmetry, or Google sees two URLs for the same Polish page.
 *
 * Some routes also carry a *different slug* per locale — the SEO landing pages
 * in `routing.pathnames`, where Polish is `/wynajem-samochodow-warszawa` and
 * English is `/en/car-rental-warsaw`. That is why nothing here builds a URL by
 * string concatenation any more: only next-intl knows which slug a locale uses,
 * so `getPathname` is the single source of truth for both.
 */

/** Base origin, without a trailing slash. */
export const SITE_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_URL ?? siteConfig.url
).replace(/\/$/, "");

/**
 * When this build was produced, or null outside a real build.
 *
 * Baked in by `next.config.ts`. The sitemap uses it as `<lastmod>` for pages
 * whose content lives in source; `null` means the sitemap omits the date rather
 * than inventing one.
 */
export const BUILD_TIME: Date | null = (() => {
  const raw = process.env.BUILD_TIME;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
})();

/**
 * Absolute URL for a route in a given locale.
 *
 * `href` is an internal route (`"/faq"`, or `{ pathname: "/fleet/[slug]",
 * params: { slug } }`), NOT the public path — the public path is what this
 * returns.
 */
export function absoluteUrl(locale: string, href: AppHref = "/"): string {
  return `${SITE_ORIGIN}${getPathname({ href, locale })}`;
}

/**
 * Canonical + hreflang set for one page.
 *
 * x-default points at the Polish version: it is the primary market and the URL
 * a visitor with no matching language should land on.
 */
export function localeAlternates(locale: string, href: AppHref = "/") {
  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = absoluteUrl(l, href);
  }
  languages["x-default"] = absoluteUrl(routing.defaultLocale, href);

  return { canonical: absoluteUrl(locale, href), languages };
}

/**
 * BreadcrumbList dla jednej strony.
 *
 * JEDNO miejsce, w którym powstaje ta struktura — landingi SEO miały ją
 * wpisaną u siebie, a flota i karty aut nie miały jej wcale, choć obie stoją
 * o poziom albo dwa niżej niż strona główna i to właśnie one wyświetlają się
 * w wynikach z pełną ścieżką zamiast z gołym adresem.
 *
 * `items` podaje się BEZ strony głównej — jest dopisywana tutaj, żeby żadne
 * wywołanie nie mogło jej pominąć ani nazwać inaczej. Każdy `href` jest trasą
 * wewnętrzną, więc adres buduje `absoluteUrl`, a nie sklejanie łańcuchów:
 * polski i angielski slug bywają różne i ścieżka do 404 w okruszkach to
 * dokładnie ten błąd, którego Search Console nie wybacza po cichu.
 */
export function breadcrumbJsonLd(
  locale: string,
  homeLabel: string,
  items: { name: string; href: AppHref }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: homeLabel,
        item: absoluteUrl(locale, "/"),
      },
      ...items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 2,
        name: item.name,
        item: absoluteUrl(locale, item.href),
      })),
    ],
  };
}

/**
 * Strona informacyjna, która ODWOŁUJE SIĘ do firmy zamiast ją powtarzać.
 *
 * Audyt z 02.09.2026 znalazł dwanaście stron bez żadnych danych
 * strukturalnych, a wśród nich `/contact` — czyli tę jedną, o której
 * wyszukiwarka najbardziej chciałaby wiedzieć, że opisuje dane kontaktowe
 * firmy.
 *
 * Kuszące i błędne byłoby wkleić tam pełny blok `AutoRental` z adresem,
 * telefonem i współrzędnymi. Wtedy ta sama firma istniałaby w indeksie
 * kilkukrotnie, za każdym razem opisana osobno, i przy pierwszej rozbieżności
 * (zmieniony telefon na jednej stronie) Google musiałby zgadywać, który zapis
 * jest prawdziwy. Dlatego tu jest wyłącznie **odnośnik**: `mainEntity` wskazuje
 * przez `@id` na `#organization`, opisany raz, na stronie głównej.
 *
 * `ContactPage` i `AboutPage` to typy o realnym znaczeniu — mówią, CZYM jest
 * ta strona. Nie dokładamy ich tam, gdzie nie wnoszą nic ponad to, co widać
 * z adresu; regulamin i polityka prywatności zostają bez schematu, bo
 * `WebPage` nad zwykłym tekstem prawnym jest wpisem dla samego wpisu.
 */
export function infoPageJsonLd({
  locale,
  type,
  href,
  name,
  description,
}: {
  locale: string;
  type: "ContactPage" | "AboutPage";
  href: AppHref;
  name: string;
  description: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": type,
    "@id": `${absoluteUrl(locale, href)}#page`,
    url: absoluteUrl(locale, href),
    name,
    description,
    inLanguage: locale === "en" ? "en" : "pl",
    /*
      Świadomie BEZ `isPartOf`. Wskazywałoby na encję `WebSite`, której ten
      serwis nigdzie nie publikuje — a odnośnik `@id` prowadzący donikąd jest
      gorszy niż jego brak: mówi wyszukiwarce, że coś przeoczyła.
    */
    // Jedna encja firmy na cały serwis — opisana na stronie głównej.
    mainEntity: { "@id": `${SITE_ORIGIN}/#organization` },
  };
}

/**
 * Serialise structured data for a `<script type="application/ld+json">` tag.
 *
 * `<` is escaped because some of what goes in here is admin-editable — a car
 * description or a company name containing `</script>` would otherwise close
 * the tag early and turn stored text into executable markup. The escape is
 * invalid nowhere: `<` is the same character to every JSON parser.
 */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/**
 * Social preview image shipped with the site — the photographic cover.
 *
 * Still the right card for the home page, which is a brand impression rather
 * than an answer to one query. Pages that DO answer one query pass their own
 * generated card instead (see `lib/og/url`); sharing thirty different pages
 * under one identical photograph wastes the only image a shared link gets.
 */
const OG_IMAGE = {
  url: "/og/cover.jpg",
  width: 1200,
  height: 630,
};

/**
 * Google pokazuje około 160 znaków opisu i ucina resztę w połowie słowa.
 * Przycięcie po swojemu, na granicy zdania albo choć słowa, to różnica między
 * zdaniem, które się kończy, a takim, które się urywa. Tekst mieszczący się
 * pod sufitem wraca nietknięty.
 *
 * TRZY PRÓBY, W TEJ KOLEJNOŚCI:
 *
 *   1. mieści się pod SUFITEM → oddajemy nietknięty tekst,
 *   2. mieści się CAŁE ZDANIE i jest DOŚĆ DŁUGIE → kończymy kropką, bez
 *      wielokropka,
 *   3. dopiero w ostateczności → tniemy na granicy słowa i dokładamy „…".
 *
 * ## Historia progu i dlaczego przestał być ułamkiem limitu
 *
 * Krok 2 dołożył audyt z 01.09.2026, żeby usunąć wielokropki w środku
 * wyliczenia; próg wynosił 60% limitu. Audyt z 02.09.2026 podniósł go do 75%,
 * bo sześć kart aut oddawało Google 98–128 znaków zamiast dostępnych 160.
 *
 * Obie te decyzje rozwiązywały jednak NIE TEN problem. Pytanie brzmiało
 * „ile znaków wyrzucić", a powinno brzmieć „dlaczego w ogóle tniemy tekst,
 * który mieści się w zdaniu". Pomiar produkcji z 05.09.2026: OSIEMNAŚCIE
 * z 62 adresów miało opis urwany wielokropkiem — czyli krok 3 wygrywał
 * z krokiem 2 w blisko jednej trzeciej serwisu, bo limit 160 stał w miejscu
 * sufitu.
 *
 * Od 05.09.2026 są to dwie osobne wielkości: `DESCRIPTION_CEILING` mówi, ile
 * tekstu wolno wpuścić do znacznika, a `DESCRIPTION_MAX` — ile z tego Google
 * zwykle pokaże. Próg zdania jest teraz liczbą bezwzględną
 * (`SENTENCE_FLOOR_CHARS`), bo wiązanie go z którymkolwiek z tych dwóch
 * limitów opisywałoby co innego, niż nazywa.
 *
 * DLACZEGO KROPKA NIE WYSTARCZY ZA GRANICĘ ZDANIA. W polszczyźnie kropkę nosi
 * też skrót: „ul.", „np.", „godz.", „m.in.". Cięcie po nich dałoby opis
 * kończący się na „Odbiór przy ul." — czyli wyraźniejszą wersję usterki,
 * którą krok 2 miał usunąć. Stąd trzy warunki naraz: po znaku stoi spacja
 * i wielka litera (albo koniec tekstu), słowo przed kropką ma co najmniej
 * cztery litery, a to, co zostaje, jest dłuższe niż próg zdania.
 */
const DESCRIPTION_MAX = 160;

/**
 * SUFIT OPISU — i to jest poprawka z 05.09.2026.
 *
 * `DESCRIPTION_MAX` przestał być granicą tekstu, a został tym, czym naprawdę
 * jest: SZACUNKIEM, ILE GOOGLE POKAŻE. To dwie różne rzeczy, a mylenie ich
 * kosztowało OSIEMNAŚCIE z sześćdziesięciu dwóch adresów na produkcji —
 * tyle miało 05.09.2026 opis urwany wielokropkiem w połowie wyliczenia.
 *
 * Długość znacznika nie jest limitem, którego nie wolno przekroczyć. Google
 * przycina WYŚWIETLANIE i robi to sam; my, tnąc wcześniej do 160 znaków
 * i doklejając „…", nie zyskiwaliśmy ani jednego znaku w wyniku, a traciliśmy
 * zdanie, które się kończy. Wielokropek wpisany do źródła zostaje w nim także
 * tam, gdzie wyszukiwarka pokazałaby całość.
 *
 * 200 znaków to limit wyświetlania plus jedno zdanie podrzędne. Poniżej tej
 * granicy tekst jedzie w całości — SIEDEM stron (BMW 740d, Volvo XC60 PL/EN,
 * Renault Trafic PL/EN, Porsche Panamera EN, „O nas" PL) mieści się tu bez
 * jednego cięcia. Powyżej — wracamy do ostatniego PEŁNEGO zdania, bo opis
 * dłuższy od akapitu przestaje być opisem.
 */
const DESCRIPTION_CEILING = 200;

/**
 * Najkrótszy opis, który jeszcze jest opisem.
 *
 * Liczba bezwzględna, nie ułamek: sufit i limit wyświetlania to od tej zmiany
 * dwie różne wielkości, więc próg wiązany z którąkolwiek z nich mówiłby o czymś
 * innym niż o sobie. 80 znaków to dolna granica zdania, które cokolwiek
 * opisuje; krótsze pełne zdanie („Tak. …") jest gorsze od dłuższego tekstu
 * z wielokropkiem i dopiero wtedy wygrywa cięcie na granicy słowa.
 */
const SENTENCE_FLOOR_CHARS = 80;

/** Ostatnie pełne zdanie mieszczące się w limicie, albo null. */
function ostatnieZdanie(text: string, max: number): string | null {
  const okno = text.slice(0, max);
  for (const dopasowanie of [...okno.matchAll(/[.!?](?=\s|$)/g)].reverse()) {
    const koniec = dopasowanie.index + 1;
    if (koniec < SENTENCE_FLOOR_CHARS) break; // dalej będzie już tylko krócej
    // Po znaku: koniec okna albo spacja i wielka litera — nie „ul. Ruczaj".
    const reszta = okno.slice(koniec);
    if (reszta && !/^\s+[A-ZĄĆĘŁŃÓŚŹŻ0-9]/.test(reszta)) continue;
    // Przed znakiem: słowo co najmniej czteroliterowe — odsiewa „ul.", „np.",
    // „tzn.", „itp.", „m.in." i resztę skrótów krótszych niż cztery znaki.
    const slowo = okno.slice(0, koniec - 1).match(/[\p{L}\p{N}]+$/u);
    if (!slowo || slowo[0].length < 4) continue;
    return okno.slice(0, koniec);
  }
  return null;
}

/**
 * Przycięcie na granicy słowa, zużywające limit do końca.
 *
 * NIGDY w środku słowa: gdy w oknie nie ma ani jednej spacji — czyli tekst
 * jest jednym długim ciągiem znaków — dopiero wtedy tniemy twardo, bo nie ma
 * innego wyjścia.
 *
 * Ogon interpunkcyjny znika przed wielokropkiem. „…komfort, elegancję,…"
 * czyta się jak usterka; „…komfort, elegancję…" jak zdanie, któremu zabrakło
 * miejsca. Lista znaków obejmuje też półpauzę i pauzę, bo obie kończą wiersz
 * równie brzydko jak przecinek.
 */
function przytnijDoSlowa(text: string, max: number): string {
  const okno = text.slice(0, max - 1);
  const ostatniaSpacja = okno.lastIndexOf(" ");
  const trzon = ostatniaSpacja > 0 ? okno.slice(0, ostatniaSpacja) : okno;
  return `${trzon.replace(/[\s,.;:!?·–—-]+$/u, "")}…`;
}

export function clampDescription(text: string, max = DESCRIPTION_CEILING) {
  const trimmed = text.trim();
  // Mieści się pod sufitem — oddajemy NIETKNIĘTY. Żadnego cięcia „na wszelki
  // wypadek": tekst, który się mieści, jest już kompletny.
  if (trimmed.length <= max) return trimmed;

  // Nie mieści się — cofamy się do ostatniego pełnego zdania POD SUFITEM.
  const zdanie = ostatnieZdanie(trimmed, max);
  if (zdanie) return zdanie.trim();

  // Ani jednej granicy zdania w zasięgu: dopiero tutaj wolno uciąć na granicy
  // słowa, i to do limitu WYŚWIETLANIA — skoro tekst i tak będzie przycięty,
  // niech przynajmniej nie niesie znaków, których nikt nie zobaczy.
  return przytnijDoSlowa(trimmed, DESCRIPTION_MAX);
}

/**
 * Standard metadata for a public page: canonical, hreflang, Open Graph and
 * Twitter card. Pages pass their own title/description; everything structural
 * is derived here so it stays consistent across the site.
 *
 * Callers pass the title WITHOUT the company name — the root layout's
 * `title.template` appends it to the document title. Open Graph carries no
 * such template, so the brand is added here for the card only. Writing it
 * into the caller's title instead is what produced "Nasza flota — A&A
 * Corporation — A&A Corporation" in the browser tab and the search result.
 */
export function pageMetadata({
  locale,
  path,
  title,
  description,
  image,
}: {
  locale: string;
  path?: AppHref;
  title: string;
  description: string;
  /** Absolute URL of a page-specific card. Omitted = the shipped cover photo. */
  image?: string;
}): Metadata {
  const alternates = localeAlternates(locale, path ?? "/");
  const card = image
    ? { url: image, width: OG_IMAGE.width, height: OG_IMAGE.height }
    : OG_IMAGE;
  const branded = title.includes(siteConfig.name)
    ? title
    : `${title} — ${siteConfig.name}`;
  const summary = clampDescription(description);

  return {
    title,
    description: summary,
    alternates,
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      locale: locale === "en" ? "en_GB" : "pl_PL",
      url: alternates.canonical,
      title: branded,
      description: summary,
      images: [card],
    },
    twitter: {
      card: "summary_large_image",
      title: branded,
      description: summary,
      images: [card.url],
    },
  };
}

/**
 * Organization / car-rental structured data for the home page.
 *
 * Deliberately conservative: only facts we actually hold are emitted. There is
 * no `aggregateRating` (the site has no verified reviews — publishing an
 * invented one is both a Google manual-action risk and an unfair commercial
 * practice), and no street address until the registered address is supplied.
 */
export function organizationJsonLd(
  socialUrls: string[],
  company: CompanySettings,
  /**
   * Google settings, resolved by `googleView`. Optional so the one existing
   * caller keeps working unchanged and a page that has not loaded the setting
   * still publishes the built-in coordinates instead of dropping `geo`.
   */
  google?: Pick<GoogleView, "geo">,
) {
  // Deduplicated, because the Google Business Profile URL and `mapsUrl` are
  // frequently the same link pasted twice — and `sameAs: [x, x]` is a malformed
  // claim that the company has two identities at one address.
  const sameAs = [
    ...new Set(socialUrls.filter((u) => u && /^https?:\/\//i.test(u))),
  ];

  // Only published once an admin has filled a real schedule in. `undefined`
  // drops the property entirely rather than emitting an empty array.
  const openingHours = openingHoursSpecification(company.openingHours);

  // The NIP is admin-editable and starts empty, so it is emitted only once it
  // actually holds something: `"vatID": ""` is not a neutral placeholder to a
  // validator, it is a claim that the company has no VAT number. Absent is
  // honest; empty is wrong. (REGON and KRS have no schema.org equivalent worth
  // inventing a property for — they stay in the footer.)
  const identity = company.nip
    ? { vatID: company.nip, taxID: company.nip }
    : {};

  // Falls back to the coordinates shipped in the repo, which is what this
  // property carried before the setting existed.
  const geo = google?.geo ?? siteConfig.geo;

  return {
    "@context": "https://schema.org",
    "@type": "AutoRental",
    "@id": `${SITE_ORIGIN}/#organization`,
    name: siteConfig.name,
    description: siteConfig.tagline,
    url: `${SITE_ORIGIN}/`,
    telephone: company.phones[0]?.number,
    email: company.email,
    image: `${SITE_ORIGIN}${OG_IMAGE.url}`,
    logo: `${SITE_ORIGIN}/brand/aa-logo-dark.png`,
    ...identity,
    address: {
      "@type": "PostalAddress",
      // Street address only once an admin supplies one — a PostalAddress with
      // an empty street reads as an incomplete address rather than a city-level
      // one.
      ...(company.address ? { streetAddress: company.address } : {}),
      addressLocality: company.city,
      addressCountry: "PL",
    },
    /*
      OBSŁUGIWANY RYNEK — dziś jeden.

      Stało tu wcześniej miasto rejestracji ORAZ Gdańsk, bo strona reklamowała
      oba. Decyzja właściciela z 05.09.2026 rozstrzygnęła to inaczej: teraz
      Warszawa, Gdańsk w przyszłości. Potwierdza to prawda operacyjna —
      punkt odbioru `airport-gdansk` ma w bazie `active = false`, więc
      w Gdańsku nie da się dziś odebrać auta.

      `areaServed` to deklaracja wobec wyszukiwarki, gdzie firma NAPRAWDĘ
      świadczy usługę. Wymienienie rynku, którego formularz rezerwacji nie
      obsługuje, ściąga zapytania, na które nie umiemy odpowiedzieć — i jest
      po prostu nieprawdziwe. Miasto bierzemy z zatwierdzonych danych firmy,
      nie z listy wpisanej w kodzie; drugi rynek dopiszemy tu w dniu, w którym
      zacznie działać.
    */
    areaServed: [{ "@type": "City", name: company.city }],
    // Coordinates of the pick-up point, so the business can be placed on a map
    // even before a Google Business Profile exists. Admin-editable since the
    // Google/Maps section shipped; `siteConfig.geo` remains the fallback, so
    // this property never disappears because a row was cleared.
    ...(geo
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: geo.lat,
            longitude: geo.lng,
          },
        }
      : {}),
    // Emitted only once there is a link. `hasMap: ""` is not an empty value to
    // a validator — it is a claim that the business has a map at the empty
    // URL, the same mistake `vatID: ""` would be two properties up.
    ...(company.mapsUrl ? { hasMap: company.mapsUrl } : {}),
    currenciesAccepted: "PLN",
    // Google renders these beside the business in search and uses them to
    // decide whether the site is open when someone searches "wynajem aut
    // warszawa" at 23:00.
    ...(openingHours ? { openingHoursSpecification: openingHours } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}
