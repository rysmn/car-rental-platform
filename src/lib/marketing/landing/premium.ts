import type { Landing } from "./types";

/**
 * "Wynajem aut premium Warszawa" / "premium car rental Warsaw".
 *
 * The closest page to the home page's own positioning, so it deliberately does
 * a different job: the home page sells the brand, this page answers the
 * question behind the query — what "premium" actually buys, and what it costs.
 * The fleet strip is filtered to the luxury / executive / premium-SUV classes.
 */
export const PREMIUM: Landing = {
  metaTitle: {
    pl: "Wynajem aut premium Warszawa | Klasa wyższa",
    en: "Premium Car Rental Warsaw | Executive Fleet",
  },
  metaDescription: {
    pl: "Wynajem samochodów premium w Warszawie — Porsche, BMW, Mercedes, Tesla, Jaguar. Dostawa pod adres i na lotnisko, faktura VAT, odbiór 24/7 po uzgodnieniu.",
    en: "Premium car rental in Warsaw — Porsche, BMW, Mercedes, Tesla, Jaguar. Delivery to your address or the airport, VAT invoice, 24/7 pickup by arrangement.",
  },
  eyebrow: { pl: "Klasa premium", en: "Premium class" },
  h1: {
    pl: "Wynajem aut premium w Warszawie",
    en: "Premium Car Rental in Warsaw",
  },
  lead: {
    pl: "Porsche, BMW, Mercedes, Tesla i Jaguar — flota klasy wyższej z dostawą pod wskazany adres w Warszawie i na Lotnisko Chopina.",
    en: "Porsche, BMW, Mercedes, Tesla and Jaguar — an upper-class fleet delivered to your address in Warsaw or to Chopin Airport.",
  },
  intro: [
    {
      pl: "„Premium” bywa słowem, za którym nie stoi nic poza wyższą stawką. U nas oznacza konkretną listę: Porsche Panamera, BMW 740d xDrive, Mercedes-Benz GLE, Tesla Model S i Model X oraz Jaguar I-PACE. Sześć aut, które można obejrzeć na stronie razem z rocznikiem, wyposażeniem, kaucją i pełnym cennikiem.",
      en: "“Premium” is often a word with nothing behind it but a higher rate. Here it means a specific list: Porsche Panamera, BMW 740d xDrive, Mercedes-Benz GLE, Tesla Model S and Model X, and the Jaguar I-PACE. Six cars, each shown on the site with its year, its equipment, its deposit and the full rate table.",
    },
    {
      pl: "Wynajmujemy je na dobę, na weekend, na czas delegacji i na miesiące. Auto podstawiamy pod adres, pod hotel, pod biurowiec albo na lotnisko — o godzinie, którą wskażesz. Bez kolejki po kluczyki i bez dojazdu na parking na obrzeżach miasta.",
      en: "We rent them by the day, by the weekend, for the length of a secondment, and by the month. The car comes to your address, your hotel, your office building or the airport, at the hour you name — no queue for keys and no trip to a car park on the edge of town.",
    },
  ],
  steps: {
    heading: {
      pl: "Jak wynająć auto premium",
      en: "How to rent a premium car",
    },
    items: [
      {
        title: { pl: "Wybierasz auto i daty", en: "Choose the car and dates" },
        desc: {
          pl: "Filtr dostępności we flocie pokazuje, które auta premium są wolne w Twoim terminie.",
          en: "The availability filter on the fleet page shows which premium cars are free on your dates.",
        },
      },
      {
        title: { pl: "Znasz pełny koszt", en: "See the full cost" },
        desc: {
          pl: "Kalkulator liczy stawkę dobową, podstawienie, dodatki i kaucję — przed wysłaniem zapytania.",
          en: "The calculator adds up the daily rate, delivery, extras and deposit — before you send the enquiry.",
        },
      },
      {
        title: { pl: "Potwierdzamy rezerwację", en: "We confirm the booking" },
        desc: {
          pl: "Kontaktujemy się, potwierdzamy warunki i ustalamy miejsce oraz godzinę podstawienia.",
          en: "We get in touch, confirm the terms, and settle the place and hour of the handover.",
        },
      },
      {
        title: { pl: "Podstawiamy auto", en: "We bring the car" },
        desc: {
          pl: "Umowa, protokół stanu pojazdu, kaucja i kluczyki — na miejscu, w kilkanaście minut.",
          en: "Agreement, condition report, deposit and keys — on the spot, in about fifteen minutes.",
        },
      },
    ],
  },
  sections: [
    {
      heading: {
        pl: "Co u nas znaczy „auto premium”",
        en: "What “premium” means here",
      },
      body: [
        {
          pl: "Trzy rzeczy, każdą sprawdzalną. Po pierwsze — konkretny egzemplarz: rezerwujesz model, który widzisz na zdjęciach, a nie „auto z grupy”, którego markę poznajesz przy odbiorze. Po drugie — stan: przegląd między wynajmami, mycie i tankowanie przed każdym wydaniem. Po trzecie — obsługa: jeden numer telefonu i osoba, która zna Twoją rezerwację, przez całą dobę.",
          en: "Three things, each checkable. First, a specific car: you book the model in the photographs, not a “vehicle from group X” whose badge you meet at handover. Second, condition: inspected between rentals, washed and fuelled before every handover. Third, service: one phone number, answered between {phone}, and a person who already knows your booking.",
        },
        {
          pl: "Czego premium u nas nie oznacza: dopłat za rzeczy oczywiste. Pełne ubezpieczenie OC i AC jest w stawce, nie w koszyku dodatków. Faktura VAT jest standardem, nie usługą na życzenie.",
          en: "What premium does not mean here: surcharges for the obvious. Full third-party and comprehensive insurance is in the rate, not in an add-on basket. A VAT invoice is standard, not a service on request.",
        },
      ],
    },
    {
      heading: {
        pl: "Flota premium — limuzyny i SUV-y",
        en: "The premium fleet — saloons and SUVs",
      },
      body: [
        {
          pl: "Limuzyny: Porsche Panamera na wyjazdy, w których liczy się prowadzenie; BMW 740d xDrive jako klasyczne auto reprezentacyjne na dłuższe trasy; Tesla Model S dla tych, którzy chcą klasy wyższej bez spalania. To auta na spotkania z klientem, transfery, wesela i sesje zdjęciowe.",
          en: "Saloons: the Porsche Panamera for drives where handling is the point; the BMW 740d xDrive as the classic representative car for long routes; the Tesla Model S for an upper-class car without a combustion engine. These go to client meetings, transfers, weddings and photo shoots.",
        },
        {
          pl: "SUV-y premium: Mercedes-Benz GLE 350, Tesla Model X (sześć miejsc) i elektryczny Jaguar I-PACE. Wybierane, kiedy w grę wchodzi bagaż, rodzina albo trasa poza miasto — i kiedy auto ma nadal wyglądać jak decyzja, a nie jak kompromis.",
          en: "Premium SUVs: the Mercedes-Benz GLE 350, the six-seat Tesla Model X and the electric Jaguar I-PACE. Chosen when luggage, family or an out-of-town route come into it — and when the car should still look like a decision rather than a compromise.",
        },
        {
          pl: "Jeśli budżet jest ważniejszy niż marka, mamy też klasę business — Volvo XC60, Volkswagen Tiguan i Toyota RAV4 Hybrid, z niższą stawką i niższą kaucją, ale tym samym ubezpieczeniem i tą samą obsługą.",
          en: "If budget matters more than the badge, there is also the business class — Volvo XC60, Volkswagen Tiguan and Toyota RAV4 Hybrid, at a lower rate and a lower deposit, but with the same insurance and the same service.",
        },
      ],
    },
    {
      heading: {
        pl: "Auto premium na spotkanie biznesowe",
        en: "A premium car for a business meeting",
      },
      body: [
        {
          pl: "Najczęstszy scenariusz: przylot rano, spotkanie w południe, powrót wieczorem. Auto czeka na Lotnisku Chopina o godzinie lądowania — monitorujemy numer lotu, więc opóźnienie samolotu nie przesuwa niczego po Twojej stronie. Wieczorem zostawiasz samochód tam, gdzie Ci wygodniej: na lotnisku albo pod innym uzgodnionym adresem.",
          en: "The most common pattern: land in the morning, meet at midday, fly out in the evening. The car is at Chopin Airport at your landing time — we track the flight number, so a delay moves nothing on your side. In the evening you leave the car wherever suits: at the airport, or at another agreed address.",
        },
        {
          pl: "Do każdego wynajmu wystawiamy fakturę VAT, również dla firm zarejestrowanych poza Polską, i akceptujemy przelew — dla działów finansowych zwykle prostszy niż karta prywatna pracownika.",
          en: "We issue a VAT invoice for every rental, including to companies registered outside Poland, and we accept bank transfer — usually simpler for a finance department than an employee's personal card.",
        },
      ],
    },
    {
      heading: {
        pl: "Ile kosztuje wynajem auta premium",
        en: "What premium car rental costs",
      },
      body: [
        {
          pl: "Stawka dobowa spada wraz z długością najmu — pięć progów: 1–2 dni, 3–6 dni, 7–13 dni, 14–29 dni i stawka miesięczna od 30 dni. Pełną tabelę dla każdego modelu publikujemy na jego stronie, bez gwiazdek i bez „ceny od” oderwanej od realnej rezerwacji.",
          en: "The daily rate falls with the length of the hire — five bands: 1–2 days, 3–6 days, 7–13 days, 14–29 days, and a monthly rate from 30 days. The full table for each model is published on its own page, with no asterisks and no “from” price detached from a real booking.",
        },
        {
          pl: "Kaucja przy autach premium jest wyższa niż w klasie business i mieści się w przedziale do 6 000 zł. Jest zwrotna, rozliczana po zwrocie pojazdu, a jej wysokość dla konkretnego modelu podajemy przed rezerwacją. Limit kilometrów: 300 km na dobę do 6 dni, 250 km na dobę od 7 dni, 3 000 km miesięcznie przy najmie miesięcznym.",
          en: "The deposit on premium cars is higher than in the business class and runs up to 6,000 zł. It is refundable, settled after the car comes back, and the figure for each model is stated before you book. Mileage: 300 km per day up to 6 days, 250 km per day from 7 days, 3,000 km per month on monthly hires.",
        },
      ],
    },
    {
      heading: {
        pl: "Kto może wynająć auto premium",
        en: "Who can rent a premium car",
      },
      body: [
        {
          pl: "Minimalny wiek kierowcy to {minAge} lat, wymagane jest ważne prawo jazdy i dokument tożsamości.{minAgeNote} Przy autach z najwyższej półki potwierdzamy warunki indywidualnie, zanim cokolwiek podpiszesz. Drugiego kierowcę dopisujemy do umowy za dopłatą dzienną.",
          en: "The minimum driver age is {minAge}, with a valid licence and photo ID.{minAgeNote} On the top-end cars we confirm the terms individually before anything is signed. A second driver goes into the agreement for a daily supplement.",
        },
        {
          pl: "Karta kredytowa nie zawsze jest wymagana; zależy to od auta i formy rozliczenia. Firmy najczęściej rozliczają się przelewem na fakturę VAT.",
          en: "A credit card is not always required; it depends on the car and how you settle. Companies most often pay by transfer against a VAT invoice.",
        },
      ],
    },
    {
      heading: {
        pl: "Premium w wynajmie długoterminowym",
        en: "Premium on long-term hire",
      },
      body: [
        {
          pl: "Od 30 dni obowiązuje stawka miesięczna z limitem 3 000 km. Dla zarządów i kadry menedżerskiej bywa to prostsza droga niż leasing: bez wkładu własnego, bez wieloletniej umowy, z jedną fakturą miesięcznie, a serwis, ubezpieczenie i przeglądy zostają po naszej stronie. Auto można wymienić w trakcie umowy.",
          en: "From 30 days the monthly rate applies, with a 3,000 km allowance. For boards and senior management it is often a simpler route than leasing: no down payment, no multi-year contract, one invoice a month, with servicing, insurance and inspections on our side. The car can be swapped mid-contract.",
        },
        {
          pl: "Dla stałej współpracy prowadzimy pakiety Business, Executive i Corporate — z indywidualnymi warunkami i dedykowanym opiekunem.",
          en: "For ongoing cooperation we run Business, Executive and Corporate packages — individual terms and a dedicated account manager.",
        },
      ],
    },
    {
      heading: {
        pl: "O A&A Corporation",
        en: "About A&A Corporation",
      },
      body: [
        {
          pl: "Jesteśmy warszawską wypożyczalnią samochodów premium. Flota jest niewielka i celowo taka pozostaje — kilkanaście aut, które znamy z historii serwisowej, zamiast setek pojazdów obsługiwanych z call center. To jedyny sposób, żeby obietnica „auto jest gotowe” znaczyła coś więcej niż wpis w systemie.",
          en: "We are a Warsaw premium car hire company. The fleet is small and deliberately stays that way — a dozen or so cars we know by service history, rather than hundreds run out of a call centre. It is the only way the promise “the car is ready” means more than a line in a system.",
        },
        {
          pl: "Obsługujemy Warszawę i Lotnisko Chopina. Wynajem krótkoterminowy i długoterminowy, dla klientów indywidualnych i firm, po polsku i po angielsku, przez całą dobę.",
          en: "We serve Warsaw and Chopin Airport. Short-term and long-term rental, for private customers and companies, in Polish and English — the phone is answered between {phone} and cars are handed over at any hour by arrangement.",
        },
      ],
    },
  ],
  faq: [
    {
      q: {
        pl: "Jakie marki mają u was auta premium?",
        en: "Which brands are in your premium fleet?",
      },
      a: {
        pl: "Porsche, BMW, Mercedes-Benz, Tesla i Jaguar. Pełna lista modeli, z rocznikiem, wyposażeniem, kaucją i cennikiem, jest na stronie każdego auta.",
        en: "Porsche, BMW, Mercedes-Benz, Tesla and Jaguar. The full model list, with year, equipment, deposit and rates, is on each car's page.",
      },
    },
    {
      q: {
        pl: "Czym różni się klasa premium od business?",
        en: "How does the premium class differ from business?",
      },
      a: {
        pl: "Modelem, stawką dobową i wysokością kaucji. Nie różni się ubezpieczeniem (pełne OC i AC w obu klasach), obsługą ani zasadami wynajmu.",
        en: "By model, daily rate and deposit. It does not differ in insurance (full cover in both classes), in service, or in the rental terms.",
      },
    },
    {
      q: {
        pl: "Czy mogę wynająć auto premium na jeden dzień?",
        en: "Can I rent a premium car for one day?",
      },
      a: {
        pl: "Tak, minimalny okres najmu to jedna doba. Obowiązuje wtedy stawka z progu 1–2 dni; od trzeciego dnia cena dobowa spada.",
        en: "Yes, the minimum is one day, charged at the 1–2 day rate. From the third day the daily price drops.",
      },
    },
    {
      q: {
        pl: "Ile wynosi kaucja przy aucie premium?",
        en: "How large is the deposit on a premium car?",
      },
      a: {
        pl: "Wyżej niż w klasie business, w przedziale do 6 000 zł zależnie od modelu. Kaucja jest zwrotna i rozliczana po zwrocie auta; kwotę podajemy na stronie modelu przed rezerwacją.",
        en: "Higher than in the business class, up to 6,000 zł depending on the model. It is refundable, settled after the car is returned, and stated on the model's page before you book.",
      },
    },
    {
      q: {
        pl: "Czy dowozicie auto premium pod wskazany adres?",
        en: "Do you deliver a premium car to my address?",
      },
      a: {
        pl: "Tak — pod dowolny adres w Warszawie oraz na Lotnisko Chopina. Stawki za podstawienie są w cenniku dodatków.",
        en: "Yes — to any address in Warsaw and to Chopin Airport. Delivery rates are in the add-on price list.",
      },
    },
    {
      q: {
        pl: "Czy auto premium można wynająć na firmę?",
        en: "Can a company rent a premium car?",
      },
      a: {
        pl: "Tak. Wystawiamy fakturę VAT do każdego wynajmu, także firmom zagranicznym, i akceptujemy przelew. Przy dłuższej współpracy proponujemy pakiety Business, Executive i Corporate.",
        en: "Yes. We issue a VAT invoice for every rental, including to companies registered abroad, and accept bank transfer. For longer cooperation we offer Business, Executive and Corporate packages.",
      },
    },
  ],
  ctaTitle: {
    pl: "Sprawdź, które auta premium są wolne w Twoim terminie",
    en: "See which premium cars are free on your dates",
  },
};
