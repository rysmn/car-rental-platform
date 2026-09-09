import type { Landing } from "./types";

/**
 * Gdańsk and the Tri-City — the second operating market.
 *
 * Deliberately does NOT claim a branch, a desk or a depot in Gdańsk: what we
 * actually do is deliver and collect there. Wording that implies a local office
 * would be the one thing on this page a customer could catch us out on, and the
 * whole point of a landing page is to be the version of the truth that ranks.
 *
 * There is also no Gdańsk figure in `EXTRAS`, so no delivery price is quoted
 * here — the copy says it is quoted per distance, which is what happens.
 */
export const GDANSK: Landing = {
  metaTitle: {
    pl: "Wynajem aut Gdańsk | Trójmiasto i lotnisko",
    en: "Car Rental Gdańsk | Tri-City & GDN Airport",
  },
  metaDescription: {
    pl: "Wynajem aut w Gdańsku i Trójmieście — auta premium i SUV-y z dostawą pod adres, hotel i na lotnisko GDN. Faktura VAT, odbiór 24/7 po uzgodnieniu.",
    en: "Car rental in Gdańsk and the Tri-City — premium cars and SUVs delivered to your address, hotel or GDN airport. VAT invoice, 24/7 pickup by arrangement.",
  },
  eyebrow: { pl: "Gdańsk i Trójmiasto", en: "Gdańsk & the Tri-City" },
  h1: {
    pl: "Wynajem aut w Gdańsku",
    en: "Car Rental in Gdańsk",
  },
  lead: {
    pl: "Samochody premium i SUV-y z dostawą w Gdańsku, Sopocie i Gdyni — pod wskazany adres, pod hotel albo na lotnisko im. Lecha Wałęsy.",
    en: "Premium cars and SUVs delivered across Gdańsk, Sopot and Gdynia — to your address, your hotel, or Lech Wałęsa Airport.",
  },
  intro: [
    {
      pl: "Gdańsk jest naszym drugim rynkiem obok Warszawy. Nie prowadzimy tu okienka w hali przylotów ani parkingu, na który trzeba dojechać taksówką — auto podstawiamy tam, gdzie jesteś: pod hotel na Starówce, pod adres w Sopocie, pod biuro w Oliwie albo bezpośrednio na lotnisko w Rębiechowie.",
      en: "Gdańsk is our second market alongside Warsaw. There is no desk in the arrivals hall and no car park you have to reach by taxi — we bring the car to where you are: your hotel in the Old Town, an address in Sopot, an office in Oliwa, or straight to the airport at Rębiechowo.",
    },
    {
      pl: "Ta sama flota, te same warunki i ten sam cennik co w Warszawie: pełne ubezpieczenie OC i AC, faktura VAT do każdego wynajmu, obsługa po polsku i po angielsku w godzinach {phone}. Różni się wyłącznie opłata za podstawienie, którą wyceniamy według odległości.",
      en: "The same fleet, the same terms and the same price list as in Warsaw: full third-party and comprehensive insurance, a VAT invoice for every rental, and support in Polish and English between {phone}. Only the delivery fee differs, quoted according to distance.",
    },
  ],
  sections: [
    {
      heading: {
        pl: "Dostawa auta w Gdańsku, Sopocie i Gdyni",
        en: "Delivery in Gdańsk, Sopot and Gdynia",
      },
      body: [
        {
          pl: "Podstawiamy samochód pod wskazany adres w całym Trójmieście — Gdańsk Śródmieście i Główne Miasto, Wrzeszcz, Oliwa, Przymorze i Jelitkowo, Sopot z Monte Cassino, Gdynia Śródmieście i Orłowo. Zwrot ustalamy tak samo: w tym samym miejscu, pod innym adresem w Trójmieście albo w Warszawie.",
          en: "We deliver to an address anywhere in the Tri-City — Gdańsk city centre and the Main Town, Wrzeszcz, Oliwa, Przymorze and Jelitkowo, Sopot with Monte Cassino, Gdynia centre and Orłowo. The return is arranged the same way: at the same spot, at another Tri-City address, or back in Warsaw.",
        },
        {
          pl: "Opłatę za podstawienie w Trójmieście wyceniamy indywidualnie, według odległości i terminu — podajemy ją przed rezerwacją, razem ze stawką dobową i kaucją, a nie po odbiorze auta. Napisz albo zadzwoń z datami, a odeślemy komplet kwot.",
          en: "The Tri-City delivery fee is quoted individually, by distance and by date — you get it before you book, together with the daily rate and the deposit, not after the car is handed over. Send us your dates by phone or e-mail and we will come back with the full set of figures.",
        },
      ],
    },
    {
      heading: {
        pl: "Odbiór na lotnisku w Gdańsku (GDN)",
        en: "Pickup at Gdańsk Airport (GDN)",
      },
      body: [
        {
          pl: "Port Lotniczy Gdańsk im. Lecha Wałęsy obsługujemy tak samo jak Lotnisko Chopina: podajesz numer lotu przy rezerwacji, my sprawdzamy rzeczywistą godzinę lądowania i podstawiamy auto na przylot. Opóźniony samolot nie kosztuje ani złotówki więcej — przesuwamy przekazanie razem z lotem.",
          en: "We work Gdańsk Lech Wałęsa Airport exactly as we work Chopin: you give us the flight number when booking, we check the real landing time, and the car meets your arrival. A delayed plane costs nothing extra — the handover moves with the flight.",
        },
        {
          pl: "Formalności odbywają się na miejscu i zajmują kilkanaście minut: dokumenty, umowa, protokół stanu pojazdu, kaucja i kluczyki. Odbiór lub zwrot poza standardowymi godzinami pracy jest objęty stałą dopłatą z cennika dodatków — mówimy o niej przy rezerwacji.",
          en: "The paperwork happens on the spot and takes about fifteen minutes: documents, the agreement, the condition report, the deposit and the keys. Collection or return outside standard business hours carries a fixed supplement from the add-on price list, and we tell you about it when you book.",
        },
      ],
    },
    {
      heading: {
        pl: "Trasa Warszawa–Gdańsk i wynajem na wyjazd nad morze",
        en: "The Warsaw–Gdańsk route and trips to the coast",
      },
      body: [
        {
          pl: "Warszawa i Gdańsk dzieli około 340 km, czyli trochę więcej niż dobowy limit 300 km. Jeśli planujesz przejazd w jedną stronę albo objazd po Kaszubach i Półwyspie Helskim, powiedz o tym przy rezerwacji — ustalimy limit kilometrów pod konkretną trasę, zamiast rozliczać nadprzebieg po powrocie.",
          en: "Warsaw and Gdańsk are about 340 km apart — slightly more than the 300 km daily allowance. If you are planning a one-way run, or a loop around Kashubia and the Hel Peninsula, say so when you book: we will set the mileage allowance around the actual route rather than billing excess kilometres afterwards.",
        },
        {
          pl: "Odbiór auta w Warszawie i zwrot w Gdańsku (albo odwrotnie) jest możliwy i wyceniany indywidualnie. To częsty scenariusz latem i przy wyjazdach służbowych, w których powrót odbywa się pociągiem lub samolotem.",
          en: "Collecting in Warsaw and returning in Gdańsk — or the other way round — is possible and quoted individually. It is a common arrangement in summer, and on business trips where the return leg is by train or plane.",
        },
      ],
    },
    {
      heading: {
        pl: "Jakie auta możesz wynająć w Gdańsku",
        en: "Which cars you can rent in Gdańsk",
      },
      body: [
        {
          pl: "Do Trójmiasta podstawiamy tę samą flotę co w Warszawie: SUV-y premium (Mercedes GLE, Tesla Model X, Jaguar I-PACE), limuzyny klasy executive (Porsche Panamera, BMW 740d, Tesla Model S), auta business (Volvo XC60, Volkswagen Tiguan, Toyota RAV4 Hybrid) oraz dziewięcioosobowego busa Renault Trafic na wyjazdy grupowe i konferencje.",
          en: "The Tri-City gets the same fleet as Warsaw: premium SUVs (Mercedes GLE, Tesla Model X, Jaguar I-PACE), executive saloons (Porsche Panamera, BMW 740d, Tesla Model S), business cars (Volvo XC60, Volkswagen Tiguan, Toyota RAV4 Hybrid) and a nine-seat Renault Trafic for groups and conferences.",
        },
        {
          pl: "Dostępność w konkretnym terminie sprawdzisz filtrem dat we flocie. Jeśli auto ma trafić nad morze w szczycie sezonu, warto zapytać z wyprzedzeniem — latem Trójmiasto rezerwuje się szybciej niż Warszawa.",
          en: "Availability for specific dates is shown by the date filter on the fleet page. If the car is heading to the coast in high season it is worth asking early — in summer the Tri-City books out faster than Warsaw.",
        },
      ],
    },
    {
      heading: {
        pl: "Wynajem długoterminowy i dla firm w Trójmieście",
        en: "Long-term and business rental in the Tri-City",
      },
      body: [
        {
          pl: "Od 30 dni obowiązuje stawka miesięczna z limitem 3 000 km. Dla firm z Gdańska, Sopotu i Gdyni to alternatywa dla leasingu bez wkładu własnego i wieloletniego zobowiązania: serwis, ubezpieczenie i przeglądy zostają po naszej stronie, a Ty dostajesz jedną fakturę VAT miesięcznie.",
          en: "From 30 days the monthly rate applies, with a 3,000 km allowance. For companies in Gdańsk, Sopot and Gdynia it is an alternative to leasing with no down payment and no multi-year commitment: servicing, insurance and inspections stay with us, and you get one VAT invoice a month.",
        },
        {
          pl: "Prowadzimy pakiety Business, Executive i Corporate — z indywidualnymi warunkami, dedykowanym opiekunem i możliwością wymiany auta w trakcie umowy.",
          en: "We run Business, Executive and Corporate packages — individual terms, a dedicated account manager, and the option to swap the car during the contract.",
        },
      ],
    },
    {
      heading: {
        pl: "O A&A Corporation w Gdańsku",
        en: "About A&A Corporation in Gdańsk",
      },
      body: [
        {
          pl: "A&A Corporation to wypożyczalnia samochodów premium działająca w Warszawie i w Gdańsku. Trójmiasto obsługujemy modelem dostawczym: nie utrzymujemy tu biura ani stanowiska na lotnisku, tylko dowozimy auto pod wskazany adres i odbieramy je z powrotem. Dla klienta oznacza to mniej dojazdów, dla nas — mniej kosztów, których nie musimy doliczać do stawki dobowej.",
          en: "A&A Corporation is a premium car hire company operating in Warsaw and Gdańsk. We serve the Tri-City on a delivery model: no office here, no airport desk — we bring the car to the address you give us and collect it afterwards. For the customer that means fewer journeys; for us, fewer overheads to build into the daily rate.",
        },
        {
          pl: "Klienci wynajmują u nas auta w Gdańsku na wesela i sesje zdjęciowe nad morzem, na konferencje i targi w AmberExpo, na urlop z rodziną, na transfery gości hotelowych i na dłuższe delegacje. Rezerwacja odbywa się przez stronę albo telefonicznie — po polsku i po angielsku.",
          en: "Customers rent from us in Gdańsk for weddings and seaside photo shoots, for conferences and trade fairs at AmberExpo, for family holidays, for hotel guest transfers, and for longer secondments. Booking happens on the site or by phone — in Polish or in English.",
        },
      ],
    },
  ],
  faq: [
    {
      q: {
        pl: "Czy macie biuro w Gdańsku?",
        en: "Do you have an office in Gdańsk?",
      },
      a: {
        pl: "Nie — i celowo. Obsługujemy Trójmiasto z dostawą: podstawiamy auto pod wskazany adres, pod hotel albo na lotnisko w Gdańsku i tam je odbieramy. Nie musisz nigdzie dojeżdżać, żeby odebrać kluczyki.",
        en: "No — by design. We serve the Tri-City by delivery: we bring the car to the address you give us, to your hotel or to Gdańsk airport, and collect it there. You do not have to travel anywhere to pick up the keys.",
      },
    },
    {
      q: {
        pl: "Ile kosztuje podstawienie auta w Gdańsku?",
        en: "How much does delivery in Gdańsk cost?",
      },
      a: {
        pl: "Wyceniamy je indywidualnie, według odległości i terminu — inaczej niż podstawienie w Warszawie i na Lotnisku Chopina, które mają stałe stawki w cenniku dodatków. Kwotę podajemy przed rezerwacją, razem ze stawką dobową i kaucją.",
        en: "It is quoted individually, by distance and date — unlike delivery in Warsaw and to Chopin Airport, which have fixed rates in the add-on price list. You get the figure before you book, together with the daily rate and the deposit.",
      },
    },
    {
      q: {
        pl: "Czy mogę odebrać auto na lotnisku w Gdańsku?",
        en: "Can I collect the car at Gdańsk airport?",
      },
      a: {
        pl: "Tak. Podajesz numer lotu przy rezerwacji, my monitorujemy godzinę lądowania i podstawiamy auto na przylot — również przy opóźnieniu, bez dodatkowej opłaty za samo opóźnienie.",
        en: "Yes. Give us the flight number when booking; we track the landing time and bring the car to your arrival — including when the flight is late, with no extra charge for the delay itself.",
      },
    },
    {
      q: {
        pl: "Czy mogę wynająć auto w Warszawie i zwrócić w Gdańsku?",
        en: "Can I rent in Warsaw and return in Gdańsk?",
      },
      a: {
        pl: "Tak, w obie strony. Taki wynajem wyceniamy indywidualnie i ustalamy przy rezerwacji — razem z limitem kilometrów dopasowanym do trasy.",
        en: "Yes, in both directions. That kind of rental is quoted individually and agreed when you book, along with a mileage allowance matched to the route.",
      },
    },
    {
      q: {
        pl: "Czy warunki w Gdańsku różnią się od warszawskich?",
        en: "Do the terms in Gdańsk differ from Warsaw?",
      },
      a: {
        pl: "Nie. Ta sama flota, ten sam cennik dobowy, ta sama kaucja (od 2 000 zł do 6 000 zł zależnie od modelu), ten sam limit kilometrów i to samo pełne ubezpieczenie OC i AC. Różni się wyłącznie opłata za podstawienie.",
        en: "No. The same fleet, the same daily rates, the same deposit (2,000 zł to 6,000 zł depending on the model), the same mileage allowance and the same full insurance cover. Only the delivery fee is different.",
      },
    },
    {
      q: {
        pl: "Jak daleko poza Trójmiasto mogę pojechać?",
        en: "How far outside the Tri-City can I drive?",
      },
      a: {
        pl: "Bez ograniczeń terytorialnych na terenie Polski; liczy się limit kilometrów — 300 km na dobę do 6 dni i 250 km na dobę od 7 dni. Wyjazd za granicę zgłoś przed rezerwacją, potwierdzamy go osobno.",
        en: "There is no territorial limit within Poland; what counts is the mileage allowance — 300 km per day up to 6 days, 250 km per day from 7 days. Tell us before booking if you plan to drive abroad, as that is confirmed separately.",
      },
    },
  ],
  ctaTitle: {
    pl: "Sprawdź dostępność auta w Gdańsku i Trójmieście",
    en: "Check car availability in Gdańsk and the Tri-City",
  },
};
