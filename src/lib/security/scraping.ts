/**
 * Ochrona przed masowym zbieraniem danych — rozdział 13.3.
 *
 * ## Czego ten plik NIE obiecuje
 *
 * Zdjęć i cen widocznych publicznie nie da się zabezpieczyć w 100% i zamówienie
 * mówi o tym wprost. Wszystko, co widzi klient, widzi też skrypt udający
 * klienta. Celem jest podniesienie kosztu MASOWEGO kopiowania — żeby przejście
 * całej floty z każdą datą wymagało cierpliwości, a nie jednej pętli w nocy.
 *
 * ## Dlaczego to nie jest zwykły limit
 *
 * Zwykły limit po adresie uderzyłby w biuro, w sieć komórkową i w hotel — czyli
 * w ludzi. Tutaj próg jest wysoki (cztery żądania na sekundę w minutowym oknie),
 * a poniżej niego działa rozpoznanie po ZACHOWANIU: pusty albo narzędziowy
 * nagłówek przeglądarki plus tempo. Człowiek klikający po flocie ma przeglądarkę
 * i przerwy między kliknięciami; `curl` w pętli nie ma ani jednego, ani drugiego.
 *
 * ## Czego NIE WOLNO zablokować
 *
 * Googlebota, Bingbota i pozostałych wyszukiwarek. Zablokowany crawler to
 * wypadnięcie z wyników wyszukiwania, czyli strata większa niż wszystko, przed
 * czym ten plik broni. Dlatego lista dozwolonych robotów jest sprawdzana
 * PIERWSZA i wychodzi z funkcji, zanim cokolwiek zdąży policzyć.
 *
 * Rozpoznanie po nagłówku jest do podrobienia i to jest ŚWIADOMA cena. Pełna
 * weryfikacja crawlera wymaga odwrotnego DNS-u przy każdym żądaniu — kosztu,
 * który przy tym progu nie zwraca się ani razu. Skutkiem podszycia się pod
 * Googlebota jest wyłącznie ominięcie tego limitu; żadnych danych ani uprawnień
 * to nie otwiera.
 */

/**
 * Roboty wyszukiwarek, których nie dotykamy.
 *
 * Lista jest krótka i konkretna. Dopisywanie do niej wszystkiego, co ma
 * w nazwie „bot", zamieniłoby ją w listę dozwolonych dla dowolnego skryptu —
 * bo „bot" w nagłówku wpisuje sobie każdy.
 */
const DOZWOLONE_ROBOTY = [
  "googlebot",
  "google-inspectiontool",
  "storebot-google",
  "bingbot",
  "duckduckbot",
  "yandexbot",
  "applebot",
  "baiduspider",
  "slurp", // Yahoo
  "seznambot",
  // Podglądy linków — bez nich udostępnienie oferty na WhatsAppie czy
  // Messengerze pokazuje gołe łącze zamiast zdjęcia auta.
  "facebookexternalhit",
  "twitterbot",
  "linkedinbot",
  "whatsapp",
  "telegrambot",
  "slackbot",
  "discordbot",
];

/** Narzędzia wiersza poleceń i biblioteki HTTP. Nie są zakazane — są liczone
 *  ostrzej, bo nie są przeglądarką klienta. */
const NARZEDZIA = [
  "curl/",
  "wget/",
  "python-requests",
  "python-urllib",
  "httpx",
  "aiohttp",
  "go-http-client",
  "java/",
  "okhttp",
  "libwww-perl",
  "scrapy",
  "node-fetch",
  "axios/",
  "http_request2",
  "phpcrawl",
  "headlesschrome",
];

export type OcenaAgenta = {
  /** Wyszukiwarka albo podgląd linku — przepuszczamy bez liczenia. */
  dozwolonyRobot: boolean;
  /** Pusty, bardzo krótki albo narzędziowy nagłówek. */
  podejrzany: boolean;
};

export function ocenAgenta(userAgent: string | null): OcenaAgenta {
  const ua = (userAgent ?? "").toLowerCase();
  if (DOZWOLONE_ROBOTY.some((r) => ua.includes(r))) {
    return { dozwolonyRobot: true, podejrzany: false };
  }
  // Przeglądarka zawsze przedstawia się długim łańcuchem. Dwadzieścia znaków
  // to próg, poniżej którego nie ma żadnej prawdziwej przeglądarki.
  const podejrzany = ua.length < 20 || NARZEDZIA.some((n) => ua.includes(n));
  return { dozwolonyRobot: false, podejrzany };
}

/**
 * Progi — i historia dwóch pomyłek, które warto mieć zapisane.
 *
 * PIERWSZA WERSJA: 240 żądań na minutę dla zwykłego klienta. Wyglądało to na
 * wartość nie do osiągnięcia przez człowieka i było błędem. Next.js pobiera
 * z wyprzedzeniem każdy odnośnik, który wejdzie w pole widzenia; zmierzone
 * 27.08.2026 na stagingu: JEDNO wejście na stronę to około dziesięciu żądań
 * liczonych przez ten limiter, z czego dziewięć to przewidywania frameworka.
 * Test przeglądarkowy dostał 429 po kilku minutach normalnego klikania.
 *
 * DRUGA WERSJA: pobrania wyprzedzające przestały być liczone (patrz `proxy.ts`)
 * i próg podniesiono do 600. Nasze własne przemiatanie stron — sto adresów
 * w dwóch językach na trzech szerokościach — nadal dostawało 429.
 *
 * WNIOSEK, KTÓRY Z TEGO PŁYNIE, jest o samym narzędziu, nie o liczbie.
 * Licznik żądań na adres NIE ODRÓŻNIA szybkiego człowieka od powolnego
 * skryptu, bo obaj mieszczą się w każdym progu, który nie krzywdzi ludzi.
 * Jego jedyna sensowna rola to HAMULEC BEZPIECZEŃSTWA na pętlę, która wali
 * dziesiątki żądań na sekundę — i taki jest ten próg.
 *
 * Prawdziwa obrona przed masowym kopiowaniem leży w dwóch innych miejscach
 * i ten plik tego nie ukrywa:
 *   1. rozpoznanie po nagłówku (`podejrzany`, próg dziesięciokrotnie niższy) —
 *      bo narzędzie zwykle nie udaje przeglądarki,
 *   2. reguły Cloudflare, opisane w `docs/BEZPIECZENSTWO-13-WDROZENIE.md` —
 *      bo tam decyzja zapada PRZED dotarciem żądania do tego serwera.
 */
export const PROGI_SCRAPINGU = {
  oknoMs: 60_000,
  /** Hamulec na pętlę: czterdzieści żądań na sekundę przez pełną minutę. */
  zwykly: 2400,
  /** Nagłówek, który nie jest przeglądarką: jedno żądanie na sekundę. */
  podejrzany: 60,
};
