import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { ocenAgenta, PROGI_SCRAPINGU } from "./lib/security/scraping";
import { clientIpOfRequest as clientIp } from "./lib/security/client-ip";

const handleI18nRouting = createMiddleware(routing);

// Auth.js session cookie names (dev + prod-secure variants).
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

/* ── Login rate limit ─────────────────────────────────────────────────────── */

/**
 * A ceiling on how fast one address may try to log in.
 *
 * The account lockout in `lib/auth/config` already stops a slow guessing
 * attack, but it does nothing about volume: an attacker can hammer the
 * endpoint thousands of times a minute, each one costing an argon2 hash on
 * this server. This caps that.
 *
 * Deliberately generous and deliberately forgetful. Twenty attempts in five
 * minutes is far more than a person who mistyped their password twice, and
 * the counter lives in memory only — it resets on every deploy and restart, so
 * no rate limit can ever become a permanent lockout of the owner. That
 * trade-off is on purpose: this is a brake, not a door.
 */
const LOGIN_WINDOW_MS = 5 * 60_000;
const LOGIN_MAX = 20;
const attempts = new Map<string, number[]>();

function loginRateLimited(request: NextRequest): boolean {
  const ip = clientIp(request);
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter(
    (t) => now - t < LOGIN_WINDOW_MS,
  );
  recent.push(now);
  attempts.set(ip, recent);

  // Cheap sweep so a long-running process cannot accumulate addresses forever.
  if (attempts.size > 5000) {
    for (const [key, times] of attempts) {
      if (times.every((t) => now - t >= LOGIN_WINDOW_MS)) attempts.delete(key);
    }
  }
  return recent.length > LOGIN_MAX;
}

/* ── Ochrona przed masowym zbieraniem danych (13.3) ───────────────────────── */

/**
 * Licznik żądań publicznych, w pamięci procesu.
 *
 * Ten sam kształt i ta sama filozofia co licznik logowania powyżej: hojny,
 * zapominalski, nigdy trwały. Różnica jest jedna — dwa progi zamiast jednego,
 * zależnie od tego, czym przedstawia się druga strona. Wyszukiwarki nie są
 * liczone w ogóle; ich zablokowanie kosztowałoby więcej niż wszystko, przed
 * czym ten licznik broni.
 */
const publiczne = new Map<string, number[]>();

function scrapingLimited(
  request: NextRequest,
): "nie" | "zwykly" | "podejrzany" {
  const agent = ocenAgenta(request.headers.get("user-agent"));
  if (agent.dozwolonyRobot) return "nie";

  /*
    POBRANIA WYPRZEDZAJĄCE SIĘ NIE LICZĄ — i to jest wniosek z pomiaru,
    nie z założenia.

    Next.js pobiera z wyprzedzeniem każdy odnośnik, który wejdzie w pole
    widzenia. Zmierzone 27.08.2026 na tym stagingu: JEDNO wejście na stronę to
    około dziesięciu żądań liczonych przez ten limiter, z czego dziewięć to
    przewidywania frameworka, a nie czynności odwiedzającego. Liczenie ich
    razem sprawia, że każdy próg opisuje coś innego niż to, co miał opisywać —
    pierwsza wersja odrzucała po kilku minutach normalnego klikania, a nasze
    własne przemiatanie stron dostawało 429 na połowie adresów.

    Odróżnia je nagłówek `next-router-prefetch`. Skrypt może go podrobić —
    i to jest świadoma cena: zyskuje wtedy ominięcie TEGO licznika, a nadal
    stoi przed nim rozpoznanie po nagłówku przeglądarki i (po wdrożeniu)
    reguły Cloudflare, które są w tej obronie warstwą właściwą.
  */
  if (request.headers.get("next-router-prefetch") === "1") return "nie";

  const ip = clientIp(request);
  const now = Date.now();
  const recent = (publiczne.get(ip) ?? []).filter(
    (t) => now - t < PROGI_SCRAPINGU.oknoMs,
  );
  recent.push(now);
  publiczne.set(ip, recent);

  if (publiczne.size > 10_000) {
    for (const [key, times] of publiczne) {
      if (times.every((t) => now - t >= PROGI_SCRAPINGU.oknoMs)) {
        publiczne.delete(key);
      }
    }
  }

  const prog = agent.podejrzany
    ? PROGI_SCRAPINGU.podejrzany
    : PROGI_SCRAPINGU.zwykly;
  if (recent.length <= prog) return "nie";
  return agent.podejrzany ? "podejrzany" : "zwykly";
}

/**
 * Zapis do dziennika — dynamicznym importem i tylko przy odrzuceniu.
 *
 * Proxy w Next 16 działa na Node, więc baza jest tu osiągalna. Statyczny import
 * sterownika obciążałby jednak KAŻDE żądanie strony publicznej po to, żeby
 * przydać się raz na tydzień. Import w gałęzi odrzucenia kosztuje wtedy, kiedy
 * naprawdę jest potrzebny.
 */
function zapiszOdrzucenie(
  request: NextRequest,
  rodzaj: "zwykly" | "podejrzany",
) {
  const kind =
    rodzaj === "podejrzany" ? "suspicious_agent" : "scrape_rate_limited";
  void import("./lib/security/events")
    .then(({ recordSecurityEvent }) =>
      recordSecurityEvent({
        kind,
        endpoint: request.nextUrl.pathname.slice(0, 200),
        subject: clientIp(request),
        detail: {
          agent: (request.headers.get("user-agent") ?? "").slice(0, 120),
        },
      }),
    )
    .catch(() => {});
  /*
    Alert dopiero przy zagęszczeniu. Pojedyncze odrzucenie to normalny dzień
    strony w internecie; pięćdziesiąt w dziesięć minut znaczy, że ktoś
    przechodzi flotę po kolei — i to jest wiadomość dla właściciela, a nie
    wpis w dzienniku.
  */
  void import("./lib/security/alerts")
    .then(({ alertGdyGesto, PROGI_ALERTOW }) =>
      alertGdyGesto({
        zdarzenie: kind,
        kind: "scrape_burst",
        oknoMs: PROGI_ALERTOW.scraping.oknoMs,
        prog: PROGI_ALERTOW.scraping.prog,
        tytul: "Wygląda na masowe pobieranie zawartości strony",
        szczegoly:
          "Publiczne strony odrzuciły serię żądań z powodu limitu. Wyszukiwarki " +
          "są z tego limitu wyłączone, więc to nie jest Googlebot. Jeżeli to " +
          "trwa, rozważ regułę po stronie Cloudflare — patrz " +
          "docs/BEZPIECZENSTWO-13-WDROZENIE.md.",
      }),
    )
    .catch(() => {});
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API paths reach this file only because the login endpoint has to be
  // throttled. They must LEAVE it again immediately: passing one to
  // `handleI18nRouting` rewrites it as a localised page and turns every login
  // into a 404 — which is exactly what happened the first time this shipped.
  if (pathname.startsWith("/api/")) {
    if (
      request.method === "POST" &&
      pathname.startsWith("/api/auth/callback/credentials") &&
      loginRateLimited(request)
    ) {
      return new NextResponse(
        "Za dużo prób logowania. Spróbuj ponownie za kilka minut.",
        {
          status: 429,
          headers: { "Retry-After": String(LOGIN_WINDOW_MS / 1000) },
        },
      );
    }
    return NextResponse.next();
  }

  /*
    Limit ruchu publicznego. PO wyjściu tras `api/` i PRZED strażnikiem panelu:
    panel stoi za logowaniem i ma własne limity, a wliczanie go tutaj karałoby
    obsługę za normalną pracę — dziesiątki wejść na minutę to w panelu zwykły
    poniedziałek.
  */
  if (!pathname.startsWith("/admin")) {
    const rodzaj = scrapingLimited(request);
    if (rodzaj !== "nie") {
      zapiszOdrzucenie(request, rodzaj);
      return new NextResponse("Za dużo żądań. Spróbuj ponownie za chwilę.", {
        status: 429,
        headers: {
          "Retry-After": String(PROGI_SCRAPINGU.oknoMs / 1000),
          // Żeby przypadkowe trafienie w limit nie zostało zaindeksowane
          // jako treść strony.
          "X-Robots-Tag": "noindex",
        },
      });
    }
  }

  /*
    POST NA STRONĘ PUBLICZNĄ, KTÓRY NIE JEST AKCJĄ SERWEROWĄ → 405.

    ## Co to naprawia (07.09.2026)

    Skanery podatności wysyłają `POST multipart/form-data` na adres strony,
    szukając czegoś, co przyjmie plik. Next traktuje KAŻDY taki POST jak
    wywołanie akcji serwerowej, nie znajduje żadnego identyfikatora i kończy
    **kodem 500** z komunikatem „Failed to find Server Action". Odtworzone
    kontrolnie: `curl -X POST -F 'pole=x' /` → 500 i dwa wpisy w logu.

    Ten sam komunikat, którym Next opisuje NAPRAWDĘ nieaktualną kartę klienta,
    trafiał więc do monitoringu także wtedy, gdy nikt niczego nie kliknął —
    jako „Błąd renderowania strony". Z dziesięciu wystąpień alertu osiem
    pochodziło z serii czterech takich żądań w ciągu trzech sekund o 04:09.
    Alert o awarii, który w większości opisuje ruch skanera, uczy operatora
    ignorować alerty — i to jest najgorsze, co może zrobić monitoring.

    ## Dlaczego to jest bezpieczne

    Prawdziwa akcja serwerowa ZAWSZE niesie nagłówek `Next-Action` — tak ją
    wysyła klient Reacta. Wyjątkiem jest formularz `<form action={akcja}>`
    wysłany BEZ JavaScriptu; taki POST ma identyfikator w polu `$ACTION_ID_…`
    w treści, której middleware nie czyta. Sprawdzone: na stronach publicznych
    nie ma ani jednego takiego formularza (wszystkie `<form action={…}>` są
    w panelu, a panel jest wyżej wyłączony z tej reguły). Gdyby kiedyś powstał,
    ten warunek trzeba rozszerzyć — i po to jest ten komentarz.

    405 z nagłówkiem `Allow`, nie 404: to jest poprawna odpowiedź na metodę,
    której zasób nie obsługuje, i mówi prawdę zarówno skanerowi, jak i nam.

    PANEL WYŁĄCZONY RAZEM Z PRZEDROSTKIEM JĘZYKA. `startsWith("/admin")` nie
    wystarcza, bo `localePrefix: "as-needed"` daje panelowi także adres
    `/en/admin/…` (sprawdzone: oddaje 200). Warunek bez zdjęcia przedrostka
    odciąłby formularze panelu w wersji angielskiej — a te NAPRAWDĘ bywają
    wysyłane bez JavaScriptu.
  */
  const bezJezyka = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "");
  if (
    request.method === "POST" &&
    !bezJezyka.startsWith("/admin") &&
    !request.headers.has("next-action")
  ) {
    return new NextResponse("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD", "X-Robots-Tag": "noindex" },
    });
  }

  // First-layer admin guard: no session cookie → bounce to login. This is defense
  // in depth only; the AUTHORITATIVE check is `auth()` in the admin layout and in
  // every admin server action (a cookie presence check is not verification).
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    const hasSession = SESSION_COOKIES.some((c) => request.cookies.has(c));
    if (!hasSession) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return handleI18nRouting(request);
}

export const config = {
  matcher: [
    // Everything except API routes, Next internals and static files…
    "/((?!api|_next|_vercel|.*\\..*).*)",
    // …plus the one API path that has to be throttled.
    "/api/auth/callback/:path*",
  ],
};
