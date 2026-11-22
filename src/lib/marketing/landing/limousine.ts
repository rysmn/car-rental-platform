import type { Landing } from "./types";

/**
 * "Wynajem limuzyn Warszawa" / "luxury sedan rental Warsaw".
 *
 * The Polish query is ambiguous in a way the English one is not: "limuzyna" is
 * both the body style (a saloon) and the colloquial name for a chauffeur-driven
 * wedding car. The
 * copy says plainly, high on the page, that these are self-drive rentals —
 * ranking for a service we do not offer wastes the click and the goodwill.
 *
 * The fleet strip is filtered to the `luxury` shelf: Panamera, 740d,
 * Model S.
 */
export const LIMOUSINE: Landing = {
  metaTitle: {
    pl: "Wynajem limuzyn Warszawa | Panamera, BMW, Tesla",
    en: "Luxury Sedan Rental Warsaw | Porsche, BMW, Tesla",
  },
  metaDescription: {
    pl: "Wynajem limuzyn w Warszawie bez kierowcy — Porsche Panamera, BMW 740d xDrive, Tesla Model S. Na wesele, sesję i spotkanie biznesowe. Dostawa pod wskazany adres.",
    en: "Luxury sedan rental in Warsaw, self-drive — Porsche Panamera, BMW 740d xDrive, Tesla Model S. For weddings, shoots and business. Delivered to your address.",
  },
  eyebrow: { pl: "Limuzyny", en: "Luxury saloons" },
  h1: {
    pl: "Wynajem limuzyn w Warszawie",
    en: "Luxury Sedan Rental in Warsaw",
  },
  lead: {
    pl: "Porsche Panamera, BMW 740d xDrive i Tesla Model S — auta klasy reprezentacyjnej z dostawą pod wskazany adres w Warszawie.",
    en: "Porsche Panamera, BMW 740d xDrive and Tesla Model S — representative-class cars delivered to your address in Warsaw.",
  },
  intro: [
    {
      pl: "Jedno wyjaśnienie na starcie, żeby nikt nie tracił czasu: wynajmujemy limuzyny bez kierowcy. Dostajesz kluczyki i prowadzisz sam — albo prowadzi osoba dopisana do umowy jako drugi kierowca. Jeśli szukasz auta z szoferem, to nie jest właściwa oferta i lepiej wiedzieć o tym teraz niż w dniu wesela.",
      en: "One clarification up front, so nobody wastes time: these are self-drive rentals. You get the keys and drive yourself — or the person named in the agreement as second driver does. If you are looking for a car with a chauffeur, this is not the right offer, and it is better to know now than on the wedding day.",
    },
    {
      pl: "Poza tym warunki są takie same jak w całej flocie: pełne ubezpieczenie OC i AC w stawce, faktura VAT do każdego wynajmu, dostawa pod adres, pod salę weselną, pod hotel albo na Lotnisko Chopina, i obsługa po polsku oraz po angielsku przez całą dobę.",
      en: "Beyond that the terms match the rest of the fleet: full third-party and comprehensive insurance in the rate, a VAT invoice for every rental, delivery to your address, to the wedding venue, to a hotel or to Chopin Airport, and support in Polish and English between {phone}.",
    },
  ],
  sections: [
    {
      heading: {
        pl: "Trzy limuzyny, trzy różne charaktery",
        en: "Three saloons, three different characters",
      },
      body: [
        {
          pl: "Porsche Panamera Turbo — najbardziej kierowcze auto z tej trójki. Cztery miejsca, sylwetka, którą widać z drugiej strony ulicy, i prowadzenie, dla którego ludzie w ogóle wynajmują Porsche. Najczęściej rezerwowana na weekend, sesję zdjęciową i urodziny.",
          en: "The Porsche Panamera Turbo — the driver's car of the three. Four seats, a silhouette recognisable from across the street, and the handling people rent a Porsche for in the first place. Most often booked for a weekend, a photo shoot or a birthday.",
        },
        {
          pl: "BMW 740d xDrive — klasyczna limuzyna reprezentacyjna. Napęd na cztery koła, diesel o realnym zasięgu na długiej trasie i tylna kanapa, na której da się przejechać kilkaset kilometrów bez zmęczenia. Wybór na transfery, delegacje i przejazdy z gośćmi.",
          en: "The BMW 740d xDrive — the classic representative saloon. All-wheel drive, a diesel with genuine long-distance range, and a rear bench you can cover several hundred kilometres on without fatigue. The choice for transfers, secondments and driving guests.",
        },
        {
          pl: "Tesla Model S — limuzyna elektryczna. Zero spalania, wjazd do Strefy Czystego Transportu bez ograniczeń i cisza, której nie da żadne auto spalinowe w tej klasie. Częsty wybór na miejskie transfery i na sesje, w których liczy się brak hałasu silnika.",
          en: "The Tesla Model S — the electric saloon. No combustion, unrestricted access to the clean transport zone, and a silence no petrol or diesel car in this class can offer. A frequent pick for city transfers and for shoots where engine noise is a problem.",
        },
      ],
    },
    {
      heading: {
        pl: "Limuzyna na wesele",
        en: "A luxury car for a wedding",
      },
      body: [
        {
          pl: "Podstawiamy auto pod wskazany adres — pod dom panny młodej, pod kościół albo pod salę weselną — o ustalonej godzinie, umyte i zatankowane. Prowadzi ktoś z Waszej strony: pan młody, świadek albo inna osoba dopisana do umowy jako drugi kierowca, po okazaniu tych samych dokumentów co najemca.",
          en: "We bring the car to the address you name — the bride's house, the church or the venue — at the agreed hour, washed and fuelled. Somebody from your side drives: the groom, a witness, or another person named in the agreement as second driver, on the same documents as the main renter.",
        },
        {
          pl: "Wesela rezerwuje się u nas najwcześniej ze wszystkich wynajmów — terminy sobotnie w sezonie potrafią być zajęte z kilkumiesięcznym wyprzedzeniem. Jeśli macie datę, warto sprawdzić dostępność od razu, nawet jeśli decyzja o modelu zapadnie później.",
          en: "Weddings are booked earliest of all our rentals — Saturday dates in season can be taken months ahead. If you have the date, it is worth checking availability now, even if the choice of model comes later.",
        },
      ],
    },
    {
      heading: {
        pl: "Sesje zdjęciowe, teledyski i wydarzenia",
        en: "Photo shoots, videos and events",
      },
      body: [
        {
          pl: "Auto na plan zdjęciowy podstawiamy pod wskazaną lokalizację i odbieramy po sesji. Przy zdjęciach komercyjnych powiedz o tym przy rezerwacji — wykorzystanie wizerunku auta w materiałach reklamowych ustalamy osobno, żeby nie było wątpliwości po publikacji.",
          en: "For a shoot we deliver the car to the location and collect it afterwards. If the images are commercial, say so when booking — the use of the car in advertising material is agreed separately, so there is no question about it after publication.",
        },
        {
          pl: "Na konferencje, gale i wydarzenia firmowe najczęściej wybierane jest BMW 740d — mieści cztery osoby z bagażem i wygląda właściwie także wtedy, gdy stoi zaparkowane przed wejściem przez pół dnia.",
          en: "For conferences, galas and corporate events the usual pick is the BMW 740d — four people with luggage, and a car that still looks right when it spends half a day parked at the entrance.",
        },
      ],
    },
    {
      heading: {
        pl: "Ile kosztuje wynajem limuzyny w Warszawie",
        en: "What luxury sedan rental in Warsaw costs",
      },
      body: [
        {
          pl: "Stawka dobowa zależy od modelu i długości najmu — pięć progów, od 1–2 dni po stawkę miesięczną od 30 dni. Jednodniowy wynajem na wesele liczony jest według progu 1–2 dni; przy dłuższym terminie cena za dobę wyraźnie spada. Pełna tabela jest na stronie każdego auta.",
          en: "The daily rate depends on the model and the length of the hire — five bands, from 1–2 days up to a monthly rate from 30 days. A single-day wedding hire is charged at the 1–2 day rate; over a longer period the daily price falls noticeably. The full table is on each car's page.",
        },
        {
          pl: "Kaucja przy limuzynach należy do wyższych w naszej flocie i sięga 6 000 zł zależnie od modelu. Jest zwrotna i rozliczana po zwrocie auta. Limit kilometrów to 300 km na dobę przy najmie do 6 dni — na wesele w zupełności wystarcza, ale przy przejeździe poza Warszawę warto ustalić limit z góry.",
          en: "The deposit on the saloons is among the higher ones in our fleet and reaches 6,000 zł depending on the model. It is refundable and settled after the car comes back. Mileage is 300 km per day on hires up to 6 days — ample for a wedding, but worth agreeing in advance if the route leaves Warsaw.",
        },
      ],
    },
    {
      heading: {
        pl: "Kto może prowadzić",
        en: "Who may drive",
      },
      body: [
        {
          pl: "Minimalny wiek kierowcy to {minAge} lat, wymagane jest ważne prawo jazdy i dokument tożsamości — dowód osobisty albo paszport.{minAgeNote} Przy autach z górnej półki potwierdzamy warunki indywidualnie, zanim cokolwiek podpiszesz.",
          en: "The minimum driver age is {minAge}, with a valid driving licence and photo ID — an identity card or a passport.{minAgeNote} On the top-end cars we confirm the terms individually before anything is signed.",
        },
        {
          pl: "Każda osoba, która ma prowadzić, musi być wpisana do umowy jako kierowca — także jeśli siada za kierownicę tylko na jeden przejazd. Osoba niewpisana nie jest objęta polisą, a to jedyny scenariusz, w którym pełne ubezpieczenie przestaje działać.",
          en: "Anybody who is going to drive must be named in the agreement — including for a single leg. A person who is not named is not covered by the policy, and that is the one scenario in which the full insurance stops working.",
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
          pl: "A&A Corporation to warszawska wypożyczalnia aut premium. W klasie limuzyn utrzymujemy trzy modele zamiast dziesięciu — bo każdy z nich ma pełnić inną rolę, a nie zapełniać listę. Auto, które rezerwujesz, to konkretny egzemplarz ze zdjęć, z własną historią serwisową i przeglądem między wynajmami.",
          en: "A&A Corporation is a Warsaw premium car hire company. In the saloon class we keep three models rather than ten — because each is meant to do a different job, not to pad a list. The car you book is the specific one in the photographs, with its own service history and an inspection between rentals.",
        },
        {
          pl: "Obsługujemy Warszawę i Lotnisko Chopina. Wynajem krótkoterminowy i długoterminowy, dla osób prywatnych i firm, z fakturą VAT i obsługą po polsku oraz po angielsku.",
          en: "We serve Warsaw and Chopin Airport. Short-term and long-term rental, for private customers and companies, with a VAT invoice and support in Polish and English.",
        },
      ],
    },
  ],
  faq: [
    {
      q: {
        pl: "Czy wynajmujecie limuzyny z kierowcą?",
        en: "Do you rent chauffeur-driven cars?",
      },
      a: {
        pl: "Nie — wynajem odbywa się bez kierowcy. Prowadzi najemca albo osoba dopisana do umowy jako drugi kierowca, po okazaniu prawa jazdy i dokumentu tożsamości.",
        en: "No — all our rentals are self-drive. The renter drives, or a person named in the agreement as second driver, on presentation of a licence and photo ID.",
      },
    },
    {
      q: {
        pl: "Jakie limuzyny macie w ofercie?",
        en: "Which saloons do you offer?",
      },
      a: {
        pl: "Trzy: Porsche Panamera Turbo, BMW 740d xDrive i Teslę Model S. Rocznik, wyposażenie, kaucję i pełny cennik każdego auta znajdziesz na jego stronie.",
        en: "Three: the Porsche Panamera Turbo, the BMW 740d xDrive and the Tesla Model S. Year, equipment, deposit and full rates are on each car's page.",
      },
    },
    {
      q: {
        pl: "Czy można wynająć limuzynę na jeden dzień, na wesele?",
        en: "Can I hire a car for a single day, for a wedding?",
      },
      a: {
        pl: "Tak. Auto podstawiamy pod wskazany adres o ustalonej godzinie i odbieramy po uroczystości. Terminy sobotnie w sezonie warto rezerwować z kilkumiesięcznym wyprzedzeniem.",
        en: "Yes. We deliver to the address you name at the agreed hour and collect after the celebration. Saturday dates in season are worth booking several months ahead.",
      },
    },
    {
      q: {
        pl: "Czy ktoś inny może prowadzić auto podczas wesela?",
        en: "Can somebody else drive during the wedding?",
      },
      a: {
        pl: "Tak, pod warunkiem że zostanie dopisany do umowy jako drugi kierowca — za dopłatą dzienną i po okazaniu tych samych dokumentów co najemca. Osoba niewpisana do umowy nie jest objęta ubezpieczeniem.",
        en: "Yes, provided they are named in the agreement as second driver — for a daily supplement and on the same documents as the renter. A person not named in the agreement is not covered by the insurance.",
      },
    },
    {
      q: {
        pl: "Ile wynosi kaucja za limuzynę?",
        en: "How large is the deposit on a luxury saloon?",
      },
      a: {
        pl: "To jedne z wyższych kaucji w naszej flocie, sięgające 6 000 zł zależnie od modelu. Kaucja jest zwrotna i rozliczana po zwrocie auta; dokładną kwotę podajemy na stronie modelu.",
        en: "Among the higher deposits in our fleet, reaching 6,000 zł depending on the model. It is refundable and settled after the car is returned; the exact figure is on the model's page.",
      },
    },
    {
      q: {
        pl: "Czy limuzynę można wykorzystać do zdjęć komercyjnych?",
        en: "Can the car be used in commercial photography?",
      },
      a: {
        pl: "Tak, ale powiedz o tym przy rezerwacji — wykorzystanie wizerunku auta w materiałach reklamowych ustalamy osobno, przed sesją.",
        en: "Yes, but tell us when you book — the use of the car's image in advertising material is agreed separately, before the shoot.",
      },
    },
  ],
  ctaTitle: {
    pl: "Sprawdź dostępność limuzyny na wybrany termin",
    en: "Check saloon availability for your date",
  },
};
