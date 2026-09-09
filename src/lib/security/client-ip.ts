/**
 * Czyj to adres — jedno pytanie, jedna odpowiedź, cztery liczniki.
 *
 * ## Usterka, którą ten plik zamyka (audyt 02.09.2026)
 *
 * Cztery miejsca liczyły limity na adresie klienta i wszystkie cztery czytały
 * go tak samo źle:
 *
 *     x-forwarded-for.split(",")[0]
 *
 * `X-Forwarded-For` jest nagłówkiem DOPISYWANYM po drodze i pierwszy element
 * pochodzi od tego, kto stoi najdalej — czyli od klienta. Caddy nie zastępuje
 * tego, co przyszło; **dokleja** na koniec adres, który sam widzi. Kto więc
 * wysyłał własne `X-Forwarded-For: 1.2.3.4`, dostawał świeży licznik przy
 * KAŻDYM żądaniu, a wraz z nim:
 *
 *   · limit logowania (20 prób / 5 min) — czyli ochronę przed łamaniem hasła,
 *   · limit czatu (12/min, 120/godz.),
 *   · limit scrapingu (2400/min, 60/min dla narzędzi),
 *   · limit formularzy.
 *
 * Wszystkie cztery były do obejścia jedną linijką w `curl`.
 *
 * ## Skąd teraz bierze się adres
 *
 * 1. **`X-Real-IP`** — ustawiany przez nasz Caddy operacją `header_up`, która
 *    ZASTĘPUJE wartość przysłaną przez klienta, a nie ją uzupełnia (patrz
 *    `Caddyfile`). Cokolwiek klient wpisze w ten nagłówek, ginie na brzegu.
 *    Caddy stoi tu bezpośrednio na łączu — nie ma przed nim CDN-a ani innego
 *    proxy (sprawdzone 02.09.2026: brak `cf-ray`, DNS wskazuje wprost na
 *    serwer) — więc adres, który widzi, jest adresem klienta.
 *
 * 2. **Ostatni** element `X-Forwarded-For` — dla środowisk bez naszego Caddy
 *    (kontener testowy, `next dev`). Ostatni, nie pierwszy: to jedyny element,
 *    który dopisał proxy najbliższe nam. Klient może dopisać dowolnie dużo
 *    elementów PRZED nim i żaden z nich nie zostanie użyty.
 *
 * 3. `"unknown"` — jeden wspólny kubełek dla żądań bez adresu. Nie jest to
 *    dziura: bez proxy i bez nagłówka rozmawiamy z kimś, kto i tak trafia do
 *    tego samego licznika co wszyscy inni tacy.
 *
 * ## Dlaczego to nie jest `server-only`
 *
 * Czyta je także `proxy.ts`, czyli middleware Next działający w środowisku
 * brzegowym. Plik jest więc czystą funkcją nad nagłówkami — bez bazy, bez
 * `node:`, bez zależności.
 */

/** Minimalny kształt, jakiego potrzebujemy — pasuje i do `Headers`, i do `NextRequest.headers`. */
type HeaderReader = { get(name: string): string | null };

/**
 * Adres klienta do liczników bezpieczeństwa.
 *
 * Zwraca zawsze łańcuch — nigdy `null` — bo każdy licznik musi mieć klucz.
 */
export function clientIp(headers: HeaderReader): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;

  /*
    OSTATNI element, i to jest cała różnica między tym plikiem a kodem, który
    zastąpił. `1.2.3.4, 5.6.7.8, 203.0.113.10` — pierwsze dwa wpisał ten, kto
    pytał; ostatni dopisało proxy, które go widziało.
  */
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }

  return "unknown";
}

/**
 * Ten sam odczyt dla żądania, a nie dla samych nagłówków — dla wywołań, które
 * trzymają `Request`/`NextRequest` i nie mają powodu rozbierać go same.
 */
export function clientIpOfRequest(request: { headers: HeaderReader }): string {
  return clientIp(request.headers);
}
