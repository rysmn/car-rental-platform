import type { Landing } from "./types";

/**
 * B2B — "wynajem aut dla firm Warszawa", "samochód na firmę faktura VAT",
 * "business car rental Warsaw".
 *
 * Aimed at the person who signs the invoice rather than the person holding the
 * keys: office managers, finance, assistants booking for a board. So the copy
 * leads with settlement, invoicing and predictability, not with horsepower —
 * and it stays inside what we actually offer, which is a rental with a VAT
 * invoice, not tax advice.
 */
export const BUSINESS: Landing = {
  metaTitle: {
    pl: "Wynajem aut dla firm Warszawa | Faktura VAT",
    en: "Business Car Rental Warsaw | VAT Invoice",
  },
  metaDescription: {
    pl: "Wynajem samochodów dla firm w Warszawie — faktura VAT, płatność przelewem, auto zastępcze i wynajem długoterminowy. Pakiety Business, Executive i Corporate.",
    en: "Business car rental in Warsaw — VAT invoice, payment by transfer, replacement cars and long-term hire. Business, Executive and Corporate packages.",
  },
  eyebrow: { pl: "Dla firm", en: "For companies" },
  h1: {
    pl: "Wynajem aut dla firm w Warszawie",
    en: "Business Car Rental in Warsaw",
  },
  lead: {
    pl: "Faktura VAT do każdego wynajmu, płatność przelewem, jeden opiekun i auto podstawione pod biuro albo na lotnisko.",
    en: "A VAT invoice for every rental, payment by bank transfer, one account contact, and the car delivered to your office or the airport.",
  },
  intro: [
    {
      pl: "Firmowy wynajem auta rozbija się zwykle nie o samochód, tylko o rozliczenie: karta prywatna pracownika, paragon zamiast faktury, kaucja blokowana na osobistym rachunku i tydzień tłumaczeń w księgowości. Dlatego zaczynamy od tej strony — faktura VAT do każdego wynajmu, płatność przelewem, dane firmy w umowie, kierowca wpisany osobno.",
      en: "Company car hire usually founders not on the car but on the settlement: an employee's personal card, a receipt instead of an invoice, a deposit blocked on a private account, and a week of explaining it to finance. So we start from that end — a VAT invoice for every rental, payment by bank transfer, the company's details in the agreement, and the driver named separately.",
    },
    {
      pl: "Obsługujemy firmy w Warszawie — od jednorazowego auta na delegację, przez auto zastępcze na czas serwisu, po wynajem długoterminowy na kwartał i dłużej. Rozliczamy się również z podmiotami zarejestrowanymi poza Polską.",
      en: "We work with companies in Warsaw — from a one-off car for a business trip, through a replacement car while yours is in for service, to long-term hire by the quarter and beyond. We also settle with entities registered outside Poland.",
    },
  ],
  sections: [
    {
      heading: {
        pl: "Rozliczenie: faktura VAT i przelew",
        en: "Settlement: VAT invoice and bank transfer",
      },
      body: [
        {
          pl: "Do każdego wynajmu wystawiamy fakturę VAT na dane firmy. Płatność przelewem jest standardem, nie wyjątkiem — nie wymagamy karty kredytowej pracownika jako warunku wydania auta. Przy stałej współpracy uzgadniamy termin płatności i zbiorcze rozliczenie zamiast osobnego dokumentu do każdego najmu.",
          en: "Every rental comes with a VAT invoice made out to the company. Payment by bank transfer is the standard, not the exception — we do not require an employee's credit card as a condition of releasing the car. On ongoing arrangements we agree payment terms and consolidated billing instead of a separate document for each hire.",
        },
        {
          pl: "Zastrzeżenie, żeby było uczciwie: wystawiamy fakturę, ale nie doradzamy podatkowo. To, czy i w jakiej części odliczycie VAT oraz jak zakwalifikujecie koszt, zależy od sposobu użytkowania auta i jest decyzją Waszej księgowości, nie naszą.",
          en: "One honest caveat: we issue the invoice, but we do not give tax advice. Whether and to what extent you reclaim VAT, and how you classify the cost, depends on how the car is used and is a decision for your accountants, not for us.",
        },
      ],
    },
    {
      heading: {
        pl: "Pakiety Business, Executive i Corporate",
        en: "Business, Executive and Corporate packages",
      },
      body: [
        {
          pl: "Business — dla małych firm: stała stawka i uproszczone rozliczenie fakturą VAT. Sprawdza się tam, gdzie auto potrzebne jest kilka razy w kwartale i nikt nie chce za każdym razem negocjować od zera.",
          en: "Business — for small companies: a fixed rate and simplified VAT invoicing. It fits where a car is needed a few times a quarter and nobody wants to renegotiate from scratch each time.",
        },
        {
          pl: "Executive — dla kadry zarządzającej: auta klasy premium i priorytetowa dostępność, czyli pierwszeństwo w terminach, o które konkuruje kilka rezerwacji. Corporate — flota na dłuższy okres, indywidualne warunki i dedykowany opiekun, z którym uzgadniasz wymiany i terminy bez przechodzenia przez ogólną infolinię.",
          en: "Executive — for senior management: premium-class cars and priority availability, meaning first call on dates several bookings are competing for. Corporate — a longer-term fleet, individual terms, and a dedicated account manager you arrange swaps and dates with, without going through a general helpline.",
        },
      ],
    },
    {
      heading: {
        pl: "Auto zastępcze na czas serwisu floty",
        en: "Replacement cars while your fleet is in service",
      },
      body: [
        {
          pl: "Typowa sytuacja: auto służbowe stoi w serwisie tydzień dłużej, niż zapowiadano, a handlowiec ma umówione spotkania. Podstawiamy zastępcze pod wskazany adres — pod biuro, pod serwis albo pod dom pracownika — i odbieramy je, kiedy wraca własne. Rozliczenie po tej samej stawce co każdy inny wynajem, z fakturą VAT.",
          en: "The familiar situation: a company car is stuck in the workshop a week longer than promised and a salesperson has meetings booked. We deliver a replacement to the address you name — the office, the workshop, or the employee's home — and collect it when yours comes back. Charged at the same rates as any other rental, with a VAT invoice.",
        },
        {
          pl: "Przy krótkich zastępstwach najczęściej wybierana jest klasa business — Volvo XC60, Volkswagen Tiguan Highline i Toyota RAV4 Hybrid: rozsądna stawka, niska kaucja i niskie koszty eksploatacji.",
          en: "For short replacements the usual choice is the business class — Volvo XC60, Volkswagen Tiguan Highline and Toyota RAV4 Hybrid: a sensible rate, a low deposit and low running costs.",
        },
      ],
    },
    {
      heading: {
        pl: "Delegacje, przyloty i goście firmowi",
        en: "Business trips, arrivals and company guests",
      },
      body: [
        {
          pl: "Dla przyjeżdżających kontrahentów i pracowników z innych oddziałów podstawiamy auto na Lotnisko Chopina albo pod wskazany adres — z numerem lotu przy rezerwacji, monitorowaniem lądowania i przekazaniem w hali przylotów. Za samo opóźnienie samolotu nie doliczamy nic, co przy delegacji rozliczanej z budżetu ma znaczenie praktyczne.",
          en: "For visiting partners and staff from other offices we bring the car to Chopin Airport or to an address you name — flight number at booking, landing monitored, handover in arrivals. There is no charge for the flight delay itself, which matters when the trip is billed to a budget.",
        },
        {
          pl: "Rezerwację może złożyć asystentka albo office manager na dane firmy, a kierowcą w umowie jest osoba, która faktycznie prowadzi — wystarczy, że okaże prawo jazdy i dokument tożsamości przy odbiorze i ma ukończone {minAge} lat.{minAgeNote}",
          en: "The booking can be placed by an assistant or office manager in the company's name, while the driver in the agreement is the person actually driving — they simply present a licence and photo ID at handover and must be at least {minAge}.{minAgeNote}",
        },
      ],
    },
    {
      heading: {
        pl: "Wynajem długoterminowy zamiast powiększania floty",
        en: "Long-term hire instead of growing an owned fleet",
      },
      body: [
        {
          pl: "Od 30 dni obowiązuje stawka miesięczna z limitem 3 000 km. Serwis, przeglądy, sezonowa wymiana opon oraz pełne ubezpieczenie OC i AC zostają po naszej stronie; po Waszej zostaje paliwo lub ładowanie, opłaty drogowe i mandaty. Jedna faktura miesięcznie zamiast rozproszonych kosztów utrzymania.",
          en: "From 30 days a monthly rate applies with a 3,000 km allowance. Servicing, inspections, seasonal tyre changes and full insurance stay with us; fuel or charging, tolls and fines stay with you. One invoice a month instead of scattered running costs.",
        },
        {
          pl: "W odróżnieniu od leasingu nie ma wkładu własnego, badania zdolności ani wieloletniego zobowiązania, a auto można wymienić w trakcie umowy, jeśli zmienią się potrzeby. Nie ma też opcji wykupu — jeśli celem jest własność pojazdu, właściwym produktem jest leasing, i mówimy to wprost.",
          en: "Unlike a lease there is no down payment, no credit assessment and no multi-year commitment, and the car can be swapped mid-agreement if needs change. There is also no purchase option — if ownership is the goal, a lease is the right product, and we say so plainly.",
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
          pl: "A&A Corporation to warszawska wypożyczalnia samochodów premium z flotą {fleetCount} aut — od klasy business po limuzyny i SUV-y premium, z {electricCount} modelami w pełni elektrycznymi i dziewięcioosobowym busem. Obsługujemy Warszawę i Lotnisko Chopina, po polsku i po angielsku.",
          en: "A&A Corporation is a Warsaw premium car hire company with a fleet of {fleetCount} cars — from the business class up to executive saloons and premium SUVs, including {electricCount} fully electric models and a nine-seat van. We serve Warsaw and Chopin Airport, in Polish and English — the phone is answered between {phone} and cars are handed over at any hour by arrangement.",
        },
        {
          pl: "Mała flota to dla klienta firmowego konkretna korzyść: rozmawiasz z osobą, która zna Twoją rezerwację i wie, którym egzemplarzem jeździ Twój pracownik, zamiast opisywać sprawę od nowa przy każdym telefonie.",
          en: "For a corporate customer a small fleet has a concrete upside: you talk to somebody who knows your booking and knows which specific car your employee is driving, instead of describing the situation from scratch on every call.",
        },
      ],
    },
  ],
  faq: [
    {
      q: {
        pl: "Czy wystawiacie fakturę VAT na firmę?",
        en: "Do you issue a VAT invoice to a company?",
      },
      a: {
        pl: "Tak, do każdego wynajmu, również dla firm zarejestrowanych poza Polską. Płatność przelewem jest standardem; nie wymagamy karty kredytowej pracownika.",
        en: "Yes, for every rental, including companies registered outside Poland. Payment by bank transfer is standard; we do not require an employee's credit card.",
      },
    },
    {
      q: {
        pl: "Czy mogę odliczyć VAT od wynajmu?",
        en: "Can I reclaim the VAT on the rental?",
      },
      a: {
        pl: "To zależy od sposobu użytkowania auta i jest decyzją Waszej księgowości — wystawiamy fakturę VAT, ale nie prowadzimy doradztwa podatkowego i nie będziemy udawać, że jest inaczej.",
        en: "That depends on how the car is used and is a decision for your accountants — we issue the VAT invoice, but we do not provide tax advice and will not pretend otherwise.",
      },
    },
    {
      q: {
        pl: "Czy rezerwację może złożyć asystentka na dane firmy?",
        en: "Can an assistant book in the company's name?",
      },
      a: {
        pl: "Tak. Rezerwację i fakturę wystawiamy na firmę, a kierowcą w umowie jest osoba, która faktycznie prowadzi — okazuje prawo jazdy i dokument tożsamości przy odbiorze auta.",
        en: "Yes. The booking and the invoice go to the company, while the driver in the agreement is the person actually driving — presenting a licence and photo ID at handover.",
      },
    },
    {
      q: {
        pl: "Czy macie auta zastępcze na czas serwisu?",
        en: "Do you provide replacement cars during servicing?",
      },
      a: {
        pl: "Tak. Podstawiamy auto pod wskazany adres — biuro, serwis albo dom pracownika — i odbieramy je, kiedy wraca Wasze. Rozliczenie na tych samych zasadach co każdy inny wynajem.",
        en: "Yes. We deliver to the address you name — office, workshop or employee's home — and collect it when yours returns. Charged on the same terms as any other rental.",
      },
    },
    {
      q: {
        pl: "Czym pakiety firmowe różnią się od zwykłego wynajmu?",
        en: "How do the company packages differ from a normal rental?",
      },
      a: {
        pl: "Stałą stawką, uproszczonym rozliczeniem, priorytetową dostępnością w pakiecie Executive i dedykowanym opiekunem w pakiecie Corporate. Warunki wynajmu, ubezpieczenie i stan aut są identyczne.",
        en: "By a fixed rate, simplified billing, priority availability on Executive, and a dedicated account manager on Corporate. The rental terms, the insurance and the condition of the cars are identical.",
      },
    },
    {
      q: {
        pl: "Czy obsługujecie firmy spoza Warszawy?",
        en: "Do you work with companies outside Warsaw?",
      },
      a: {
        pl: "Tak — siedziba firmy może być dowolna, rozliczamy się także z podmiotami zarejestrowanymi poza Polską. Wydanie i zwrot auta prowadzimy dziś w Warszawie: w biurze, na Lotnisku Chopina albo pod wskazanym adresem w Warszawie.",
        en: "Yes — your company can be registered anywhere, and we settle with entities registered outside Poland too. Handover and return currently take place in Warsaw: at our office, at Chopin Airport, or at an address you name in Warsaw.",
      },
    },
  ],
  ctaTitle: {
    pl: "Zapytaj o warunki dla swojej firmy",
    en: "Ask about terms for your company",
  },
};
