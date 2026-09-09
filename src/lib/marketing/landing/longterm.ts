import type { Landing } from "./types";

/**
 * Long-term rental — "wynajem długoterminowy aut Warszawa", "wynajem
 * abonamentowy", "alternatywa dla leasingu", "long term car rental Warsaw".
 *
 * The highest customer value on the site: one signature covers months rather
 * than days. The copy's whole job is the leasing comparison, because that is
 * the decision the visitor is actually making — and it stays scrupulous about
 * what we do NOT offer (no purchase option, no ownership, no fixed multi-year
 * rate), since a long-term customer discovers an overstatement eventually.
 */
export const LONGTERM: Landing = {
  metaTitle: {
    pl: "Wynajem długoterminowy aut Warszawa | Abonament",
    en: "Long-Term Car Rental Warsaw | Monthly Hire",
  },
  metaDescription: {
    pl: "Wynajem długoterminowy aut w Warszawie od 30 dni — stawka miesięczna, 3 000 km, serwis i ubezpieczenie po naszej stronie. Bez wkładu własnego i bez leasingu.",
    en: "Long-term car rental in Warsaw from 30 days — a monthly rate, 3,000 km, servicing and insurance on us. No down payment and no lease agreement.",
  },
  eyebrow: { pl: "Wynajem długoterminowy", en: "Long-term rental" },
  h1: {
    pl: "Wynajem długoterminowy aut w Warszawie",
    en: "Long-Term Car Rental in Warsaw",
  },
  lead: {
    pl: "Od 30 dni obowiązuje stawka miesięczna z limitem 3 000 km. Bez wkładu własnego, bez wieloletniej umowy i bez zdolności leasingowej.",
    en: "From 30 days a monthly rate applies, with a 3,000 km allowance. No down payment, no multi-year contract and no lease approval to pass.",
  },
  intro: [
    {
      pl: "Wynajem długoterminowy to rozwiązanie dla kogoś, kto potrzebuje auta na kwartał, na pół roku albo na czas kontraktu — i nie chce w zamian podpisywać zobowiązania na trzy lata. Płacisz jedną stawkę miesięczną, dostajesz jedną fakturę VAT, a serwis, ubezpieczenie i przeglądy zostają po naszej stronie.",
      en: "Long-term rental is for somebody who needs a car for a quarter, for half a year, or for the length of a contract — and does not want to sign a three-year commitment in exchange. You pay one monthly rate, get one VAT invoice, and servicing, insurance and inspections stay with us.",
    },
    {
      pl: "W praktyce najczęściej wybierają je firmy, które nie chcą powiększać floty na własność, oraz osoby, które przyjechały do Warszawy na dłużej i nie zamierzają kupować auta na kilka miesięcy. Umowa jest krótsza i prostsza od leasingowej, a wyjście z niej nie wymaga cesji.",
      en: "In practice it is chosen mostly by companies that would rather not grow an owned fleet, and by people who came to Warsaw for a longer stretch and have no intention of buying a car for a few months. The agreement is shorter and simpler than a lease, and getting out of it does not require an assignment to a third party.",
    },
  ],
  sections: [
    {
      heading: {
        pl: "Co dokładnie zawiera stawka miesięczna",
        en: "What the monthly rate actually covers",
      },
      body: [
        {
          pl: "Auto, pełne ubezpieczenie OC i AC, serwis i przeglądy okresowe, wymianę opon zgodnie z sezonem oraz limit 3 000 km miesięcznie. Do tego obsługa pod jednym numerem w godzinach {phone} i faktura VAT raz w miesiącu. Nie doliczamy opłaty za „pakiet ubezpieczeniowy” ani za podstawową ochronę — to nie są dodatki, tylko warunek jazdy.",
          en: "The car, full third-party and comprehensive insurance, servicing and scheduled inspections, seasonal tyre changes, and a 3,000 km monthly allowance. Plus support on one number between {phone} and a VAT invoice once a month. There is no “insurance package” fee and no charge for basic cover — those are not add-ons, they are the condition of driving at all.",
        },
        {
          pl: "Poza stawką zostają rzeczy, których nie da się przewidzieć za Ciebie: paliwo lub ładowanie, opłaty parkingowe i drogowe, mandaty oraz nadprzebieg powyżej limitu. Kaucja obowiązuje tak jak przy krótkim najmie i jest zwrotna.",
          en: "Outside the rate stay the things nobody can predict for you: fuel or charging, parking and road tolls, fines, and mileage beyond the allowance. A deposit applies as on a short hire, and is refundable.",
        },
      ],
    },
    {
      heading: {
        pl: "Wynajem długoterminowy a leasing — czym się różnią",
        en: "Long-term rental versus leasing",
      },
      body: [
        {
          pl: "Leasing to finansowanie: wkład własny, wieloletnia umowa, badanie zdolności, wartość wykupu na końcu i zwykle Twoja odpowiedzialność za serwis. Wynajem długoterminowy to usługa: płacisz za dostępność auta w danym miesiącu i oddajesz je, kiedy przestaje być potrzebne. Nic nie wykupujesz, bo nic nie kupujesz.",
          en: "A lease is financing: a down payment, a multi-year contract, a credit assessment, a residual value at the end, and usually servicing on your side. Long-term rental is a service: you pay for having the car available this month and hand it back when it stops being needed. There is nothing to buy out, because you are not buying.",
        },
        {
          pl: "Kiedy leasing wygrywa: gdy auto ma zostać u Ciebie na lata i chcesz je docelowo wykupić. Kiedy wygrywa wynajem: gdy horyzont jest krótszy niż dwa lata, gdy potrzeby mogą się zmienić, gdy firma jest nowa i nie ma jeszcze historii kredytowej, albo gdy nie chcesz obciążać bilansu. Mówimy o tym wprost, bo klient, którego przekonaliśmy do złego produktu, wraca z pretensją, a nie po kolejne auto.",
          en: "When leasing wins: when the car is to stay with you for years and you want to own it in the end. When rental wins: when the horizon is under two years, when needs may change, when the company is new and has no credit history yet, or when you would rather not put it on the balance sheet. We say this plainly, because a customer talked into the wrong product comes back with a complaint, not for a second car.",
        },
      ],
    },
    {
      heading: {
        pl: "Limit kilometrów i co się dzieje po jego przekroczeniu",
        en: "The mileage allowance, and what happens past it",
      },
      body: [
        {
          pl: "Standardowy limit przy najmie miesięcznym to 3 000 km na miesiąc — w praktyce wystarcza na codzienne dojazdy po Warszawie i okolicach plus kilka wyjazdów. Jeśli wiesz, że jeździsz więcej, powiedz o tym przed podpisaniem umowy: ustalimy wyższy limit w stawce, zamiast rozliczać nadprzebieg co miesiąc.",
          en: "The standard allowance on a monthly hire is 3,000 km — in practice enough for daily driving around Warsaw and the region plus a few longer trips. If you know you drive more, say so before signing: we will build a higher allowance into the rate rather than settling excess kilometres every month.",
        },
        {
          pl: "Dopłata za nadprzebieg zależy od modelu i jest podana w umowie, nie odkrywana przy zwrocie. Przy dłuższej współpracy limit liczymy narastająco, więc jeden intensywny miesiąc nie generuje dopłaty, jeśli następny był spokojniejszy.",
          en: "The excess-mileage charge depends on the model and is stated in the agreement, not discovered at handback. On longer arrangements the allowance is counted cumulatively, so one heavy month costs nothing extra if the next one is quieter.",
        },
      ],
    },
    {
      heading: {
        pl: "Które auta bierze się na dłużej",
        en: "Which cars go out on long hires",
      },
      body: [
        {
          pl: "Najczęściej klasa business — Volvo XC60, Volkswagen Tiguan Highline i Toyota RAV4 Hybrid. Rozsądna stawka miesięczna, niska kaucja, niskie koszty eksploatacji i nadwozie, które sprawdza się i w mieście, i na trasie. To typowy wybór na auto dla pracownika albo na czas rozbudowy floty.",
          en: "Most often the business class — Volvo XC60, Volkswagen Tiguan Highline and Toyota RAV4 Hybrid. A sensible monthly rate, a low deposit, low running costs, and a body style that works both in the city and on the motorway. The usual choice for an employee car or for bridging a fleet expansion.",
        },
        {
          pl: "Dla kadry zarządzającej częściej BMW 740d xDrive, Porsche Panamera albo Mercedes GLE. Dla firm, którym zależy na kosztach paliwa i wizerunku, sensowna bywa Tesla Model S lub Model X — przy 3 000 km miesięcznie różnica między ładowaniem a tankowaniem robi się widoczna w budżecie.",
          en: "For senior management, more often the BMW 740d xDrive, the Porsche Panamera or the Mercedes GLE. For companies weighing fuel cost against image, a Tesla Model S or Model X can make sense — at 3,000 km a month the gap between charging and refuelling becomes visible in the budget.",
        },
      ],
    },
    {
      heading: {
        pl: "Pakiety dla firm: Business, Executive, Corporate",
        en: "Company packages: Business, Executive, Corporate",
      },
      body: [
        {
          pl: "Business — dla małych firm: stała stawka i uproszczone rozliczenie fakturą VAT. Executive — dla kadry zarządzającej: auta klasy premium i priorytetowa dostępność. Corporate — flota na dłuższy okres, indywidualne warunki i dedykowany opiekun, z którym uzgadniasz wymiany aut i terminy bez przechodzenia przez ogólną infolinię.",
          en: "Business — for small companies: a fixed rate and simplified VAT invoicing. Executive — for senior management: premium-class cars and priority availability. Corporate — a longer-term fleet, individual terms, and a dedicated account manager you arrange swaps and dates with, without going through a general helpline.",
        },
        {
          pl: "Auto można wymienić w trakcie umowy, jeśli zmienią się potrzeby — inaczej niż w leasingu, gdzie zmiana pojazdu zwykle oznacza cesję albo zerwanie umowy. Rozliczamy się przelewem na fakturę VAT, również z firmami zarejestrowanymi poza Polską.",
          en: "The car can be swapped mid-agreement if needs change — unlike a lease, where changing vehicle usually means an assignment or breaking the contract. We settle by bank transfer against a VAT invoice, including with companies registered outside Poland.",
        },
      ],
    },
    {
      heading: {
        pl: "Jak zacząć i czego potrzebujesz",
        en: "How to start, and what you need",
      },
      body: [
        {
          pl: "Napisz albo zadzwoń z trzema informacjami: na jak długo, ile kilometrów miesięcznie i jaka klasa auta. Odsyłamy stawkę miesięczną, wysokość kaucji i warunki — bez wypełniania wniosku i bez sprawdzania zdolności kredytowej. Auto podstawiamy pod wskazany adres w Warszawie, tak samo jak przy najmie na dobę.",
          en: "Write or call with three things: how long, how many kilometres a month, and which class of car. We come back with the monthly rate, the deposit and the terms — no application form and no credit check. The car is delivered to your address in Warsaw exactly as on a one-day hire.",
        },
        {
          pl: "Wymagania są te same co przy krótkim najmie: ukończone {minAge} lat, ważne prawo jazdy i dokument tożsamości.{minAgeNote} Dla firm — dane do faktury; NIP wystarczy, nie potrzebujemy sprawozdań finansowych.",
          en: "The requirements match a short hire: at least {minAge} years old, a valid driving licence and photo ID.{minAgeNote} For companies — invoicing details; a tax number is enough, we do not ask for financial statements.",
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
          pl: "Jesteśmy warszawską wypożyczalnią samochodów premium obsługującą Warszawę i Lotnisko Chopina. Flota jest niewielka i celowo taka pozostaje, co przy wynajmie długoterminowym ma konkretny skutek: auto, które dostajesz na pół roku, znamy z historii serwisowej, a nie z numeru w systemie.",
          en: "We are a Warsaw premium car hire company serving Warsaw and Chopin Airport. The fleet is small and deliberately stays that way, which on a long-term hire has a concrete consequence: the car you get for six months is one we know by service history, not by a number in a system.",
        },
      ],
    },
  ],
  faq: [
    {
      q: {
        pl: "Od ilu dni zaczyna się wynajem długoterminowy?",
        en: "From how many days does long-term rental start?",
      },
      a: {
        pl: "Od 30 dni — wtedy obowiązuje stawka miesięczna z limitem 3 000 km. Krótsze okresy rozliczamy według progów dobowych: 14–29 dni, 7–13 dni i tak dalej.",
        en: "From 30 days, when the monthly rate with a 3,000 km allowance applies. Shorter periods are charged from the daily bands: 14–29 days, 7–13 days and so on.",
      },
    },
    {
      q: {
        pl: "Czy potrzebna jest zdolność leasingowa albo wkład własny?",
        en: "Do I need lease approval or a down payment?",
      },
      a: {
        pl: "Nie. To najem, nie finansowanie — nie ma wniosku, badania zdolności ani wkładu własnego. Obowiązuje zwrotna kaucja, tak jak przy każdym innym wynajmie.",
        en: "No. This is a rental, not financing — there is no application, no credit assessment and no down payment. A refundable deposit applies, as on any other hire.",
      },
    },
    {
      q: {
        pl: "Czy mogę wykupić auto po zakończeniu umowy?",
        en: "Can I buy the car when the agreement ends?",
      },
      a: {
        pl: "Nie — wynajem długoterminowy nie zawiera opcji wykupu. Jeśli celem jest własność pojazdu, właściwym produktem jest leasing lub kredyt, nie najem.",
        en: "No — long-term rental carries no purchase option. If ownership is the goal, the right product is a lease or a loan, not a rental.",
      },
    },
    {
      q: {
        pl: "Kto płaci za serwis, przeglądy i opony?",
        en: "Who pays for servicing, inspections and tyres?",
      },
      a: {
        pl: "My. Serwis, przeglądy okresowe, wymiana opon zgodnie z sezonem i ubezpieczenie OC oraz AC są w stawce miesięcznej. Po Twojej stronie zostaje paliwo lub ładowanie, opłaty drogowe i parkingowe oraz mandaty.",
        en: "We do. Servicing, scheduled inspections, seasonal tyre changes and full insurance are in the monthly rate. Fuel or charging, tolls, parking and fines stay on your side.",
      },
    },
    {
      q: {
        pl: "Czy mogę wymienić auto w trakcie trwania umowy?",
        en: "Can I swap the car during the agreement?",
      },
      a: {
        pl: "Tak, przy dłuższej współpracy jest to standardowa możliwość — uzgadniamy termin i model. To jedna z głównych różnic wobec leasingu, gdzie zmiana pojazdu zwykle wymaga cesji.",
        en: "Yes; on longer arrangements it is a standard option — we agree the timing and the model. It is one of the main differences from a lease, where changing the vehicle usually requires an assignment.",
      },
    },
    {
      q: {
        pl: "Czy wystawiacie fakturę VAT co miesiąc?",
        en: "Do you issue a monthly VAT invoice?",
      },
      a: {
        pl: "Tak, jedna faktura VAT miesięcznie, płatna przelewem. Obsługujemy również firmy zarejestrowane poza Polską.",
        en: "Yes, one VAT invoice a month, payable by bank transfer. We also work with companies registered outside Poland.",
      },
    },
  ],
  ctaTitle: {
    pl: "Zapytaj o stawkę miesięczną dla wybranego auta",
    en: "Ask for a monthly rate on the car you need",
  },
};
