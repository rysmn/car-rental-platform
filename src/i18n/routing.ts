import { defineRouting } from "next-intl/routing";

// PL is the primary market → served at the root (`/`). EN is prefixed (`/en`).
// localeDetection is off: `/` ALWAYS serves Polish regardless of the browser's
// Accept-Language; English is reached explicitly via the switcher (`/en`).
export const routing = defineRouting({
  locales: ["pl", "en"],
  defaultLocale: "en", // LOKALER TEST: Englisch als Standard
  localePrefix: "as-needed",
  localeDetection: false,
  pathnames: {
    "/": "/",
    "/fleet": "/fleet",
    "/fleet/[slug]": "/fleet/[slug]",
    "/about": "/about",
    "/how-it-works": "/how-it-works",
    "/faq": "/faq",
    "/contact": "/contact",
    /*
     * Strona partnerska. Slugi różnią się w obu językach — tak samo jak
     * w landingach SEO — bo „partnerstwo" i „partnership" to słowa, których
     * szukają dwie różne grupy, a wspólny adres zawsze przegrywa jedną z nich.
     */
    "/partnership": { pl: "/partnerstwo", en: "/partnership" },
    "/moje-rezerwacje": "/moje-rezerwacje",
    /*
     * Potwierdzenie rezerwacji z maila — rozdział 13.4.
     *
     * Ten sam adres w obu językach, bo link trafia do skrzynki i wraca do
     * przeglądarki, która o wyborze języka nic nie wie; osobny slug angielski
     * dawałby dwa adresy, z których jeden zawsze byłby tym „złym".
     * Strona nie jest indeksowana (`robots: noindex`), więc slug nie ma tu
     * żadnej wartości wyszukiwarkowej do stracenia.
     */
    "/potwierdz-rezerwacje/[token]": "/potwierdz-rezerwacje/[token]",
    // Saved cars and the comparison built from them. Same path in both locales:
    // the selection is a list of ids and carries no language of its own, so a
    // visitor switching PL/EN keeps both the page and the cars they picked.
    "/saved": "/saved",
    "/compare": "/compare",
    "/regulamin": "/regulamin",
    "/polityka-prywatnosci": "/polityka-prywatnosci",
    // ---- SEO landing pages -------------------------------------------------
    // The key is the internal route (and the folder name under `(public)/`);
    // the pl/en values are the public slugs, which deliberately differ so each
    // locale carries its own keywords. Adding one here is step 1 of 3 — see
    // `lib/marketing/landing/index.ts`.
    //
    // Renaming a slug that has already been indexed needs a 308 in
    // `next.config.ts` alongside the change, or the old URL starts 404ing.
    "/car-rental-warsaw": {
      pl: "/wynajem-aut-warszawa",
      en: "/car-rental-warsaw",
    },
    "/car-rental-warsaw-chopin-airport": {
      pl: "/wynajem-aut-lotnisko-chopina",
      en: "/car-rental-warsaw-chopin-airport",
    },
    "/car-rental-gdansk": {
      pl: "/wynajem-aut-gdansk",
      en: "/car-rental-gdansk",
    },
    "/suv-rental-warsaw": {
      pl: "/wynajem-suv-warszawa",
      en: "/suv-rental-warsaw",
    },
    "/premium-car-rental-warsaw": {
      pl: "/wynajem-aut-premium-warszawa",
      en: "/premium-car-rental-warsaw",
    },
    "/luxury-sedan-rental-warsaw": {
      pl: "/wynajem-limuzyn-warszawa",
      en: "/luxury-sedan-rental-warsaw",
    },
    "/electric-car-rental-warsaw": {
      pl: "/wynajem-aut-elektrycznych-warszawa",
      en: "/electric-car-rental-warsaw",
    },
    "/9-seater-van-rental-warsaw": {
      pl: "/wynajem-busa-9-osobowego-warszawa",
      en: "/9-seater-van-rental-warsaw",
    },
    "/long-term-car-rental-warsaw": {
      pl: "/wynajem-dlugoterminowy-aut-warszawa",
      en: "/long-term-car-rental-warsaw",
    },
    "/business-car-rental-warsaw": {
      pl: "/wynajem-aut-dla-firm-warszawa",
      en: "/business-car-rental-warsaw",
    },
    "/wedding-car-rental-warsaw": {
      pl: "/wynajem-auta-na-wesele-warszawa",
      en: "/wedding-car-rental-warsaw",
    },
    "/admin": "/admin",
    "/admin/login": "/admin/login",
    "/admin/analytics": "/admin/analytics",
    "/admin/analytics/raport": "/admin/analytics/raport",
    "/admin/analytics/[carId]": "/admin/analytics/[carId]",
    "/admin/alerty": "/admin/alerty",
    "/admin/audit": "/admin/audit",
    "/admin/chatbot": "/admin/chatbot",
    "/admin/chatbot/analityka": "/admin/chatbot/analityka",
    "/admin/chatbot/leady": "/admin/chatbot/leady",
    "/admin/chatbot/pytania": "/admin/chatbot/pytania",
    "/admin/chatbot/rozmowy": "/admin/chatbot/rozmowy",
    "/admin/customers": "/admin/customers",
    // Skrzynka zapytań klientów — etap 44D. Ten sam adres w obu językach,
    // jak cały panel: administratorzy pracują po polsku, a tłumaczenie ścieżki
    // panelu tylko rozjechałoby zakładki i linki wysyłane między sobą.
    "/admin/inbox": "/admin/inbox",
    "/admin/customers/[id]": "/admin/customers/[id]",
    "/admin/finanse": "/admin/finanse",
    "/admin/kaucje": "/admin/kaucje",
    "/admin/szkody": "/admin/szkody",
    "/admin/szkody/[id]": "/admin/szkody/[id]",
    "/admin/fleet": "/admin/fleet",
    "/admin/fleet/new": "/admin/fleet/new",
    "/admin/fleet/[id]": "/admin/fleet/[id]",
    "/admin/pricing": "/admin/pricing",
    // Business policy, not translated: the panel is Polish-only like the rest
    // of /admin, so the slug is the same on both sides.
    "/admin/zasady": "/admin/zasady",
    // Umowy i dokumenty — ta sama ścieżka w obu językach, jak reszta panelu:
    // panel jest narzędziem pracy firmy, nie treścią pozycjonowaną w sieci.
    "/admin/dokumenty": "/admin/dokumenty",
    "/admin/reservations": "/admin/reservations",
    // Before `[id]`: a literal segment and a dynamic one both match
    // `/admin/reservations/new`, and the order here is what decides.
    "/admin/reservations/new": "/admin/reservations/new",
    "/admin/reservations/[id]": "/admin/reservations/[id]",
    // Protokoły wydania i zwrotu — osobne trasy, bo to robota wykonywana
    // telefonem przy aucie, nie sekcja strony rezerwacji.
    "/admin/reservations/[id]/wydanie": "/admin/reservations/[id]/wydanie",
    "/admin/reservations/[id]/zwrot": "/admin/reservations/[id]/zwrot",
    "/admin/reservations/[id]/protokol": "/admin/reservations/[id]/protokol",
    "/admin/settings": "/admin/settings",
    "/admin/settings/bezpieczenstwo": "/admin/settings/bezpieczenstwo",
    "/admin/settings/chatbot": "/admin/settings/chatbot",
    "/admin/settings/google": "/admin/settings/google",
    "/admin/settings/konto": "/admin/settings/konto",
    "/admin/settings/legal": "/admin/settings/legal",
    "/admin/settings/strona": "/admin/settings/strona",
    "/admin/users": "/admin/users",
  },
});

export type Locale = (typeof routing.locales)[number];
