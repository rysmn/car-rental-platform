import "server-only";

/**
 * Cloudflare Turnstile — niewidoczna weryfikacja „to człowiek".
 *
 * ## Dlaczego Turnstile, a nie reCAPTCHA
 *
 * Zamówienie wskazuje Turnstile i to jest dobry wybór z trzech powodów:
 * jest DARMOWY bez limitu (zasada „zero nowych kosztów" jest spełniona),
 * w trybie zarządzanym najczęściej nie pokazuje klientowi ŻADNEJ zagadki,
 * i nie przekazuje odwiedzającego do systemu reklamowego. Projekt ma już konto
 * Cloudflare (`CF_ACCOUNT_ID` dla Workers AI), więc nie dochodzi nowy dostawca
 * — dochodzi druga usługa u tego samego.
 *
 * ## Klucze
 *
 * Turnstile ma własną parę kluczy, NIEZALEŻNĄ od tokenu Workers AI, i tworzy
 * się ją w panelu Cloudflare (Turnstile → Add site). Do środowiska trzeba
 * dopisać:
 *
 *     TURNSTILE_SITE_KEY=...     (jawny, ląduje w przeglądarce — tak ma być)
 *     TURNSTILE_SECRET_KEY=...   (tajny, WYŁĄCZNIE serwer)
 *
 * Klucz witryny NIE ma przedrostka `NEXT_PUBLIC_` celowo: czyta go serwer przy
 * renderowaniu strony i podaje komponentowi, więc nie jest wkompilowywany
 * w obraz. Dzięki temu dodanie kluczy wymaga restartu kontenera, a nie
 * przebudowy. Obie zmienne muszą być wypisane w `docker-compose.prod.yml`,
 * inaczej nie dotrą z `.env` do procesu aplikacji.
 *
 * ## Zachowanie bez kluczy: PRZEPUSZCZAMY
 *
 * I to jest decyzja, którą trzeba widzieć, a nie odkryć. Gdyby brak konfiguracji
 * oznaczał odrzucenie, to pierwsze wdrożenie tego kodu na produkcję zamknęłoby
 * formularz rezerwacji i formularz kontaktowy dla WSZYSTKICH klientów, dopóki
 * ktoś nie wklei kluczy — czyli wprowadzenie zabezpieczenia byłoby awarią
 * sprzedaży. Dlatego niezmiennik brzmi: bez kluczy Turnstile nie działa i nie
 * udaje, że działa, a formularzy pilnują wtedy pułapka na roboty, pomiar czasu
 * wypełniania i limity częstotliwości — które są WŁĄCZONE ZAWSZE i nie zależą
 * od żadnej usługi zewnętrznej.
 *
 * Stan konfiguracji jest widoczny w panelu (Ustawienia → Bezpieczeństwo), żeby
 * „myśleliśmy, że mamy captchę" nie trwało miesiącami.
 */

const ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Czy para kluczy jest w środowisku. Czytane przy każdym wywołaniu — zmiana
 *  zmiennej działa po restarcie kontenera, bez przebudowy obrazu. */
export function turnstileSkonfigurowany(): boolean {
  return Boolean(
    process.env.TURNSTILE_SECRET_KEY && process.env.TURNSTILE_SITE_KEY,
  );
}

/** Klucz witryny do przekazania komponentowi. `null` = widget się nie rysuje. */
export function turnstileSiteKey(): string | null {
  return turnstileSkonfigurowany()
    ? (process.env.TURNSTILE_SITE_KEY as string)
    : null;
}

export type WynikTurnstile =
  | { ok: true; powod: "zweryfikowany" | "wylaczony" }
  | { ok: false; powod: "brak_tokenu" | "odrzucony" | "niedostepny" };

/**
 * Sprawdź token po stronie SERWERA.
 *
 * Token z przeglądarki sam w sobie nie jest niczym — dopiero ta wymiana
 * u Cloudflare mówi, czy jest prawdziwy, czy nie został już zużyty i czy
 * pochodzi z tej witryny. Weryfikacja po stronie klienta nie jest
 * zabezpieczeniem i nigdy nią nie była.
 */
export async function verifyTurnstile(
  token: unknown,
  ip?: string | null,
): Promise<WynikTurnstile> {
  if (!turnstileSkonfigurowany()) return { ok: true, powod: "wylaczony" };
  if (typeof token !== "string" || token.length === 0 || token.length > 4096) {
    return { ok: false, powod: "brak_tokenu" };
  }

  const dane = new URLSearchParams();
  dane.set("secret", process.env.TURNSTILE_SECRET_KEY as string);
  dane.set("response", token);
  if (ip) dane.set("remoteip", ip);

  try {
    /*
      Krótki limit czasu i to nie jest ozdoba: gdyby Cloudflare przestało
      odpowiadać, formularz rezerwacji czekałby domyślne trzydzieści sekund
      na każdym wysłaniu. Pięć sekund wystarcza z zapasem — a przy braku
      odpowiedzi decyzję podejmuje wołający, nie ten moduł.
    */
    const odpowiedz = await fetch(ENDPOINT, {
      method: "POST",
      body: dane,
      signal: AbortSignal.timeout(5000),
    });
    if (!odpowiedz.ok) return { ok: false, powod: "niedostepny" };
    const wynik = (await odpowiedz.json()) as { success?: boolean };
    return wynik.success
      ? { ok: true, powod: "zweryfikowany" }
      : { ok: false, powod: "odrzucony" };
  } catch {
    return { ok: false, powod: "niedostepny" };
  }
}
