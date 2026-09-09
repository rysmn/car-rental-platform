import type { Landing } from "./types";

/**
 * The broad city query — "wynajem aut Warszawa", "wynajem samochodów Warszawa",
 * "car rental Warsaw", "wypożyczalnia samochodów Warszawa".
 *
 * The home page leads with *premium*, which is the right brand position and the
 * wrong keyword for somebody who simply wants a car in Warsaw. This page is the
 * one that answers that query, and the hub the other Warsaw pages link back to.
 */
export const WARSAW: Landing = {
  metaTitle: {
    pl: "Wynajem aut Warszawa | Auta premium i SUV-y",
    en: "Car Rental Warsaw | Premium & Luxury Cars",
  },
  metaDescription: {
    pl: "Wynajem aut w Warszawie — samochody premium, SUV-y i limuzyny. Dostawa pod adres i na Lotnisko Chopina, pełne ubezpieczenie, odbiór 24/7 po uzgodnieniu.",
    en: "Car rental in Warsaw — premium, SUV and business cars. Delivery to any address in Warsaw and to Chopin Airport, full insurance, 24/7 pickup by arrangement.",
  },
  eyebrow: { pl: "Warszawa", en: "Warsaw" },
  h1: {
    pl: "Wynajem aut w Warszawie",
    en: "Car Rental in Warsaw",
  },
  lead: {
    pl: "Samochody premium, SUV-y i limuzyny z dostawą na terenie Warszawy i na Lotnisko Chopina — na dobę, na weekend i na miesiące.",
    en: "Premium, SUV and executive car rental with delivery across Warsaw and to Warsaw Chopin Airport — by the day, the weekend or the month.",
  },
  intro: [
    {
      pl: "Wynajmujemy samochody w Warszawie klientom indywidualnym i firmom — na jeden dzień, na weekend i na kilka miesięcy. Nie prowadzimy okienka na parkingu, do którego trzeba dojechać: auto podstawiamy pod wskazany adres, pod hotel, pod biuro albo na lotnisko, o godzinie, którą wybierzesz.",
      en: "We rent cars in Warsaw to private customers and companies — for a single day, for a weekend, or for several months. There is no counter in a car park you have to reach first: we bring the car to the address you give us, to your hotel, to your office, or to the airport, at the hour you choose.",
    },
    {
      pl: "Cena, kaucja i limit kilometrów są znane przed rezerwacją. Kalkulator na stronie każdego auta liczy pełny koszt wynajmu dla wybranych dat, razem z dostawą i dodatkami — to ta sama stawka, którą zobaczysz w umowie.",
      en: "The price, the deposit and the mileage limit are all known before you book. The calculator on each car page works out the full cost for your dates, including delivery and any extras — and that is the same rate that appears in the agreement.",
    },
  ],
  sections: [
    {
      heading: {
        pl: "Co obejmuje wynajem auta w Warszawie",
        en: "What a Warsaw car rental includes",
      },
      body: [
        {
          pl: "Każdy samochód wydajemy czysty, zatankowany i sprawdzony technicznie. Cała flota ma pełne ubezpieczenie OC i AC — nie dopłacasz za podstawową ochronę, żeby w ogóle wyjechać. Do każdego wynajmu wystawiamy fakturę VAT, a obsługa działa po polsku i po angielsku przez całą dobę, przez cały okres najmu.",
          en: "Every car is handed over clean, fuelled and mechanically checked. The whole fleet carries full third-party and comprehensive insurance — you are not paying extra for basic cover just to drive away. We issue a VAT invoice for every rental, and support runs in both Polish and English, between {phone}, for the whole hire.",
        },
        {
          pl: "Jeśli coś wydarzy się w trasie, dzwonisz pod jeden numer i rozmawiasz z osobą, która zna Twoją rezerwację. Przy aucie za kilkaset tysięcy złotych i kaucji liczonej w tysiącach to ma znaczenie większe niż cena za dobę.",
          en: "If something happens on the road you call one number and speak to somebody who already knows your booking. With a car worth several hundred thousand złoty and a deposit running into thousands, that matters more than the headline daily rate.",
        },
      ],
    },
    {
      heading: {
        pl: "Dostawa auta na terenie Warszawy",
        en: "Delivery across Warsaw",
      },
      body: [
        {
          pl: "Podstawiamy auto pod dowolny adres w granicach Warszawy — Śródmieście, Mokotów, Wola, Wilanów, Ursynów, Żoliborz, Praga czy Białołęka. Dowozimy pod hotel, pod biurowiec, pod salę weselną i pod dom. Zwrot działa tak samo: możesz oddać samochód tam, gdzie go odebrałeś, albo pod innym uzgodnionym adresem.",
          en: "We deliver to any address inside Warsaw — Śródmieście, Mokotów, Wola, Wilanów, Ursynów, Żoliborz, Praga or Białołęka. We bring cars to hotels, office buildings, wedding venues and private homes. The return works the same way: give the car back where you collected it, or at another agreed address.",
        },
        {
          pl: "Dostawa na terenie Warszawy jest płatna według cennika dodatków, a odbiór na Lotnisku Chopina rozliczamy osobną stawką. Aktualne kwoty znajdziesz w tabeli dodatków — kalkulator dolicza je automatycznie, więc kwota w podsumowaniu jest kompletna.",
          en: "Delivery within Warsaw is charged according to the add-on price list, with a separate rate for Chopin Airport. The current amounts are in the add-ons table, and the calculator applies them automatically, so the total you see is the total you pay.",
        },
      ],
    },
    {
      heading: {
        pl: "Ile kosztuje wynajem samochodu w Warszawie",
        en: "What car rental in Warsaw costs",
      },
      body: [
        {
          pl: "Stawka dobowa spada wraz z długością najmu. Cennik ma pięć progów: 1–2 dni, 3–6 dni, 7–13 dni, 14–29 dni oraz stawkę miesięczną od 30 dni. Im dłużej trzymasz auto, tym mniej płacisz za dobę — przy wynajmie tygodniowym różnica wobec stawki weekendowej jest już wyraźna.",
          en: "The daily rate falls as the rental gets longer. The price list has five bands: 1–2 days, 3–6 days, 7–13 days, 14–29 days, and a monthly rate from 30 days. The longer you keep the car, the less each day costs — by the time you reach a week, the gap against the weekend rate is substantial.",
        },
        {
          pl: "Pełną tabelę stawek dla każdego modelu publikujemy na stronie głównej i na stronie każdego auta. Nie ma tam gwiazdek ani „ceny od” oderwanej od realnej rezerwacji: to stawki, według których liczy kalkulator.",
          en: "The full rate table for every model is published on the home page and on each car page. There are no asterisks and no “from” price detached from a real booking: these are the rates the calculator actually charges.",
        },
      ],
    },
    {
      heading: {
        pl: "Kaucja i limit kilometrów",
        en: "Deposit and mileage limits",
      },
      body: [
        {
          pl: "Kaucja zależy od modelu i mieści się w przedziale od 2 000 zł do 6 000 zł. Jest zwrotna i rozliczamy ją po oddaniu auta. Kwotę dla konkretnego samochodu podajemy na jego stronie, przed rezerwacją.",
          en: "The deposit depends on the model and runs from 2,000 zł to 6,000 zł. It is refundable and settled once the car comes back. The exact figure for each car is shown on its own page, before you book.",
        },
        {
          pl: "Limit kilometrów wynosi 300 km na dobę przy wynajmie do 6 dni, 250 km na dobę od 7 dni i 3 000 km miesięcznie przy najmie miesięcznym. Dopłata za nadprzebieg zależy od modelu. Jeśli planujesz dłuższą trasę — na przykład do Gdańska albo Krakowa — powiedz o tym przy rezerwacji, ustalimy limit pod Twój wyjazd.",
          en: "Mileage is capped at 300 km per day for rentals up to 6 days, 250 km per day from 7 days, and 3,000 km per month on monthly hires. The excess-mileage charge depends on the model. If you are planning a longer route — to Gdańsk or Kraków, say — tell us when you book and we will set the allowance around your trip.",
        },
      ],
    },
    {
      heading: {
        pl: "Czego potrzebujesz, żeby wynająć auto",
        en: "What you need in order to rent",
      },
      body: [
        {
          pl: "Minimalny wiek kierowcy to {minAge} lat.{minAgeNote} Potrzebne są ważne prawo jazdy oraz dokument tożsamości — dowód osobisty lub paszport. Drugiego kierowcę można dopisać do umowy za dopłatą dzienną; musi on okazać te same dokumenty co najemca.",
          en: "The minimum driver age is {minAge}.{minAgeNote} You need a valid driving licence and photo ID — an identity card or a passport. A second driver can be named in the agreement for a daily supplement, and has to present the same documents as the main renter.",
        },
        {
          pl: "Karta kredytowa nie zawsze jest wymagana — zależy to od wybranego auta i formy rozliczenia. Akceptujemy również przelew, co dla firm zwykle jest wygodniejsze. Warunki potwierdzamy przy rezerwacji, zanim cokolwiek podpiszesz.",
          en: "A credit card is not always required — it depends on the car and how you choose to settle. We also accept bank transfer, which is usually easier for companies. We confirm the terms when you book, before you sign anything.",
        },
      ],
    },
    {
      heading: {
        pl: "Kto najczęściej wynajmuje u nas auto",
        en: "Who rents from us",
      },
      body: [
        {
          pl: "Podróże służbowe i spotkania z klientami, dla których auto jest częścią pierwszego wrażenia. Wesela i sesje zdjęciowe. Goście przylatujący do Warszawy na kilka dni, którzy nie chcą zaczynać wizyty od kolejki po kluczyki. Firmy, które potrzebują auta zastępczego na czas serwisu floty. I klienci długoterminowi, dla których wynajem miesięczny wychodzi taniej i prościej niż leasing.",
          en: "Business trips and client meetings, where the car is part of the first impression. Weddings and photo shoots. Visitors flying into Warsaw for a few days who would rather not start the trip queueing for keys. Companies needing a replacement car while their own fleet is in for service. And long-term customers, for whom a monthly rental works out cheaper and simpler than leasing.",
        },
      ],
    },
    {
      heading: {
        pl: "Wynajem długoterminowy w Warszawie",
        en: "Long-term rental in Warsaw",
      },
      body: [
        {
          pl: "Przy najmie od 30 dni obowiązuje stawka miesięczna z limitem 3 000 km na miesiąc. To rozwiązanie dla firm i osób, które potrzebują auta na kwartał albo na pół roku bez umowy leasingowej, wkładu własnego i wieloletniego zobowiązania. Serwis, ubezpieczenie i przeglądy zostają po naszej stronie.",
          en: "From 30 days the monthly rate applies, with an allowance of 3,000 km per month. It suits companies and individuals who need a car for a quarter or half a year without a lease agreement, a down payment or a multi-year commitment. Servicing, insurance and inspections stay with us.",
        },
        {
          pl: "Dla flot i stałej współpracy prowadzimy pakiety Business, Executive i Corporate — z indywidualnymi warunkami i dedykowanym opiekunem.",
          en: "For fleets and ongoing cooperation we run Business, Executive and Corporate packages — individual terms with a dedicated account manager.",
        },
      ],
    },
    {
      heading: {
        pl: "O A&A Corporation — wypożyczalnia samochodów w Warszawie",
        en: "About A&A Corporation — a car hire company in Warsaw",
      },
      body: [
        {
          pl: "A&A Corporation to warszawska wypożyczalnia samochodów działająca w segmencie premium. Flota jest niewielka i celowo taka pozostaje: kilkanaście aut, które znamy z nazwy i z historii serwisowej, zamiast setek pojazdów obsługiwanych z call center. Każdy samochód przechodzi przegląd między wynajmami, a nie raz na sezon.",
          en: "A&A Corporation is a Warsaw car hire company working in the premium segment. The fleet is small and deliberately stays that way: a dozen or so cars we know by name and by service history, rather than hundreds of vehicles run out of a call centre. Every car is inspected between rentals, not once a season.",
        },
        {
          pl: "Obsługujemy Warszawę i Lotnisko Chopina. W ofercie mamy auta klasy business, SUV-y, limuzyny i samochody elektryczne — wynajem krótkoterminowy na dobę i weekend, wynajem długoterminowy dla firm oraz wynajem z dostawą pod wskazany adres. Rozliczamy się fakturą VAT, także z firmami zagranicznymi.",
          en: "We serve Warsaw and Chopin Airport. The offer covers business-class cars, SUVs, executive saloons and electric models — short-term hire by the day or weekend, long-term rental for companies, and delivery to an address of your choice. We invoice with VAT, including for companies registered abroad.",
        },
      ],
    },
  ],
  faq: [
    {
      q: {
        pl: "Czy dowozicie samochód pod wskazany adres w Warszawie?",
        en: "Do you deliver the car to an address in Warsaw?",
      },
      a: {
        pl: "Tak. Podstawiamy auto pod dowolny adres w granicach Warszawy, a także na Lotnisko Chopina. Opłata za podstawienie jest naliczana według cennika dodatków i widoczna w podsumowaniu rezerwacji.",
        en: "Yes. We deliver to any address inside Warsaw, and also to Chopin Airport. The delivery fee follows the add-on price list and appears in your booking summary.",
      },
    },
    {
      q: {
        pl: "Czy mogę wynająć auto tylko na jeden dzień?",
        en: "Can I rent a car for just one day?",
      },
      a: {
        pl: "Tak, minimalny okres najmu to jeden dzień. Przy krótkim wynajmie obowiązuje stawka z progu 1–2 dni; od trzeciego dnia cena dobowa spada.",
        en: "Yes, the minimum rental is one day. Short hires are charged at the 1–2 day rate; from the third day the daily price drops.",
      },
    },
    {
      q: {
        pl: "Ile wynosi kaucja przy wynajmie w Warszawie?",
        en: "How much is the deposit?",
      },
      a: {
        pl: "Od 2 000 zł do 6 000 zł, zależnie od modelu. Kaucja jest zwrotna i rozliczana po zwrocie pojazdu. Kwotę dla konkretnego auta podajemy na jego stronie.",
        en: "From 2,000 zł to 6,000 zł depending on the model. It is refundable and settled after the car is returned. The amount for each car is listed on its own page.",
      },
    },
    {
      q: {
        pl: "Jaki jest minimalny wiek kierowcy?",
        en: "What is the minimum driver age?",
      },
      a: {
        pl: "{minAge} lat, z ważnym prawem jazdy i dokumentem tożsamości.{minAgeNote}",
        en: "{minAge}, with a valid driving licence and photo ID.{minAgeNote}",
      },
    },
    {
      q: {
        pl: "Czy mogę zwrócić auto w innym miejscu niż je odebrałem?",
        en: "Can I return the car somewhere other than where I collected it?",
      },
      a: {
        pl: "Tak, pod innym uzgodnionym adresem — również na lotnisku. Wystarczy ustalić miejsce i godzinę przy rezerwacji lub w trakcie najmu.",
        en: "Yes, at another agreed address — including the airport. Just settle the place and time when you book, or during the rental.",
      },
    },
    {
      q: {
        pl: "Czy wystawiacie fakturę VAT?",
        en: "Do you issue a VAT invoice?",
      },
      a: {
        pl: "Tak, do każdego wynajmu. Akceptujemy również płatność przelewem, co dla firm zwykle jest najwygodniejsze.",
        en: "Yes, for every rental. We also accept bank transfer, which is usually the easiest option for companies.",
      },
    },
  ],
  ctaTitle: {
    pl: "Sprawdź dostępność auta w Warszawie na wybrane dni",
    en: "Check which cars are free in Warsaw on your dates",
  },
};
