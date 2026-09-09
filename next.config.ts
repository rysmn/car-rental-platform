import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const isDev = process.env.NODE_ENV !== "production";

/**
 * Google Analytics hosts, added to the CSP below only when GA is actually
 * configured.
 *
 * An environment with no `NEXT_PUBLIC_GA4_ID` keeps the original, tighter
 * policy — there is no reason to permit Google's script host on a deployment
 * that will never load it. Note this widens the policy for the whole site,
 * including the admin panel, which is why the tag itself is mounted on public
 * pages only.
 */
const gaConfigured = /^G-[A-Z0-9]+$/i.test(
  process.env.NEXT_PUBLIC_GA4_ID ?? "",
);
const gaScript = gaConfigured ? " https://www.googletagmanager.com" : "";
const gaConnect = gaConfigured
  ? " https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com"
  : "";
const gaImg = gaConfigured
  ? " https://*.google-analytics.com https://www.googletagmanager.com"
  : "";

/**
 * Content-Security-Policy.
 *
 * Every directive is locked down EXCEPT `script-src`, which currently allows
 * `'unsafe-inline'`. Reason: a nonce/hash-based script-src is the goal, but Next
 * 16.2's automatic nonce propagation does not emit `nonce=` on its framework
 * scripts here (verified — the CSP request header reaches the renderer but no
 * nonce is stamped), and hashing the RSC payload scripts is not viable. React's
 * output escaping remains the primary XSS defense, and the public pages render no
 * user-supplied HTML. TODO(security): move script-src to nonce/hash before the
 * authenticated/admin surfaces render user data (see SECURITY.md).
 *
 * Dev additionally needs `unsafe-eval` + a websocket for Turbopack HMR.
 */
/*
 * Turnstile — rozdział 13.1.
 *
 * Widget ładuje skrypt i osadza ramkę z `challenges.cloudflare.com`, więc bez
 * tych trzech dyrektyw CSP blokuje go w ciszy: klient widzi pusty prostokąt,
 * token nigdy nie powstaje, a przycisk wysyłki zostaje wyłączony na zawsze.
 *
 * ## Dlaczego BEZWARUNKOWO, a nie „tylko gdy klucz jest ustawiony"
 *
 * Pierwsza wersja czytała `process.env.TURNSTILE_SITE_KEY` i dokładała te trzy
 * pozycje tylko wtedy, gdy klucz istniał — z komentarzem, że wartość jest
 * czytana przy starcie procesu, więc wystarczy restart kontenera. **To było
 * nieprawdą i kosztowało awarię produkcji 27.08.2026.**
 *
 * `headers()` z tego pliku Next rozstrzyga podczas `next build` i zapisuje
 * gotowy łańcuch do `.next/routes-manifest.json`. Serwer produkcyjny czyta
 * manifest i już go nie przelicza. Obraz zbudowany bez klucza niesie więc CSP
 * bez Cloudflare NA ZAWSZE — dopisanie klucza do `.env` i odtworzenie
 * kontenera nie zmienia nagłówka ani o znak. Właściciel dodał prawdziwe klucze,
 * zrestartował i formularz kontaktowy oraz rezerwacja przestały działać:
 * przeglądarka odrzucała skrypt Turnstile (`Refused to load … violates
 * script-src`), token nie powstawał, przyciski zostawały nieaktywne.
 *
 * Polityka wymieniona z nazwy jeden host, którego integracja i tak wymaga.
 * Bez gwiazdki, bez `unsafe-*`, bez rozluźnienia czegokolwiek innego. Cena
 * jest znana i mała: wdrożenie, które nigdy nie włączy Turnstile, pozwala
 * przeglądarce pobrać skrypt z hosta, o który nigdy nie poprosi. Zysk jest
 * duży: konfiguracja przestaje zależeć od tego, co akurat było w środowisku
 * w chwili budowania obrazu — czyli od rzeczy, której nikt nie widzi patrząc
 * na działający serwer.
 */
const TURNSTILE_HOST = "https://challenges.cloudflare.com";
const tsScript = ` ${TURNSTILE_HOST}`;
const tsFrame = ` ${TURNSTILE_HOST}`;
const tsConnect = ` ${TURNSTILE_HOST}`;

/*
 * Mapa Google na stronie kontaktowej — sekcja „Google / Maps” w Adminie.
 *
 * Mapa jest osadzana ramką z `https://www.google.com/maps?q=…&output=embed`,
 * czyli bez klucza API, bez projektu w Google Cloud i bez karty płatniczej.
 * Bez tej dyrektywy CSP blokuje ramkę w ciszy — na stronie zostaje pusty
 * prostokąt, dokładnie tak jak stało się z Turnstile 27.08.2026.
 *
 * BEZWARUNKOWO, z tego samego powodu co host Cloudflare wyżej: `headers()`
 * rozstrzyga się podczas `next build` i ląduje w `routes-manifest.json`.
 * Włączenie przełącznika „Pokaż mapę” w Adminie NIE zmienia nagłówka —
 * zmienia go wyłącznie przebudowanie obrazu. Gdyby ta pozycja zależała od
 * ustawienia w bazie, właściciel włączyłby mapę i zobaczył pustą ramkę bez
 * jednego komunikatu, który by to wyjaśniał.
 *
 * Wymieniony jeden host, bez gwiazdki. Cena wdrożenia, które nigdy nie włączy
 * mapy: przeglądarka mogłaby osadzić ramkę z google.com, o którą nikt nie
 * poprosi. `frame-ancestors 'none'` i `X-Frame-Options: DENY` zostają bez
 * zmian — to jest zgoda na osadzanie CUDZEJ treści u nas, nie naszej u obcych.
 */
const MAPS_HOST = "https://www.google.com";
const mapsFrame = ` ${MAPS_HOST}`;

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${gaScript}${tsScript}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${gaImg}`,
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}${gaConnect}${tsConnect}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  `frame-src 'self'${tsFrame}${mapsFrame}`,
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

// Security headers applied to every response (static + dynamic). When we move off
// Vercel to Hetzner these must be re-asserted at the reverse proxy too — nothing
// here relies on a platform default except TLS/HSTS termination.
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  // Standalone output keeps us portable: works with `next start`, Docker, and a
  // future Hetzner box — no Vercel-proprietary runtime required.
  output: "standalone",
  poweredByHeader: false,
  /**
   * How large a Server Action request may be.
   *
   * Next's default is **1 MB**, and every image in this panel is uploaded
   * through a Server Action — the hero photos, and the car gallery with them.
   * So the framework rejected any photo over 1 MB with a 413 before a line of
   * our code ran: the operator saw "A server error occurred", the server log
   * said `Body exceeded 1 MB limit`, and nothing explained that a perfectly
   * ordinary 3 MB photograph was the problem. Reported from production on
   * 21.08.2026 at 23:49, fifteen attempts in six minutes.
   *
   * 9 MB rather than 8: the real rule is `MAX_BYTES` in `lib/storage/media`,
   * which rejects anything over 8 MB with a message a human can act on. A
   * multipart body carries the file plus its encoding overhead, so a limit set
   * exactly at 8 MB would fail an 8 MB file here — at the framework, with the
   * unreadable error — instead of there, with the readable one. The margin
   * keeps the decision in our code.
   */
  experimental: {
    serverActions: { bodySizeLimit: "9mb" },
  },
  /*
    KOMPRESJĘ ODDAJEMY CADDY'EMU (06.09.2026).

    Next ma własną kompresję i domyślnie jest ona włączona — kompresuje gzipem,
    szybkim i słabym poziomem, po czym Caddy dostaje odpowiedź JUŻ zakodowaną
    i, całkiem poprawnie, nie rusza jej drugi raz. Skutek: przeglądarka, która
    umie zstd, i tak dostawała gzipa.

    Zmierzone na produkcji, dokument strony głównej:

        surowy                        547 kB
        gzip z Next (stan przed)       94,7 kB
        gzip z Caddy'ego (Safari)      ~66 kB
        zstd z Caddy'ego (Chrome)      52,5 kB     ← o 45 % mniej niż przed

    Dokument HTML jest PIERWSZYM zasobem strony i blokuje wszystko, co po nim:
    parser, wykrycie zdjęcia LCP, hydratację. Czterdzieści kilobajtów mniej
    schodzi więc z drogi krytycznej w całości, a nie proporcjonalnie — i to
    była, po zdjęciu wagi ze zdjęcia tytułowego, największa pozostała pozycja
    w rachunku LCP na telefonie (model Lighthouse: „Load Delay" 1466 ms).

    Bezpieczeństwo tej zmiany: aplikacja nie jest wystawiona wprost — port
    publiczny ma wyłącznie Caddy (`docker-compose.prod.yml`), a on kompresuje
    każdą odpowiedź tekstową i sam ustawia `Vary: Accept-Encoding`.
    Przeglądarki bez zstd dostają gzip, tyle że lepszym poziomem niż dotąd.
    Zero zmian w treści, w API i w nagłówkach bezpieczeństwa.
  */
  compress: false,
  env: {
    /**
     * When this build was produced — inlined at `next build`, so it is the
     * moment the Docker image was made, not the moment a page is served.
     *
     * The sitemap uses it as `<lastmod>` for pages whose content lives in
     * source rather than in the database. Those pages genuinely do change only
     * on deploy, which makes this the one honest date available for them; the
     * previous `new Date()` claimed every page had changed on every fetch.
     * Not a secret, so its presence in the client bundle is harmless.
     */
    BUILD_TIME: new Date().toISOString(),
  },
  images: {
    // Car photos and (later) signed document previews will be served from
    // S3-compatible object storage. Hosts get added here once STORAGE_* is set.
    remotePatterns: [],
    /*
      Next 16 wymaga zadeklarowania każdej wartości `<Image quality>`.

      75 — zdjęcia aut (karty, galeria, porównanie).
      80 — zdjęcie tytułowe, patrz niżej.
      90 — zostaje zadeklarowane, bo `qualities` obowiązuje CAŁY optymalizator,
           a adresy `?q=90` wygenerowane przed 06.09.2026 wciąż krążą w cache
           przeglądarek i w Google. Usunięcie 90 z listy odpowiadałoby na nie
           błędem 400 zamiast obrazem.

      DLACZEGO HERO ZSZEDŁ Z 90 NA 80 (06.09.2026)

      Zdjęcie tytułowe JEST elementem LCP na telefonie, a przy dzieleniu pasma
      po równo między strumienie czas jego pobrania jest wprost proporcjonalny
      do liczby bajtów. Zmierzone na produkcji: 39 kB pobierało się 3159 ms
      przy 750 kB startujących naraz — czyli każdy zaoszczędzony kilobajt to
      realne 80 ms LCP.

      q=80 daje 26,3 kB zamiast 38,6 (−32 %) przy PSNR **40,5 dB** względem
      q=90 i średnim błędzie 2,1/255. Kadry 1:1 z najtrudniejszego miejsca
      zdjęcia — kratownica, diody reflektora, szprychy felgi, zacisk hamulca —
      są nie do odróżnienia. Zdjęcie tytułowe zostaje przy tym NAJWYŻSZEJ
      jakości na stronie: każde zdjęcie auta, które klient ogląda z bliska
      (karta, galeria, porównanie), stoi na q=75 i tam nic się nie zmienia.

      AVIF SPRAWDZONY I ODRZUCONY: dla tego zdjęcia jest WIĘKSZY niż WebP
      (44,5 kB przy q=90 wobec 38,6), a kodowanie kosztuje 2,8 s procesora
      zamiast 95 ms. Zysku nie ma, koszt jest — nie włączamy.
    */
    qualities: [75, 80, 90],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  /**
   * Retired landing-page slugs.
   *
   * The first batch of SEO landing pages shipped on `/wynajem-samochodow-*`
   * (and `/en/warsaw-chopin-airport-car-rental`). Those URLs were live, linked
   * from the footer and submitted in the sitemap, so they cannot simply stop
   * existing: a 308 hands whatever authority they gathered to the new slug and
   * keeps any bookmark or inbound link working.
   *
   * Checked before the filesystem and before `proxy.ts`, so next-intl never
   * sees the old path. Keep these entries permanently — a redirect that has
   * done its job still costs one hop and is the only thing standing between an
   * old link and a 404.
   */
  async redirects() {
    return [
      {
        source: "/wynajem-samochodow-warszawa",
        destination: "/wynajem-aut-warszawa",
        permanent: true,
      },
      {
        source: "/wynajem-samochodow-lotnisko-chopina",
        destination: "/wynajem-aut-lotnisko-chopina",
        permanent: true,
      },
      {
        source: "/en/warsaw-chopin-airport-car-rental",
        destination: "/en/car-rental-warsaw-chopin-airport",
        permanent: true,
      },
      /*
       * Modlin — landing zdjęty 31.08.2026 decyzją właściciela: A&A nie ma
       * tam punktu odbioru, więc strona obiecywała usługę, której nie ma.
       * Adresy były zaindeksowane i linkowane, więc idą 308 na lotnisko,
       * które faktycznie obsługujemy. Bez tego oba zaczęłyby oddawać 404.
       */
      {
        source: "/wynajem-aut-lotnisko-modlin",
        destination: "/wynajem-aut-lotnisko-chopina",
        permanent: true,
      },
      {
        source: "/en/car-rental-warsaw-modlin-airport",
        destination: "/en/car-rental-warsaw-chopin-airport",
        permanent: true,
      },
      // Two cars carried a slug taken from the variant alone — `turbo-4s` and
      // `gle-350-de-4-matic-premium` name a trim level and no manufacturer, so
      // neither URL contained the word anyone searches for. The slug lives in
      // the database; these entries keep the old addresses working.
      {
        source: "/fleet/turbo-4s",
        destination: "/fleet/porsche-panamera-turbo-4s",
        permanent: true,
      },
      {
        source: "/en/fleet/turbo-4s",
        destination: "/en/fleet/porsche-panamera-turbo-4s",
        permanent: true,
      },
      {
        source: "/fleet/gle-350-de-4-matic-premium",
        destination: "/fleet/mercedes-gle-350-de-4matic",
        permanent: true,
      },
      {
        source: "/en/fleet/gle-350-de-4-matic-premium",
        destination: "/en/fleet/mercedes-gle-350-de-4matic",
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
