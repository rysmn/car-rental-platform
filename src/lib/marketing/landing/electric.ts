import type { Landing } from "./types";

/**
 * Electric cars — "wynajem samochodów elektrycznych Warszawa", "wynajem Tesli",
 * "electric car rental Warsaw".
 *
 * Three real cars: Tesla Model S, Tesla Model X, Jaguar I-PACE. The honest
 * selling point is not range figures — which vary with speed, temperature and
 * load, and which we therefore do not quote — but the two facts that hold
 * unconditionally: zero tailpipe emissions get you into any clean transport
 * zone, and somebody explains charging to you before you drive off.
 */
export const ELECTRIC: Landing = {
  metaTitle: {
    pl: "Wynajem aut elektrycznych Warszawa | Tesla",
    en: "Electric Car Rental Warsaw | Tesla, Jaguar",
  },
  metaDescription: {
    pl: "Wynajem aut elektrycznych w Warszawie — Tesla Model S, Tesla Model X i Jaguar I-PACE. Wjazd do Strefy Czystego Transportu, instruktaż ładowania, faktura VAT.",
    en: "Electric car rental in Warsaw — Tesla Model S, Tesla Model X and Jaguar I-PACE. Clean transport zone access, a charging walkthrough at handover, VAT invoice.",
  },
  eyebrow: { pl: "Auta elektryczne", en: "Electric cars" },
  h1: {
    pl: "Wynajem aut elektrycznych w Warszawie",
    en: "Electric Car Rental in Warsaw",
  },
  lead: {
    pl: "Tesla Model S, Tesla Model X i Jaguar I-PACE — trzy w pełni elektryczne auta z dostawą pod wskazany adres i instruktażem ładowania przy wydaniu.",
    en: "Tesla Model S, Tesla Model X and Jaguar I-PACE — three fully electric cars, delivered to your address with a charging walkthrough at handover.",
  },
  intro: [
    {
      pl: "Wynajem elektryka to najczęściej jedna z dwóch sytuacji: albo ktoś zastanawia się nad kupnem i chce sprawdzić, jak to działa przez tydzień w prawdziwym życiu, albo potrzebuje auta, które bez ograniczeń wjedzie wszędzie w mieście. Oba przypadki obsługujemy tak samo — z instruktażem ładowania, bo to jedyna rzecz, która przy pierwszym elektryku faktycznie sprawia kłopot.",
      en: "Renting an electric car is usually one of two situations: somebody is considering buying one and wants a week of real life with it, or somebody needs a car that can go anywhere in the city without restrictions. We handle both the same way — with a charging walkthrough, because charging is the one thing that genuinely trips people up the first time.",
    },
    {
      pl: "Czego tu nie znajdziesz: obiecanego zasięgu w kilometrach. Realny zasięg zależy od prędkości, temperatury, obciążenia i stylu jazdy, a liczba z katalogu potrafi się rozminąć z rzeczywistością o jedną trzecią. Zamiast tego przy wydaniu auta mówimy, czego się spodziewać na Twojej trasie.",
      en: "What you will not find here: a promised range in kilometres. Real range depends on speed, temperature, load and driving style, and the brochure figure can miss reality by a third. Instead, at handover we tell you what to expect on your actual route.",
    },
  ],
  sections: [
    {
      heading: {
        pl: "Trzy elektryki, trzy różne zastosowania",
        en: "Three electric cars, three different jobs",
      },
      body: [
        {
          pl: "Tesla Model S — limuzyna. Pięć miejsc, najniższa sylwetka z tej trójki, największy sens na transfery miejskie, spotkania biznesowe i trasy autostradowe. Najczęściej wybierana przez osoby, które chcą sprawdzić, czy elektryk zastąpi im auto służbowe.",
          en: "Tesla Model S — the saloon. Five seats, the lowest profile of the three, and the strongest case for city transfers, business meetings and motorway routes. Most often chosen by people testing whether an electric car could replace their company car.",
        },
        {
          pl: "Tesla Model X — SUV z sześcioma miejscami. Jedyne auto w naszej flocie, które łączy sześć foteli z napędem elektrycznym. Wybierana na wyjazdy rodzinne, transfery grupowe z lotniska i wtedy, gdy liczy się i przestrzeń, i wrażenie.",
          en: "Tesla Model X — a six-seat SUV. The only car in our fleet that combines six seats with electric drive. Chosen for family trips, group airport transfers, and whenever both space and impression matter.",
        },
        {
          pl: "Jaguar I-PACE — elektryczny SUV o bardziej klasycznych proporcjach i innym charakterze prowadzenia niż Tesle. Częsty wybór osób, które chcą elektryka, ale niekoniecznie chcą Tesli.",
          en: "Jaguar I-PACE — an electric SUV with more conventional proportions and a different character behind the wheel from the Teslas. A frequent pick for people who want an electric car but not necessarily a Tesla.",
        },
      ],
    },
    {
      heading: {
        pl: "Strefa Czystego Transportu i opłaty miejskie",
        en: "The clean transport zone and city charges",
      },
      body: [
        {
          pl: "Auta w pełni elektryczne nie mają emisji spalin, więc ograniczenia wjazdu do stref czystego transportu ich nie dotyczą — ani w Warszawie, ani w żadnym innym mieście, które taką strefę wprowadzi. To jedyna kategoria pojazdów, której nie trzeba sprawdzać pod kątem normy emisji i rocznika przed wjazdem do centrum.",
          en: "Fully electric cars have no tailpipe emissions, so clean transport zone restrictions do not apply to them — not in Warsaw and not in any other city that introduces one. They are the one category of vehicle you never have to check against an emissions standard or a model year before driving into the centre.",
        },
        {
          pl: "W praktyce znaczy to jedno: jeśli Twoje spotkania są w Śródmieściu albo mieszkasz w strefie, elektryk zdejmuje z Ciebie całą tę klasę problemów. Osobną kwestią są opłaty za parkowanie — te zależą od aktualnych uchwał miasta, więc sprawdź je przed wyjazdem; nie obiecujemy zwolnień, których nie kontrolujemy.",
          en: "In practice that means one thing: if your meetings are in the city centre or you live inside the zone, an electric car removes that entire class of problem. Parking charges are a separate matter — those follow current city resolutions, so check them before you set off; we do not promise exemptions we do not control.",
        },
      ],
    },
    {
      heading: {
        pl: "Ładowanie — jak to wygląda w praktyce",
        en: "Charging — how it actually works",
      },
      body: [
        {
          pl: "Auto wydajemy naładowane. Przy przekazaniu pokazujemy, jak podłączyć ładowarkę, gdzie w aucie sprawdzić stan naładowania i planowanie trasy oraz z jakich sieci ładowarek korzystać w Warszawie i po drodze. Zajmuje to kilka minut i rozwiązuje 90% obaw osób, które jadą elektrykiem pierwszy raz.",
          en: "The car goes out charged. At handover we show you how to plug in, where in the car to check the state of charge and the route planner, and which charging networks to use in Warsaw and on the road. It takes a few minutes and settles most of the worry people bring to their first electric car.",
        },
        {
          pl: "Jeśli planujesz dłuższą trasę — Gdańsk, Kraków, Zakopane — powiedz o tym przy rezerwacji. Podpowiemy realny plan postojów zamiast zostawiać Cię z liczbą zasięgu z katalogu. Zwrot auta ustalamy z poziomem naładowania podanym w umowie, żeby nie było niespodzianek przy rozliczeniu.",
          en: "If you are planning a longer route — Gdańsk, Kraków, Zakopane — tell us when you book. We will suggest a realistic stop plan rather than leaving you with a brochure range figure. The return is agreed with a state of charge written into the contract, so the settlement holds no surprises.",
        },
      ],
    },
    {
      heading: {
        pl: "Elektryk na dłużej — kiedy naprawdę się opłaca",
        en: "Electric on a longer hire — when it genuinely pays",
      },
      body: [
        {
          pl: "Przy krótkim wynajmie różnica w koszcie energii jest zauważalna, ale nie decydująca. Robi się realna przy najmie miesięcznym z limitem 3 000 km: przy takim przebiegu koszt ładowania kontra tankowanie zaczyna być pozycją w budżecie, a nie ciekawostką. Dla firm rozliczających flotę to zwykle pierwszy argument, który ma pokrycie w liczbach.",
          en: "On a short hire the energy-cost difference is noticeable but not decisive. It becomes real on a monthly rental with a 3,000 km allowance: at that mileage, charging versus refuelling turns into a budget line rather than a talking point. For companies costing a fleet, it is usually the first argument backed by actual numbers.",
        },
        {
          pl: "Wynajem miesięczny elektryka bywa też najtańszym sposobem, żeby sprawdzić go przed decyzją o zakupie albo o zmianie floty — bez wkładu własnego, bez leasingu i bez ryzyka, że po trzech miesiącach okaże się, że jednak nie pasuje do Waszych tras.",
          en: "A monthly electric rental is also often the cheapest way to test one before committing to a purchase or a fleet change — no down payment, no lease, and no risk of discovering after three months that it does not fit your routes.",
        },
      ],
    },
    {
      heading: {
        pl: "Warunki wynajmu",
        en: "Rental terms",
      },
      body: [
        {
          pl: "Te same co dla całej floty: minimalny wiek kierowcy {minAge} lat, ważne prawo jazdy i dokument tożsamości, pełne ubezpieczenie OC i AC w stawce, faktura VAT do każdego wynajmu.{minAgeNote} Kaucja zależy od modelu i mieści się w przedziale od 2 000 zł do 6 000 zł, jest zwrotna i rozliczana po zwrocie auta.",
          en: "The same as for the rest of the fleet: minimum driver age {minAge}, a valid licence and photo ID, full insurance in the rate, and a VAT invoice for every rental.{minAgeNote} The deposit depends on the model, runs from 2,000 zł to 6,000 zł, is refundable and settled after the car comes back.",
        },
        {
          pl: "Limit kilometrów: 300 km na dobę do 6 dni, 250 km na dobę od 7 dni i 3 000 km miesięcznie przy najmie miesięcznym. Dostawa pod adres w Warszawie oraz na Lotnisko Chopina.",
          en: "Mileage: 300 km per day up to 6 days, 250 km per day from 7 days, and 3,000 km per month on monthly hires. Delivery to any address in Warsaw and to Chopin Airport.",
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
          pl: "Jesteśmy warszawską wypożyczalnią samochodów premium. {electricCount} z {fleetCount} aut w naszej flocie są w pełni elektryczne — to nie jest jeden pokazowy egzemplarz dostawiony do oferty, tylko stała część floty, którą znamy z eksploatacji i z historii serwisowej.",
          en: "We are a Warsaw premium car hire company. {electricCount} of the {fleetCount} cars in our fleet are fully electric — not a single showpiece added to the price list, but a permanent part of the fleet we know from running it and from its service history.",
        },
      ],
    },
  ],
  faq: [
    {
      q: {
        pl: "Jakie auta elektryczne macie w wynajmie?",
        en: "Which electric cars do you rent?",
      },
      a: {
        pl: "Trzy: Teslę Model S (limuzyna), Teslę Model X (SUV, sześć miejsc) i Jaguara I-PACE (SUV). Wszystkie są w pełni elektryczne, nie hybrydowe.",
        en: "Three: the Tesla Model S (saloon), the Tesla Model X (six-seat SUV) and the Jaguar I-PACE (SUV). All are fully electric, not hybrids.",
      },
    },
    {
      q: {
        pl: "Jaki mają zasięg?",
        en: "What range do they have?",
      },
      a: {
        pl: "Nie podajemy jednej liczby, bo realny zasięg zależy od prędkości, temperatury, obciążenia i stylu jazdy — katalogowa wartość potrafi się rozminąć z rzeczywistością o jedną trzecią. Powiedz nam, jaką trasę planujesz, a powiemy, czego się spodziewać i gdzie się zatrzymać.",
        en: "We do not quote a single figure, because real range depends on speed, temperature, load and driving style — the brochure number can miss reality by a third. Tell us the route you are planning and we will tell you what to expect and where to stop.",
      },
    },
    {
      q: {
        pl: "Czy elektryk wjedzie do Strefy Czystego Transportu?",
        en: "Can an electric car enter the clean transport zone?",
      },
      a: {
        pl: "Tak, bez ograniczeń. Auta w pełni elektryczne nie mają emisji spalin, więc nie obowiązują ich normy emisji ani ograniczenia rocznikowe stosowane w strefach czystego transportu.",
        en: "Yes, without restriction. Fully electric cars have no tailpipe emissions, so the emissions standards and model-year limits used in clean transport zones do not apply to them.",
      },
    },
    {
      q: {
        pl: "Nigdy nie jeździłem elektrykiem — poradzę sobie?",
        en: "I have never driven an electric car — will I manage?",
      },
      a: {
        pl: "Tak. Przy wydaniu auta pokazujemy ładowanie, sprawdzanie stanu naładowania i planowanie trasy — kilka minut. Prowadzenie jest prostsze niż w aucie spalinowym, bo nie ma skrzyni biegów; jedyną nowością jest ładowanie.",
        en: "Yes. At handover we walk you through charging, checking the state of charge and route planning — a few minutes. Driving is simpler than in a combustion car because there is no gearbox; charging is the only new thing.",
      },
    },
    {
      q: {
        pl: "Z jakim poziomem naładowania trzeba zwrócić auto?",
        en: "What state of charge do I return the car with?",
      },
      a: {
        pl: "Ustalamy to przy rezerwacji i zapisujemy w umowie, tak jak poziom paliwa w aucie spalinowym. Auto wydajemy naładowane.",
        en: "It is agreed when you book and written into the contract, just like a fuel level in a combustion car. The car goes out charged.",
      },
    },
    {
      q: {
        pl: "Czy elektryka można wynająć na miesiąc?",
        en: "Can I rent an electric car for a month?",
      },
      a: {
        pl: "Tak — od 30 dni obowiązuje stawka miesięczna z limitem 3 000 km. Przy takim przebiegu różnica między ładowaniem a tankowaniem staje się realną pozycją w budżecie, więc to najczęstszy scenariusz dla firm.",
        en: "Yes — from 30 days the monthly rate applies, with a 3,000 km allowance. At that mileage the gap between charging and refuelling becomes a real budget line, which is why it is the most common company scenario.",
      },
    },
  ],
  ctaTitle: {
    pl: "Sprawdź dostępność auta elektrycznego na wybrane dni",
    en: "Check electric car availability for your dates",
  },
};
