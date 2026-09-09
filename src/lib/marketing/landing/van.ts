import type { Landing } from "./types";

/**
 * Nine-seat van — "wynajem busa 9-osobowego Warszawa", "wynajem mikrobusu",
 * "9 seater van rental Warsaw".
 *
 * Low search volume, unusually high conversion: whoever types it needs exactly
 * this and there is no substitute — a group of nine cannot be sold a saloon.
 * The fleet has ONE Trafic, so the copy says so and tells people to book early
 * rather than implying a row of vans is standing by.
 */
export const VAN: Landing = {
  metaTitle: {
    pl: "Wynajem busa 9-osobowego Warszawa | Trafic",
    en: "9-Seater Van Rental Warsaw | Renault Trafic",
  },
  metaDescription: {
    pl: "Wynajem busa 9-osobowego w Warszawie — Renault Trafic z dostawą pod adres i na Lotnisko Chopina. Wyjazdy grupowe, konferencje, transfery. Faktura VAT, pełne AC.",
    en: "9-seater van rental in Warsaw — a Renault Trafic delivered to your address or Chopin Airport. For group trips, conferences, transfers. VAT invoice, full cover.",
  },
  eyebrow: { pl: "Bus 9-osobowy", en: "Nine-seat van" },
  h1: {
    pl: "Wynajem busa 9-osobowego w Warszawie",
    en: "9-Seater Van Rental in Warsaw",
  },
  lead: {
    pl: "Renault Trafic na dziewięć osób — na wyjazd grupowy, transfer z lotniska, konferencję i przeprowadzkę większej ekipy.",
    en: "A nine-seat Renault Trafic — for group trips, airport transfers, conferences and moving a larger team.",
  },
  intro: [
    {
      pl: "Dziewięć miejsc to granica, przy której kończą się kompromisy: siedmioosobowy SUV nie pomieści dziewięciu osób z bagażem, a dwa auta osobowe oznaczają dwóch kierowców, dwa parkingi i dwa razy więcej ustaleń. Bus 9-osobowy rozwiązuje to jednym pojazdem i jednym prawem jazdy kategorii B.",
      en: "Nine seats is where compromises end: a seven-seat SUV will not take nine people with luggage, and two cars mean two drivers, two parking spaces and twice the coordination. A nine-seat van solves it with one vehicle and one ordinary category B licence.",
    },
    {
      pl: "Uczciwie: mamy jeden taki egzemplarz. To znaczy, że w weekendy i w sezonie ślubnym bywa zajęty z wyprzedzeniem, a rezerwacja na ostatnią chwilę częściej się nie udaje niż udaje. Jeśli masz datę — zapytaj od razu, nawet jeśli reszta planów jest jeszcze niepewna.",
      en: "To be straight about it: we have one. Which means that at weekends and in wedding season it is often taken well in advance, and a last-minute booking fails more often than it works. If you have a date, ask now, even if the rest of the plan is still loose.",
    },
  ],
  sections: [
    {
      heading: {
        pl: "Kiedy potrzebny jest bus 9-osobowy",
        en: "When a nine-seat van is the answer",
      },
      body: [
        {
          pl: "Transfery z Lotniska Chopina dla grupy, która przylatuje razem. Wyjazdy firmowe i integracyjne. Konferencje i targi, gdzie ekipa jeździ między hotelem a halą kilka razy dziennie. Wesela — przewóz gości między kościołem, salą i hotelem. Wyjazdy w góry i nad morze większą rodziną. Ekipy filmowe i zespoły muzyczne ze sprzętem.",
          en: "Transfers from Chopin Airport for a group arriving together. Company trips and team events. Conferences and trade fairs, where a team shuttles between hotel and hall several times a day. Weddings — moving guests between church, venue and hotel. Mountain and seaside trips with a larger family. Film crews and bands with equipment.",
        },
        {
          pl: "Częsty scenariusz: bus wozi grupę, a osobno wynajmowana limuzyna albo SUV obsługuje parę młodą lub zarząd. Można to zarezerwować jednym zapytaniem i rozliczyć jedną fakturą.",
          en: "A common pattern: the van carries the group while a separately hired saloon or SUV handles the couple or the board. Both can be booked in one enquiry and settled on one invoice.",
        },
      ],
    },
    {
      heading: {
        pl: "Prawo jazdy kategorii B wystarczy",
        en: "An ordinary category B licence is enough",
      },
      body: [
        {
          pl: "Bus 9-osobowy mieści się w limicie 3,5 tony i przewozi maksymalnie dziewięć osób razem z kierowcą, więc prowadzi się go na zwykłym prawie jazdy kategorii B. Nie jest potrzebna kategoria D ani żadne uprawnienie zawodowe, o ile przewóz nie jest zarobkowy.",
          en: "A nine-seat van stays under 3.5 tonnes and carries at most nine people including the driver, so it is driven on an ordinary category B licence. No category D and no professional qualification is needed, as long as the transport is not commercial passenger service.",
        },
        {
          pl: "Jedna uwaga praktyczna: bus jest wyższy i dłuższy od osobówki. Jeśli nigdy nie prowadziłeś takiego auta, przy wydaniu pokazujemy, na co zwrócić uwagę — parkingi podziemne z ograniczeniem wysokości potrafią zaskoczyć bardziej niż samo prowadzenie.",
          en: "One practical note: a van is taller and longer than a car. If you have never driven one, we walk you through what to watch for at handover — underground car parks with a height limit surprise people more than the driving does.",
        },
      ],
    },
    {
      heading: {
        pl: "Bagaż, przestrzeń i konfiguracja",
        en: "Luggage, space and layout",
      },
      body: [
        {
          pl: "Przy komplecie dziewięciu osób przestrzeń bagażowa jest ograniczona — to fizyka, nie wada konkretnego modelu. Przy grupie ośmioosobowej i złożonym ostatnim rzędzie miejsca na walizki jest wyraźnie więcej. Jeśli lecicie z dużym bagażem albo ze sprzętem, powiedz o tym przy rezerwacji, policzymy to razem zamiast zgadywać na parkingu przy terminalu.",
          en: "With all nine seats occupied the luggage space is limited — that is physics, not a flaw in this particular model. With eight people and the last row folded there is noticeably more room for suitcases. If you are flying in with heavy luggage or equipment, say so when booking; we will work it out together rather than guessing in the car park at the terminal.",
        },
        {
          pl: "Foteliki dziecięce dokładamy za dopłatą dzienną z cennika dodatków i montujemy przed wydaniem auta. Przy przewozie dzieci podaj wiek każdego z nich — dobierzemy właściwe typy.",
          en: "Child seats are added for a daily supplement from the add-on price list and fitted before handover. If children are travelling, give us each child's age and we will match the right seats.",
        },
      ],
    },
    {
      heading: {
        pl: "Dostawa busa i transfer z lotniska",
        en: "Van delivery and airport transfers",
      },
      body: [
        {
          pl: "Podstawiamy bus pod dowolny adres w Warszawie oraz na Lotnisko Chopina. Przy odbiorze na lotnisku podaj numer lotu — monitorujemy godzinę lądowania i przesuwamy podstawienie razem z nim, bez dopłaty za samo opóźnienie.",
          en: "We deliver the van to any address in Warsaw and to Chopin Airport. For an airport pickup, give us the flight number — we track the landing time and move the handover with it, with no charge for the delay itself.",
        },
        {
          pl: "Stawki za podstawienie w Warszawie i na oba lotniska są w cenniku dodatków; Trójmiasto wyceniamy indywidualnie według odległości. Zwrot może nastąpić w innym uzgodnionym miejscu niż odbiór.",
          en: "Delivery rates for Warsaw and both airports are in the add-on price list; the Tri-City is quoted individually by distance. The return can be at a different agreed place from the collection.",
        },
      ],
    },
    {
      heading: {
        pl: "Ile kosztuje wynajem busa i jaka jest kaucja",
        en: "What van rental costs, and the deposit",
      },
      body: [
        {
          pl: "Stawka dobowa spada wraz z długością najmu — pięć progów, od 1–2 dni po stawkę miesięczną od 30 dni. Przy wyjeździe tygodniowym różnica wobec weekendu jest wyraźna, więc jeśli bus i tak stoi u Was przez tydzień, warto policzyć oba warianty. Pełna tabela stawek jest na stronie auta.",
          en: "The daily rate falls with the length of the hire — five bands, from 1–2 days up to a monthly rate from 30 days. Over a week the gap against a weekend rate is substantial, so if the van is staying with you anyway, it is worth pricing both. The full table is on the car's page.",
        },
        {
          pl: "Kaucja jest zwrotna, rozliczana po zwrocie pojazdu, a jej wysokość podajemy na stronie auta przed rezerwacją. Limit kilometrów: 300 km na dobę przy najmie do 6 dni i 250 km na dobę od 7 dni — przy wyjeździe w góry albo nad morze warto ustalić go z góry.",
          en: "The deposit is refundable, settled after the van comes back, and stated on the car's page before you book. Mileage: 300 km per day up to 6 days and 250 km per day from 7 days — worth agreeing up front for a trip to the mountains or the coast.",
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
          pl: "A&A Corporation to warszawska wypożyczalnia samochodów premium. Bus 9-osobowy jest w naszej flocie jedynym autem tej wielkości i traktujemy go jak każdy inny pojazd: przegląd między wynajmami, mycie i tankowanie przed wydaniem, pełne ubezpieczenie OC i AC w stawce oraz faktura VAT do każdego najmu.",
          en: "A&A Corporation is a Warsaw premium car hire company. The nine-seat van is the only vehicle of its size in our fleet, and it gets the same treatment as everything else: inspected between rentals, washed and fuelled before handover, full insurance in the rate, and a VAT invoice for every hire.",
        },
      ],
    },
  ],
  faq: [
    {
      q: {
        pl: "Czy do prowadzenia busa 9-osobowego potrzebne jest specjalne prawo jazdy?",
        en: "Do I need a special licence for a nine-seat van?",
      },
      a: {
        pl: "Nie. Auto mieści się w limicie 3,5 tony i przewozi maksymalnie dziewięć osób z kierowcą, więc wystarczy zwykłe prawo jazdy kategorii B — o ile przewóz nie ma charakteru zarobkowego.",
        en: "No. The van is under 3.5 tonnes and carries at most nine people including the driver, so an ordinary category B licence is enough — provided the transport is not a commercial passenger service.",
      },
    },
    {
      q: {
        pl: "Ile busów macie w wynajmie?",
        en: "How many vans do you have?",
      },
      a: {
        pl: "Jeden — Renault Trafic. Dlatego w weekendy i w sezonie ślubnym bywa zarezerwowany z wyprzedzeniem; jeśli macie datę, warto zapytać wcześnie.",
        en: "One — a Renault Trafic. That is why it is often booked ahead at weekends and in wedding season; if you have a date, ask early.",
      },
    },
    {
      q: {
        pl: "Czy zmieści się bagaż dla dziewięciu osób?",
        en: "Will luggage for nine people fit?",
      },
      a: {
        pl: "Przy komplecie dziewięciu osób przestrzeń bagażowa jest ograniczona. Przy ośmiu osobach i złożonym ostatnim rzędzie miejsca jest wyraźnie więcej. Napisz, ilu Was jedzie i z jakim bagażem — policzymy to przed rezerwacją.",
        en: "With all nine seats taken, luggage space is limited. With eight people and the last row folded there is noticeably more. Tell us how many are travelling and with what luggage, and we will work it out before you book.",
      },
    },
    {
      q: {
        pl: "Czy dowieziecie busa na Lotnisko Chopina?",
        en: "Will you deliver the van to Chopin Airport?",
      },
      a: {
        pl: "Tak, na Lotnisko Chopina, według stawki z cennika dodatków. Podaj numer lotu — monitorujemy lądowanie i za samo opóźnienie samolotu nie doliczamy nic.",
        en: "Yes, to Chopin Airport, at the rate in the add-on price list. Give us the flight number — we track the landing and charge nothing extra for the delay itself.",
      },
    },
    {
      q: {
        pl: "Czy można wynająć bus i drugie auto na ten sam termin?",
        en: "Can I book the van and a second car for the same dates?",
      },
      a: {
        pl: "Tak — to częsty układ na wesela i wyjazdy firmowe: bus wozi grupę, a limuzyna lub SUV parę młodą albo zarząd. Jedno zapytanie, jedna faktura.",
        en: "Yes — a common arrangement for weddings and company trips: the van carries the group while a saloon or SUV handles the couple or the board. One enquiry, one invoice.",
      },
    },
    {
      q: {
        pl: "Czy bus ma foteliki dziecięce?",
        en: "Are child seats available for the van?",
      },
      a: {
        pl: "Tak, za dopłatą dzienną z cennika dodatków. Montujemy je przed wydaniem auta — podaj wiek dzieci, dobierzemy właściwe typy.",
        en: "Yes, for a daily supplement from the add-on price list. We fit them before handover — give us the children's ages and we will match the right seats.",
      },
    },
  ],
  ctaTitle: {
    pl: "Sprawdź, czy bus jest wolny w Twoim terminie",
    en: "Check whether the van is free on your dates",
  },
};
