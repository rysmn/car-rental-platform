import type { Landing } from "./types";

/**
 * Wedding cars — "wynajem auta na wesele Warszawa", "samochód do ślubu",
 * "wedding car rental Warsaw".
 *
 * Seasonal, high intent, booked further ahead than anything else on the site.
 * Same honesty constraint as the limousine page and for the same reason: in
 * Polish a wedding car is assumed to come with a driver, and ours does not.
 * That is said in the first paragraph, not buried in the FAQ — a couple who
 * discovers it a week before the wedding is a complaint, not a customer.
 */
export const WEDDING: Landing = {
  metaTitle: {
    pl: "Auto na wesele Warszawa | Wynajem bez kierowcy",
    en: "Wedding Car Rental Warsaw | Self-Drive",
  },
  metaDescription: {
    pl: "Wynajem auta na wesele w Warszawie — Porsche Panamera, BMW 740d, Mercedes GLE, Tesla. Bez kierowcy, z dostawą pod dom, kościół lub salę. Umyte i zatankowane.",
    en: "Wedding car rental in Warsaw — Porsche Panamera, BMW 740d, Mercedes GLE, Tesla. Self-drive, delivered to the house, church or venue. Washed and fuelled.",
  },
  eyebrow: { pl: "Wesela i uroczystości", en: "Weddings and celebrations" },
  h1: {
    pl: "Auto na wesele — wynajem w Warszawie",
    en: "Wedding Car Rental in Warsaw",
  },
  lead: {
    pl: "Auta klasy premium na dzień ślubu, podstawiane pod wskazany adres o ustalonej godzinie — umyte, zatankowane i gotowe.",
    en: "Premium cars for the wedding day, delivered to the address you name at the agreed hour — washed, fuelled and ready.",
  },
  intro: [
    {
      pl: "Najpierw jedna rzecz, żeby nie było nieporozumienia w najgorszym możliwym momencie: wynajmujemy auta bez kierowcy. Prowadzi ktoś z Waszej strony — pan młody, świadek, brat, kolega — wpisany do umowy jako kierowca. Jeśli szukacie samochodu z szoferem, to nie jest ta oferta i lepiej wiedzieć o tym teraz niż w tygodniu przed ślubem.",
      en: "First, one thing, so there is no misunderstanding at the worst possible moment: our cars are self-drive. Somebody from your side drives — the groom, a witness, a brother, a friend — named in the agreement as a driver. If you are looking for a car with a chauffeur, this is not that offer, and it is better to know now than in the week before the wedding.",
    },
    {
      pl: "Poza tym wszystko działa tak, jak powinno w ten jeden dzień: podstawiamy auto pod wskazany adres o ustalonej godzinie, umyte i zatankowane, z pełnym ubezpieczeniem OC i AC w stawce. Odbieramy je po uroczystości, z tego samego albo z innego uzgodnionego miejsca.",
      en: "Beyond that, everything works the way it should on that particular day: the car arrives at the address you name at the agreed hour, washed and fuelled, with full insurance in the rate. We collect it after the celebration, from the same place or another agreed one.",
    },
  ],
  sections: [
    {
      heading: {
        pl: "Które auta wybiera się na ślub",
        en: "Which cars get chosen for a wedding",
      },
      body: [
        {
          pl: "Porsche Panamera Turbo — najczęściej, kiedy auto ma być bohaterem zdjęć. Niska sylwetka, cztery miejsca, wygląda dobrze i w ruchu, i zaparkowane przed kościołem. BMW 740d xDrive — klasyczna limuzyna reprezentacyjna: pięć miejsc, przestronna tylna kanapa, najlepszy wybór, jeśli suknia jest obszerna, a przejazd dłuższy.",
          en: "The Porsche Panamera Turbo — most often when the car is meant to carry the photographs. A low profile, four seats, and it looks right both moving and parked outside the church. The BMW 740d xDrive — the classic representative saloon: five seats, a generous rear bench, and the better choice if the dress is full and the drive is long.",
        },
        {
          pl: "Tesla Model S — cicha, bez spalin i bez dźwięku silnika w tle podczas nagrań. Mercedes GLE i Tesla Model X — kiedy auto ma zabrać nie tylko parę młodą, ale i rodziców albo świadków; Model X ma sześć miejsc. Do przewozu gości między kościołem, salą i hotelem najlepiej sprawdza się dziewięcioosobowy Renault Trafic.",
          en: "The Tesla Model S — quiet, emission-free, with no engine noise under the video. The Mercedes GLE and Tesla Model X — when the car takes not only the couple but parents or witnesses too; the Model X seats six. For moving guests between church, venue and hotel, the nine-seat Renault Trafic is the practical answer.",
        },
      ],
    },
    {
      heading: {
        pl: "Kiedy rezerwować",
        en: "When to book",
      },
      body: [
        {
          pl: "Wcześniej niż cokolwiek innego na tej stronie. Soboty od maja do września bywają zajęte z kilkumiesięcznym wyprzedzeniem, a naszą flotę stanowi {fleetCount} aut, nie sto — konkretny model w konkretną sobotę to jeden egzemplarz, nie pula. Jeśli macie datę, sprawdźcie dostępność od razu, nawet jeśli decyzja o modelu zapadnie za dwa miesiące.",
          en: "Earlier than anything else on this site. Saturdays from May to September are often taken months ahead, and our fleet is {fleetCount} cars, not a hundred — a specific model on a specific Saturday is one car, not a pool. If you have the date, check availability now, even if the choice of model comes two months later.",
        },
        {
          pl: "Jeśli potrzebujecie dwóch aut — limuzyny dla pary młodej i busa dla gości — powiedzcie o tym w jednym zapytaniu. Zarezerwujemy oba na ten sam termin i rozliczymy jedną fakturą.",
          en: "If you need two vehicles — a saloon for the couple and the van for guests — say so in one enquiry. We will hold both for the same date and settle them on one invoice.",
        },
      ],
    },
    {
      heading: {
        pl: "Kto prowadzi i jak to zapisać w umowie",
        en: "Who drives, and how it goes into the agreement",
      },
      body: [
        {
          pl: "Każda osoba, która ma prowadzić, musi być wpisana do umowy jako kierowca — także jeśli siada za kierownicę tylko na jeden przejazd, spod kościoła pod salę. Wpisanie drugiego kierowcy kosztuje dopłatę dzienną i wymaga okazania tych samych dokumentów co najemca: ważnego prawa jazdy i dowodu lub paszportu, przy ukończonych {minAge} latach.{minAgeNote}",
          en: "Anybody who is going to drive must be named in the agreement — including for a single leg, from the church to the venue. Adding a second driver costs a daily supplement and requires the same documents as the main renter: a valid licence and an ID card or passport, at {minAge} or over.{minAgeNote}",
        },
        {
          pl: "To nie jest formalność dla formalności. Osoba niewpisana do umowy nie jest objęta polisą — a to jedyny scenariusz, w którym pełne ubezpieczenie przestaje działać. W dniu ślubu, przy aucie wartym kilkaset tysięcy złotych, nie warto tego testować.",
          en: "This is not paperwork for its own sake. A person not named in the agreement is not covered by the policy — and that is the one scenario in which the full insurance stops working. On a wedding day, with a car worth several hundred thousand złoty, it is not worth testing.",
        },
      ],
    },
    {
      heading: {
        pl: "Dekoracje, zdjęcia i zwyczaje",
        en: "Decorations, photographs and traditions",
      },
      body: [
        {
          pl: "Dekoracje ustalamy przed wynajmem. Zasada jest prosta: wszystko, co da się zamocować bez klejenia, wiercenia i bez kontaktu z lakierem, jest w porządku — wstążki, kompozycje na masce z odpowiednim mocowaniem. Taśmy klejone bezpośrednio na lakier i przyssawki na dłuższy czas potrafią zostawić ślad, za który odpowiada najemca, więc lepiej uzgodnić to wcześniej niż tłumaczyć przy zwrocie.",
          en: "Decorations are agreed before the hire. The rule is simple: anything that attaches without glue, drilling or contact with the paintwork is fine — ribbons, bonnet arrangements with proper mounts. Tape stuck straight onto the paint, and suction mounts left on for hours, can leave a mark the renter is liable for, so it is better agreed in advance than explained at handback.",
        },
        {
          pl: "Zdjęcia prywatne — bez ograniczeń, to Wasz dzień. Jeśli materiał ma trafić do celów komercyjnych (portfolio fotografa publikowane jako reklama, materiał sponsorowany), powiedzcie o tym przy rezerwacji — wykorzystanie wizerunku auta w reklamie ustalamy osobno.",
          en: "Private photographs — no restrictions, it is your day. If the material is going to commercial use (a photographer's portfolio published as advertising, sponsored content), mention it when booking — the use of the car's image in advertising is agreed separately.",
        },
      ],
    },
    {
      heading: {
        pl: "Ile to kosztuje",
        en: "What it costs",
      },
      body: [
        {
          pl: "Wynajem jednodniowy rozliczamy według progu 1–2 dni — to najwyższa stawka dobowa w cenniku. Jeśli auto jest Wam potrzebne również na poprawiny albo na sesję plenerową dzień później, próg 3–6 dni bywa w sumie tańszy niż dwa osobne jednodniowe najmy; warto policzyć oba warianty. Pełna tabela stawek jest na stronie każdego auta.",
          en: "A single-day hire is charged at the 1–2 day band — the highest daily rate in the price list. If you also need the car for the day-after party or an outdoor shoot, the 3–6 day band can total less than two separate one-day hires; it is worth pricing both. The full table is on each car's page.",
        },
        {
          pl: "Do stawki dochodzi podstawienie pod wskazany adres (stała kwota z cennika dodatków w granicach Warszawy) i ewentualny drugi kierowca. Kaucja przy autach premium sięga 6 000 zł zależnie od modelu, jest zwrotna i rozliczana po zwrocie auta. Limit 300 km na dobę na wesele w Warszawie i okolicach wystarcza z zapasem — przy dalszym kościele albo sali za miastem ustalimy go z góry.",
          en: "On top of the rate come delivery to your address (a fixed amount from the add-on price list within Warsaw) and any second driver. The deposit on premium cars reaches 6,000 zł depending on the model, is refundable, and is settled after the car comes back. The 300 km daily allowance covers a Warsaw-area wedding comfortably — for a church or venue further out we will agree it in advance.",
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
          pl: "Jesteśmy warszawską wypożyczalnią samochodów premium z flotą {fleetCount} aut, obsługującą Warszawę i Lotnisko Chopina. Na wesela wynajmujemy te same auta co na co dzień — sprawdzone między wynajmami, umyte i zatankowane przed wydaniem. Przy uroczystości, którą planuje się rok, ma znaczenie to, że auto podstawia człowiek, z którym rozmawialiście przy rezerwacji, a nie anonimowy podwykonawca.",
          en: "We are a Warsaw premium car hire company with a fleet of {fleetCount} cars, serving Warsaw and Chopin Airport. Weddings get the same cars as everyone else — inspected between rentals, washed and fuelled before handover. For a celebration planned a year ahead, it matters that the car is delivered by the person you spoke to when booking, not by an anonymous subcontractor.",
        },
      ],
    },
  ],
  faq: [
    {
      q: {
        pl: "Czy auto na wesele jest z kierowcą?",
        en: "Does the wedding car come with a driver?",
      },
      a: {
        pl: "Nie. Wszystkie nasze wynajmy są bez kierowcy — prowadzi najemca albo osoba wpisana do umowy jako drugi kierowca, po okazaniu prawa jazdy i dokumentu tożsamości.",
        en: "No. All our rentals are self-drive — the renter drives, or a person named in the agreement as second driver, on presentation of a licence and photo ID.",
      },
    },
    {
      q: {
        pl: "Z jakim wyprzedzeniem rezerwować auto na ślub?",
        en: "How far ahead should I book a wedding car?",
      },
      a: {
        pl: "Im wcześniej, tym lepiej — soboty od maja do września bywają zajęte z kilkumiesięcznym wyprzedzeniem. Mamy {fleetCount} aut, więc konkretny model w konkretną sobotę to jeden egzemplarz, nie pula do wyboru.",
        en: "As early as possible — Saturdays from May to September are often taken months ahead. We have {fleetCount} cars, so a specific model on a specific Saturday is one car, not a pool.",
      },
    },
    {
      q: {
        pl: "Czy można udekorować auto?",
        en: "Can the car be decorated?",
      },
      a: {
        pl: "Tak, po wcześniejszym uzgodnieniu. Wszystko, co mocuje się bez kleju, wiercenia i bez kontaktu z lakierem, jest w porządku. Taśmy klejone bezpośrednio na lakier mogą zostawić ślad, za który odpowiada najemca.",
        en: "Yes, agreed in advance. Anything that attaches without glue, drilling or contact with the paintwork is fine. Tape stuck directly onto the paint can leave a mark the renter is liable for.",
      },
    },
    {
      q: {
        pl: "Czy podstawicie auto pod dom albo pod kościół?",
        en: "Will you deliver to the house or the church?",
      },
      a: {
        pl: "Tak, pod dowolny adres w Warszawie o ustalonej godzinie — pod dom, pod kościół albo pod salę. Odbieramy je po uroczystości, z tego samego lub innego uzgodnionego miejsca.",
        en: "Yes, to any address in Warsaw at the agreed hour — the house, the church or the venue. We collect it after the celebration, from the same place or another agreed one.",
      },
    },
    {
      q: {
        pl: "Czy mogę wynająć limuzynę i busa dla gości na ten sam dzień?",
        en: "Can I book a saloon and the van for guests on the same day?",
      },
      a: {
        pl: "Tak — to częsty układ. Wystarczy jedno zapytanie; zarezerwujemy oba auta na ten sam termin i wystawimy jedną fakturę VAT.",
        en: "Yes — a common arrangement. One enquiry is enough; we will hold both vehicles for the same date and issue a single VAT invoice.",
      },
    },
    {
      q: {
        pl: "Ile wynosi kaucja przy aucie na wesele?",
        en: "How large is the deposit on a wedding car?",
      },
      a: {
        pl: "Przy autach premium sięga 6 000 zł, zależnie od modelu. Kaucja jest zwrotna i rozliczana po zwrocie auta; dokładną kwotę podajemy na stronie modelu przed rezerwacją.",
        en: "On premium cars it reaches 6,000 zł depending on the model. It is refundable and settled after the car is returned; the exact figure is on the model's page before you book.",
      },
    },
  ],
  ctaTitle: {
    pl: "Sprawdź, które auta są wolne w dniu Waszego ślubu",
    en: "See which cars are free on your wedding date",
  },
};
