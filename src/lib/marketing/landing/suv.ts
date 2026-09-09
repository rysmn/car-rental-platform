import type { Landing } from "./types";

/**
 * SUV rental in Warsaw.
 *
 * The fleet strip on this page is filtered to `category === "suv"` — six real
 * cars, from the business Tiguan up to the Model X. Model names appear in the
 * copy because that is what people actually search ("wynajem GLE", "Model X
 * wynajem"), but nothing here states a spec the car pages do not: seat counts
 * and fuel come from the database, and only the two facts that are certain for
 * every unit (six seats in the Model X, electric drivetrains in the I-PACE and
 * Model X) are asserted in prose.
 */
export const SUV: Landing = {
  metaTitle: {
    pl: "Wynajem SUV Warszawa | Premium i elektryczne",
    en: "SUV Rental Warsaw | Premium & Electric SUVs",
  },
  metaDescription: {
    pl: "Wynajem SUV-a w Warszawie — Mercedes GLE, Tesla Model X, Jaguar I-PACE, Volvo XC60, Tiguan i RAV4. Dostawa pod adres i na lotnisko, pełne AC, faktura VAT.",
    en: "Rent an SUV in Warsaw — Mercedes GLE, Tesla Model X, Jaguar I-PACE, Volvo XC60, Tiguan and RAV4. Delivery to your address or airport, full cover, VAT invoice.",
  },
  eyebrow: { pl: "SUV-y", en: "SUVs" },
  h1: {
    pl: "Wynajem SUV-ów w Warszawie",
    en: "SUV Rental in Warsaw",
  },
  lead: {
    pl: "Sześć SUV-ów w jednej flocie — od miejskiego Tiguana po sześciomiejscową Teslę Model X i elektrycznego Jaguara I-PACE.",
    en: "Six SUVs in one fleet — from the everyday Tiguan up to the six-seat Tesla Model X and the all-electric Jaguar I-PACE.",
  },
  intro: [
    {
      pl: "SUV to najczęściej wybierana klasa w naszej flocie i zwykle z konkretnego powodu: więcej miejsca na bagaż, wyższa pozycja za kierownicą, spokojniejsza jazda zimą i po drogach, których nikt nie odśnieżył na czas. Wynajmujemy SUV-y w Warszawie na dobę, na weekend, na ferie i na całe miesiące.",
      en: "The SUV is the most-booked class in our fleet, and usually for a concrete reason: more luggage space, a higher driving position, and a calmer drive in winter and on roads nobody cleared in time. We rent SUVs in Warsaw by the day, by the weekend, for the school holidays and by the month.",
    },
    {
      pl: "Auto podstawiamy pod wskazany adres w Warszawie albo na Lotnisko Chopina — nie musisz nigdzie dojeżdżać po kluczyki. Cena, kaucja i limit kilometrów są znane przed rezerwacją, a kalkulator przy każdym modelu liczy pełny koszt dla wybranych dat.",
      en: "We deliver the car to an address in Warsaw or to Chopin Airport — there is nowhere you have to travel to collect keys. The price, the deposit and the mileage allowance are known before you book, and the calculator on each model works out the full cost for your dates.",
    },
  ],
  sections: [
    {
      heading: {
        pl: "Jakie SUV-y mamy w wynajmie",
        en: "Which SUVs we rent",
      },
      body: [
        {
          pl: "W klasie premium: Mercedes-Benz GLE 350, Tesla Model X i Jaguar I-PACE. To auta na dłuższą trasę, na spotkanie z klientem i na wyjazd, w którym wnętrze ma znaczenie równe osiągom. Model X ma sześć miejsc, więc jako jedyny SUV z naszej floty zabierze większą rodzinę razem z bagażem.",
          en: "In the premium class: Mercedes-Benz GLE 350, Tesla Model X and Jaguar I-PACE. These are cars for a long route, for a client meeting, and for a trip where the interior matters as much as the performance. The Model X seats six, which makes it the only SUV in our fleet that takes a larger family and their luggage in one go.",
        },
        {
          pl: "W klasie business: Volvo XC60, Volkswagen Tiguan Highline i Toyota RAV4 Hybrid. Rozsądniejsza stawka dobowa, niższa kaucja i to samo pełne ubezpieczenie — najczęstszy wybór na wynajem długoterminowy dla firm i na auto zastępcze.",
          en: "In the business class: Volvo XC60, Volkswagen Tiguan Highline and Toyota RAV4 Hybrid. A more sensible daily rate, a lower deposit and exactly the same full insurance cover — the usual choice for long-term company hire and for replacement cars.",
        },
        {
          pl: "Potrzebujesz więcej niż sześciu miejsc? Wtedy właściwym autem nie jest SUV, tylko dziewięcioosobowy Renault Trafic — znajdziesz go we flocie obok SUV-ów.",
          en: "Need more than six seats? Then the right car is not an SUV but the nine-seat Renault Trafic, listed in the fleet alongside them.",
        },
      ],
    },
    {
      heading: {
        pl: "Elektryczny SUV w Warszawie",
        en: "Electric SUVs in Warsaw",
      },
      body: [
        {
          pl: "Tesla Model X i Jaguar I-PACE to auta w pełni elektryczne. W praktyce oznacza to trzy rzeczy: zerowy koszt paliwa na krótkich trasach po mieście, brak ograniczeń przy wjeździe do Strefy Czystego Transportu i ciszę, której nie da żaden diesel w tej klasie.",
          en: "The Tesla Model X and the Jaguar I-PACE are fully electric. In practice that means three things: no fuel cost on short city runs, unrestricted access to Warsaw's clean transport zone, and a quietness no diesel in this class can match.",
        },
        {
          pl: "Przy wydaniu auta tłumaczymy, jak i gdzie je ładować — również jeśli jedziesz elektrykiem pierwszy raz. Jeśli planujesz dłuższą trasę, powiedz o tym przy rezerwacji: podpowiemy realny plan postojów zamiast zostawiać Cię z tabelą zasięgu z katalogu.",
          en: "At handover we walk you through how and where to charge — including if this is your first time in an electric car. If you are planning a long route, tell us when you book: we will suggest a realistic stop plan instead of leaving you with a brochure range figure.",
        },
      ],
    },
    {
      heading: {
        pl: "SUV na zimę, ferie i wyjazd w góry",
        en: "SUVs for winter, half-term and the mountains",
      },
      body: [
        {
          pl: "Zimą SUV wynajmuje się u nas najczęściej — na ferie w Zakopanem, na weekend w Beskidach, na dojazdy po mieście, kiedy sypie. Wszystkie auta są przygotowane do sezonu, w którym są wydawane; stan opon i płynów sprawdzamy między wynajmami, nie raz na kwartał.",
          en: "Winter is when SUVs move fastest here — half-term in Zakopane, a weekend in the Beskids, city driving when it snows. Every car is prepared for the season it goes out in; tyres and fluids are checked between rentals, not once a quarter.",
        },
        {
          pl: "Na wyjazd w góry warto zaplanować limit kilometrów: standardowo 300 km na dobę przy najmie do 6 dni i 250 km na dobę od 7 dni. Jeśli trasa jest dłuższa, ustalimy limit indywidualnie przed rezerwacją — to tańsze niż rozliczanie nadprzebiegu po powrocie.",
          en: "For a trip to the mountains it is worth planning the mileage: the standard allowance is 300 km per day up to 6 days and 250 km per day from 7 days. If the route is longer we will agree a custom allowance before you book — cheaper than settling excess kilometres afterwards.",
        },
      ],
    },
    {
      heading: {
        pl: "SUV z fotelikiem i dla rodziny",
        en: "SUVs with a child seat, and for families",
      },
      body: [
        {
          pl: "Fotelik dziecięcy dokładamy za dopłatą dzienną z cennika dodatków — montujemy go przed wydaniem auta, więc nie zaczynasz wyjazdu od instrukcji na parkingu. Przy rezerwacji podaj wiek dziecka, dobierzemy właściwy typ fotelika.",
          en: "A child seat is added for a daily supplement from the add-on price list, and fitted before handover — so the trip does not start with an instruction manual in a car park. Tell us the child's age when booking and we will match the right seat.",
        },
        {
          pl: "Drugiego kierowcę dopisujemy do umowy za dopłatą dzienną. Przy rodzinnym wyjeździe to zwykle rozsądniejsze niż jazda jednej osoby przez cały dzień — a w razie kontroli albo szkody obie osoby są objęte tą samą polisą.",
          en: "A second driver goes into the agreement for a daily supplement. On a family trip that is usually more sensible than one person driving all day — and in a check or a claim both drivers are covered by the same policy.",
        },
      ],
    },
    {
      heading: {
        pl: "Ile kosztuje wynajem SUV-a w Warszawie",
        en: "What SUV rental in Warsaw costs",
      },
      body: [
        {
          pl: "Stawka zależy od modelu i długości najmu. Cennik ma pięć progów — 1–2 dni, 3–6 dni, 7–13 dni, 14–29 dni i stawka miesięczna od 30 dni — a różnica między weekendem a tygodniem jest wyraźna. SUV-y business są zauważalnie tańsze od premium przy tej samej pojemności bagażnika.",
          en: "The rate depends on the model and the length of the hire. There are five bands — 1–2 days, 3–6 days, 7–13 days, 14–29 days and a monthly rate from 30 days — and the gap between a weekend and a week is substantial. Business-class SUVs come in noticeably cheaper than premium ones at a similar boot capacity.",
        },
        {
          pl: "Kaucja mieści się w przedziale od 2 000 zł do 6 000 zł zależnie od modelu, jest zwrotna i rozliczana po oddaniu auta. Dokładną kwotę dla wybranego SUV-a podajemy na jego stronie, przed rezerwacją.",
          en: "The deposit runs from 2,000 zł to 6,000 zł depending on the model, is refundable, and is settled once the car comes back. The exact figure for each SUV is shown on its own page, before you book.",
        },
      ],
    },
    {
      heading: {
        pl: "SUV dla firmy i na wynajem długoterminowy",
        en: "SUVs for companies and long-term hire",
      },
      body: [
        {
          pl: "Od 30 dni obowiązuje stawka miesięczna z limitem 3 000 km. Dla firm SUV w wynajmie długoterminowym bywa prostszy niż leasing: bez wkładu własnego, bez wieloletniej umowy, z jedną fakturą VAT miesięcznie i z serwisem po naszej stronie. Auto można wymienić w trakcie umowy, jeśli zmienią się potrzeby.",
          en: "From 30 days the monthly rate applies, with a 3,000 km allowance. For companies a long-term SUV is often simpler than a lease: no down payment, no multi-year contract, one VAT invoice a month, and servicing on our side. The car can be swapped mid-contract if needs change.",
        },
      ],
    },
    {
      heading: {
        pl: "Dlaczego SUV-a warto wynająć u nas",
        en: "Why rent your SUV from us",
      },
      body: [
        {
          pl: "A&A Corporation to warszawska wypożyczalnia aut premium z niewielką, dobrze utrzymaną flotą. Nie mamy setek pojazdów i nie obsługujemy nikogo z automatu: SUV, którego rezerwujesz, to konkretny egzemplarz z konkretną historią serwisową, a nie „samochód z grupy”, którego markę poznajesz na parkingu.",
          en: "A&A Corporation is a Warsaw premium car hire company with a small, well-kept fleet. We do not run hundreds of vehicles and nobody here is served by a script: the SUV you book is a specific car with a specific service history — not a “vehicle from group X” whose badge you discover in the car park.",
        },
        {
          pl: "Pełne ubezpieczenie OC i AC w cenie, faktura VAT do każdego wynajmu, obsługa po polsku i po angielsku w godzinach {phone}, dostawa pod adres w Warszawie oraz na Lotnisko Chopina.",
          en: "Full third-party and comprehensive insurance included, a VAT invoice for every rental, support in Polish and English between {phone}, and delivery to any address in Warsaw and to Chopin Airport.",
        },
      ],
    },
  ],
  faq: [
    {
      q: {
        pl: "Który SUV pomieści największą rodzinę?",
        en: "Which SUV takes the largest family?",
      },
      a: {
        pl: "Tesla Model X — ma sześć miejsc. Pozostałe SUV-y z naszej floty są pięciomiejscowe. Jeśli potrzebujesz więcej niż sześciu foteli, właściwym autem jest dziewięcioosobowy Renault Trafic.",
        en: "The Tesla Model X, with six seats. The other SUVs in our fleet seat five. If you need more than six, the right car is the nine-seat Renault Trafic.",
      },
    },
    {
      q: {
        pl: "Czy macie elektrycznego SUV-a?",
        en: "Do you have an electric SUV?",
      },
      a: {
        pl: "Tak, dwa: Teslę Model X i Jaguara I-PACE. Oba są w pełni elektryczne, bez ograniczeń wjeżdżają do Strefy Czystego Transportu, a przy wydaniu tłumaczymy sposób i miejsca ładowania.",
        en: "Yes, two: the Tesla Model X and the Jaguar I-PACE. Both are fully electric, both have unrestricted access to the clean transport zone, and we explain charging in practice at handover.",
      },
    },
    {
      q: {
        pl: "Ile kosztuje wynajem SUV-a na weekend?",
        en: "What does an SUV cost for a weekend?",
      },
      a: {
        pl: "Weekend liczony jest według progu 1–2 dni albo 3–6 dni, zależnie od długości. Konkretną kwotę dla wybranego modelu i dat wylicza kalkulator na stronie auta — razem z podstawieniem i dodatkami.",
        en: "A weekend falls into the 1–2 day or 3–6 day band depending on its length. The exact figure for your model and dates comes from the calculator on the car page, delivery and extras included.",
      },
    },
    {
      q: {
        pl: "Czy SUV-y mają opony zimowe?",
        en: "Are the SUVs on winter tyres?",
      },
      a: {
        pl: "Auta są przygotowane do sezonu, w którym są wydawane, a stan opon sprawdzamy między wynajmami. Jeśli planujesz wyjazd w góry, powiedz o tym przy rezerwacji — potwierdzimy przygotowanie konkretnego egzemplarza.",
        en: "Cars are prepared for the season they go out in, and tyres are checked between rentals. If you are heading for the mountains, mention it when booking and we will confirm the preparation of that specific car.",
      },
    },
    {
      q: {
        pl: "Czy dowieziecie SUV-a na Lotnisko Chopina?",
        en: "Will you deliver an SUV to Chopin Airport?",
      },
      a: {
        pl: "Tak. Podstawienie na Lotnisko Chopina ma stałą stawkę w cenniku dodatków, a dostawa pod adres w Warszawie jest tańsza. Podaj numer lotu, a dopasujemy godzinę do lądowania.",
        en: "Yes. Delivery to Chopin has a fixed rate in the add-on price list, and delivery to a Warsaw address is cheaper. Give us your flight number and we will set the handover to your landing time.",
      },
    },
    {
      q: {
        pl: "Ile wynosi kaucja za SUV-a?",
        en: "How large is the deposit on an SUV?",
      },
      a: {
        pl: "Od 2 000 zł do 6 000 zł, zależnie od modelu — SUV-y business mają niższą kaucję niż premium. Kwota jest zwrotna i podana na stronie każdego auta.",
        en: "From 2,000 zł to 6,000 zł depending on the model — business-class SUVs carry a lower deposit than premium ones. It is refundable and stated on each car's page.",
      },
    },
  ],
  ctaTitle: {
    pl: "Sprawdź, które SUV-y są wolne w Twoim terminie",
    en: "See which SUVs are free on your dates",
  },
};
