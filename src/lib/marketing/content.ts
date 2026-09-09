/**
 * Marketing copy for the home page and the FAQ page.
 *
 * Lives here rather than in messages/*.json because these are long, ordered,
 * structured lists (20 FAQ entries, a 5-column price matrix). next-intl handles
 * flat strings well but arrays-of-objects poorly, so we follow the same
 * locale-keyed module pattern already used by `@/lib/legal/content`.
 *
 * MONEY IS INTEGER GROSZE so every amount renders through `formatPln`, exactly
 * like DB-sourced prices. The per-model daily rates below mirror the values
 * seeded in `@/lib/fleet/data` — when the operator edits a price in the admin
 * panel, the *tier table* here does NOT follow automatically. Keep them in sync
 * or the table will disagree with the booking calculator.
 */

import type { TierPricing } from "@/lib/booking/pricing";

export type Locale = string;
type Pair = { pl: string; en: string };

/**
 * Hours are NOT written into the copy below.
 *
 * They live in the admin settings and are worded in `lib/company/service-hours`
 * — the office 08:00–23:00, the phone 07:00–24:00, e-mail after midnight, and
 * handovers at any hour by arrangement. Anything on this page that states a
 * time takes it as an argument (see `getWhyChoose` / `getPromise`), and the
 * rest of the copy describes the rule instead of repeating the digits. Four
 * places used to carry their own numbers and three of them were already wrong.
 */
export type ServiceHoursText = {
  office: string;
  phone: string;
};

const pick = (p: Pair, locale: Locale) => (locale === "en" ? p.en : p.pl);

/* ------------------------------------------------------------------ *
 * 1. Why A&A — the ten differentiators
 * ------------------------------------------------------------------ */

const WHY: Pair[] = [
  {
    pl: "Odbiór i zwrot 24/7 po uzgodnieniu",
    en: "24/7 pickup and return by arrangement",
  },
  { pl: "100% ubezpieczona flota", en: "100% insured fleet" },
  { pl: "Dostawa na Lotnisko Chopina", en: "Chopin Airport delivery" },
  { pl: "Obsługa PL / EN", en: "Service in Polish & English" },
  { pl: "Dostawa door-to-door", en: "Door-to-door delivery" },
  { pl: "VIP Concierge", en: "VIP concierge" },
  { pl: "Szybka odpowiedź na zapytanie", en: "Fast response to every enquiry" },
  { pl: "Nowoczesna flota premium", en: "A modern premium fleet" },
  { pl: "Transparentne ceny", en: "Transparent pricing" },
  { pl: "Wsparcie przez cały wynajem", en: "Support throughout your rental" },
];

export const getWhyUs = (locale: Locale) => WHY.map((w) => pick(w, locale));

/* ------------------------------------------------------------------ *
 * 2. Rental process — eight steps
 *
 * Eight, not seven: the grid on the home page lays these out two- and
 * four-across, so a seventh step would leave a visibly empty cell. Keep the
 * count divisible by four when editing this list.
 *
 * TE OSIEM TYTUŁÓW MUSI ZGADZAĆ SIĘ Z `HowItWorks.steps.s1..s8Title`
 * w `messages/pl.json` i `en.json`. To jest jeden proces opisany w dwóch
 * miejscach — strona główna pokazuje same tytuły, `/how-it-works` te same
 * tytuły z opisami — a asystent odpowiada z FAQ, które mówi to samo.
 *
 * DLACZEGO TA LISTA ZOSTAŁA PRZEPISANA 31.08.2026
 *
 * Stara ósemka opisywała proces, którego system nie ma. „Wyślij zapytanie" →
 * „Otrzymaj ofertę i potwierdzenie" → „Potwierdź rezerwację online" stawiało
 * potwierdzenie klienta PO potwierdzeniu obsługi, a jest dokładnie odwrotnie:
 * zgłoszenie wpada jako `pending_verification`, klient klika link z maila
 * (`lib/booking/verification`), dopiero wtedy robi się `pending` i dopiero
 * wtedy obsługa potwierdza dostępność. Brakowało też kroku z dokumentami,
 * które od 30.08.2026 idą do klienta załącznikiem zaraz po potwierdzeniu
 * (`lib/documents/wysylka`). „Ciesz się podróżą" nie jest krokiem procesu.
 *
 * Zniknął krok „Otrzymaj zwrot kaucji" — nie dlatego, że kaucja nie wraca,
 * tylko dlatego, że jej zwolnienie jest częścią zwrotu (§7 i §14 regulaminu)
 * i jako osobny kafelek obiecywało zwrot bezwarunkowy. Warunek stoi w opisie
 * kroku 8 na `/how-it-works`, gdzie jest miejsce, żeby go wypowiedzieć.
 * ------------------------------------------------------------------ */

const PROCESS: Pair[] = [
  { pl: "Wybierz samochód", en: "Choose a car" },
  { pl: "Wybierz termin i miejsce", en: "Choose dates and a place" },
  { pl: "Poznaj pełną cenę", en: "See the full price" },
  { pl: "Podaj dane", en: "Enter your details" },
  { pl: "Potwierdź rezerwację", en: "Confirm the reservation" },
  { pl: "Otrzymaj dokumenty", en: "Receive your documents" },
  { pl: "Odbierz samochód", en: "Collect the car" },
  { pl: "Zwróć samochód", en: "Return the car" },
];

export const getProcess = (locale: Locale) =>
  PROCESS.map((s, i) => ({ n: i + 1, title: pick(s, locale) }));

/* ------------------------------------------------------------------ *
 * 3. Airport delivery
 * ------------------------------------------------------------------ */

const AIRPORT: { title: Pair; points: Pair[] } = {
  title: { pl: "Dostawa na lotnisko", en: "Airport delivery" },
  points: [
    {
      pl: "Odbiór i zwrot pojazdu na lotnisku",
      en: "Vehicle pickup and return at the airport",
    },
    { pl: "Monitorowanie lotu", en: "We track your flight" },
    {
      pl: "Podstawienie auta przy opóźnieniu",
      en: "Car delivered even if you land late",
    },
    {
      pl: "Szybki kontakt z opiekunem",
      en: "Direct line to your account manager",
    },
  ],
};

export const getAirport = (locale: Locale) => ({
  title: pick(AIRPORT.title, locale),
  points: AIRPORT.points.map((p) => pick(p, locale)),
});

/* ------------------------------------------------------------------ *
 * 4. Why customers choose us (replaces a "Partners" strip until we have logos)
 * ------------------------------------------------------------------ */

const CHOOSE: { title: Pair; desc: Pair }[] = [
  {
    title: { pl: "Transparentne zasady", en: "Transparent terms" },
    desc: {
      pl: "Cena, kaucja i limit kilometrów znane przed rezerwacją. Bez gwiazdek.",
      en: "Price, deposit and mileage limit known before you book. No small print.",
    },
  },
  {
    title: { pl: "Premium Service", en: "Premium service" },
    desc: {
      pl: "Auto przygotowane, czyste i zatankowane na każde wydanie.",
      en: "Every car prepared, cleaned and fuelled before handover.",
    },
  },
  {
    // `{phone}` and `{office}` are filled from the admin settings — see the
    // note at the top of this file. Never hardcode an hour here again.
    title: { pl: "Kontakt {phone}", en: "Phone {phone}" },
    desc: {
      pl: "Telefon odbieramy codziennie w godzinach {phone}, przez cały wynajem. Biuro i obsługa rezerwacji pracują {office}, a odbiór i zwrot auta ustalimy o dowolnej porze.",
      en: "We answer the phone every day between {phone}, for the whole rental. The office and reservations desk work {office}, and a car can be collected or returned at any hour by arrangement.",
    },
  },
  {
    title: { pl: "Dostawa na lotnisko", en: "Airport delivery" },
    desc: {
      pl: "Lotnisko Chopina — z monitorowaniem lotu.",
      en: "Chopin Airport — with flight tracking.",
    },
  },
];

const fill = (value: string, hours: ServiceHoursText) =>
  value.replace(/\{phone\}/g, hours.phone).replace(/\{office\}/g, hours.office);

export const getWhyChoose = (locale: Locale, hours: ServiceHoursText) =>
  CHOOSE.map((c) => ({
    title: fill(pick(c.title, locale), hours),
    desc: fill(pick(c.desc, locale), hours),
  }));

/* ------------------------------------------------------------------ *
 * 5. Our promise
 * ------------------------------------------------------------------ */

const PROMISE: Pair[] = [
  { pl: "Czysty samochód", en: "A clean car" },
  { pl: "Pełny bak", en: "A full tank" },
  { pl: "Punktualne podstawienie", en: "On-time delivery" },
  { pl: "Pełne ubezpieczenie", en: "Full insurance" },
  { pl: "Wsparcie telefoniczne {phone}", en: "Phone support {phone}" },
  { pl: "Sprawdzony stan techniczny", en: "Verified mechanical condition" },
  { pl: "Brak ukrytych kosztów", en: "No hidden costs" },
  { pl: "Profesjonalna obsługa", en: "Professional service" },
];

export const getPromise = (locale: Locale, hours: ServiceHoursText) =>
  PROMISE.map((p) => fill(pick(p, locale), hours));

/* ------------------------------------------------------------------ *
 * 6. Pricing — daily rate by rental length, plus the monthly rate
 * ------------------------------------------------------------------ */

export const PRICE_TIERS: Pair[] = [
  { pl: "1–2 dni", en: "1–2 days" },
  { pl: "3–6 dni", en: "3–6 days" },
  { pl: "7–13 dni", en: "7–13 days" },
  { pl: "14–29 dni", en: "14–29 days" },
  { pl: "30+ dni", en: "30+ days" },
];

/**
 * One row of the published price table. Built from live fleet data (see the
 * home page) rather than hardcoded here — the table and the booking calculator
 * read the same numbers, so they cannot disagree.
 */
export type PriceRow = {
  slug: string;
  name: string;
  /** Daily rate (grosze) for tiers 1–4, in the same order as PRICE_TIERS. */
  daily: number[];
  /** Monthly rate (grosze) — the "30+" column. */
  monthly: number;
  deposit: number;
};

export const getPriceTiers = (locale: Locale) =>
  PRICE_TIERS.map((t) => pick(t, locale));

/**
 * The five published rates for one model, in the same order as PRICE_TIERS:
 * four daily tiers, then the monthly rate for the 30+ column.
 *
 * Unset tier fields fall back to the base daily rate — the same fallback the
 * booking calculator applies — so the home-page matrix and the per-car table
 * on the model page can never quote a different number than the quote engine.
 */
export function tierRatesGrosze(p: TierPricing): number[] {
  return [
    p.dailyPriceGrosze,
    p.dailyPrice3to6Grosze ?? p.dailyPriceGrosze,
    p.dailyPrice7to13Grosze ?? p.dailyPriceGrosze,
    p.dailyPrice14to29Grosze ?? p.dailyPriceGrosze,
    p.monthlyPriceGrosze,
  ];
}

/* ------------------------------------------------------------------ *
 * 7. Mileage limits
 * ------------------------------------------------------------------ */

const KM_LIMITS: Pair[] = [
  { pl: "1–6 dni — 300 km/dzień", en: "1–6 days — 300 km/day" },
  { pl: "7–29 dni — 250 km/dzień", en: "7–29 days — 250 km/day" },
  { pl: "30+ dni — 3 000 km/miesiąc", en: "30+ days — 3,000 km/month" },
  {
    pl: "Dopłata za nadprzebieg zależna od modelu pojazdu",
    en: "Excess-mileage charge depends on the vehicle model",
  },
];

export const getKmLimits = (locale: Locale) =>
  KM_LIMITS.map((k) => pick(k, locale));

/* ------------------------------------------------------------------ *
 * 8. Add-on services
 * ------------------------------------------------------------------ */

/*
 * Cennik dodatków STĄD ZNIKNĄŁ — 26.08.2026.
 *
 * Stała tu druga lista cen: dostawa 99, Chopin 149, Modlin 199, kierowca 50,
 * fotelik 30, zwrot poza godzinami 150. Formularz rezerwacji liczył w tym
 * czasie z tabel `fees` i `pickup_locations` zupełnie inne kwoty, a Modlin
 * nigdy nie był punktem odbioru w systemie. Klient czytał jedno, płacił drugie.
 *
 * Jedynym cennikiem dodatków jest teraz `publicExtras` w `lib/booking/fees`,
 * układany z tych samych tabel, z których liczy silnik cen. Nie przywracaj tu
 * listy — każda kolejna kopia zaczyna się rozjeżdżać od pierwszej edycji
 * w panelu.
 */

/* ------------------------------------------------------------------ *
 * 9. B2B tiers
 * ------------------------------------------------------------------ */

const B2B: { name: string; desc: Pair }[] = [
  {
    name: "Business",
    desc: {
      pl: "Dla małych firm — stała stawka i uproszczone rozliczenie fakturą VAT.",
      en: "For small companies — a fixed rate and simplified VAT invoicing.",
    },
  },
  {
    name: "Executive",
    desc: {
      pl: "Dla kadry zarządzającej — auta klasy premium i priorytetowa dostępność.",
      en: "For management — premium-class cars and priority availability.",
    },
  },
  {
    name: "Corporate",
    desc: {
      pl: "Flota na dłuższy okres, indywidualne warunki i dedykowany opiekun.",
      en: "Long-term fleet, individual terms and a dedicated account manager.",
    },
  },
];

export const getB2b = (locale: Locale) =>
  B2B.map((b) => ({ name: b.name, desc: pick(b.desc, locale) }));

/* ------------------------------------------------------------------ *
 * 10. FAQ — the public list, and the assistant's knowledge base (`lib/chat/faq`)
 * ------------------------------------------------------------------ */

export type FaqItem = { q: string; a: string };

const FAQ: { q: Pair; a: Pair }[] = [
  {
    q: {
      pl: "Czy mogę wyjechać za granicę?",
      en: "Can I take the car abroad?",
    },
    a: {
      // Reworded 2026-08-20 on the owner's decision. The old wording opened
      // with "Tak", which a customer reads as permission already granted —
      // and the rule is the opposite: forbidden until A&A says otherwise, for
      // every destination without exception. See docs/ZASADY-BIZNESOWE.md.
      pl: "Pojazd przeznaczony jest do użytkowania na terytorium Polski. Wyjazd za granicę wymaga uprzedniej, wyraźnej pisemnej zgody A&A Corporation oraz spełnienia warunków wskazanych przez A&A dla konkretnego pojazdu i najmu, w tym wynikających z zakresu ubezpieczenia i Assistance. Zgodę uzyskasz, kontaktując się z nami przed wynajmem — wyjazd zostaje wtedy wpisany do umowy najmu albo do aneksu podpisanego przed przekroczeniem granicy. Zgoda ustna, sama rozmowa telefoniczna ani brak odpowiedzi z naszej strony nie oznaczają zgody.",
      en: "The vehicle is intended for use within Poland. Travel abroad requires A&A Corporation's prior express written consent and compliance with the conditions A&A sets for the specific vehicle and rental, including those arising from the scope of insurance and Assistance. Contact us before the rental to obtain it — the trip is then recorded in the rental agreement or in an annex signed before the border is crossed. Oral consent, a phone call on its own, or no reply from us does not mean consent has been given.",
    },
  },
  {
    q: { pl: "Czy jest limit kilometrów?", en: "Is there a mileage limit?" },
    a: {
      pl: "Tak, zgodnie z cennikiem — 300 km/dzień przy wynajmie do 6 dni, 250 km/dzień od 7 dni i 3 000 km/miesiąc przy wynajmie miesięcznym.",
      en: "Yes, as per the price list — 300 km/day up to 6 days, 250 km/day from 7 days, and 3,000 km/month on monthly rentals.",
    },
  },
  /*
    NADPRZEBIEG BEZ TABELI DZIESIĘCIU STAWEK — i to jest decyzja, nie
    przeoczenie.

    Wpisanie tu „Panamera 5,00 · BMW 4,50 · …" zrobiłoby z FAQ jedenaste
    miejsce, w którym stoi cena auta — obok karty auta, floty, porównywarki,
    rezerwacji, podsumowania, moich rezerwacji, asystenta, panelu, rozliczenia
    zwrotu i samej bazy. Dziesięć z nich czyta jedną kolumnę i nie ma jak się
    rozjechać; jedenaste byłoby tekstem, który po pierwszej zmianie w panelu
    zaczyna kłamać w ciszy.

    Odpowiedź kieruje więc tam, gdzie liczba naprawdę jest — i wymienia
    wszystkie trzy miejsca, w których klient ją zobaczy.
  */
  {
    q: {
      pl: "Co się stanie, jeśli przekroczę limit kilometrów?",
      en: "What happens if I exceed the mileage limit?",
    },
    a: {
      pl: "Za każdy kilometr ponad limit naliczana jest opłata właściwa dla wybranego samochodu — stawki różnią się między modelami. Dokładną kwotę w złotych za kilometr znajdziesz na karcie danego auta, w podsumowaniu rezerwacji przed jej wysłaniem oraz w umowie najmu. Rozliczenie następuje po zwrocie, na podstawie różnicy wskazań licznika, i obowiązuje stawka z Twojej rezerwacji — późniejsza zmiana cennika nie dotyczy zawartej już umowy.",
      en: "Every kilometre above the limit is charged at the rate that applies to the car you picked — the rates differ between models. You will find the exact amount per kilometre on the car's own page, in the booking summary before you send it, and in the rental agreement. It is settled after the return, from the difference in odometer readings, at the rate recorded on your reservation — a later price change does not affect an agreement already made.",
    },
  },
  {
    q: { pl: "Czy auto jest ubezpieczone?", en: "Is the car insured?" },
    a: {
      pl: "Tak. Każdy pojazd we flocie posiada pełne ubezpieczenie OC i AC.",
      en: "Yes. Every vehicle in the fleet carries full third-party and comprehensive insurance.",
    },
  },
  {
    q: { pl: "Jak wygląda odbiór auta?", en: "How does pickup work?" },
    a: {
      pl: "Dostarczamy auto pod wybrane przez Ciebie miejsce — adres w Warszawie, lotnisko lub nasze biuro.",
      en: "We deliver the car to the place you choose — an address in Warsaw, the airport, or our office.",
    },
  },
  {
    q: { pl: "Jak wygląda zwrot auta?", en: "How does the return work?" },
    a: {
      pl: "W uzgodnionym miejscu i czasie. Możesz zwrócić auto tam, gdzie je odebrałeś, lub pod innym ustalonym adresem.",
      en: "At the agreed place and time. You can return the car where you collected it, or at another agreed address.",
    },
  },
  /*
    TRZY WPISY O PRZEBIEGU REZERWACJI — dodane 31.08.2026 razem z ósemką
    kroków na `/how-it-works`.

    Nie są ozdobą FAQ. Ta sama lista jest źródłem dla strony I dla asystenta
    (`getMergedFaq` → `base`, patrz `lib/chat/faq.ts`), a asystent nie miał
    czym odpowiedzieć na „jak zarezerwować", „co dalej po rezerwacji" ani
    „kiedy dostanę dokumenty" — więc na trzy pytania wprost o proces mówił, że
    nie wie, podczas gdy strona odpowiadała na nie w ośmiu krokach. To nie była
    sprzeczność w treści, tylko dziura po jednej stronie; te trzy wpisy ją
    zamykają, nie ruszając ani intencji, ani architektury asystenta.

    Odpowiedzi celowo BEZ LICZB: kwoty ma cennik (`lib/booking/fees`), a liczbę
    dokumentów ustawia panel (`documents.auto_send`). Wpisanie ich tutaj
    zrobiłoby z FAQ drugie źródło prawdy — dokładnie ten błąd, który ten plik
    już raz naprawiał (patrz komentarz przy dodatkach).
  */
  {
    /*
      PYTANIE ZŁOŻONE, I TO CELOWO.

      Klient pyta o ten sam proces na dwa sposoby — „jak zarezerwować auto"
      i „jak wygląda wynajem" — a dopasowywacz asystenta liczy pokrycie słów
      z pytania, nie znaczenie. Sam „zarezerwować" nie zawiera słowa
      „wynajem", więc „Jak wygląda wynajem?" trafiało w „Czy mogę PRZEDŁUŻYĆ
      wynajem?" i klient dostawał odpowiedź o przedłużeniu zamiast o procesie.
      Oba sformułowania w jednym pytaniu rozwiązują to bez dopisywania
      aliasów, które są mocniejszą i bardziej ryzykowną deklaracją.
    */
    q: {
      pl: "Jak wygląda wynajem i jak zarezerwować samochód?",
      en: "How does renting work and how do I book a car?",
    },
    a: {
      pl: "Wybierasz auto z floty, wskazujesz daty, godziny i miejsce odbioru, a kalkulator pokazuje pełną cenę wraz z kaucją. Potem podajesz dane kierowcy i wysyłasz zgłoszenie — bez płatności online. Odbiór planujemy z co najmniej trzygodzinnym wyprzedzeniem. Cały proces opisuje strona „Jak to działa”.",
      en: "You pick a car from the fleet, set the dates, times and pick-up point, and the calculator shows the full price including the deposit. You then enter the driver details and send the request — no online payment. Collection is scheduled at least three hours ahead. The “How it works” page walks through the whole process.",
    },
  },
  {
    q: {
      pl: "Co dzieje się po wysłaniu rezerwacji?",
      en: "What happens after I send a reservation?",
    },
    a: {
      pl: "Najpierw wysyłamy na Twój adres e-mail link potwierdzający — dopóki go nie klikniesz, zgłoszenie czeka. Po wysłaniu rezerwacji potwierdzimy dostępność auta i warunki najmu. Zgłoszenie złożone w serwisie jest zapytaniem o dostępność, a nie zawarciem umowy najmu — umowę podpisujemy przy wydaniu auta (§4 regulaminu).",
      en: "First we e-mail you a confirmation link — until you click it, the request stays on hold. After you submit your reservation, we will confirm availability and the rental terms. A request placed on the site is an availability enquiry, not a concluded rental agreement — the agreement is signed when the car is handed over (§4 of the Terms).",
    },
  },
  {
    q: {
    /*
      BEZ DOPOWIEDZENIA „do wynajmu" — i to nie jest kosmetyka.

      Dopasowywacz asystenta traktuje słowo powtórzone W PYTANIU I W ODPOWIEDZI
      jako temat wpisu (`intrusion` w `lib/chat/faq`): skoro wpis mówi o nim
      dwa razy, a klient ani razu, to prawdopodobnie nie o to pytał. Wersja
      „Kiedy dostanę dokumenty do wynajmu?" powtarzała „wynajmu" po obu
      stronach, więc na zadane wprost „Kiedy dostanę dokumenty?" asystent
      ODMAWIAŁ odpowiedzi — mimo idealnego pokrycia słów. Kwalifikator zostaje
      w odpowiedzi, gdzie niczego nie blokuje.
    */
      pl: "Kiedy dostanę dokumenty?",
      en: "When do I get the documents?",
    },
    a: {
      pl: "Po potwierdzeniu rezerwacji wysyłamy wymagane dokumenty dotyczące wynajmu na podany adres e-mail, w załączniku — dzięki temu masz je na każdym urządzeniu, także później. Zgodnie z §4 regulaminu udostępniamy je przed zawarciem umowy najmu, żebyś mógł się z nimi zapoznać.",
      en: "Once the reservation is confirmed we e-mail the required rental documents to the address you gave, as attachments — so you have them on any device, and later on too. Under §4 of the Terms we make them available before the rental agreement is concluded, so you can read them first.",
    },
  },
  /*
    DWA WPISY BEZ ANI JEDNEJ LICZBY — i to jest cała decyzja projektowa.

    „Czy cena jest ostateczna?" i „Gdzie znajdę swoją rezerwację?" opisują
    MECHANIZM, nie kwoty i nie terminy. Wszystko, co ma liczbę — stawki,
    kaucja, opłaty za nadprzebieg i zwrot poza godzinami, okno rezerwacji,
    godziny biura — jest budowane w `faq-live.ts` z bazy i z ustawień, więc
    wpisanie tu choćby jednej cyfry zrobiłoby drugie źródło prawdy. Ten plik
    naprawiał już raz dokładnie ten błąd (patrz komentarz przy dodatkach).
  */
  {
    q: {
      pl: "Czy cena jest ostateczna?",
      en: "Is the price final?",
    },
    a: {
      pl: "Kalkulator pokazuje pełną kwotę za wybrany termin, razem z zaznaczonymi dodatkami, miejscem odbioru i kaucją — widzisz ją, zanim wyślesz zgłoszenie, i nic nie doliczamy po cichu. Stawka jest tą obowiązującą w chwili potwierdzenia rezerwacji (§7 regulaminu). Po wynajmie mogą dojść wyłącznie pozycje wynikające z umowy i Tabeli Opłat Dodatkowych — na przykład przekroczenie limitu kilometrów albo zwrot poza standardowymi godzinami — i każdą z nich wykazujemy z podstawą naliczenia.",
      en: "The calculator shows the full amount for your dates, including the extras you tick, the pick-up point and the deposit — you see it before you send the request, and nothing is added quietly. The rate is the one in force when the reservation is confirmed (§7 of the Terms). After the rental, only items arising from the agreement and the Table of Additional Fees can be added — exceeding the mileage limit, or an out-of-hours return, for example — and each one is itemised with the basis for the charge.",
    },
  },
  {
    q: {
      pl: "Gdzie znajdę swoją rezerwację?",
      en: "Where do I find my reservation?",
    },
    a: {
      pl: "Na stronie „Moje rezerwacje”. Nie prowadzimy kont użytkowników — lista jest zapamiętana w tej przeglądarce, w której rezerwowałeś, więc na innym urządzeniu jej nie zobaczysz. Numer rezerwacji (zaczyna się od „AA-”) dostajesz też w wiadomości e-mail z potwierdzeniem; warto go zachować. Jeżeli rezerwowałeś na innym urządzeniu albo wyczyściłeś dane strony, skontaktuj się z nami i podaj ten numer.",
      en: "On the “My reservations” page. We do not run customer accounts — the list is remembered in the browser you booked from, so it will not appear on another device. Your reservation reference (it starts with “AA-”) also comes in the confirmation e-mail; it is worth keeping. If you booked on another device or cleared the site data, contact us and quote that reference.",
    },
  },
  {
    q: {
      pl: "Czy wymagacie karty kredytowej?",
      en: "Do you require a credit card?",
    },
    a: {
      pl: "Nie zawsze — zależy od wybranej oferty i modelu pojazdu. Warunki potwierdzamy przy rezerwacji.",
      en: "Not always — it depends on the selected offer and vehicle. We confirm the terms when you book.",
    },
  },
  {
    q: { pl: "Czy wystawiacie faktury VAT?", en: "Do you issue VAT invoices?" },
    a: {
      pl: "Tak, do każdego wynajmu wystawiamy fakturę VAT.",
      en: "Yes, we issue a VAT invoice for every rental.",
    },
  },
  {
    q: { pl: "Czy mogę przedłużyć wynajem?", en: "Can I extend my rental?" },
    a: {
      pl: "Tak, jeśli auto jest w tym terminie dostępne. Skontaktuj się z nami możliwie wcześnie.",
      en: "Yes, provided the car is available for the extended dates. Please contact us as early as you can.",
    },
  },
  {
    q: {
      pl: "Czy mogę anulować rezerwację?",
      en: "Can I cancel a reservation?",
    },
    a: {
      pl: "Tak, zgodnie z regulaminem wynajmu.",
      en: "Yes, in accordance with the rental terms.",
    },
  },
  {
    q: {
      pl: "Czy samochody są przygotowane przed wydaniem?",
      en: "Are the cars prepared before handover?",
    },
    a: {
      pl: "Tak — każde auto wydajemy czyste i zatankowane.",
      en: "Yes — every car is handed over clean and fuelled.",
    },
  },
  {
    q: {
      pl: "Czy oferujecie współpracę B2B?",
      en: "Do you offer B2B cooperation?",
    },
    a: {
      pl: "Tak, w pakietach Business, Executive i Corporate — z indywidualnymi warunkami.",
      en: "Yes, in our Business, Executive and Corporate packages — on individual terms.",
    },
  },
  {
    q: {
      pl: "Jak szybko odpowiadacie na zapytania?",
      en: "How fast do you respond?",
    },
    a: {
      pl: "Najczęściej w ciągu kilkunastu minut w godzinach kontaktu telefonicznego. Po północy odpowiadamy e-mailem.",
      en: "Usually within a few minutes during our phone hours. After midnight we reply by e-mail.",
    },
  },
  {
    q: {
      pl: "Czy można zapłacić przelewem?",
      en: "Can I pay by bank transfer?",
    },
    a: {
      pl: "Tak, akceptujemy płatność przelewem.",
      en: "Yes, we accept payment by bank transfer.",
    },
  },
  {
    q: { pl: "Czy samochody mają GPS?", en: "Do the cars have GPS?" },
    a: {
      pl: "Tak, wszystkie pojazdy są wyposażone w GPS.",
      en: "Yes, all vehicles are equipped with GPS.",
    },
  },
  /*
    AWARIA — odpowiedź pisana pod dokumenty, nie pod marketing.

    Dwa razy była za mocna. Najpierw brzmiała „Pomożemy i zorganizujemy auto
    zastępcze" — zdanie bez ani jednego warunku. Potem, 30.08.2026, dostała
    warunki z ówczesnego §11: „na terenie Polski, do 12 godzin od zgłoszenia".
    Tyle że sam §11 obiecywał więcej, niż firma ma pokrycie: żaden dokument
    A&A nie gwarantuje auta zastępczego ani czasu jego podstawienia, bo jedno
    i drugie zależy od Assistance przypisanego do KONKRETNEGO pojazdu.

    31.08.2026 właściciel to rozstrzygnął: żadnej bezwarunkowej gwarancji.
    Zdanie mówi więc to, co ma pokrycie w Procedurze Zdarzenia — kontakt
    z A&A, Assistance przez A&A (chyba że przy wydaniu padł bezpośredni
    numer), 112 przy zagrożeniu — i wprost nazywa to, czego NIE obiecuje.

    Zniknęło też „całodobowe wsparcie drogowe": telefon A&A pracuje
    07:00–24:00, a dokumenty nigdzie nie stwierdzają dostępności 24/7.

    Ta sama lista jest źródłem FAQ na stronie I dla asystenta
    (`getMergedFaq` → `base`), więc poprawka działa w obu miejscach naraz.
  */
  {
    q: { pl: "Co zrobić w razie awarii?", en: "What if the car breaks down?" },
    a: {
      pl: "Zadzwoń pod numer wskazany w umowie najmu i skontaktuj się z A&A Corporation — ustalimy dalsze postępowanie. Kontakt z Assistance odbywa się za pośrednictwem A&A, chyba że przy wydaniu auta otrzymałeś bezpośredni numer. Zakres pomocy, w tym ewentualny pojazd zastępczy, zależy od zakresu ochrony i Assistance przypisanego do konkretnego pojazdu oraz od warunków najmu (§11 regulaminu) — nie jest to automatyczna gwarancja auta zastępczego ani określonego czasu podstawienia. Jeżeli komukolwiek zagraża niebezpieczeństwo, najpierw zadzwoń na 112.",
      en: "Call the number given in your rental agreement and contact A&A Corporation — we will agree the next steps. Assistance is reached through A&A unless you were given a direct number at handover. The scope of help, including any replacement vehicle, depends on the protection and Assistance cover assigned to the specific vehicle and on the terms of the rental (§11 of the Terms) — it is not an automatic guarantee of a replacement car or of any particular time for providing one. If anyone is in danger, call 112 first.",
    },
  },
];

export const getFaq = (locale: Locale): FaqItem[] =>
  FAQ.map((f) => ({ q: pick(f.q, locale), a: pick(f.a, locale) }));
