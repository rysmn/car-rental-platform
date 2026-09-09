import type { Landing } from "./types";

/**
 * Warsaw Chopin Airport — the highest commercial intent query the site can
 * plausibly win: somebody searching it already has a flight booked.
 */
export const AIRPORT: Landing = {
  metaTitle: {
    pl: "Wynajem aut — Lotnisko Chopina Warszawa",
    en: "Car Rental Warsaw Chopin Airport",
  },
  metaDescription: {
    pl: "Wynajem auta z odbiorem na Lotnisku Chopina w Warszawie. Monitorujemy lot i podstawiamy auto na przylot — odbiór 24/7 po uzgodnieniu, także przy opóźnieniach.",
    en: "Rent a car with pickup at Warsaw Chopin Airport. We track your flight and meet you at arrivals — 24/7 pickup by arrangement, late arrivals included.",
  },
  eyebrow: { pl: "Lotnisko Chopina", en: "Chopin Airport" },
  h1: {
    pl: "Wynajem aut na Lotnisku Chopina",
    en: "Car Rental at Warsaw Chopin Airport",
  },
  lead: {
    pl: "Podstawiamy auto na przylot, monitorujemy numer lotu i czekamy również wtedy, gdy samolot się spóźni.",
    en: "We bring the car to your arrival, track your flight number, and wait even when the plane is late.",
  },
  intro: [
    {
      pl: "Lotnisko Chopina to najczęstszy punkt odbioru w naszej flocie. Podajesz numer lotu przy rezerwacji, a my pilnujemy godziny lądowania — jeśli samolot przyleci wcześniej albo z opóźnieniem, auto i tak czeka o właściwej porze. Nie musisz dzwonić z płyty lotniska i tłumaczyć, że się spóźnisz.",
      en: "Chopin Airport is the most common pickup point in our fleet. You give us your flight number when booking and we watch the landing time — if the plane is early or late, the car is still there at the right moment. You do not have to phone from the tarmac to explain that you are delayed.",
    },
    {
      pl: "Formalności załatwiamy na miejscu: sprawdzenie dokumentów, podpisanie umowy, protokół zdawczo-odbiorczy i kluczyki. W praktyce zajmuje to kilkanaście minut od spotkania w hali przylotów do wyjazdu z parkingu.",
      en: "The paperwork happens on the spot: document check, the agreement, the handover protocol and the keys. In practice it takes about fifteen minutes from meeting in the arrivals hall to driving off.",
    },
  ],
  steps: {
    heading: {
      pl: "Jak wygląda odbiór auta na lotnisku",
      en: "How airport pickup works",
    },
    items: [
      {
        title: {
          pl: "Rezerwacja z numerem lotu",
          en: "Book and give us your flight number",
        },
        desc: {
          pl: "Wybierasz auto i daty, jako miejsce odbioru wskazujesz Lotnisko Chopina i podajesz numer lotu.",
          en: "Pick the car and the dates, choose Chopin Airport as the pickup point and add your flight number.",
        },
      },
      {
        title: { pl: "Monitorujemy lot", en: "We monitor the flight" },
        desc: {
          pl: "Sprawdzamy rzeczywistą godzinę lądowania i dostosowujemy do niej podstawienie auta.",
          en: "We check the actual landing time and move the handover to match it.",
        },
      },
      {
        title: {
          pl: "Spotkanie w hali przylotów",
          en: "We meet you in arrivals",
        },
        desc: {
          pl: "Nasz przedstawiciel czeka po odbiorze bagażu — z kontaktem telefonicznym na wypadek, gdyby coś się przesunęło.",
          en: "Our representative is waiting after baggage reclaim, with a phone contact in case anything shifts.",
        },
      },
      {
        title: {
          pl: "Przekazanie auta i dokumentów",
          en: "Handover of the car and documents",
        },
        desc: {
          pl: "Umowa, protokół stanu pojazdu, kaucja i kluczyki. Auto jest czyste i zatankowane.",
          en: "The agreement, the condition report, the deposit and the keys. The car is clean and fuelled.",
        },
      },
      {
        title: {
          pl: "Zwrot na lotnisku lub pod adresem",
          en: "Return at the airport or at an address",
        },
        desc: {
          pl: "Oddajesz auto na lotnisku przed odlotem albo w innym uzgodnionym miejscu w Warszawie.",
          en: "Drop the car at the airport before your flight home, or at another agreed place in Warsaw.",
        },
      },
    ],
  },
  sections: [
    {
      heading: {
        pl: "Opóźniony lot i nocne przyloty",
        en: "Delayed flights and night arrivals",
      },
      body: [
        {
          pl: "Opóźnienie samolotu nie jest problemem, o który musisz się martwić — po to monitorujemy numer lotu. Podstawienie przesuwamy razem z rzeczywistą godziną lądowania i nie doliczamy za to kary.",
          en: "A delayed plane is not something you need to worry about — that is precisely why we track the flight number. The handover moves with the real landing time, and we do not charge a penalty for it.",
        },
        {
          pl: "Osobną sprawą jest odbiór lub zwrot poza standardowymi godzinami pracy — tu obowiązuje stała dopłata według cennika dodatków. Mówimy o niej przy rezerwacji, żeby nie pojawiła się jako niespodzianka na fakturze.",
          en: "Collection or return outside standard business hours is a separate matter — that carries a fixed supplement from the add-on price list. We tell you about it when you book, so it never turns up as a surprise on the invoice.",
        },
      ],
    },
    {
      heading: {
        pl: "Ile kosztuje podstawienie na lotnisko",
        en: "What airport delivery costs",
      },
      body: [
        {
          pl: "Podstawienie na Lotnisko Chopina rozliczamy według stawki z tabeli dodatków, a dostawa pod adres w samej Warszawie jest tańsza. Opłata dotyczy jednego podstawienia; zwrot na lotnisku ustalamy przy rezerwacji.",
          en: "Delivery to Chopin Airport is charged from the add-ons table, while delivery to an address inside Warsaw is cheaper. The fee covers one handover; an airport return is arranged when you book.",
        },
        {
          pl: "Do stawki dobowej i podstawienia możesz dodać fotelik dziecięcy albo drugiego kierowcę. Kalkulator przy każdym aucie liczy wszystko razem, więc kwotę końcową znasz przed wysłaniem zapytania.",
          en: "On top of the daily rate and the delivery you can add a child seat or a second driver. The calculator on each car page adds it all up, so you know the final figure before you send the enquiry.",
        },
      ],
    },
    {
      heading: {
        pl: "Jakie dokumenty przygotować",
        en: "Which documents to bring",
      },
      body: [
        {
          pl: "Ważne prawo jazdy i dokument tożsamości — dowód osobisty lub paszport. Kierowca musi mieć ukończone {minAge} lat.{minAgeNote} Jeśli autem ma jeździć druga osoba, dopisujemy ją do umowy i sprawdzamy te same dokumenty.",
          en: "A valid driving licence and photo ID — an identity card or a passport. The driver must be at least {minAge}.{minAgeNote} If somebody else will also drive, we add them to the agreement and check the same documents.",
        },
        {
          pl: "Kaucję rozliczamy przy odbiorze, a jej wysokość zależy od modelu. Do każdego wynajmu wystawiamy fakturę VAT — również dla firm zagranicznych.",
          en: "The deposit is settled at handover and its size depends on the model. We issue a VAT invoice for every rental, including for companies registered abroad.",
        },
      ],
    },
    {
      heading: {
        pl: "Które lotniska obsługujemy",
        en: "Which airports we serve",
      },
      body: [
        {
          pl: "Punktem odbioru na lotnisku jest Lotnisko Chopina. Lotnisko Warszawa-Modlin nie jest naszym punktem odbioru i nie podstawiamy tam aut; możliwa jest natomiast dostawa pod wskazany adres w Warszawie, płatna według cennika dodatków. Lotnisko w Gdańsku jest punktem zapowiedzianym: dziś nie da się go jeszcze wybrać przy rezerwacji.",
          en: "Our airport pickup point is Warsaw Chopin Airport. Warsaw-Modlin Airport is not one of our pickup points and we do not deliver cars there; delivery to an address in Warsaw is available instead, charged per the add-on price list. Gdańsk Airport is an announced point: it cannot be selected when booking yet.",
        },
      ],
    },
    {
      heading: {
        pl: "Kto odbiera u nas auto na Chopina",
        en: "Who collects a car from us at Chopin",
      },
      body: [
        {
          pl: "Menedżerowie przylatujący na jednodniowe spotkanie, dla których kolejka do okienka to stracona godzina. Rodziny zaczynające wakacje — SUV z fotelikiem czeka pod halą przylotów. Zagraniczni klienci, którzy potrzebują faktury VAT na firmę spoza Polski. I goście weselni, którzy lądują w piątek wieczorem i muszą tego samego dnia dojechać pod Warszawę.",
          en: "Managers flying in for a one-day meeting, for whom a queue at the desk is an hour lost. Families starting a holiday — an SUV with a child seat waiting outside arrivals. International clients who need a VAT invoice made out to a company outside Poland. And wedding guests who land on Friday evening and have to be outside Warsaw the same night.",
        },
        {
          pl: "A&A Corporation obsługuje Lotnisko Chopina (WAW) na co dzień — to nasz najbliższy i najczęstszy punkt wydania aut. Wynajem samochodu na lotnisku w Warszawie prowadzimy w obu językach, po polsku i po angielsku, przez całą dobę.",
          en: "A&A Corporation works Chopin Airport (WAW) daily — it is our nearest and busiest handover point. Airport car hire in Warsaw is run in both languages, Polish and English, with handovers at any hour by arrangement.",
        },
      ],
    },
  ],
  faq: [
    {
      q: {
        pl: "Co się stanie, jeśli mój lot będzie opóźniony?",
        en: "What happens if my flight is delayed?",
      },
      a: {
        pl: "Nic — monitorujemy numer lotu i przesuwamy podstawienie auta razem z rzeczywistą godziną lądowania. Za samo opóźnienie nie pobieramy dodatkowej opłaty. Dopłata obowiązuje wyłącznie za odbiór poza standardowymi godzinami pracy.",
        en: "Nothing — we track your flight number and move the handover to the actual landing time. There is no extra charge for the delay itself. A supplement applies only to collection outside standard business hours.",
      },
    },
    {
      q: {
        pl: "Gdzie dokładnie odbieram samochód?",
        en: "Where exactly do I collect the car?",
      },
      a: {
        pl: "Nasz przedstawiciel czeka w hali przylotów Lotniska Chopina po odbiorze bagażu. Przed przylotem dostajesz numer telefonu do bezpośredniego kontaktu.",
        en: "Our representative waits in the Chopin Airport arrivals hall after baggage reclaim. You get a direct phone number before you land.",
      },
    },
    {
      q: {
        pl: "Czy mogę zwrócić auto na lotnisku?",
        en: "Can I return the car at the airport?",
      },
      a: {
        pl: "Tak. Zwrot na lotnisku ustalamy przy rezerwacji — podajesz godzinę odlotu, a my dobieramy do niej moment odbioru auta.",
        en: "Yes. An airport return is arranged when you book — you give us your departure time and we set the pickup around it.",
      },
    },
    {
      q: {
        pl: "Czy obsługujecie Lotnisko Modlin?",
        en: "Do you serve Modlin Airport?",
      },
      a: {
        pl: "Lotnisko Modlin nie jest naszym punktem odbioru i nie podstawiamy tam aut. Możemy zaproponować odbiór na Lotnisku Chopina albo dostawę pod wskazany adres; dostawa jest płatna według cennika dodatków.",
        en: "Warsaw Modlin Airport is not one of our pickup points and we do not deliver cars there. We can offer pickup at Warsaw Chopin Airport, or delivery to an address you choose; delivery is charged per the add-on price list.",
      },
    },
    {
      q: {
        pl: "Jak szybko odbierzemy formalności na lotnisku?",
        en: "How long do the airport formalities take?",
      },
      a: {
        pl: "Zwykle kilkanaście minut od spotkania do wyjazdu — sprawdzenie dokumentów, umowa, protokół stanu auta i kluczyki.",
        en: "Usually about fifteen minutes from meeting to driving away — document check, agreement, condition report and keys.",
      },
    },
  ],
  ctaTitle: {
    pl: "Zarezerwuj auto z odbiorem na Lotnisku Chopina",
    en: "Book a car for pickup at Chopin Airport",
  },
};
