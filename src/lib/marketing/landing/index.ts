import type { Metadata } from "next";
import type { AppHref } from "@/i18n/navigation";
import type { FleetCar } from "@/lib/fleet/types";
import {
  absoluteUrl,
  breadcrumbJsonLd,
  pageMetadata,
  SITE_ORIGIN,
} from "@/lib/seo";
import { siteConfig } from "@/lib/config/site";
import { ogImageUrl } from "@/lib/og/url";
import {
  pick,
  resolveLanding,
  type Landing,
  type LandingContent,
  type LandingFacts,
  type Pair,
} from "./types";
import { WARSAW } from "./warsaw";
import { AIRPORT } from "./airport";
import { GDANSK } from "./gdansk";
import { SUV } from "./suv";
import { PREMIUM } from "./premium";
import { LIMOUSINE } from "./limousine";
import { ELECTRIC } from "./electric";
import { VAN } from "./van";
import { LONGTERM } from "./longterm";
import { BUSINESS } from "./business";
import { WEDDING } from "./wedding";

export type { LandingContent } from "./types";

/**
 * The SEO landing-page registry.
 *
 * ONE entry per page, and everything that page needs hangs off it: the route,
 * the copy, the label used in the footer and in cross-links, which cars its
 * fleet strip shows, what `areaServed` it claims, and how it ranks in the
 * sitemap. The page file, the footer, the sitemap and the related-links block
 * all read from here, so adding a landing page is three edits and no hunting:
 *
 *   1. a slug pair in `routing.pathnames` (Polish and English differ),
 *   2. a copy file next to this one, added to `LANDING_ROUTES` below,
 *   3. `page.tsx` under `(public)/<internal route>/` — 20 lines, all boilerplate.
 *
 * Nothing else needs touching: the sitemap iterates this list, the footer
 * iterates this list, and `related` wires the internal linking both ways.
 */

export type LandingKey =
  | "warsaw"
  | "airport"
  | "gdansk"
  | "suv"
  | "premium"
  | "limousine"
  | "electric"
  | "van"
  | "longterm"
  | "business"
  | "wedding";

export type LandingRoute = {
  key: LandingKey;
  /** Internal route — the folder name, NOT the public slug. */
  href: AppHref;
  page: Landing;
  /** Short label for the footer and the cross-link block. */
  label: Pair;
  /**
   * Which cars the fleet strip shows. Omitted = the whole fleet.
   *
   * A class page that lists every car it does not talk about is a worse answer
   * than a short honest one — but an EMPTY strip is worse than both, so the
   * renderer falls back to the full fleet if a filter matches nothing.
   */
  matchCar?: (car: FleetCar) => boolean;
  /** schema.org `areaServed` for the `Service` node. */
  areaServed: Record<string, unknown>;
  /** Sitemap priority, relative to the rest of this site only. */
  priority: number;
  /** Other landing pages worth linking to from this one. */
  related: LandingKey[];
  /**
   * Czy ten rynek jest DZIŚ obsługiwany. Brak pola = tak.
   *
   * Decyzja właściciela z 05.09.2026: TERAZ Warszawa, Gdańsk W PRZYSZŁOŚCI.
   * Potwierdza to prawda operacyjna, a nie tylko deklaracja — punkt odbioru
   * `airport-gdansk` stoi w bazie z `active = false`, więc formularz
   * rezerwacji NIE POZWALA odebrać auta w Gdańsku. Strona reklamowała rynek,
   * którego system nie potrafił obsłużyć: klient z Trójmiasta docierał na
   * landing, a przy rezerwacji nie znajdował swojego lotniska.
   *
   * `false` wyłącza stronę z CAŁEJ aktywnej oferty publicznej naraz — znika
   * z mapy witryny, ze stopki i z odnośników pokrewnych, a sama trasa
   * odpowiada 404. To ten sam mechanizm, którym administrator wyłącza FAQ czy
   * „O nas": strona wyłączona nie jest stroną ukrytą, tylko nieistniejącą,
   * i dlatego nie trafia do indeksu ani do linkowania wewnętrznego.
   *
   * Pliki, treść, slugi i wpisy `related` ZOSTAJĄ nietknięte. Włączenie
   * Gdańska w dniu otwarcia to zmiana jednego słowa tutaj i uaktywnienie
   * punktu odbioru w panelu — nic więcej nie trzeba odtwarzać.
   */
  aktywny?: boolean;
};

const WARSAW_CITY = { "@type": "City", name: "Warszawa" } as const;

export const LANDING_ROUTES: LandingRoute[] = [
  {
    key: "warsaw",
    href: "/car-rental-warsaw",
    page: WARSAW,
    label: { pl: "Wynajem aut Warszawa", en: "Car rental Warsaw" },
    areaServed: WARSAW_CITY,
    priority: 0.9,
    related: ["airport", "suv", "premium", "longterm", "gdansk"],
  },
  {
    key: "airport",
    href: "/car-rental-warsaw-chopin-airport",
    page: AIRPORT,
    label: { pl: "Lotnisko Chopina", en: "Chopin Airport" },
    areaServed: {
      "@type": "Airport",
      name: "Warsaw Chopin Airport",
      iataCode: "WAW",
    },
    priority: 0.8,
    related: ["warsaw", "suv", "premium", "gdansk"],
  },
  {
    key: "gdansk",
    href: "/car-rental-gdansk",
    page: GDANSK,
    label: { pl: "Wynajem aut Gdańsk", en: "Car rental Gdańsk" },
    areaServed: { "@type": "City", name: "Gdańsk" },
    priority: 0.8,
    related: ["warsaw", "airport", "suv", "longterm"],
    // RYNEK PRZYSZŁY, nie dzisiejszy — patrz `aktywny` w typie wyżej.
    aktywny: false,
  },
  {
    key: "suv",
    href: "/suv-rental-warsaw",
    page: SUV,
    label: { pl: "Wynajem SUV Warszawa", en: "SUV rental Warsaw" },
    // Every SUV, business class included — somebody searching "wynajem SUV"
    // wants the body style, not our internal premium/business split.
    matchCar: (car) => car.category === "suv",
    areaServed: WARSAW_CITY,
    priority: 0.8,
    related: ["premium", "electric", "van", "warsaw"],
  },
  {
    key: "premium",
    href: "/premium-car-rental-warsaw",
    page: PREMIUM,
    label: { pl: "Auta premium Warszawa", en: "Premium cars Warsaw" },
    matchCar: (car) =>
      car.segments.includes("luxury") ||
      car.segments.includes("executive") ||
      car.segments.includes("premium-suv"),
    areaServed: WARSAW_CITY,
    priority: 0.8,
    related: ["limousine", "suv", "wedding", "business"],
  },
  {
    key: "limousine",
    href: "/luxury-sedan-rental-warsaw",
    page: LIMOUSINE,
    label: { pl: "Wynajem limuzyn Warszawa", en: "Luxury sedans Warsaw" },
    // "Limuzyna" is the saloon body style on our own car pages — the same word
    // the category filter uses — so the strip matches on the luxury shelf.
    matchCar: (car) => car.segments.includes("luxury"),
    areaServed: WARSAW_CITY,
    priority: 0.7,
    related: ["wedding", "premium", "warsaw", "suv"],
  },
  {
    key: "electric",
    href: "/electric-car-rental-warsaw",
    page: ELECTRIC,
    label: { pl: "Auta elektryczne", en: "Electric cars" },
    // `electric` is derived from `fuel` rather than ticked by an admin, so this
    // can never drift out of step with the spec sheet.
    matchCar: (car) => car.fuel === "electric",
    areaServed: WARSAW_CITY,
    priority: 0.7,
    related: ["suv", "premium", "longterm", "warsaw"],
  },
  {
    key: "van",
    href: "/9-seater-van-rental-warsaw",
    page: VAN,
    label: { pl: "Bus 9-osobowy", en: "9-seater van" },
    matchCar: (car) => car.category === "van",
    areaServed: WARSAW_CITY,
    priority: 0.7,
    related: ["wedding", "airport", "business"],
  },
  {
    key: "longterm",
    href: "/long-term-car-rental-warsaw",
    page: LONGTERM,
    label: { pl: "Wynajem długoterminowy", en: "Long-term rental" },
    areaServed: WARSAW_CITY,
    priority: 0.8,
    related: ["business", "electric", "suv", "warsaw"],
  },
  {
    key: "business",
    href: "/business-car-rental-warsaw",
    page: BUSINESS,
    label: { pl: "Wynajem dla firm", en: "Rental for companies" },
    areaServed: WARSAW_CITY,
    priority: 0.7,
    related: ["longterm", "premium", "airport", "van"],
  },
  {
    key: "wedding",
    href: "/wedding-car-rental-warsaw",
    page: WEDDING,
    label: { pl: "Auto na wesele", en: "Wedding cars" },
    // The cars couples actually ask for: the luxury and executive classes,
    // saloons and premium SUVs alike. Guests travel in the van, which the copy
    // links to separately.
    matchCar: (car) =>
      car.segments.includes("luxury") || car.segments.includes("executive"),
    areaServed: WARSAW_CITY,
    priority: 0.7,
    related: ["limousine", "van", "premium", "warsaw"],
  },
];

const BY_KEY = new Map(LANDING_ROUTES.map((r) => [r.key, r]));

export function landingRoute(key: LandingKey): LandingRoute {
  const route = BY_KEY.get(key);
  // Unreachable while `LandingKey` and `LANDING_ROUTES` agree, which the type
  // checker enforces on the keys but not on the completeness of the array.
  if (!route) throw new Error(`Unknown landing page: ${key}`);
  return route;
}

/**
 * Copy for one landing page, resolved to a single locale.
 *
 * `facts` fills the `{phone}`, `{office}`, `{minAge}` and `{minAgeNote}`
 * placeholders — see `LandingFacts`. Optional so a caller with no database
 * (the OG-card renderer, a test, a script) still gets readable copy; those
 * callers use only `h1` and `eyebrow`, which carry no placeholders. The page
 * renderer always passes it.
 */
export const getLandingContent = (
  key: LandingKey,
  locale: string,
  facts?: LandingFacts,
) => resolveLanding(landingRoute(key).page, locale, facts);


/** Footer / cross-link label for one landing page. */
export const landingLabel = (key: LandingKey, locale: string) =>
  pick(landingRoute(key).label, locale);

/**
 * Landingi obsługiwanych rynków — jedyne źródło dla mapy witryny, stopki
 * i odnośników pokrewnych. Rynek wyłączony (`aktywny: false`) nie pojawia się
 * w żadnym z tych trzech miejsc, więc nie da się go przeoczyć w jednym z nich.
 */
export const AKTYWNE_LANDINGI = LANDING_ROUTES.filter(
  (route) => route.aktywny !== false,
);

/** Every active landing page as a link, in registry order — for the footer. */
export const landingLinks = (locale: string) =>
  AKTYWNE_LANDINGI.map((route) => ({
    key: route.key,
    href: route.href,
    label: pick(route.label, locale),
  }));

/** The cross-links shown at the foot of one landing page. */
export const relatedLandingLinks = (key: LandingKey, locale: string) =>
  landingRoute(key)
    .related // Rynek wyłączony zostaje w tablicy jako zapis zamiaru, ale się nie linkuje.
    .filter((k) => landingRoute(k).aktywny !== false)
    .map((k) => ({
      key: k,
      href: landingRoute(k).href,
      label: landingLabel(k, locale),
    }));

/** Which cars this page's fleet strip should show. */
export function landingFleet(key: LandingKey, fleet: FleetCar[]): FleetCar[] {
  const { matchCar } = landingRoute(key);
  if (!matchCar) return fleet;
  const matched = fleet.filter(matchCar);
  // An empty strip is a dead end for the visitor and a leaf node for a crawler.
  // If the fleet ever stops containing, say, a saloon, show everything rather
  // than nothing.
  return matched.length > 0 ? matched : fleet;
}

/**
 * Canonical, hreflang, title, description, Open Graph and Twitter card.
 *
 * Goes through `pageMetadata` rather than assembling Open Graph by hand: hand
 * assembly is how these pages ended up with no `og:image` and no Twitter card
 * at all, which made every link pasted into WhatsApp, Messenger or LinkedIn
 * render as bare text — on the one set of pages most likely to be shared.
 *
 * The card is generated per page and per locale. These twelve pages exist to be
 * sent to somebody ("here, this is the airport one"), and until now all twelve
 * arrived showing the same stock photograph, so the preview said nothing the
 * link did not already say.
 */
export function landingMetadata(key: LandingKey, locale: string): Metadata {
  const { href } = landingRoute(key);
  const content = getLandingContent(key, locale);
  return pageMetadata({
    locale,
    path: href,
    title: content.metaTitle,
    description: content.metaDescription,
    image: ogImageUrl("landing", key, locale),
  });
}

/**
 * BreadcrumbList + FAQPage + Service for one landing page.
 *
 * The `Service` node points at the `AutoRental` emitted on the home page via
 * `@id` instead of describing a second, unrelated business — six landing pages
 * each declaring their own organisation would tell Google there are six of us.
 * `name` and `url` travel beside that `@id`: the referenced node lives on the
 * home page, not this one, so a validator reading this page alone would
 * otherwise see a provider with no properties at all.
 *
 * `content` IS THE PAGE'S OWN RESOLVED COPY, and it is a parameter rather than
 * a second `getLandingContent(key, locale)` call for one reason that a live
 * check caught: resolving it here a second time, without `LandingFacts`, gave
 * this file placeholder text. `/wynajem-aut-warszawa` published
 * `"{minAge} lat, z ważnym prawem jazdy…"` inside its `FAQPage` while the
 * visible page beside it said `"21 lat"` — structured data contradicting the
 * answer a visitor reads is exactly what a FAQ rich result is penalised for.
 * Taking the rendered copy as an argument makes the two physically the same
 * strings, so they cannot drift again.
 */
export function landingJsonLd(
  key: LandingKey,
  locale: string,
  homeLabel: string,
  content: LandingContent,
) {
  const { href, areaServed } = landingRoute(key);
  const url = absoluteUrl(locale, href);

  return [
    breadcrumbJsonLd(locale, homeLabel, [{ name: content.h1, href }]),
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: content.faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: content.h1,
      description: content.metaDescription,
      serviceType: content.h1,
      provider: {
        "@id": `${SITE_ORIGIN}/#organization`,
        "@type": "AutoRental",
        name: siteConfig.name,
        url: `${SITE_ORIGIN}/`,
      },
      areaServed,
      url,
    },
  ];
}
