import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getFaq } from "./content";
// `getAllLocations`, nie `getLocations`: ta druga oddaje wyłącznie punkty
// aktywne, a odpowiedź o miejscach odbioru musi umieć powiedzieć także
// „zapowiedziany, jeszcze nie do wyboru" — inaczej Gdańsk po prostu znika
// i klient nie dowiaduje się o nim niczego.
import { getFeeCatalog, getAllLocations } from "@/lib/booking/repo";
import { BOOKING_RULES, HANDOVER } from "@/lib/booking/fees";
import { MIN_WYPRZEDZENIE_H } from "@/lib/booking/lead-time";
import { serviceHours } from "@/lib/company/service-hours";
import { getSetting } from "@/lib/admin/settings";
import { rulesToFaq } from "@/lib/admin/rental-rules";
import { isPriceOnRequest } from "@/lib/booking/pricing";
import type { FeeUnit } from "@/lib/booking/types";

/**
 * The FAQ as it stands right now: the entries written into the repository, plus
 * the ones an administrator added from the assistant's unanswered list and
 * published.
 *
 * **One source, two surfaces.** The `pytania` page has always carried a warning
 * that answering only inside the bot would create a second, invisible version
 * of the rental terms — a customer reading the FAQ page and a customer asking
 * the assistant would get different answers, and only one of them would be
 * reviewable. That warning is right, so a published entry appears in BOTH
 * places: this function is what the public FAQ page renders and what the
 * assistant's matcher searches.
 *
 * Nothing is generated. Drafts start with an empty answer and only a person can
 * fill one in and publish it — see `chat_faq` and the actions behind it.
 */
export type FaqItem = { q: string; a: string };

export async function getPublishedFaq(locale: string): Promise<FaqItem[]> {
  const lang = locale === "en" ? "en" : "pl";
  const rows = await getDb()
    .select({ q: schema.chatFaq.question, a: schema.chatFaq.answer })
    .from(schema.chatFaq)
    .where(
      and(
        eq(schema.chatFaq.status, "published"),
        eq(schema.chatFaq.locale, lang),
        sql`length(trim(${schema.chatFaq.answer})) > 0`,
      ),
    )
    .orderBy(schema.chatFaq.publishedAt);
  return rows;
}

const zl = (grosze: number, lang: "pl" | "en") =>
  `${new Intl.NumberFormat(lang === "en" ? "en-GB" : "pl-PL").format(
    Math.round(grosze / 100),
  )} zł`;

/** Minuty od północy jako `HH:MM` — okno wydań pochodzi z `HANDOVER`. */
const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60,
  ).padStart(2, "0")}`;

const per = (unit: FeeUnit, lang: "pl" | "en") =>
  unit === "per_day"
    ? lang === "en"
      ? "per day"
      : "za dobę"
    : lang === "en"
      ? "for the whole rental"
      : "za cały wynajem";

/**
 * The FAQ entries that quote money, built from the rows the booking form
 * charges from — `fees`, `pickup_locations` and `car_models`.
 *
 * Until 2026-08-20 these four answers were literals in `content.ts` and nobody
 * had kept them in step with the price list. The assistant told customers an
 * extra driver cost 50 zł a day while the form charged 400 zł for the rental,
 * and quoted "from 5,900 zł a month" for a period the price list marks as
 * quoted by hand. Reading the same rows makes that class of drift impossible
 * rather than merely fixed.
 *
 * The company still decides the amounts, in the admin panel, exactly as before.
 * Nothing here sets or changes a price.
 */
async function priceBackedFaq(lang: "pl" | "en"): Promise<FaqItem[]> {
  const [fees, locations, models] = await Promise.all([
    getFeeCatalog(),
    getAllLocations(),
    getDb()
      .select({
        deposit: schema.carModels.depositGrosze,
        monthly: schema.carModels.monthlyPriceGrosze,
      })
      .from(schema.carModels)
      .where(eq(schema.carModels.published, true)),
  ]);

  const out: FaqItem[] = [];

  out.push({
    /*
      OBA SŁOWA W PYTANIU, ŻADNEGO W ODPOWIEDZI — i to nie jest stylistyka.

      Cennik nazywa tę pozycję „dodatkowy kierowca", a wpis pytał o „drugiego";
      klient używa obu słów, a dopasowywacz asystenta traktuje je jak dwa różne
      (stemmer daje „dodatkoweg" i „drugieg"). Samo dopisanie aliasu nie
      wystarczyło: aliasy rozwijają się także po stronie WPISU, więc forma,
      której akurat nie użył pytający, lądowała w jego pytaniu jako temat
      nieobjęty pytaniem (`intrusion`) i odpowiedź była odrzucana mimo pełnego
      pokrycia słów.

      Reguła, która z tego wynika i którą warto tu zostawić: słowo rozstrzygające
      o temacie wpisu ma stać W PYTANIU ALBO W ODPOWIEDZI, nigdy w obu naraz —
      bo powtórzone po obu stronach staje się warunkiem, który pytający musi
      trafić.

      GÓRNA GRANICA. Odpowiedź podawała samą stawkę dobową i milczała o limicie,
      który katalog opłat trzyma w `capGrosze` — a to jest właśnie ta liczba,
      przy której klient liczący dwutygodniowy wynajem przestaje się bać.
      Czytana z katalogu, nie wpisana tutaj.
    */
    q:
      lang === "en"
        ? "Can I add an additional (second) driver?"
        : "Czy mogę dodać dodatkowego (drugiego) kierowcę?",
    a: (() => {
      const stawka = `${zl(fees.extraDriver.amountGrosze, lang)} ${per(fees.extraDriver.unit, lang)}`;
      const limit = fees.extraDriver.capGrosze
        ? lang === "en"
          ? `, capped at ${zl(fees.extraDriver.capGrosze, lang)} for the whole rental`
          : `, najwyżej ${zl(fees.extraDriver.capGrosze, lang)} za cały wynajem`
        : "";
      return lang === "en"
        ? `Yes. The person must be named in the rental agreement, and they have to meet the same requirements as the main driver. The cost is ${stawka}${limit}.`
        : `Tak. Osoba musi zostać wpisana do umowy najmu i spełniać te same wymagania co główny kierowca. Koszt to ${stawka}${limit}.`;
    })(),
  });

  out.push({
    q: lang === "en" ? "Can I order a child seat?" : "Czy mogę zamówić fotelik dziecięcy?",
    a:
      lang === "en"
        ? `Yes. A child seat costs ${zl(fees.childSeat.amountGrosze, lang)} ${per(fees.childSeat.unit, lang)} — just select it when booking.`
        : `Tak. Fotelik kosztuje ${zl(fees.childSeat.amountGrosze, lang)} ${per(fees.childSeat.unit, lang)} — wystarczy zaznaczyć go przy rezerwacji.`,
  });

  /**
   * Deposits are per model, so the honest answer is the real span across the
   * published fleet — not a remembered "2 000 to 6 000".
   */
  const deposits = models.map((m) => m.deposit).filter((d) => d > 0);
  if (deposits.length > 0) {
    const lo = zl(Math.min(...deposits), lang);
    const hi = zl(Math.max(...deposits), lang);
    out.push({
      q: lang === "en" ? "How much is the deposit?" : "Ile wynosi kaucja?",
      a:
        lang === "en"
          ? `Depending on the model — from ${lo} to ${hi}. The deposit is refundable and settled after the car is returned.`
          : `Zależnie od modelu — od ${lo} do ${hi}. Kaucja jest zwrotna i rozliczana po zwrocie pojazdu.`,
    });
  }

  /**
   * Monthly hire. A rate of 0 in the price list means "quoted by hand" — see
   * `isPriceOnRequest` — so when no published model has one, the answer must
   * not invent a figure. It says so, and points at a person.
   */
  const monthly = models.map((m) => m.monthly).filter((v) => !isPriceOnRequest(v));
  out.push({
    q: lang === "en" ? "Can I rent a car for a month?" : "Czy można wynająć auto na miesiąc?",
    a:
      monthly.length > 0
        ? lang === "en"
          ? `Yes — monthly rates start at ${zl(Math.min(...monthly), lang)} per month, depending on the car.`
          : `Tak — stawki miesięczne zaczynają się od ${zl(Math.min(...monthly), lang)} za miesiąc, zależnie od auta.`
        : lang === "en"
          ? "Yes, we do monthly hire. The rate for that period is quoted individually — contact the A&A team and we will prepare an offer."
          : "Tak, prowadzimy najem miesięczny. Cena dla tego okresu jest ustalana indywidualnie — skontaktuj się z zespołem A&A, a przygotujemy ofertę.",
  });

  /**
   * Delivery and airports, listed from the pickup points that actually exist.
   * Modlin used to be advertised at 199 zł with no such point in the system;
   * a location the booking form cannot offer is not a location we deliver to.
   *
   * PYTANIE BEZ SŁOWA „DOSTAWA" — i to nie jest kosmetyka. Dopasowywacz
   * asystenta traktuje słowo powtórzone w pytaniu I w odpowiedzi jako temat
   * wpisu (`intrusion` w `lib/chat/faq`), więc dawne „Gdzie mogę odebrać auto
   * i ile kosztuje dostawa?" kazało mu ODMÓWIĆ odpowiedzi na zadane wprost
   * „Gdzie mogę odebrać samochód?". Cennik zostaje w odpowiedzi, gdzie
   * niczego nie blokuje.
   *
   * MODLIN I GDAŃSK PO IMIENIU. „Innych miejsc odbioru nie obsługujemy" jest
   * prawdziwe, ale klient pyta o konkretne lotnisko i chce usłyszeć jego
   * nazwę. Modlin jest wpisany wprost, bo o niego pytają najczęściej i bo
   * przez pół roku wisiał w cenniku jako punkt, którego nigdy nie było.
   * Punkty zapowiedziane (`active === false`) wymieniamy jako „wkrótce" —
   * czytane z bazy, więc w dniu, w którym właściciel włączy Gdańsk, ta
   * odpowiedź zmieni się sama.
   */
  const paid = locations.filter((l) => l.active !== false && l.feeGrosze > 0);
  const zapowiedziane = locations.filter((l) => l.active === false);
  if (paid.length > 0) {
    const list = paid
      .map(
        (l) =>
          `${lang === "en" ? l.nameEn : l.name} — ${zl(l.feeGrosze, lang)}`,
      )
      .join(", ");
    const wkrotce = zapowiedziane
      .map((l) => (lang === "en" ? l.nameEn : l.name))
      .join(", ");
    const zdania =
      lang === "en"
        ? [
            `Office pickup in Warsaw is free. Paid options: ${list}.`,
            "Warsaw Modlin Airport is not one of our pickup points and we do not deliver cars there.",
            wkrotce
              ? `${wkrotce}: announced, but it cannot be selected when booking yet.`
              : "",
            "We do not serve any other pickup point.",
          ]
        : [
            `Odbiór w biurze w Warszawie jest bezpłatny. Opcje płatne: ${list}.`,
            "Lotnisko Warszawa-Modlin nie jest naszym punktem odbioru i nie podstawiamy tam aut ani nie realizujemy tam dostaw.",
            wkrotce
              ? `${wkrotce}: punkt zapowiedziany, dziś nie da się go jeszcze wybrać przy rezerwacji.`
              : "",
            "Innych miejsc odbioru nie obsługujemy.",
          ];
    out.push({
      q:
        lang === "en"
          ? "Where can I collect the car?"
          : "Gdzie mogę odebrać samochód?",
      a: zdania.filter(Boolean).join(" "),
    });
  }

  /*
    TRZY OSOBNE WPISY O LOTNISKACH — po jednym na lotnisko, i to jest decyzja
    wymuszona przez sposób, w jaki asystent dopasowuje pytania.

    Wpis zbiorczy („Czy obsługujecie Chopina, Modlin i Gdańsk?") nie działa:
    dla kogoś, kto pyta tylko o Modlin, nazwy dwóch pozostałych lotnisk stoją
    w pytaniu wpisu I w jego odpowiedzi, więc `intrusion` uznaje je za temat
    wpisu, o który nikt nie pytał, i odpowiedź zostaje odrzucona. Odwrotnie
    też nie wychodzi: gdy nazwy zniknąć z pytania, pokrycie słów pytania
    spada poniżej progu. Trzy krótkie wpisy rozwiązują oba warunki naraz —
    i tak właśnie klient pyta: o jedno konkretne lotnisko.

    Statusy czytane z bazy, nie wpisane tutaj: Chopin jest punktem płatnym
    (kwota z `pickup_locations`), Gdańsk jest zapowiedziany (`active=false`),
    Modlina w systemie nie ma i nigdy nie było.
  */
  const chopin = locations.find((l) => l.slug === "airport");
  if (chopin && chopin.active !== false) {
    out.push({
      q:
        lang === "en"
          ? "Do you serve Chopin Airport?"
          : "Czy obsługujecie Lotnisko Chopina?",
      a:
        lang === "en"
          ? `Yes. Warsaw Chopin Airport is a pick-up and return point — select it when booking; the fee is ${zl(chopin.feeGrosze, lang)} ${per("per_rental", lang)}.`
          : `Tak. Lotnisko Chopina jest punktem odbioru i zwrotu — wybierasz je przy rezerwacji, opłata wynosi ${zl(chopin.feeGrosze, lang)} ${per("per_rental", lang)}.`,
    });
  }

  out.push({
    q:
      lang === "en"
        ? "Do you serve Modlin?"
        : "Czy obsługujecie Modlin?",
    a:
      lang === "en"
        ? "No. Warsaw Modlin is not one of our pick-up points, we do not bring cars there and we do not deliver there. Instead we can offer Warsaw Chopin Airport, our Warsaw office, or delivery to an address in Warsaw — the fees are in the add-on price list."
        : "Nie. Lotnisko Warszawa-Modlin nie jest naszym punktem odbioru, nie podstawiamy tam aut i nie realizujemy tam dostaw. W zamian możemy zaproponować Lotnisko Chopina, biuro w Warszawie albo dostawę pod wskazany adres w Warszawie — opłaty znajdziesz w cenniku dodatków.",
  });

  const gdansk = locations.find((l) => l.slug === "airport-gdansk");
  if (gdansk) {
    const czynny = gdansk.active !== false;
    out.push({
      q:
        lang === "en"
          ? "Do you serve Gdansk?"
          : "Czy obsługujecie Gdańsk?",
      a: czynny
        ? lang === "en"
          ? `Yes. Gdansk Airport is a pick-up and return point — select it when booking; the fee is ${zl(gdansk.feeGrosze, lang)} ${per("per_rental", lang)}.`
          : `Tak. Lotnisko Gdańsk jest punktem odbioru i zwrotu — wybierasz je przy rezerwacji, opłata wynosi ${zl(gdansk.feeGrosze, lang)} ${per("per_rental", lang)}.`
        : lang === "en"
          ? "Not yet. Gdansk Airport is an announced point — it cannot be selected when booking today, so please do not count on it for your dates. Warsaw Chopin Airport, our Warsaw office and delivery to a Warsaw address are available now."
          : "Jeszcze nie. Lotnisko Gdańsk jest punktem zapowiedzianym — dziś nie da się go wybrać przy rezerwacji, więc nie planuj na nim odbioru. Dostępne są Lotnisko Chopina, biuro w Warszawie i dostawa pod adres w Warszawie.",
    });
  }

  /**
   * Zwrot poza standardowymi godzinami.
   *
   * Dwie liczby, obie ze źródła prawdy i żadnej wpisanej tutaj: okno wydań
   * z `HANDOVER` (to samo, z którego formularz generuje listę godzin) i opłata
   * z katalogu `fees`. §6 i §7 regulaminu mówią o „wydaniu i zwrocie poza
   * standardowymi godzinami za dodatkową opłatą zgodnie z cennikiem" — to
   * jest ten cennik.
   */
  const okno = `${hhmm(HANDOVER.openMinutes)}–${hhmm(HANDOVER.closeMinutes)}`;
  out.push({
    q:
      lang === "en"
        ? "Can I return the car outside standard hours?"
        : "Czy można zwrócić samochód poza standardowymi godzinami?",
    a:
      lang === "en"
        ? `Yes, by prior arrangement. Standard collection and return slots run ${okno}; outside that window there is a fee of ${zl(fees.afterHours.amountGrosze, lang)} ${per(fees.afterHours.unit, lang)}. Agree the hour with us before the rental so it can be recorded in the agreement.`
        : `Tak, po wcześniejszym uzgodnieniu. Standardowe godziny wydań i zwrotów to ${okno}; poza tym oknem obowiązuje opłata ${zl(fees.afterHours.amountGrosze, lang)} ${per(fees.afterHours.unit, lang)}. Godzinę ustal z nami przed wynajmem, żeby trafiła do umowy.`,
  });

  return out;
}

/**
 * Odpowiedzi zbudowane z FAKTÓW SYSTEMU, które nie są kwotą.
 *
 * Osobno od `priceBackedFaq`, bo tamta funkcja ma jedno zadanie — nie
 * wymyślać cen — i dokładanie do niej godzin biura zaciera tę granicę.
 * Wspólna jest za to zasada: żadnej liczby wpisanej w tym pliku. Okno
 * rezerwacji pochodzi z `BOOKING_RULES` i `MIN_WYPRZEDZENIE_H` (tych samych
 * stałych, którymi formularz odrzuca zgłoszenie), a godziny z ustawień
 * firmy przez `serviceHours` — czyli stamtąd, skąd czyta je strona Kontakt.
 * Gdyby właściciel zmienił godziny w panelu, ta odpowiedź zmieni się sama.
 */
async function systemBackedFaq(lang: "pl" | "en"): Promise<FaqItem[]> {
  const company = await getSetting("company");
  const hours = serviceHours(company, lang);
  const out: FaqItem[] = [];

  /*
    ANULOWANIE — sześć pytań, ANI JEDNEJ kwoty wpisanej w tekst.

    Wszystkie liczby pochodzą z `getSetting("cancellation")`, czyli z tego
    samego wiersza, który czyta panel, ekran anulowania i rozliczenie. Gdy
    właściciel zmieni 200 zł na 250, ta odpowiedź zmienia się w tej samej
    chwili — i FAQ, i asystent, bo obaj czytają tę listę. Wpisanie kwot
    literalnie zrobiłoby z FAQ drugi cennik, który rozjeżdża się po cichu:
    dokładnie tak było z dodatkowym kierowcą do 20.08.2026, o czym mówi
    komentarz przy `priceBackedFaq` wyżej.
  */
  const anul = await getSetting("cancellation");
  const bezplatne = anul.tier1Grosze === 0 && anul.tier2Grosze === 0;

  out.push({
    q: lang === "en" ? "Can I cancel my reservation?" : "Czy mogę anulować rezerwację?",
    a:
      lang === "en"
        ? `Yes, at any time before handover. Open "My reservations", pick the booking and choose "Cancel reservation" — you will see the exact amount, if any, before you confirm. A cancellation made more than ${anul.freeHours} h before pick-up is free of charge.`
        : `Tak, w każdej chwili przed wydaniem auta. Wejdź w „Moje rezerwacje", wybierz rezerwację i kliknij „Anuluj rezerwację" — przed potwierdzeniem zobaczysz dokładną kwotę, jeżeli jakaś obowiązuje. Anulowanie wcześniej niż ${anul.freeHours} h przed odbiorem jest bezpłatne.`,
  });

  out.push({
    q: lang === "en" ? "How much does cancelling cost?" : "Ile kosztuje anulowanie?",
    a: bezplatne
      ? lang === "en"
        ? `Nothing. Cancelling is free of charge whenever you do it.`
        : `Nic. Anulowanie jest bezpłatne niezależnie od terminu.`
      : lang === "en"
        ? `More than ${anul.freeHours} h before pick-up — free of charge. Between ${anul.freeHours} h and ${anul.lateHours} h — ${zl(anul.tier1Grosze, lang)}. Less than ${anul.lateHours} h — ${zl(anul.tier2Grosze, lang)}. Not collecting the car at all (no-show) — ${zl(anul.noShowGrosze, lang)}. The fee never exceeds the value of the reservation: if the booking is worth less than the fee, you pay the value of the booking.`
        : `Ponad ${anul.freeHours} h przed odbiorem — bezpłatnie. Od ${anul.freeHours} h do ${anul.lateHours} h — ${zl(anul.tier1Grosze, lang)}. Poniżej ${anul.lateHours} h — ${zl(anul.tier2Grosze, lang)}. Nieodebranie auta (no-show) — ${zl(anul.noShowGrosze, lang)}. Opłata nigdy nie przekracza wartości rezerwacji: jeżeli rezerwacja jest tańsza niż opłata, zapłacisz tyle, ile wynosi rezerwacja.`,
  });

  out.push({
    q: lang === "en" ? "How do I cancel? Do I have to write a letter?" : "Jak anulować rezerwację? Czy muszę pisać pismo?",
    a:
      lang === "en"
        ? `No letter and no e-mail are needed. Everything happens in "My reservations": pick the booking, choose "Cancel reservation", read the amount and confirm. You will get a confirmation by e-mail. If you cannot reach the panel — for example you booked from another device — call us and we will do it for you.`
        : `Żadne pismo ani e-mail nie są potrzebne. Wszystko robisz w „Moich rezerwacjach": wybierasz rezerwację, klikasz „Anuluj rezerwację", czytasz kwotę i potwierdzasz. Potwierdzenie dostaniesz mailem. Jeżeli nie masz dostępu do panelu — na przykład rezerwowałeś z innego urządzenia — zadzwoń, zrobimy to za Ciebie.`,
  });

  out.push({
    q: lang === "en" ? "What does no-show mean?" : "Co oznacza no-show?",
    a:
      lang === "en"
        ? `A no-show is not collecting the car at the agreed time without cancelling. We wait ${anul.noShowGraceMinutes} minutes past the agreed hour before treating a booking that way, and it is always a person who decides — nothing is charged automatically by a clock. ${bezplatne ? "" : `The no-show fee is ${zl(anul.noShowGrosze, lang)}, never more than the value of the reservation.`}`.trim()
        : `No-show to nieodebranie auta w umówionym terminie bez anulowania rezerwacji. Czekamy ${anul.noShowGraceMinutes} minut po umówionej godzinie, zanim uznamy rezerwację za nieodebraną, i zawsze decyduje o tym człowiek — żaden zegar nie nalicza niczego sam. ${bezplatne ? "" : `Opłata za nieodebranie wynosi ${zl(anul.noShowGrosze, lang)} i nigdy nie przekracza wartości rezerwacji.`}`.trim(),
  });

  out.push({
    q: lang === "en" ? "Can the cancellation fee be waived?" : "Czy A&A może umorzyć opłatę za anulowanie?",
    a:
      lang === "en"
        ? `Yes, in individually justified cases — a fault on our side, a sudden illness, a car we could not provide. Contact us and describe what happened. Waiving is a decision, not an entitlement, and it is recorded together with its reason.`
        : `Tak, w indywidualnie uzasadnionych przypadkach — awaria po naszej stronie, nagła choroba, auto, którego nie mogliśmy wydać. Napisz albo zadzwoń i opisz sytuację. Umorzenie jest decyzją, a nie uprawnieniem, i zapisujemy je razem z powodem.`,
  });

  out.push({
    q:
      lang === "en"
        ? "Will a later price change affect my reservation?"
        : "Czy późniejsza zmiana cennika wpłynie na moją rezerwację?",
    a:
      lang === "en"
        ? `No. The cancellation terms are recorded when you place the booking and stay with it. If we change the rates next month, your reservation is still settled on the terms you accepted.`
        : `Nie. Zasady anulowania zapisujemy w chwili składania rezerwacji i zostają przy niej. Jeżeli za miesiąc zmienimy stawki, Twoja rezerwacja nadal rozliczy się na warunkach, które zaakceptowałeś.`,
  });

  out.push({
    q:
      lang === "en"
        ? "How far in advance can I book a car?"
        : "Jak wcześnie mogę zarezerwować samochód?",
    a:
      lang === "en"
        ? `From ${MIN_WYPRZEDZENIE_H} hours before collection up to ${BOOKING_RULES.maxLeadDays} days ahead. A single reservation can run up to ${BOOKING_RULES.maxDays} days; for anything longer, or for a monthly rate, contact us and we will prepare an offer. The earlier you book, the better the chance the specific car is still free on your dates.`
        : `Od ${MIN_WYPRZEDZENIE_H} godzin przed odbiorem do ${BOOKING_RULES.maxLeadDays} dni naprzód. Jedna rezerwacja może obejmować maksymalnie ${BOOKING_RULES.maxDays} dni; dłuższy okres albo stawkę miesięczną ustalamy indywidualnie. Im wcześniej zarezerwujesz, tym większa szansa, że konkretne auto będzie jeszcze wolne w Twoim terminie.`,
  });

  /*
    Kontakt. Numery i adres biorą się z ustawień firmy, więc gdy są puste —
    a mogą być, bo panel na to pozwala — zdanie po prostu ich nie wymienia
    zamiast drukować pustkę albo wymyślony numer.
  */
  const numery = company.phones
    .filter((p) => p.number)
    .map((p) => `${p.number} (${p.lang})`)
    .join(", ");
  const czesci =
    lang === "en"
      ? [
          numery ? `By phone or WhatsApp: ${numery}.` : "",
          company.email ? `By e-mail: ${company.email}.` : "",
          `The office and reservations desk work ${hours.office}; the phone is answered ${hours.phone}.`,
          "You can also use the enquiry form on the Contact page, or ask the assistant on the site — it hands over to a person whenever the answer needs one.",
        ]
      : [
          numery ? `Telefonicznie lub przez WhatsApp: ${numery}.` : "",
          company.email ? `Mailowo: ${company.email}.` : "",
          `Biuro i obsługa rezerwacji pracują ${hours.office}, telefon odbieramy ${hours.phone}.`,
          "Możesz też wysłać zapytanie formularzem na stronie Kontakt albo zapytać asystenta na stronie — przekaże sprawę człowiekowi, gdy odpowiedź tego wymaga.",
        ];
  out.push({
    q:
      lang === "en"
        ? "How can I contact A&A?"
        : "Jak mogę skontaktować się z A&A?",
    a: czesci.filter(Boolean).join(" "),
  });

  return out;
}

/**
 * Jedno pytanie — jeden wpis, wygrywa źródło bardziej szczegółowe.
 *
 * ## Co to naprawia
 *
 * „Czy mogę wyjechać za granicę?" stało na `/faq` DWA RAZY: raz z listy
 * w repozytorium, raz z centrum zasad, które właściciel zatwierdził w panelu.
 * Odpowiedzi były identyczne co do znaku, więc nikt nie zgłosił sprzeczności —
 * ale klient widział ten sam akordeon dwukrotnie, a asystent liczył ten wpis
 * podwójnie przy ważeniu rzadkości słów (`buildIdf`).
 *
 * ## Dlaczego wygrywa PÓŹNIEJSZY
 *
 * Kolejność źródeł w `getMergedFaq` idzie od ogólnego do szczegółowego:
 * repozytorium → ceny z bazy → fakty systemu → zasady z panelu → odpowiedzi
 * napisane ręcznie. Gdy dwa źródła mówią o tym samym, właściwe jest to, które
 * właściciel może zmienić bez wdrożenia. Wpis zostaje więc na POZYCJI
 * późniejszej i z jej treścią — usunięcie wcześniejszego kopii nie zmienia
 * kolejności czytania reszty listy.
 *
 * Porównujemy same pytania, po sprowadzeniu do małych liter i zwinięciu
 * spacji, bez interpunkcji końcowej. Celowo NIE porównujemy odpowiedzi: dwa
 * wpisy o tym samym pytaniu i różnej treści to właśnie ten przypadek, który
 * ma się skończyć jednym wpisem, a nie dwoma.
 */
function dedupe(items: FaqItem[]): FaqItem[] {
  const klucz = (q: string) =>
    q
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[?!.\s]+$/, "")
      .trim();
  const ostatni = new Map<string, number>();
  items.forEach((it, i) => ostatni.set(klucz(it.q), i));
  return items.filter((it, i) => ostatni.get(klucz(it.q)) === i);
}

export async function getMergedFaq(locale: string): Promise<FaqItem[]> {
  const lang = locale === "en" ? "en" : "pl";
  const base = getFaq(lang);
  try {
    /**
     * Four sources, one list, in order of how specific they are.
     *
     * `base` — sentences that never change, written in the repository.
     * `live` — anything quoting money, built from the rows the booking form
     *   charges from.
     * `rules` — the rental rules centre: whatever the owner has approved in
     *   Admin → Zasady wynajmu. Added 2026-08-20.
     * `published` — answers an administrator wrote by hand and published.
     *
     * The assistant searches this same list, so a rule approved in the panel
     * reaches the FAQ page and the chatbot in one step and cannot end up
     * saying two different things in the two places.
     */
    const [live, system, rules, published] = await Promise.all([
      priceBackedFaq(lang),
      systemBackedFaq(lang),
      getSetting("rentalRules").then((r) => rulesToFaq(r, lang)),
      getPublishedFaq(lang),
    ]);
    return dedupe([...base, ...live, ...system, ...rules, ...published]);
  } catch {
    // The repository entries are the behaviour that shipped; a database hiccup
    // must not empty the FAQ page or silence the assistant.
    return base;
  }
}
