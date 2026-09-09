// Legal copy for the Regulamin (terms) and Polityka prywatności (privacy) pages.
//
// Written for THIS business: a reservation-only website (no online payment, no
// payment operator), a fleet insured OC + AC, GPS-equipped vehicles, handover in
// Warsaw, and the rental contract signed on handover. Anything the
// site states elsewhere — deposit range, mileage limits, extras, airport
// delivery — is repeated here in the same terms, because a rulebook that
// contradicts the FAQ is worse than none.
//
// Amounts that exist nowhere else on the site (breach fees, excess) are stated
// in full below. Amounts that DO exist elsewhere (per-day extras, delivery
// fees) are deliberately referenced rather than repeated: the operator edits
// those in the admin panel, and a second copy here would silently drift.
//
// ŹRÓDŁEM ZASAD JEST PAKIET DOKUMENTÓW A&A z 30.08.2026 — Umowa Najmu Pojazdu,
// OWN, Tabela Opłat Dodatkowych, Zasady Kaucji i Rozliczenia Szkód, Procedura
// Wypadku/Awarii/Kradzieży oraz Klauzula RODO + GPS (wgrane w panelu, katalog
// `documents`). Regulamin dostosowuje się do dokumentów, nigdy odwrotnie:
// limit kilometrów, zakazy, kaucja, odpowiedzialność za szkodę i przestój,
// wyjazd za granicę oraz Załączniki 1 i 2 pochodzą wprost stamtąd. Zmiana
// stawki albo zasady po tej stronie bez zmiany w dokumencie źródłowym jest
// błędem, nawet jeżeli brzmi rozsądnie.
//
// Danych rejestrowych (NIP, REGON, KRS/CEIDG) nie ma tu celowo: same dokumenty
// źródłowe mają w tych miejscach puste pola, a publiczny regulamin nie może
// podawać numeru, którego właściciel nie potwierdził. Adres siedziby jest ten
// sam co w Umowie i w Klauzuli RODO. Klauzule, które polskie prawo konsumenckie
// traktuje jako abuzywne (zryczałtowane koszty windykacji, odmowa „bez
// powodu", odpowiedzialność blankietowa), są pominięte albo zawężone.

export type LegalSection = { h: string; p: string[] };
export type LegalDoc = {
  title: string;
  updatedLabel: string;
  intro: string;
  /** Adnotacja pod wstępem — opcjonalna; brak oznacza brak akapitu na stronie. */
  note?: string;
  /**
   * Opis dla wyszukiwarki, gdy `intro` się do tego nie nadaje.
   *
   * Wstęp dokumentu prawnego jest pisany jako JEDNO precyzyjne zdanie i bywa
   * długi — polityka prywatności ma go na 273 znaki bez ani jednej kropki
   * w środku. Generator opisów (`clampDescription`) nie ma się wtedy do czego
   * cofnąć i musi uciąć na granicy słowa, co dawało na produkcji 05.09.2026
   * opis urwany wielokropkiem w PL i EN.
   *
   * To nie jest usterka generatora ani powód, by skracać zdanie prawne:
   * dokument ma być precyzyjny, a nie mieścić się w wyniku wyszukiwania.
   * Strona, której wstęp nie nadaje się na opis, dostaje więc opis własny —
   * pełne zdanie, mówiące to samo krócej. Brak pola = `intro` jest dobre
   * i jedzie do znacznika bez zmian.
   */
  metaDescription?: string;
  sections: LegalSection[];
};

export type LegalKind = "terms" | "privacy";

const UPDATED = "31.08.2026";
/**
 * Polityka prywatności ma WŁASNĄ datę, bo zmieniła się osobno.
 *
 * Wspólna stała kazałaby przy każdej poprawce polityki twierdzić, że zmienił
 * się także regulamin — a to jest inny dokument, z inną historią wersji i z
 * innymi skutkami dla umowy. 02.09.2026 dołożony został punkt 11 o asystencie.
 */
const UPDATED_PRIVACY = "02.09.2026";
/** Wersja pakietu dokumentów A&A (Umowa, OWN, Tabela Opłat, Kaucja, RODO+GPS). */
const DOCS_VERSION = "30.08.2026";
const COMPANY = "A&A Corporation";
const EMAIL = "kontakt@aacorporation.pl";
const PHONE = "+48 884 762 950";
const PHONE_EN = "+47 462 67 097";
/**
 * Adres siedziby — dokładnie ten, który widnieje w Umowie Najmu i w Klauzuli
 * RODO. Numeru NIP, REGON i KRS/CEIDG dokumenty źródłowe jeszcze nie zawierają
 * (są w nich puste pola), więc nie ma ich również tutaj: publiczny regulamin
 * nie może podawać danych rejestrowych, których właściciel nie potwierdził.
 */
const ADDRESS_PL = "ul. Ruczaj 89, 02-997 Warszawa";
const ADDRESS_EN = "ul. Ruczaj 89, 02-997 Warsaw, Poland";

const pl: Record<LegalKind, LegalDoc> = {
  terms: {
    title: "Regulamin wynajmu",
    updatedLabel: `Ostatnia aktualizacja: ${UPDATED}`,
    intro:
      `Niniejszy regulamin (Ogólne Warunki Umowy) określa zasady korzystania z serwisu ${COMPANY} ` +
      "oraz warunki rezerwacji i najmu pojazdów. Złożenie rezerwacji oznacza akceptację regulaminu.",
    sections: [
      {
        h: "§1. Postanowienia ogólne",
        p: [
          `Wynajmującym jest ${COMPANY}, ${ADDRESS_PL}, kontakt: ${EMAIL}, ` +
            `tel. ${PHONE} (PL), ${PHONE_EN} (EN).`,
          "Regulamin określa szczegółowe warunki umów najmu pojazdów zawieranych przez Wynajmującego oraz zasady rezerwacji pojazdów za pośrednictwem serwisu internetowego aacorporation.pl, telefonicznie i pocztą elektroniczną.",
          "Wynajmujący prowadzi wynajem i obsługę wydania pojazdów na terenie Warszawy, wraz z dostawą pod wskazany adres oraz odbiorem z lotnisk obsługiwanych zgodnie z cennikiem.",
          `Regulamin stosuje się do wszystkich rezerwacji złożonych od dnia ${UPDATED} r. Odpowiada on Ogólnym Warunkom Najmu (OWN) A&A Corporation w wersji z ${DOCS_VERSION} r.`,
          "Integralnymi częściami umowy najmu są: Ogólne Warunki Najmu (OWN), Tabela Opłat Dodatkowych, Protokół Wydania Pojazdu, Protokół Zwrotu Pojazdu, Zasady Kaucji i Rozliczenia Szkód, Procedura Wypadku / Kolizji / Awarii / Kradzieży oraz Klauzula Informacyjna RODO + GPS.",
          "W razie sprzeczności postanowień podpisanej umowy najmu z regulaminem strony wiąże umowa najmu, z zastrzeżeniem bezwzględnie obowiązujących przepisów prawa.",
        ],
      },
      {
        h: "§2. Definicje",
        p: [
          "Wynajmujący — podmiot wskazany w §1, oddający pojazd w najem.",
          "Najemca — osoba fizyczna, osoba prawna lub jednostka organizacyjna, która składa rezerwację i zawiera umowę najmu.",
          "Użytkownik (dodatkowy kierowca) — osoba wpisana do umowy najmu jako uprawniona do kierowania pojazdem.",
          "Rezerwacja — zgłoszenie chęci najmu pojazdu w wybranym terminie, złożone za pośrednictwem serwisu, telefonicznie lub e-mailem.",
          "Umowa najmu — umowa zawierana przy wydaniu pojazdu, określająca szczegółowe warunki najmu.",
          "Protokół — protokół zdawczo-odbiorczy opisujący stan pojazdu przy wydaniu i przy zwrocie.",
          "Cennik — cennik stawek najmu, opłat dodatkowych i opłat za naruszenia publikowany w serwisie Wynajmującego, wraz z załącznikami do niniejszego regulaminu.",
          "Doba najmu — 24 godziny liczone od godziny wydania pojazdu wskazanej w umowie najmu.",
          "Kaucja — zwrotne zabezpieczenie roszczeń Wynajmującego, o którym mowa w §7.",
        ],
      },
      {
        /**
         * DO AKCEPTACJI PRAWNEJ — nie zmieniać bez zgody właściciela i prawnika.
         * Zgłoszone 21.08.2026, decyzja właściciela: regulamin zostaje bez zmian,
         * miejsca zostają wyłącznie oznaczone.
         *
         * Akapit 1 mówi „ukończyła 21 lat". Panel pozwala ustawić próg klasowy
         * 25 lat dla Premium i Van/Bus. Dziś nie ma rozjazdu, bo egzekwowanie
         * progów klas jest WYŁĄCZONE i formularz stosuje 21 — ale w dniu, w
         * którym właściciel je włączy, ten akapit trzeba przejrzeć z prawnikiem.
         *
         * Akapit 2 („wyższy wiek dla wybranych modeli, podawany przy
         * potwierdzeniu rezerwacji") pokrywa próg 25 co do zasady. Rozbieżność
         * dotyczy MOMENTU: my odmawiamy już przy składaniu rezerwacji, a nie
         * przy jej potwierdzaniu. To jest zdanie do przeredagowania.
         *
         * Wzmianka o „dłuższym stażu za kierownicą" w akapicie 2 oraz o prawie
         * jazdy „wydanym co najmniej rok przed" w akapicie 1 zostaje w umowie i
         * jest weryfikowana przez pracownika przy wydaniu auta. System stażu NIE
         * sprawdza i nigdzie go klientowi nie komunikuje
         * (`LICENCE_TENURE_ENFORCEABLE = false`) — to nie jest rozjazd, to
         * warunek umowny egzekwowany poza systemem.
         *
         * Pełny opis: docs/ZLECENIE-WIEK-KIEROWCY.md, sekcja 6.
         */
        h: "§3. Kto może wynająć i prowadzić pojazd",
        p: [
          "Najemcą oraz osobą uprawnioną do kierowania pojazdem może być osoba fizyczna, która ukończyła 21 lat i posiada ważne prawo jazdy honorowane na terytorium RP, wydane co najmniej rok przed dniem zawarcia umowy, oraz ważny dokument tożsamości (dowód osobisty lub paszport).",
          "Dla wybranych modeli Wynajmujący może wymagać wyższego wieku lub dłuższego stażu za kierownicą — warunek ten jest podawany przy potwierdzeniu rezerwacji, przed zawarciem umowy.",
          "Najemcą może być również osoba prawna lub jednostka organizacyjna, o której mowa w art. 33¹ Kodeksu cywilnego. Osoba zawierająca umowę w jej imieniu przedstawia dokument potwierdzający umocowanie (odpis z rejestru, pełnomocnictwo) oraz własny dokument tożsamości i prawo jazdy.",
          "Pojazd może prowadzić wyłącznie Najemca lub osoba wpisana do umowy najmu jako dodatkowy kierowca. Wpisanie dodatkowego kierowcy podlega opłacie zgodnie z cennikiem.",
          "Warunki wskazane w niniejszym paragrafie obowiązują przez cały okres najmu. W razie ich niespełnienia Wynajmujący może odmówić wydania pojazdu albo wypowiedzieć umowę najmu ze skutkiem natychmiastowym.",
          "Wynajmujący jest uprawniony do weryfikacji przedstawionych dokumentów w zakresie dopuszczalnym prawem, w tym w rejestrach publicznych (KRS, CEIDG).",
          "W razie odwołania upoważnienia dla dodatkowego kierowcy Najemca niezwłocznie informuje o tym Wynajmującego.",
        ],
      },
      {
        h: "§4. Rezerwacja i zawarcie umowy",
        p: [
          "Rezerwację składa się przez formularz dostępny w serwisie aacorporation.pl, telefonicznie lub pocztą elektroniczną.",
          "Serwis nie pobiera płatności online i nie wymaga przedpłaty przy składaniu rezerwacji. Rezerwacja złożona w serwisie stanowi zapytanie o dostępność pojazdu i nie jest równoznaczna z zawarciem umowy najmu.",
          "Po otrzymaniu rezerwacji Wynajmujący potwierdza jej przyjęcie na wskazany adres e-mail, a następnie potwierdza dostępność pojazdu i warunki najmu.",
          "Warunkami potwierdzenia rezerwacji są: spełnienie wymogów z §3, podanie danych wymaganych w formularzu oraz akceptacja niniejszego regulaminu.",
          "Wynajmujący może odmówić potwierdzenia rezerwacji, w szczególności w razie niedostępności pojazdu w wybranym terminie, negatywnej weryfikacji danych lub niespełnienia warunków z §3. Odmowa nie rodzi po stronie Najemcy żadnych kosztów.",
          "Dokumenty wskazane w §1 Wynajmujący przekazuje lub udostępnia Najemcy przed zawarciem umowy najmu — przez system rezerwacyjny i stronę aacorporation.pl albo pocztą elektroniczną na adres e-mail wskazany przez Najemcę.",
          "Przy rezerwacji telefonicznej oraz przy najmie bez wcześniejszej rezerwacji internetowej Najemca podaje adres e-mail, na który Wynajmujący wysyła dokumenty i warunki najmu przed zawarciem umowy. Adres ten jest wpisywany do umowy najmu.",
          "Sposób udostępnienia dokumentów — e-mail albo system rezerwacyjny i strona WWW — oraz adres e-mail Najemcy są potwierdzane w umowie najmu. Podpisując umowę, Najemca potwierdza otrzymanie lub udostępnienie dokumentów oraz możliwość zapoznania się z nimi przed zawarciem umowy; odrębny podpis pod każdym z dokumentów nie jest wymagany.",
          "Do danego najmu stosuje się wersję regulaminu i pozostałych dokumentów przekazaną lub udostępnioną Najemcy przed zawarciem umowy. Późniejsza zmiana dokumentu w serwisie nie zmienia automatycznie umowy już zawartej.",
          "Do zawarcia umowy najmu dochodzi z chwilą jej podpisania przez Najemcę i przedstawiciela Wynajmującego oraz wydania pojazdu. Jeżeli umowę zawiera więcej niż jeden Najemca, ich odpowiedzialność jest solidarna.",
          "Jeżeli Wynajmujący nie może wydać pojazdu zgodnego z potwierdzoną rezerwacją, zaproponuje pojazd tej samej lub wyższej klasy w stawce wynikającej z rezerwacji. Najemca, który nie wyraża zgody na zmianę pojazdu, może odstąpić od rezerwacji bez ponoszenia kosztów.",
        ],
      },
      {
        h: "§5. Zmiana i anulowanie rezerwacji",
        p: [
          "Najemca może anulować rezerwację w każdej chwili przed wydaniem pojazdu, samodzielnie w panelu „Moje rezerwacje” albo kontaktując się z Wynajmującym. Anulowanie zgłoszone wcześniej niż na 24 godziny przed umówioną godziną wydania jest bezpłatne.",
          "Anulowanie zgłoszone później podlega opłacie zależnej od tego, ile czasu pozostało do umówionej godziny wydania: w przedziale od 24 do 12 godzin oraz poniżej 12 godzin obowiązują stawki wskazane w Rezerwacji, w Tabeli Opłat Dodatkowych i w cenniku. Niezgłoszenie się po pojazd w umówionym terminie (no-show) podlega odrębnej opłacie, naliczanej po upływie tolerancji wskazanej w Rezerwacji.",
          "Opłata za anulowanie ani opłata za niezgłoszenie się po pojazd nie może przekroczyć całkowitej wartości rezerwacji. Wysokość opłat obowiązujących dla danej rezerwacji jest utrwalana w chwili jej złożenia — późniejsza zmiana cennika nie zmienia warunków rezerwacji już zawartej.",
          "Wynajmujący może odstąpić od naliczenia opłaty za anulowanie w indywidualnie uzasadnionych przypadkach.",
          "Zmiana terminu, miejsca wydania lub klasy pojazdu jest możliwa w miarę dostępności floty, po potwierdzeniu przez Wynajmującego.",
          "Wynajmujący może anulować rezerwację do chwili wydania pojazdu z przyczyn obiektywnych (m.in. szkoda w pojeździe, niezwrócenie pojazdu przez poprzedniego Najemcę). W takim przypadku zwraca Najemcy wszelkie otrzymane wpłaty i, w miarę możliwości, proponuje pojazd zastępczy.",
          "Zgodnie z art. 38 pkt 12 ustawy o prawach konsumenta prawo odstąpienia od umowy zawartej na odległość nie przysługuje w odniesieniu do usług najmu pojazdów ze wskazanym dniem lub okresem świadczenia usługi. Nie ogranicza to prawa do anulowania rezerwacji na zasadach opisanych powyżej.",
        ],
      },
      {
        h: "§6. Wydanie pojazdu",
        p: [
          "Pojazd wydawany jest w miejscu i czasie uzgodnionym w rezerwacji — w biurze Wynajmującego, pod wskazanym adresem albo na lotnisku, zgodnie z cennikiem dostaw.",
          "Wydanie poza standardowymi godzinami pracy jest możliwe za dodatkową opłatą zgodnie z cennikiem.",
          "Przy wydaniu sporządzany jest Protokół opisujący stan pojazdu, stan licznika i poziom paliwa. Najemca zapoznaje się ze stanem pojazdu i zgłasza zastrzeżenia przed odjazdem — zastrzeżenia odnotowuje się w Protokole.",
          "Pojazd wydawany jest czysty i zatankowany, z ważnymi dokumentami i wyposażeniem wymaganym przepisami.",
          "Odbioru pojazdu dokonuje Najemca osobiście albo osoba wpisana w umowie jako dodatkowy kierowca, po okazaniu dokumentów wskazanych w §3.",
        ],
      },
      {
        h: "§7. Płatności, kaucja i faktury",
        p: [
          "Czynsz najmu naliczany jest za dobę najmu, według stawki obowiązującej w chwili potwierdzenia rezerwacji, i płatny z góry — przelewem bankowym lub kartą płatniczą przy wydaniu pojazdu. Wynajmujący wystawia fakturę VAT do każdego najmu.",
          "Kaucja lub preautoryzacja stanowi zabezpieczenie należności związanych z konkretnym najmem. Nie jest karą, automatycznym odszkodowaniem ani zgodą Najemcy na dowolne obciążenie. Jej wysokość zależy od modelu i wynosi od 2 000 zł do 6 000 zł; kwota właściwa dla danego pojazdu podawana jest przed zawarciem umowy najmu.",
          "Kaucja pobierana jest w formie blokady (preautoryzacji) na karcie płatniczej Najemcy albo przelewem.",
          "W razie szkody lub poważnego naruszenia umowy Wynajmujący może wstrzymać zwolnienie odpowiedniej części kaucji lub preautoryzacji na czas niezbędny do ustalenia podstawy odpowiedzialności, związku ze zdarzeniem i wysokości należności. Nie stosuje się automatycznego przepadku całej kaucji za samo naruszenie.",
          "Potrącenie z kaucji następuje wyłącznie w uzasadnionej wysokości i wyłącznie w zakresie należności mających podstawę w umowie najmu, regulaminie, Tabeli Opłat Dodatkowych i przepisach prawa. Najemca otrzymuje wskazanie zdarzenia, podstawy oraz sposobu wyliczenia obciążenia, a pozostała część zabezpieczenia podlega zwolnieniu.",
          "Jeżeli po zwrocie pojazdu nie stwierdzono podstaw do zatrzymania kaucji, Wynajmujący zleca jej zwolnienie bez zbędnej zwłoki. Przy preautoryzacji moment faktycznego odblokowania środków zależy również od banku lub operatora płatności. Jeżeli konieczna jest dalsza weryfikacja szkody, Najemca otrzymuje informację o przyczynie i dalszym sposobie rozliczenia.",
          "Wysokość kaucji nie stanowi maksymalnego limitu odpowiedzialności Najemcy. Jeżeli prawidłowo ustalona i należycie wykazana należność przewyższa kaucję, Wynajmujący może dochodzić pozostałej należności od Najemcy zgodnie z umową najmu i przepisami prawa. Zwrot kaucji nie oznacza zrzeczenia się roszczeń, które ujawnią się po zwrocie pojazdu.",
          "Wariant najmu bez kaucji oznacza brak pobrania standardowego zabezpieczenia przy wydaniu pojazdu. Nie zwalnia Najemcy z odpowiedzialności za szkody, opłaty i inne należności, za które odpowiada zgodnie z umową najmu i przepisami prawa.",
          "Opóźnienie w zwrocie pojazdu do 1 godziny nie powoduje naliczenia kolejnej doby najmu. Opóźnienie przekraczające 1 godzinę powoduje naliczenie opłaty za kolejną rozpoczętą dobę według stawki z umowy najmu.",
          "Przedłużenie najmu wymaga zgody Wynajmującego i opłacenia dodatkowego okresu z góry, najpóźniej do godziny, w której upływa pierwotny termin zwrotu.",
        ],
      },
      {
        h: "§8. Zasady używania pojazdu",
        p: [
          "Najemca oraz każda osoba kierująca pojazdem zobowiązani są do: posiadania przy sobie dokumentów wymaganych przez służby kontroli ruchu drogowego; zabezpieczenia pojazdu, kluczyków i dokumentów przed kradzieżą przy każdym opuszczeniu pojazdu; zamykania pojazdu i korzystania z fabrycznych zabezpieczeń; bieżącej obsługi pojazdu (kontrola poziomu oleju i płynów, ciśnienia w ogumieniu, działania oświetlenia); tankowania paliwa zgodnego ze specyfikacją silnika oraz utrzymywania pojazdu w należytej czystości.",
          "Zabronione jest w szczególności: prowadzenie pojazdu po spożyciu alkoholu, w stanie nietrzeźwości, pod wpływem narkotyków lub innych środków odurzających, a także pod wpływem leków lub innych substancji ograniczających zdolność bezpiecznego prowadzenia; spożywanie alkoholu i środków odurzających w pojeździe; prowadzenie pojazdu bez ważnych uprawnień, w okresie ich zatrzymania, zawieszenia albo cofnięcia.",
          "Zabronione jest również: palenie w pojeździe papierosów, cygar i fajki; używanie e-papierosów oraz podgrzewaczy tytoniu, a także innych produktów pozostawiających dym, parę, popiół lub trwały zapach; niszczenie, uszkadzanie lub dewastowanie pojazdu, w tym karoserii, lakieru, szyb, felg, opon, foteli, tapicerki, podsufitki, deski rozdzielczej, ekranów, elektroniki i pozostałego wyposażenia.",
          "Zabronione jest ponadto: przekazywanie pojazdu osobie niewpisanej do umowy najmu; podnajem, użyczenie, zastawienie lub inne rozporządzenie pojazdem bez wymaganej zgody Wynajmującego; udział w wyścigach, rajdach, zawodach, treningach i testach sportowych; drift; jazda poza drogami przeznaczonymi do ruchu (off-road); nauka jazdy; holowanie innych pojazdów bez uprzedniej pisemnej zgody Wynajmującego; zarobkowy przewóz osób lub rzeczy, taxi, ride-hailing, kurierstwo i dostawy bez pisemnej zgody Wynajmującego.",
          "Zabronione jest także: ingerowanie w GPS, telematykę, elektronikę, systemy bezpieczeństwa i zabezpieczenia pojazdu, w tym ich demontaż, odłączanie, zasłanianie lub uszkadzanie; usuwanie, zakrywanie i zmienianie oznaczeń pojazdu; dokonywanie samodzielnych napraw, przeróbek i modyfikacji bez zgody Wynajmującego; tankowanie paliwa innego niż wymagane dla pojazdu; przeciążanie pojazdu oraz przewożenie większej liczby osób lub ładunku niż dopuszcza pojazd; przewożenie zwierząt bez zgody Wynajmującego; przewożenie materiałów niebezpiecznych, nielegalnych lub mogących uszkodzić albo trwale zabrudzić pojazd; kontynuowanie jazdy mimo kontrolki, komunikatu lub usterki, jeżeli dalsza jazda może zwiększyć szkodę.",
          "Kierowanie pojazdem po spożyciu alkoholu, środków odurzających lub bez wymaganych uprawnień stanowi rażące naruszenie umowy i może prowadzić do ograniczenia albo odmowy ochrony ubezpieczeniowej.",
          "Naruszenie zakazu może skutkować naliczeniem opłaty wskazanej w Załączniku nr 2 oraz — niezależnie od niej i bez podwójnego obciążenia za ten sam uszczerbek — odpowiedzialnością za należycie wykazaną szkodę, jeżeli faktycznie wystąpiła.",
          "Najemca zapoznaje każdą osobę, której powierza kierowanie pojazdem, z obowiązkami wynikającymi z umowy i regulaminu i odpowiada za ich przestrzeganie.",
          "Wynajmujący ma prawo kontrolować sposób korzystania z pojazdu oraz jego stan, a Najemca ma obowiązek taką kontrolę umożliwić.",
          "Najemca odpowiada za prawidłowy montaż i użycie wyposażenia dodatkowego (m.in. fotelika dziecięcego).",
        ],
      },
      {
        h: "§9. Limity kilometrów",
        p: [
          "Najem obejmuje limit przebiegu: 300 km na dobę przy najmie od 1 do 6 dni, 250 km na dobę przy najmie od 7 do 29 dni oraz 3 000 km miesięcznie przy najmie od 30 dni, o ile umowa najmu lub indywidualna oferta nie stanowi inaczej.",
          "Przekroczenie limitu rozliczane jest według stawki za kilometr wskazanej w umowie najmu lub w cenniku, zależnej od modelu pojazdu, na podstawie różnicy wskazań licznika.",
          "Odczyt licznika przy wydaniu i przy zwrocie odnotowywany jest w Protokole.",
        ],
      },
      {
        h: "§10. Wyjazd poza granice Polski",
        p: [
          "Pojazd przeznaczony jest do użytkowania wyłącznie na terytorium Rzeczypospolitej Polskiej. Wyjazd, przewiezienie, przemieszczenie lub umożliwienie przemieszczenia pojazdu poza granice Polski jest zabronione.",
          "Wyjątek jest możliwy wyłącznie po uprzedniej, wyraźnej pisemnej zgodzie Wynajmującego, udzielonej przed wyjazdem i wpisanej do umowy najmu albo do odrębnego aneksu podpisanego przed przekroczeniem granicy, oraz po spełnieniu warunków określonych przez Wynajmującego dla konkretnego pojazdu i najmu — w tym warunków wynikających z zakresu ubezpieczenia i Assistance oraz wskazanych krajów.",
          "Zgoda ustna, sama rozmowa telefoniczna, brak odpowiedzi Wynajmującego ani domniemanie zgody nie stanowią zezwolenia na wyjazd.",
          "W razie naruszenia zakazu Najemca niezwłocznie informuje Wynajmującego i stosuje się do otrzymanych instrukcji. Najemca ponosi opłatę wskazaną w Załączniku nr 2 oraz odpowiada za należycie wykazane szkody i uzasadnione koszty pozostające w związku z naruszeniem, w tym uzasadnione koszty sprowadzenia pojazdu do Polski, w zakresie dopuszczalnym przez prawo i warunki polisy.",
        ],
      },
      {
        h: "§11. Serwis, przeglądy i awarie",
        p: [
          "Najemca umożliwia Wynajmującemu wykonanie przeglądu okresowego pojazdu w miejscu i czasie uzgodnionym z Wynajmującym, jeżeli termin przeglądu przypada w okresie najmu. Koszt przeglądu na terenie Polski pokrywa Wynajmujący.",
          "Najemca nie jest uprawniony do zlecania napraw, przeróbek ani innych czynności obsługowych bez zgody Wynajmującego. Naprawa uzgodniona z Wynajmującym rozliczana jest na podstawie rachunków, po zwrocie wymienionych części.",
          "W razie awarii, unieruchomienia pojazdu, kolizji lub innego zdarzenia Najemca niezwłocznie kontaktuje się z Wynajmującym i stosuje się do otrzymanych instrukcji. Kontakt z Assistance następuje za pośrednictwem Wynajmującego, chyba że przy wydaniu pojazdu przekazano Najemcy bezpośredni numer Assistance.",
          "Zakres pomocy — w tym holowanie, naprawa na miejscu, ewentualny pojazd zastępczy oraz koszty z tym związane — wynika z zakresu ochrony i Assistance przypisanego do konkretnego pojazdu oraz z warunków najmu. Wynajmujący nie gwarantuje pojazdu zastępczego w każdej sytuacji ani określonego czasu jego podstawienia; możliwości są ustalane indywidualnie po zgłoszeniu zdarzenia.",
          "Jeżeli pojazd zastępczy zostanie udostępniony i należy do niższej klasy niż pojazd wynajęty, czynsz ulega odpowiedniemu obniżeniu.",
          "Numer kontaktowy do zgłoszenia zdarzenia wskazany jest w umowie najmu. W sytuacji zagrożenia życia lub zdrowia w pierwszej kolejności należy wezwać numer alarmowy 112.",
        ],
      },
      {
        h: "§12. Uszkodzenie, wypadek, kradzież — procedura",
        p: [
          "W razie uszkodzenia pojazdu, wypadku, kolizji, awarii, włamania, kradzieży lub utraty kluczyków Najemca zobowiązany jest do: zatrzymania pojazdu w bezpiecznym miejscu i zabezpieczenia miejsca zdarzenia, o ile można to zrobić bez narażania siebie lub innych; zabezpieczenia pojazdu przed dalszym uszkodzeniem; niezwłocznego zgłoszenia zdarzenia Wynajmującemu i postępowania zgodnie z otrzymanymi instrukcjami; wykonania zdjęć oraz zebrania danych uczestników, świadków i ubezpieczenia; a w razie kradzieży — zawiadomienia Policji oraz przekazania Wynajmującemu posiadanych kluczyków i dokumentów pojazdu.",
          "Policję lub numer alarmowy 112 należy wezwać, gdy wymagają tego przepisy lub okoliczności, w szczególności gdy: są osoby ranne; doszło do kradzieży pojazdu, kluczyków, dokumentów albo do włamania; istnieje podejrzenie, że uczestnik zdarzenia jest pod wpływem alkoholu lub środków odurzających; uczestnik odmawia podania danych, oddala się z miejsca zdarzenia albo istnieje spór co do istotnych okoliczności zdarzenia; doszło do poważnego uszkodzenia pojazdu lub mienia. W sytuacji zagrożenia życia lub zdrowia pierwszeństwo mają bezpieczeństwo osób i polecenia służb.",
          "Najemca nie zleca napraw ani holowania poza wskazanym Assistance bez zgody Wynajmującego, chyba że natychmiastowe działanie jest obiektywnie konieczne dla bezpieczeństwa. Nie kontynuuje jazdy, jeżeli pojazd jest niesprawny albo dalsza jazda może zwiększyć szkodę.",
          "Jeżeli sprawcą zdarzenia jest kierujący innym pojazdem, Najemca ustala jego dane, numer rejestracyjny i numer polisy OC, a także dane świadków, oraz przekazuje je Wynajmującemu.",
          "Niewezwanie Policji lub niezgłoszenie zdarzenia Wynajmującemu może skutkować odmową wypłaty odszkodowania przez ubezpieczyciela; w takim zakresie, w jakim ubezpieczyciel odmówi wypłaty z tej przyczyny, Najemca odpowiada za powstałą szkodę.",
          "Złożenie nieprawdziwego oświadczenia o okolicznościach szkody zwalnia Wynajmującego z ograniczeń odpowiedzialności wynikających z wykupionego pakietu ochronnego.",
        ],
      },
      {
        h: "§13. Ubezpieczenie i odpowiedzialność za szkodę",
        p: [
          "Każdy pojazd we flocie posiada ubezpieczenie OC posiadaczy pojazdów mechanicznych oraz ubezpieczenie AC. Zakres ochrony, udział własny, wyłączenia i Assistance wynikają z aktualnej polisy konkretnego pojazdu oraz z wariantu wskazanego w umowie najmu.",
          "Odpowiedzialność Najemcy ustalana jest indywidualnie — na podstawie przepisów prawa, umowy najmu, regulaminu, warunków polisy i okoliczności zdarzenia, po ustaleniu podstawy odpowiedzialności, związku przyczynowego i wysokości szkody. Samo stwierdzenie różnicy przy zwrocie pojazdu nie stanowi podstawy obciążenia.",
          "Jeżeli Najemca odpowiada za uszkodzenie lub zniszczenie pojazdu, Wynajmujący może dochodzić należycie wykazanej szkody oraz uzasadnionych kosztów, w szczególności: naprawy, części, robocizny, diagnostyki, holowania, transportu, przywrócenia pojazdu do właściwego stanu oraz innych należycie wykazanych kosztów pozostających w związku ze zdarzeniem.",
          "Rozliczenie uwzględnia świadczenia wypłacone przez ubezpieczyciela lub osobę trzecią. Za ten sam uszczerbek nie pobiera się podwójnej rekompensaty.",
          "Jeżeli wskutek zdarzenia, za które odpowiada Najemca, pojazd zostanie czasowo wyłączony z możliwości wynajmu, Wynajmujący może dochodzić należycie wykazanej szkody związanej z tym przestojem, w tym utraconych korzyści, jeżeli pozostają one w normalnym związku przyczynowym ze zdarzeniem. Nie stosuje się automatycznej opłaty liczonej jako liczba dni postoju pomnożona przez pełną stawkę najmu.",
          "Za szkodę w pojeździe, która nie została rozliczona z OC sprawcy, Najemca odpowiada do wysokości udziału własnego wskazanego w Załączniku nr 2, chyba że wykaże, że ani on, ani osoba kierująca pojazdem nie ponoszą winy. Udział własny nie jest automatyczną karą — stosuje się go zgodnie z umową, polisą i ustaloną odpowiedzialnością, a jeżeli rzeczywista, prawnie należna kwota jest niższa, rozliczenie nie przekracza tej kwoty.",
          "Wykupienie pakietu ochronnego, dostępnego przy rezerwacji zgodnie z cennikiem, obniża udział własny zgodnie z ofertą konkretnego pojazdu.",
          "Kierowanie pojazdem po spożyciu alkoholu lub środków odurzających, przez osobę nieuprawnioną, bez wymaganych uprawnień albo inne rażące naruszenie warunków polisy może prowadzić do ograniczenia lub odmowy ochrony ubezpieczeniowej. Nie oznacza to automatycznie dowolnej odpowiedzialności Najemcy — Wynajmujący wykazuje podstawę i wysokość dochodzonego roszczenia.",
          "Uszkodzenie i zabrudzenie tapicerki oraz braki w wyposażeniu pojazdu nie są objęte ubezpieczeniem ani pakietem ochronnym i rozliczane są zgodnie z Załącznikiem nr 2 albo według rzeczywistego, udokumentowanego kosztu.",
          "Wysokość kaucji nie ogranicza odpowiedzialności Najemcy. Jeżeli należycie wykazane i prawnie należne roszczenie przewyższa kaucję, Wynajmujący może dochodzić różnicy zgodnie z umową najmu i przepisami prawa.",
        ],
      },
      {
        h: "§14. Zwrot pojazdu",
        p: [
          "Najemca zwraca pojazd w miejscu i czasie uzgodnionym w umowie najmu. Zmiana miejsca lub terminu zwrotu wymaga uzgodnienia z Wynajmującym z co najmniej 12-godzinnym wyprzedzeniem.",
          "Pojazd należy zwrócić w stanie niepogorszonym ponad normalne zużycie — czysty wewnątrz i na zewnątrz oraz z takim poziomem paliwa lub energii, jaki odnotowano w Protokole przy wydaniu, wraz z kompletem kluczyków, dokumentów i wyposażenia.",
          "Przy zwrocie sporządzany jest Protokół wraz z dokumentacją zdjęciową, stanem licznika i poziomem paliwa lub baterii. Jeżeli pojazd jest zwracany w stanie uniemożliwiającym oględziny (np. znaczne zabrudzenie) albo przez osobę niewymienioną w umowie, Wynajmujący może sporządzić Protokół jednostronnie i doręczyć go Najemcy.",
          "Normalne zużycie wynikające z prawidłowej eksploatacji nie stanowi automatycznie szkody obciążającej Najemcę.",
          "Niezwrócenie pojazdu w terminie i korzystanie z niego mimo braku zgody na przedłużenie najmu stanowi naruszenie umowy. Wynajmujący może naliczyć opłatę za kolejną rozpoczętą dobę według stawki z umowy najmu, podjąć prawnie dopuszczalne działania zmierzające do odzyskania pojazdu, dochodzić należycie wykazanych należności i szkody oraz — w razie uzasadnionego podejrzenia przywłaszczenia — zawiadomić organy ścigania. Najemca odpowiada za pojazd, w tym za jego kradzież i uszkodzenie, także po upływie umówionego terminu zwrotu.",
          "Wynajmujący nie zwraca czynszu za niewykorzystany okres najmu w razie wcześniejszego zwrotu pojazdu ani wartości nadwyżki paliwa.",
        ],
      },
      {
        h: "§15. Opłaty dodatkowe, opłaty za naruszenia i mandaty",
        p: [
          "Opłaty dodatkowe i opłaty za naruszenia określają Załącznik nr 1 i Załącznik nr 2 do niniejszego regulaminu oraz cennik publikowany w serwisie. Odpowiadają one Tabeli Opłat Dodatkowych stanowiącej załącznik do umowy najmu.",
          "Każde obciążenie wskazuje zdarzenie, podstawę umowną lub prawną oraz sposób wyliczenia. Opłata za naruszenie może zostać naliczona wyłącznie po stwierdzeniu i udokumentowaniu zdarzenia; niezależnie od niej Wynajmujący może dochodzić należycie wykazanej szkody, jeżeli faktycznie wystąpiła — bez podwójnego obciążenia za ten sam uszczerbek.",
          "Szkody i ponadstandardowe zabrudzenia Wynajmujący dokumentuje protokołem, zdjęciami oraz — gdy jest to potrzebne — kosztorysem, fakturą albo innym wiarygodnym dokumentem. Normalne zużycie wynikające z prawidłowej eksploatacji nie jest dodatkowo płatne.",
          "Najemca pokrywa mandaty, opłaty za parkowanie, opłaty drogowe i inne należności wynikające z korzystania z pojazdu w okresie najmu, chyba że wykaże, że ani on, ani osoba kierująca pojazdem nie odpowiadają za ich powstanie.",
          "W razie zapytania uprawnionego organu Wynajmujący jest zobowiązany wskazać dane osoby, której powierzył pojazd. Obsługa takiego zapytania podlega opłacie administracyjnej zgodnie z Załącznikiem nr 2, naliczanej wyłącznie wtedy, gdy Wynajmujący rzeczywiście wykonał czynności administracyjne, a opłata jest prawnie dopuszczalna.",
          "Opłaty zastrzeżone wobec konsumentów stosuje się wyłącznie w zakresie dopuszczalnym przepisami o ochronie konsumentów; postanowienie sprzeczne z tymi przepisami nie wiąże konsumenta.",
          "Koszty windykacji rozliczane są na zasadach ogólnych wynikających z przepisów prawa, bez zryczałtowanych opłat po stronie konsumenta.",
        ],
      },
      {
        h: "§16. Reklamacje",
        p: [
          `Reklamacje można składać pocztą elektroniczną na adres ${EMAIL} lub pisemnie na adres siedziby Wynajmującego.`,
          "Reklamacja powinna zawierać dane kontaktowe, numer rezerwacji lub umowy najmu oraz opis zastrzeżeń.",
          "Wynajmujący rozpatruje reklamację w terminie 14 dni od jej otrzymania i informuje o sposobie rozpatrzenia na wskazany adres e-mail.",
          "Konsument może skorzystać z pozasądowych sposobów rozpatrywania reklamacji i dochodzenia roszczeń, w tym z pomocy powiatowego (miejskiego) rzecznika konsumentów oraz z postępowania przed wojewódzkim inspektorem Inspekcji Handlowej. Informacje o tych trybach dostępne są na stronach Urzędu Ochrony Konkurencji i Konsumentów.",
        ],
      },
      {
        h: "§17. Dane osobowe",
        p: [
          "Administratorem danych osobowych Najemcy oraz osób uprawnionych do kierowania pojazdem jest Wynajmujący.",
          "Zasady przetwarzania danych, w tym cele, podstawy prawne, odbiorców, okresy przechowywania i przysługujące prawa, opisuje Polityka prywatności dostępna w serwisie oraz Klauzula Informacyjna RODO + GPS udostępniana przed zawarciem umowy najmu.",
          "Pojazdy mogą być wyposażone w system GPS / telematyczny rejestrujący lokalizację pojazdu oraz dane techniczne związane z jego eksploatacją.",
          "Dane te wykorzystywane są wyłącznie w określonych, niezbędnych i proporcjonalnych celach, w szczególności: ochrony pojazdu i mienia; bezpieczeństwa floty; lokalizacji i odzyskania pojazdu w razie kradzieży; obsługi zdarzeń i szkód; ustalenia, dochodzenia lub obrony roszczeń; weryfikacji istotnych naruszeń umowy — w prawnie dopuszczalnym i proporcjonalnym zakresie.",
          "GPS nie służy do dowolnego, nieograniczonego śledzenia zachowania Najemcy. Dostęp do danych jest ograniczony do osób i podmiotów, które potrzebują go do realizacji określonego celu.",
          "Najemca nie może demontować, wyłączać, zasłaniać ani w inny sposób ingerować w urządzenia GPS i telematyczne.",
          "Potwierdzenie otrzymania Klauzuli RODO + GPS składane jest w umowie najmu razem z potwierdzeniem sposobu udostępnienia dokumentów; odrębny podpis pod klauzulą nie jest wymagany. Potwierdzenie otrzymania informacji nie stanowi zgody na przetwarzanie, jeżeli podstawą przetwarzania jest umowa, obowiązek prawny albo prawnie uzasadniony interes Wynajmującego.",
        ],
      },
      {
        h: "§18. Postanowienia końcowe",
        p: [
          "W sprawach nieuregulowanych regulaminem stosuje się przepisy Kodeksu cywilnego oraz — w umowach z konsumentami — przepisy o ochronie praw konsumentów.",
          "Wynajmujący może zmienić regulamin z ważnych przyczyn (zmiana przepisów, zakresu usług lub cennika). Do rezerwacji potwierdzonych przed dniem wejścia w życie zmian stosuje się regulamin w brzmieniu dotychczasowym.",
          "Strony informują się wzajemnie o zmianie adresu do doręczeń. Korespondencja związana z umową może być kierowana na adres e-mail wskazany w umowie najmu.",
          "Nieważność lub bezskuteczność któregokolwiek z postanowień regulaminu nie wpływa na ważność pozostałych postanowień.",
          "Spory z Najemcą niebędącym konsumentem rozstrzyga sąd właściwy dla siedziby Wynajmującego. Spory z konsumentem rozstrzyga sąd właściwy według przepisów Kodeksu postępowania cywilnego.",
        ],
      },
      {
        h: "Załącznik nr 1 — Opłaty dodatkowe",
        p: [
          "Aktualne stawki najmu oraz opłaty dodatkowe publikowane są w serwisie aacorporation.pl — w sekcji cennika oraz w formularzu rezerwacji, gdzie każda opłata jest widoczna przed złożeniem rezerwacji.",
          "Usługi dodatkowe obejmują w szczególności: podstawienie lub odbiór pojazdu pod wskazany adres; odbiór i zwrot na lotnisku; wydanie lub zwrot poza standardowymi godzinami pracy; dodatkowego kierowcę wpisanego do umowy; fotelik dziecięcy; pakiet ochronny; wariant najmu bez kaucji; przekroczenie limitu kilometrów.",
          "Wszystkie opłaty podawane są w złotych polskich i zawierają podatek VAT.",
          "Opłata może zostać naliczona wyłącznie wtedy, gdy wystąpiło zdarzenie stanowiące jej podstawę i zostało ono odpowiednio udokumentowane.",
          "Jeżeli kalkulator konkretnego pojazdu pokazuje inną stawkę niż podana w innym miejscu serwisu, wiążąca jest stawka potwierdzona Najemcy przed zawarciem umowy najmu.",
        ],
      },
      {
        h: "Załącznik nr 2 — Opłaty za naruszenia i udział własny",
        p: [
          "Udział własny w szkodzie nierozliczonej z OC sprawcy: pojazdy klasy standard — 4 000 zł; SUV i pojazdy dostawcze — 6 000 zł; pojazdy klasy premium — 8 000 zł. Wykupienie pakietu ochronnego obniża udział własny zgodnie z ofertą konkretnego pojazdu.",
          "Kradzież pojazdu lub szkoda całkowita — rozliczenie zgodnie z umową najmu, wybranym wariantem ochrony i warunkami polisy ubezpieczeniowej.",
          "Udział własny nie jest automatyczną karą. Stosuje się go zgodnie z umową najmu, polisą i ustaloną odpowiedzialnością; jeżeli rzeczywista, prawnie należna kwota jest niższa, rozliczenie nie przekracza tej kwoty.",
          "Palenie tytoniu lub e-papierosów albo używanie produktów pozostawiających dym lub zapach — 500 zł, po stwierdzeniu i udokumentowaniu naruszenia. Niezależnie od tej opłaty mogą być dochodzone należycie wykazane koszty naprawy szkody, bez podwójnej rekompensaty za ten sam uszczerbek.",
          "Przewożenie zwierząt bez zgody Wynajmującego — 500 zł, po udokumentowaniu naruszenia.",
          "Utrata lub uszkodzenie kluczyka albo pilota — do 2 500 zł albo rzeczywisty niższy koszt odtworzenia lub kodowania, na podstawie kosztorysu albo faktury.",
          "Utrata dowodu rejestracyjnego, tablicy rejestracyjnej lub innego elementu rejestracyjnego — do 500 zł za element, nie więcej niż uzasadniony koszt wraz z obsługą, po wykazaniu kosztu.",
          "Utrata lub uszkodzenie kołpaka ponad normalne zużycie — do 300 zł za sztukę.",
          "Felga aluminiowa — do 1 500 zł za sztukę; felga stalowa — do 600 zł za sztukę. Naprawa lub wymiana według udokumentowanego kosztu, nie więcej niż zasadne rozliczenie.",
          "Przypalenie, rozdarcie lub trwałe uszkodzenie tapicerki albo wyposażenia — rzeczywisty, uzasadniony koszt naprawy lub odtworzenia według kosztorysu albo faktury, z uwzględnieniem stanu i zużycia elementu.",
          "Brak innego elementu wyposażenia — rzeczywisty koszt odtworzenia, z uwzględnieniem zużycia, jeżeli ma ono znaczenie.",
          "Powierzenie pojazdu osobie niewpisanej do umowy najmu — 2 500 zł oraz należycie wykazana szkoda wynikająca z naruszenia, jeżeli wystąpi.",
          "Holowanie innego pojazdu bez zgody Wynajmującego — 500 zł oraz należycie wykazana szkoda, jeżeli wystąpi.",
          "Użytkowanie niezgodne z przeznaczeniem: zawody, rajdy, treningi, nauka jazdy, drift i podobne — 1 500 zł oraz należycie wykazana szkoda, jeżeli wystąpi.",
          "Demontaż, przeróbka lub ingerencja w pojazd albo w GPS bez zgody Wynajmującego — 2 500 zł oraz uzasadniony koszt przywrócenia stanu poprzedniego, po udokumentowaniu.",
          "Zatankowanie pojazdu niewłaściwym rodzajem paliwa — 3 000 zł oraz koszt usunięcia skutków, maksymalnie do wysokości prawnie należnego roszczenia, po udokumentowaniu zdarzenia i kosztów.",
          "Wyjazd poza granice Polski bez uprzedniego pisemnego aneksu Wynajmującego — 2 000 zł oraz uzasadnione koszty sprowadzenia pojazdu i obsługi sprawy, jeżeli powstały.",
          "Przemieszczenie pojazdu poza Unię Europejską bez wymaganej zgody — 5 000 zł oraz uzasadnione koszty, w zakresie dopuszczalnym przez prawo.",
          "Porzucenie pojazdu poza miejscem uzgodnionym w umowie — do 2 000 zł oraz rzeczywisty koszt odzyskania pojazdu, po udokumentowaniu, bez automatycznego podwójnego obciążenia.",
          "Uzupełnienie brakującego paliwa — 10 zł za każdy brakujący litr oraz 50 zł opłaty obsługowej, na podstawie poziomu paliwa odnotowanego przy wydaniu i przy zwrocie.",
          "Zwrot pojazdu wymagający ponadstandardowego mycia — 100 zł; pojazd dostawczy — 150 zł, gdy zabrudzenie wykracza poza zwykłe używanie i jest udokumentowane.",
          "Pranie tapicerki — 500 zł; w pojeździe dostawczym — 700 zł, gdy pranie jest rzeczywiście konieczne z przyczyn przypisanych Najemcy.",
          "Przekroczenie limitu kilometrów — stawka za kilometr właściwa dla danego modelu, według różnicy wskazań licznika; stawka wskazana jest w umowie najmu lub w ofercie.",
          "Opóźnienie zwrotu do 1 godziny — bez opłaty za kolejną dobę. Opóźnienie przekraczające 1 godzinę — kolejna rozpoczęta doba według stawki z umowy najmu, bez podwójnego rozliczenia tego samego okresu.",
          "Opłata administracyjna za obsługę zapytania organu krajowego, mandatu lub opłaty drogowej — 150 zł za sprawę; za obsługę sprawy organu zagranicznego — 300 zł za sprawę, wyłącznie jeżeli Wynajmujący faktycznie wykonał czynności administracyjne, a opłata jest prawnie dopuszczalna. Mandat, opłata parkingowa lub drogowa obciąża osobę odpowiedzialną w kwocie wynikającej z decyzji lub wezwania.",
          "Powyższe kwoty nie zastępują obowiązku ustalenia odpowiedzialności za konkretną szkodę. W relacji z konsumentem stosuje się je wyłącznie w zakresie dopuszczalnym przez prawo.",
          "Za ten sam uszczerbek nie pobiera się podwójnej rekompensaty. Jeżeli koszt został pokryty przez ubezpieczyciela lub osobę trzecią, rozliczenie Najemcy uwzględnia tę kwotę.",
          "W razie rozbieżności między niniejszym załącznikiem a indywidualną umową najmu wiążą postanowienia umowy, z zastrzeżeniem bezwzględnie obowiązujących przepisów prawa.",
        ],
      },
    ],
  },
  privacy: {
    title: "Polityka prywatności",
    updatedLabel: `Ostatnia aktualizacja: ${UPDATED_PRIVACY}`,
    intro:
      "Niniejsza polityka opisuje zasady gromadzenia i wykorzystywania danych osobowych osób " +
      "korzystających z serwisu i usług A&A Corporation — danych podanych bezpośrednio, " +
      "zbieranych za pośrednictwem plików cookie oraz pochodzących z urządzeń pokładowych pojazdów, " +
      "zgodnie z RODO (rozporządzenie 2016/679).",
    metaDescription:
      "Jak A&A Corporation zbiera i wykorzystuje dane osobowe klientów " +
      "wypożyczalni: dane podane przy rezerwacji, pliki cookie oraz dane " +
      "z urządzeń pokładowych pojazdów, zgodnie z RODO.",
    sections: [
      {
        h: "1. Administrator danych i kontakt",
        p: [
          `Administratorem danych osobowych Najemców, osób uprawnionych do kierowania pojazdem oraz osób korzystających z serwisu jest ${COMPANY}, ${ADDRESS_PL}.`,
          `We wszystkich sprawach dotyczących przetwarzania danych osobowych można kontaktować się pocztą elektroniczną: ${EMAIL}, telefonicznie: ${PHONE}, lub pisemnie na adres siedziby administratora.`,
          "Administrator nie wyznaczył inspektora ochrony danych; zgłoszenia obsługiwane są pod powyższymi danymi kontaktowymi.",
        ],
      },
      {
        h: "2. Źródło danych",
        p: [
          "Dane pochodzą bezpośrednio od osoby, której dotyczą — z formularza rezerwacji, korespondencji e-mail, rozmowy telefonicznej lub umowy najmu.",
          "Jeżeli dane przekazała inna osoba (np. pracodawca zamawiający najem, pełnomocnik lub Najemca wskazujący dodatkowego kierowcę), administrator otrzymuje dane identyfikacyjne, kontaktowe i dane uprawnień do kierowania pojazdem od tej osoby.",
        ],
      },
      {
        h: "3. Zakres zbieranych danych",
        p: [
          "Przy rezerwacji w serwisie zbieramy: imię i nazwisko, adres e-mail, numer telefonu, datę urodzenia, adres (ulica, kod pocztowy, miejscowość), numer prawa jazdy oraz szczegóły rezerwacji (termin, miejsce odbioru, wybrany pojazd i dodatki).",
          "Przy zawarciu umowy najmu i wydaniu pojazdu zbieramy dodatkowo dane wymagane do zawarcia umowy: serię i numer dokumentu tożsamości, numer PESEL lub jego odpowiednik, dane prawa jazdy, a w przypadku firm — dane rejestrowe i dane osoby reprezentującej.",
          "Serwis nie przyjmuje płatności online i nie zbiera danych kart płatniczych. Płatność następuje przelewem lub przy wydaniu pojazdu; dane rozliczeniowe otrzymujemy w zakresie wynikającym z przelewu lub transakcji kartą realizowanej przez terminal płatniczy.",
          "W trakcie najmu przetwarzamy dane o położeniu wynajętego pojazdu pochodzące z zamontowanego urządzenia GPS, w tym trasę przejazdu i przebieg.",
        ],
      },
      {
        h: "4. Cele i podstawy prawne przetwarzania",
        p: [
          "Obsługa rezerwacji, zawarcie i wykonanie umowy najmu, kontakt w sprawie rezerwacji — art. 6 ust. 1 lit. b RODO.",
          "Wystawianie i przechowywanie faktur oraz dokumentacji księgowej, wypełnienie obowiązków podatkowych i obowiązku wskazania organom osoby, której powierzono pojazd — art. 6 ust. 1 lit. c RODO.",
          "Ustalenie, dochodzenie i obrona roszczeń, w tym rozliczenie szkód i opłat za naruszenia — art. 6 ust. 1 lit. f RODO.",
          "Ochrona pojazdu i mienia, bezpieczeństwo floty, zapobieganie nadużyciom, lokalizacja i odzyskanie pojazdu w razie kradzieży, obsługa zdarzeń i szkód oraz weryfikacja istotnych naruszeń umowy (dane GPS/telematyka) — art. 6 ust. 1 lit. f RODO, w zakresie niezbędnym i proporcjonalnym.",
          "Rozpatrywanie reklamacji i obsługa korespondencji — art. 6 ust. 1 lit. f RODO.",
          "Wysyłka informacji handlowych i marketing własnych usług — wyłącznie na podstawie odrębnej zgody, art. 6 ust. 1 lit. a RODO w związku z przepisami o świadczeniu usług drogą elektroniczną i prawa telekomunikacyjnego.",
        ],
      },
      {
        h: "5. Dobrowolność podania danych",
        p: [
          "Podanie danych w formularzu rezerwacji i przy zawarciu umowy jest dobrowolne, ale niezbędne do obsługi rezerwacji i zawarcia umowy najmu. Ich niepodanie uniemożliwia realizację usługi.",
          "Podanie danych w celach marketingowych jest w pełni dobrowolne i nie wpływa na możliwość skorzystania z usług.",
          "Zgodę na przetwarzanie danych w celach marketingowych oraz na otrzymywanie informacji handlowych można wycofać w każdej chwili, kontaktując się z administratorem. Wycofanie zgody nie wpływa na zgodność z prawem przetwarzania dokonanego przed jej wycofaniem.",
        ],
      },
      {
        h: "6. Odbiorcy danych",
        p: [
          "Dane mogą być udostępniane lub powierzane: pracownikom i współpracownikom administratora; dostawcom usług IT i hostingu; dostawcy usługi wysyłki wiadomości e-mail; ubezpieczycielom i podmiotom likwidującym szkody; podmiotom świadczącym obsługę księgową i prawną; podmiotom windykacyjnym w razie nieuregulowanych należności; organom publicznym uprawnionym na podstawie przepisów prawa (m.in. Policji, organom podatkowym).",
          "Powierzenie danych następuje wyłącznie w zakresie niezbędnym do wykonania usługi i na podstawie umów powierzenia przetwarzania.",
          "Infrastruktura serwisu i baza rezerwacji utrzymywane są na serwerach zlokalizowanych na terenie Europejskiego Obszaru Gospodarczego.",
        ],
      },
      {
        h: "7. Przekazywanie danych poza EOG",
        p: [
          "Do wysyłki wiadomości e-mail dotyczących rezerwacji korzystamy z dostawcy usługi pocztowej, który może przetwarzać dane również poza Europejskim Obszarem Gospodarczym.",
          "Takie przekazanie odbywa się wyłącznie w oparciu o mechanizmy przewidziane w rozdziale V RODO — standardowe klauzule umowne zatwierdzone przez Komisję Europejską lub decyzję o odpowiednim stopniu ochrony — wraz z dodatkowymi środkami bezpieczeństwa.",
          "Kopię zastosowanych zabezpieczeń można uzyskać, kontaktując się z administratorem.",
        ],
      },
      {
        h: "8. Okres przechowywania danych",
        p: [
          "Dane rezerwacji, która nie zakończyła się zawarciem umowy — przez okres niezbędny do obsługi zgłoszenia, nie dłużej niż 12 miesięcy.",
          "Dane związane z umową najmu — przez czas jej trwania, a następnie do upływu okresu przedawnienia roszczeń wynikających z umowy.",
          "Dokumentacja księgowa i podatkowa — przez okres wymagany przepisami prawa, co do zasady 5 lat od końca roku podatkowego.",
          "Dane lokalizacyjne pojazdu — przez okres najmu i krótki okres po jego zakończeniu, niezbędny do rozliczenia najmu i ewentualnych zdarzeń, a następnie są usuwane.",
          "Dane przetwarzane na podstawie zgody — do czasu jej wycofania.",
        ],
      },
      {
        h: "9. Prawa osób, których dane dotyczą",
        p: [
          "Przysługuje Państwu prawo dostępu do danych (art. 15 RODO), ich sprostowania (art. 16), usunięcia (art. 17), ograniczenia przetwarzania (art. 18), przenoszenia danych (art. 20) oraz wniesienia sprzeciwu wobec przetwarzania opartego na prawnie uzasadnionym interesie (art. 21).",
          "Przysługuje Państwu prawo wycofania zgody w dowolnym momencie, w zakresie, w jakim dane przetwarzane są na jej podstawie.",
          `Wnioski prosimy kierować na adres ${EMAIL}. Odpowiadamy bez zbędnej zwłoki, nie później niż w terminie miesiąca od otrzymania żądania.`,
          "Przysługuje Państwu prawo wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych (ul. Stawki 2, 00-193 Warszawa).",
        ],
      },
      {
        h: "10. Pliki cookie i podobne technologie",
        p: [
          "Serwis nie zbiera automatycznie żadnych informacji poza informacjami zawartymi w plikach cookie i w pamięci lokalnej przeglądarki.",
          "Pliki cookie to dane informatyczne, w szczególności pliki tekstowe, przechowywane w urządzeniu końcowym użytkownika. Zawierają zazwyczaj nazwę serwisu, z którego pochodzą, czas przechowywania oraz unikalny numer.",
          "Podmiotem zamieszczającym pliki cookie w urządzeniu użytkownika i uzyskującym do nich dostęp jest administrator serwisu wskazany w punkcie 1.",
          "Serwis stosuje wyłącznie pliki niezbędne do jego działania — zapewniające obsługę sesji, bezpieczeństwo oraz zapamiętanie wyboru języka, wersji kolorystycznej i decyzji dotyczącej zgody na cookie. Zapis samej decyzji o zgodzie jest niezbędny i przechowywany bez odrębnej zgody.",
          "Pliki analityczne, marketingowe i profilujące stosujemy wyłącznie po wyrażeniu zgody w banerze zgody.",
          "Po wyrażeniu zgody na pliki analityczne serwis korzysta z Google Analytics 4, dostarczanego przez Google Ireland Limited (Gordon House, Barrow Street, Dublin 4, Irlandia). Narzędzie zbiera statystyki odwiedzin: adresy odwiedzanych podstron, źródło wejścia, przybliżoną lokalizację, typ urządzenia i przeglądarki. Do czasu wyrażenia zgody skrypt Google nie jest w ogóle wczytywany, a żadne dane — w tym adres IP — nie są przekazywane do Google. Nie korzystamy z reklam ani z personalizacji reklam.",
          "Google może przetwarzać dane również poza Europejskim Obszarem Gospodarczym, w tym w Stanach Zjednoczonych. Podstawą takiego przekazania jest decyzja Komisji Europejskiej stwierdzająca odpowiedni stopień ochrony (EU–US Data Privacy Framework) oraz standardowe klauzule umowne.",
          "Zgodę na analitykę można w każdej chwili wycofać przez odnośnik „Ustawienia cookie” w stopce; wycofanie nie wpływa na zgodność z prawem przetwarzania dokonanego przed jej wycofaniem.",
          "Zgodę na pliki inne niż niezbędne można w każdej chwili zmienić, korzystając z odnośnika „Ustawienia cookie” w stopce serwisu, a także zmieniając ustawienia przeglądarki internetowej. Ograniczenie stosowania plików cookie może wpłynąć na niektóre funkcje serwisu.",
        ],
      },
      {
        /*
          Sekcja dołożona 02.09.2026 po audycie RODO. Do tego dnia polityka nie
          zawierała ANI JEDNEGO zdania o asystencie, choć rozmowy zapisują się
          w bazie i są usuwane dopiero po dziewięćdziesięciu dniach, a treść
          wiadomości wychodzi do analizy poza nasz serwer.

          Każde zdanie niżej opisuje to, co system faktycznie robi — sprawdzone
          w kodzie: `chat_messages` (treść), `chat_leads` (dane kontaktowe za
          zgodą), `RETENTION_DAYS = 90` (usuwanie), `lib/chat/ai/sanitize`
          (usuwanie identyfikatorów przed wysłaniem). Żadnej podstawy prawnej
          ani mechanizmu transferu nie dopisujemy tu na wyrost: cele
          i podstawy opisuje punkt 4, odbiorców punkt 6, a przekazywanie poza
          EOG punkt 7.
        */
        h: "11. Asystent (czat) w serwisie",
        p: [
          "W serwisie działa asystent tekstowy („Zapytaj AI”), który odpowiada na pytania o flotę, ceny, dostępność i zasady najmu. Skorzystanie z niego jest dobrowolne — te same informacje można uzyskać telefonicznie, mailowo i przez formularz kontaktowy.",
          "Treść rozmowy jest zapisywana: wiadomości użytkownika i odpowiedzi asystenta, wraz z ustaleniami rozmowy takimi jak wybrany model, termin czy podany budżet. Jeżeli użytkownik sam przekaże w rozmowie dane kontaktowe w celu przygotowania oferty, są one zapisywane jako zapytanie i obsługiwane tak samo jak zapytanie z formularza.",
          "Rozmowy wykorzystujemy do obsługi zapytania, poprawy jakości odpowiedzi oraz bezpieczeństwa serwisu — w tym do ograniczania nadużyć i automatycznego zalewania czatu żądaniami.",
          "Zapisane rozmowy usuwamy po 90 dniach od ostatniej wiadomości. Zapytanie, które powstało z rozmowy, przechowujemy na zasadach opisanych w punkcie 8, tak jak każde inne zapytanie.",
          "Prosimy o niewpisywanie w czacie danych, które nie są potrzebne do odpowiedzi — w szczególności numeru PESEL, numeru dokumentu tożsamości, danych karty płatniczej ani informacji o zdrowiu. Do przygotowania oferty wystarczą model, termin i sposób kontaktu.",
          "Zanim wiadomość zostanie przeanalizowana pod kątem tego, o co użytkownik pyta, usuwamy z niej automatycznie numery telefonów, adresy e-mail, numery PESEL, numery dokumentów i ciągi wyglądające jak numer karty. Analiza wykonywana jest z użyciem infrastruktury dostawcy, który obsługuje funkcje sztucznej inteligencji serwisu (Cloudflare, Inc.); dostawca nie otrzymuje danych z systemu rezerwacji ani z kartotek klientów, a wyłącznie oczyszczoną treść pojedynczej wiadomości.",
          "Asystent nie podejmuje decyzji wywołujących skutki prawne — nie zawiera umowy, nie potwierdza rezerwacji i nie przyznaje rabatów. Ceny i dostępność, które podaje, pochodzą z tego samego cennika i tego samego kalendarza, co formularz rezerwacji.",
        ],
      },
      {
        h: "12. Zautomatyzowane decyzje i profilowanie",
        p: [
          "Dane nie są wykorzystywane do podejmowania decyzji opierających się wyłącznie na zautomatyzowanym przetwarzaniu, w tym profilowaniu, wywołujących skutki prawne wobec osoby, której dane dotyczą.",
        ],
      },
      {
        h: "13. Bezpieczeństwo danych",
        p: [
          "Stosujemy środki techniczne i organizacyjne odpowiadające ryzyku — szyfrowanie transmisji (HTTPS), kontrolę dostępu do systemów rezerwacyjnych, rejestrowanie operacji w panelu administracyjnym oraz kopie zapasowe.",
          "Dostęp do danych mają wyłącznie osoby upoważnione, w zakresie niezbędnym do wykonywania obowiązków.",
        ],
      },
      {
        h: "14. Zmiany polityki prywatności",
        p: [
          "Polityka może być aktualizowana w razie zmiany przepisów, zakresu usług lub stosowanych narzędzi. Aktualna wersja wraz z datą ostatniej aktualizacji publikowana jest w serwisie.",
        ],
      },
    ],
  },
};

const en: Record<LegalKind, LegalDoc> = {
  terms: {
    title: "Rental Terms",
    updatedLabel: `Last updated: ${UPDATED}`,
    intro:
      `These terms and conditions govern the use of the ${COMPANY} website and the conditions of ` +
      "vehicle reservation and rental. Placing a reservation constitutes acceptance of these terms.",
    sections: [
      {
        h: "§1. General provisions",
        p: [
          `The Lessor is ${COMPANY}, ${ADDRESS_EN}, contact: ${EMAIL}, ` +
            `tel. ${PHONE} (PL), ${PHONE_EN} (EN).`,
          "These terms set out the detailed conditions of the vehicle rental agreements concluded by the Lessor and the rules for reserving vehicles through the aacorporation.pl website, by telephone and by e-mail.",
          "The Lessor rents out and hands over vehicles in Warsaw, including delivery to an address you choose and airport pickup, in accordance with the price list.",
          `These terms apply to all reservations placed on or after ${UPDATED}. They correspond to the A&A Corporation General Rental Conditions (GRC) in the version of ${DOCS_VERSION}.`,
          "The following form integral parts of the rental agreement: the General Rental Conditions (GRC), the Additional Fee Schedule, the Vehicle Handover Protocol, the Vehicle Return Protocol, the Deposit and Damage Settlement Rules, the Accident / Collision / Breakdown / Theft Procedure and the GDPR + GPS Information Notice.",
          "Where a signed rental agreement conflicts with these terms, the rental agreement prevails, subject to mandatory provisions of law.",
        ],
      },
      {
        h: "§2. Definitions",
        p: [
          "Lessor — the entity identified in §1, which rents out the vehicle.",
          "Renter — the individual, legal person or organisational unit placing the reservation and concluding the rental agreement.",
          "User (additional driver) — a person named in the rental agreement as authorised to drive the vehicle.",
          "Reservation — a request to rent a vehicle for selected dates, placed via the website, by telephone or by e-mail.",
          "Rental agreement — the agreement concluded at handover, setting out the detailed rental conditions.",
          "Protocol — the handover/return protocol describing the condition of the vehicle.",
          "Price list — the rates, additional fees and breach fees published on the Lessor's website, together with the schedules to these terms.",
          "Rental day — 24 hours counted from the handover time stated in the rental agreement.",
          "Deposit — the refundable security for the Lessor's claims, described in §7.",
        ],
      },
      {
        /**
         * DO AKCEPTACJI PRAWNEJ — angielska wersja §3, patrz komentarz przy
         * wersji polskiej wyżej. Ten sam próg 21 lat w akapicie 1, ta sama
         * klauzula o wyższym wieku dla wybranych modeli w akapicie 2, ta sama
         * rozbieżność co do momentu stawiania warunku. Obie wersje trzeba
         * zmieniać razem i obie wymagają akceptacji prawnej.
         *
         * Pełny opis: docs/ZLECENIE-WIEK-KIEROWCY.md, sekcja 6.
         */
        h: "§3. Who may rent and drive the vehicle",
        p: [
          "The Renter and any authorised driver must be at least 21 years old and hold a valid driving licence recognised in Poland, issued at least one year before the agreement date, together with a valid identity document (ID card or passport).",
          "For selected models the Lessor may require a higher age or longer driving experience; this condition is stated when the reservation is confirmed, before the agreement is concluded.",
          "The Renter may also be a legal person or an organisational unit referred to in art. 33¹ of the Polish Civil Code. The person concluding the agreement on its behalf presents proof of authority (register extract, power of attorney) together with their own identity document and driving licence.",
          "Only the Renter or a person named in the agreement as an additional driver may drive the vehicle. Adding a driver is subject to a fee under the price list.",
          "These conditions apply throughout the rental. If they are not met, the Lessor may refuse to hand over the vehicle or terminate the agreement with immediate effect.",
          "The Lessor may verify the documents presented to the extent permitted by law, including in public registers (KRS, CEIDG).",
          "If the authorisation of an additional driver is revoked, the Renter shall inform the Lessor without delay.",
        ],
      },
      {
        h: "§4. Reservation and conclusion of the agreement",
        p: [
          "Reservations are placed through the form on aacorporation.pl, by telephone or by e-mail.",
          "The website takes no online payment and requires no prepayment. A reservation placed on the website is an availability enquiry and does not itself conclude a rental agreement.",
          "On receiving a reservation the Lessor confirms its receipt to the e-mail address provided and then confirms vehicle availability and the rental conditions.",
          "A reservation is confirmed provided that the requirements of §3 are met, the required details have been supplied and these terms have been accepted.",
          "The Lessor may decline to confirm a reservation, in particular where the vehicle is unavailable for the requested dates, verification is unsuccessful, or the conditions of §3 are not met. A declined reservation costs the Renter nothing.",
          "The documents listed in §1 are sent or made available to the Renter before the rental agreement is concluded — through the booking system and the aacorporation.pl website, or by e-mail to the address indicated by the Renter.",
          "For telephone bookings and for rentals without a prior online reservation, the Renter provides an e-mail address to which the Lessor sends the documents and rental conditions before the agreement is concluded. That address is entered into the rental agreement.",
          "The method used to make the documents available — e-mail or the booking system and website — and the Renter's e-mail address are confirmed in the rental agreement. By signing the agreement the Renter confirms receipt of, or access to, the documents and the opportunity to read them before the agreement was concluded; a separate signature on each document is not required.",
          "The version of these terms and of the other documents sent or made available to the Renter before the agreement was concluded applies to that rental. A later change to a document on the website does not automatically change an agreement already concluded.",
          "The rental agreement is concluded when signed by the Renter and the Lessor's representative and the vehicle is handed over. Where more than one Renter is party to the agreement, their liability is joint and several.",
          "If the Lessor cannot provide the vehicle covered by a confirmed reservation, it will offer a vehicle of the same or a higher class at the reserved rate. A Renter who does not accept the substitute vehicle may withdraw from the reservation at no cost.",
        ],
      },
      {
        h: "§5. Changing and cancelling a reservation",
        p: [
          'The Renter may cancel a reservation at any time before handover, either in the "My reservations" panel or by contacting the Lessor. A cancellation notified more than 24 hours before the agreed handover time is free of charge.',
          "A cancellation notified later is subject to a fee that depends on how much time remains before the agreed handover time: separate rates apply between 24 and 12 hours and below 12 hours, as stated in the reservation, in the Table of Additional Fees and in the price list. Failing to collect the vehicle at the agreed time (no-show) is subject to a separate fee, charged after the tolerance period stated in the reservation.",
          "Neither the cancellation fee nor the no-show fee may exceed the total value of the reservation. The rates applicable to a given reservation are recorded when it is placed — a later change to the price list does not alter the terms of a reservation already made.",
          "The Lessor may waive the cancellation fee in individually justified cases.",
          "Changes to dates, handover location or vehicle class are possible subject to fleet availability and confirmation by the Lessor.",
          "The Lessor may cancel a reservation up to handover for objective reasons (e.g. damage to the vehicle, a previous Renter failing to return it). In such a case any amounts received are refunded and, where possible, a replacement vehicle is offered.",
          "Under art. 38(12) of the Polish Consumer Rights Act, the right to withdraw from a distance contract does not apply to vehicle rental services for a specified date or period. This does not affect the right to cancel a reservation on the terms described above.",
        ],
      },
      {
        h: "§6. Handover",
        p: [
          "The vehicle is handed over at the place and time agreed in the reservation — at the Lessor's office, at an address you specify, or at the airport, in accordance with the delivery price list.",
          "Handover outside standard business hours is possible for an additional fee under the price list.",
          "A Protocol is drawn up at handover recording the condition of the vehicle, the odometer reading and the fuel level. The Renter inspects the vehicle and raises any objections before departure; objections are noted in the Protocol.",
          "The vehicle is handed over clean and fuelled, with valid documents and the equipment required by law.",
          "The vehicle is collected in person by the Renter or by a person named in the agreement as an additional driver, on presentation of the documents listed in §3.",
        ],
      },
      {
        h: "§7. Payments, deposit and invoices",
        p: [
          "Rent is charged per rental day at the rate applicable when the reservation was confirmed and is payable in advance — by bank transfer or by card at handover. A VAT invoice is issued for every rental.",
          "The deposit or pre-authorisation secures amounts due in connection with the specific rental. It is not a penalty, automatic compensation or the Renter's consent to arbitrary charging. Its amount depends on the model and ranges from 2,000 zł to 6,000 zł; the amount applicable to the vehicle is stated before the rental agreement is concluded.",
          "The deposit is taken as a card pre-authorisation or by bank transfer.",
          "In the event of damage or a serious breach of the agreement, the Lessor may withhold release of the relevant part of the deposit or pre-authorisation for the time necessary to establish the basis of liability, the connection with the event and the amount due. No automatic forfeiture of the whole deposit applies to a breach as such.",
          "Any deduction from the deposit is made only in the justified amount and only for amounts having a basis in the rental agreement, these terms, the Additional Fee Schedule and applicable law. The Renter is given the event, the basis and the calculation method for the charge, and the remaining part of the security is released.",
          "If no grounds for withholding the deposit are identified after the vehicle is returned, the Lessor instructs its release without undue delay. For a pre-authorisation, the actual time at which funds are released also depends on the bank or payment operator. If further verification of damage is required, the Renter is informed of the reason and of the further settlement procedure.",
          "The amount of the deposit is not a cap on the Renter's liability. If a properly established and properly evidenced amount due exceeds the deposit, the Lessor may pursue the remainder from the Renter in accordance with the rental agreement and applicable law. Releasing the deposit does not waive claims that come to light after the vehicle is returned.",
          "The no-deposit option means that the standard security is not collected at handover. It does not release the Renter from liability for damage, fees or other amounts for which the Renter is liable under the agreement and applicable law.",
          "A delay in returning the vehicle of up to 1 hour does not trigger a further rental day. A delay exceeding 1 hour triggers the charge for a further commenced day at the rate in the rental agreement.",
          "Extending the rental requires the Lessor's consent and payment for the additional period in advance, no later than the hour at which the original return time falls due.",
        ],
      },
      {
        h: "§8. Rules for using the vehicle",
        p: [
          "The Renter and every person driving the vehicle must: carry the documents required by road traffic authorities; secure the vehicle, keys and documents against theft whenever leaving it; lock the vehicle and use the factory security systems; carry out routine checks (oil and fluid levels, tyre pressure, lighting); refuel with the fuel type specified for the engine; and keep the vehicle reasonably clean.",
          "The following are prohibited in particular: driving after consuming alcohol, while intoxicated, under the influence of narcotics or other intoxicants, or under the influence of medicines or other substances impairing the ability to drive safely; consuming alcohol or intoxicants in the vehicle; driving without valid driving privileges or while they are retained, suspended or revoked.",
          "Also prohibited: smoking cigarettes, cigars or pipes in the vehicle; using e-cigarettes or heated-tobacco products, or any other product leaving smoke, vapour, ash or a permanent odour; destroying, damaging or vandalising the vehicle, including its bodywork, paintwork, windows, rims, tyres, seats, upholstery, headliner, dashboard, screens, electronics and other equipment.",
          "Further prohibited: handing the vehicle to a person not named in the rental agreement; subletting, lending, pledging or otherwise disposing of the vehicle without the Lessor's required consent; taking part in races, rallies, competitions, training or sports tests; drifting; driving off roads intended for traffic (off-road); driving instruction; towing other vehicles without the Lessor's prior written consent; and paid carriage of persons or goods, taxi, ride-hailing, courier or delivery work without the Lessor's written consent.",
          "Also prohibited: interfering with the GPS, telematics, electronics, safety systems or security devices of the vehicle, including removing, disconnecting, covering or damaging them; removing, concealing or altering vehicle markings; carrying out repairs, alterations or modifications without the Lessor's consent; using fuel other than the fuel required for the vehicle; overloading the vehicle or carrying more passengers or luggage than it permits; carrying animals without the Lessor's consent; carrying hazardous or illegal materials or materials that may damage or permanently contaminate the vehicle; and continuing to drive despite a warning light, message or fault where further driving may increase the damage.",
          "Driving after consuming alcohol or intoxicants, or without the required licence, is a gross breach of the agreement and may lead to reduction or refusal of insurance cover.",
          "A breach of a prohibition may result in the fee set out in Schedule 2 and — independently of that fee and without double charging for the same loss — in liability for properly evidenced damage where it has actually occurred.",
          "The Renter shall inform every person entrusted with the vehicle of the obligations arising from the agreement and these terms and is responsible for their compliance.",
          "The Lessor may inspect how the vehicle is used and its condition, and the Renter shall enable such inspection.",
          "The Renter is responsible for the correct fitting and use of additional equipment (e.g. a child seat).",
        ],
      },
      {
        h: "§9. Mileage limits",
        p: [
          "The rental includes a mileage allowance of 300 km per day for rentals of 1–6 days, 250 km per day for rentals of 7–29 days and 3,000 km per month for rentals of 30 days or more, unless the rental agreement or an individual offer provides otherwise.",
          "Mileage above the allowance is charged per kilometre at the rate stated in the rental agreement or the price list, depending on the vehicle model, based on the difference in odometer readings.",
          "Odometer readings at handover and return are recorded in the Protocol.",
        ],
      },
      {
        h: "§10. Travel outside Poland",
        p: [
          "The vehicle is intended for use only within the territory of the Republic of Poland. Taking, transporting, moving or allowing the vehicle to be moved outside Poland is prohibited.",
          "An exception is possible only with the Lessor's prior express written consent, given before departure and recorded in the rental agreement or in a separate annex signed before the border is crossed, and subject to the conditions set by the Lessor for the specific vehicle and rental — including those arising from the scope of insurance and Assistance and the countries indicated.",
          "Oral consent, a telephone conversation on its own, no reply from the Lessor, or an assumption of consent do not constitute permission to travel abroad.",
          "If the prohibition is breached, the Renter shall immediately inform the Lessor and follow the instructions received. The Renter pays the fee set out in Schedule 2 and is liable for properly evidenced damage and reasonable costs connected with the breach, including the reasonable cost of returning the vehicle to Poland, to the extent permitted by law and by the insurance policy.",
        ],
      },
      {
        h: "§11. Servicing, inspections and breakdowns",
        p: [
          "If a scheduled service falls due during the rental, the Renter shall make the vehicle available at a time and place agreed with the Lessor. The Lessor covers the cost of servicing within Poland.",
          "The Renter may not commission repairs, alterations or other maintenance without the Lessor's consent. Repairs agreed with the Lessor are settled against invoices and the return of replaced parts.",
          "In the event of a breakdown, immobilisation, collision or any other incident, the Renter contacts the Lessor without delay and follows the instructions received. Assistance is contacted through the Lessor, unless the Renter was given a direct Assistance number at vehicle handover.",
          "The scope of help — including towing, roadside repair, any replacement vehicle and the costs involved — follows the protection and Assistance cover assigned to the specific vehicle and the terms of the rental. The Lessor does not guarantee a replacement vehicle in every situation, nor any particular time for providing one; what is possible is established case by case once the incident is reported.",
          "If a replacement vehicle is provided and is of a lower class than the vehicle rented, the rent is reduced accordingly.",
          "The number for reporting an incident is stated in the rental agreement. Where life or health is at risk, call the emergency number 112 first.",
        ],
      },
      {
        h: "§12. Damage, accident, theft — procedure",
        p: [
          "In the event of damage, an accident, a collision, a breakdown, a break-in, theft or loss of keys, the Renter shall: stop the vehicle in a safe place and secure the scene, provided this can be done without putting themselves or others at risk; secure the vehicle against further damage; notify the Lessor without undue delay and follow the instructions received; take photographs and collect the details of participants, witnesses and insurance; and, in the event of theft, notify the Police and hand over to the Lessor the keys and vehicle documents in their possession.",
          "The Police or the emergency number 112 must be called where required by law or the circumstances, in particular where: there are injured persons; the vehicle, keys or documents have been stolen or there has been a break-in; there is reason to suspect that a participant is under the influence of alcohol or intoxicants; a participant refuses to give their details, leaves the scene, or there is a dispute about material circumstances of the event; or there is serious damage to the vehicle or to property. Where life or health is at risk, the safety of persons and the instructions of the emergency services take priority.",
          "The Renter must not arrange repairs or towing outside the designated Assistance service without the Lessor's consent, unless immediate action is objectively necessary for safety. The Renter must not continue driving where the vehicle is unroadworthy or where further driving may increase the damage.",
          "Where another driver caused the event, the Renter shall obtain their details, registration number and third-party insurance policy number, together with witness details, and pass them to the Lessor.",
          "Failing to call the Police or to notify the Lessor may cause the insurer to refuse to pay; to the extent the insurer refuses on that ground, the Renter is liable for the resulting loss.",
          "Making a false statement about the circumstances of the damage releases the Lessor from the liability limits arising from any protection package purchased.",
        ],
      },
      {
        h: "§13. Insurance and liability for damage",
        p: [
          "Every vehicle in the fleet carries third-party motor liability insurance (OC) and comprehensive insurance (AC). The scope of cover, the excess, exclusions and Assistance are governed by the current policy for the specific vehicle and by the option stated in the rental agreement.",
          "The Renter's liability is determined individually — on the basis of applicable law, the rental agreement, these terms, the policy conditions and the circumstances of the event, after establishing the basis of liability, causation and the amount of the loss. Merely identifying a difference on return is not a basis for a charge.",
          "Where the Renter is liable for damage to or destruction of the vehicle, the Lessor may claim properly evidenced loss and reasonable costs, in particular: repair, parts, labour, diagnostics, towing, transport, restoration of the vehicle to its proper condition, and other properly evidenced costs connected with the event.",
          "The settlement takes into account amounts paid by the insurer or by a third party. The same loss is not compensated twice.",
          "If, as a result of an event for which the Renter is liable, the vehicle is temporarily unavailable for rental, the Lessor may claim properly evidenced downtime loss, including lost profits, where they are in a normal causal relationship with the event. No automatic charge calculated as the number of days off the road multiplied by the full rental rate applies.",
          "For damage that is not settled under the at-fault party's third-party policy, the Renter is liable up to the excess set out in Schedule 2, unless the Renter shows that neither they nor the driver were at fault. The excess is not an automatic penalty — it applies in accordance with the agreement, the policy and established liability, and if the amount actually due in law is lower, the settlement does not exceed that amount.",
          "Purchasing the protection package offered at booking reduces the excess in accordance with the offer for the specific vehicle.",
          "Driving after consuming alcohol or intoxicants, use by an unauthorised person, driving without the required licence or another serious breach of the policy conditions may lead to reduction or refusal of insurance cover. This does not automatically create unlimited liability of the Renter — the Lessor must establish the basis and the amount of any claim.",
          "Damage to and soiling of the upholstery and missing vehicle equipment are covered neither by the insurance nor by the protection package and are settled in accordance with Schedule 2 or at the actual documented cost.",
          "The amount of the deposit does not cap the Renter's liability. If a properly evidenced and legally due claim exceeds the deposit, the Lessor may pursue the difference in accordance with the rental agreement and applicable law.",
        ],
      },
      {
        h: "§14. Returning the vehicle",
        p: [
          "The Renter returns the vehicle at the place and time agreed in the rental agreement. Any change of return place or time requires the Lessor's agreement at least 12 hours in advance.",
          "The vehicle must be returned in no worse condition than normal wear and tear — clean inside and out, with the fuel or energy level recorded in the handover Protocol, and with all keys, documents and equipment.",
          "A Protocol is drawn up on return, together with photographs, the odometer reading and the fuel or battery level. If the vehicle is returned in a condition that prevents inspection (e.g. heavily soiled) or by a person not named in the agreement, the Lessor may draw up the Protocol unilaterally and deliver it to the Renter.",
          "Normal wear resulting from proper use does not automatically constitute damage chargeable to the Renter.",
          "Failing to return the vehicle on time and continuing to use it without consent to an extension is a breach of the agreement. The Lessor may charge for the next commenced day at the rate in the rental agreement, take legally permitted steps to recover the vehicle, claim properly evidenced amounts due and loss and, where misappropriation is reasonably suspected, notify law enforcement. The Renter remains liable for the vehicle, including theft and damage, after the agreed return time.",
          "The Lessor does not refund rent for an unused period where the vehicle is returned early, nor the value of surplus fuel.",
        ],
      },
      {
        h: "§15. Additional fees, breach fees and fines",
        p: [
          "Additional fees and fees for breaches are set out in Schedule 1 and Schedule 2 to these terms and in the price list published on the website. They correspond to the Additional Fee Schedule annexed to the rental agreement.",
          "Every charge identifies the event, the contractual or legal basis and the calculation method. A fee for a breach may be charged only once the event has been identified and documented; independently of that fee, the Lessor may claim properly evidenced loss where it has actually occurred — without double charging for the same loss.",
          "The Lessor documents damage and excessive soiling by protocol, photographs and, where necessary, an estimate, invoice or other reliable document. Normal wear resulting from proper use is not subject to an additional charge.",
          "The Renter covers fines, parking charges, tolls and other amounts arising from use of the vehicle during the rental, unless they show that neither they nor the driver are responsible.",
          "Where an authorised public body makes an enquiry, the Lessor is obliged to identify the person entrusted with the vehicle. Handling such an enquiry is subject to the administrative fee in Schedule 2, charged only where the Lessor actually performed administrative work and the fee is legally permissible.",
          "Fees stipulated against consumers apply only to the extent permitted by consumer protection law; any provision conflicting with those rules is not binding on a consumer.",
          "Debt collection costs are settled on the general terms provided by law, with no flat-rate charges imposed on consumers.",
        ],
      },
      {
        h: "§16. Complaints",
        p: [
          `Complaints may be submitted by e-mail to ${EMAIL} or in writing to the Lessor's registered office.`,
          "A complaint should include contact details, the reservation or agreement number and a description of the issue.",
          "The Lessor examines complaints within 14 days of receipt and communicates the outcome to the e-mail address provided.",
          "Consumers may use out-of-court complaint and redress procedures, including the assistance of the district (municipal) consumer ombudsman and proceedings before the regional Trade Inspection inspector. Information on these procedures is available from the Polish Office of Competition and Consumer Protection (UOKiK).",
        ],
      },
      {
        h: "§17. Personal data",
        p: [
          "The controller of the personal data of the Renter and of authorised drivers is the Lessor.",
          "The rules of processing — purposes, legal bases, recipients, retention periods and your rights — are described in the Privacy Policy available on the website and in the GDPR + GPS Information Notice made available before the rental agreement is concluded.",
          "Vehicles may be fitted with a GPS/telematics system recording the vehicle's location and technical data relating to its operation.",
          "That data is used only for specified, necessary and proportionate purposes, in particular: protecting the vehicle and property; fleet security; locating and recovering the vehicle in the event of theft; handling incidents and damage; establishing, pursuing or defending claims; and verifying material breaches of the agreement — to the extent legally permissible and proportionate.",
          "GPS is not used for arbitrary or unlimited tracking of the Renter's behaviour. Access to the data is restricted to the persons and entities that need it for the relevant purpose.",
          "The Renter may not remove, disable, cover or otherwise interfere with GPS or telematics devices.",
          "Confirmation of receipt of the GDPR + GPS Notice is given in the rental agreement together with confirmation of how the documents were made available; no separate signature on the Notice is required. Acknowledging receipt of the information does not constitute consent to processing where the legal basis is the agreement, a legal obligation or the Lessor's legitimate interest.",
        ],
      },
      {
        h: "§18. Final provisions",
        p: [
          "Matters not covered by these terms are governed by the Polish Civil Code and, in agreements with consumers, by consumer protection law.",
          "The Lessor may amend these terms for valid reasons (changes in law, in the scope of services or in the price list). Reservations confirmed before the amendments take effect remain governed by the previous wording.",
          "The parties shall notify each other of any change of address for service. Correspondence relating to the agreement may be sent to the e-mail address given in the rental agreement.",
          "The invalidity or ineffectiveness of any provision does not affect the validity of the remaining provisions.",
          "Disputes with a Renter who is not a consumer are resolved by the court having jurisdiction over the Lessor's registered office. Disputes with consumers are resolved by the court determined under the Polish Code of Civil Procedure.",
        ],
      },
      {
        h: "Schedule 1 — Additional fees",
        p: [
          "Current rental rates and additional fees are published on aacorporation.pl — in the pricing section and in the booking form, where every fee is shown before the reservation is submitted.",
          "Additional services cover in particular: delivery or collection at an address you specify; airport pickup and return; handover or return outside standard business hours; an additional driver named in the agreement; a child seat; the protection package; the no-deposit option; and mileage above the allowance.",
          "All fees are quoted in Polish złoty and include VAT.",
          "A fee may be charged only where the event giving rise to it has occurred and has been appropriately documented.",
          "If the calculator for a specific vehicle shows a rate different from one quoted elsewhere on the website, the rate confirmed to the Renter before the rental agreement is concluded is binding.",
        ],
      },
      {
        h: "Schedule 2 — Breach fees and excess",
        p: [
          "Excess for damage not settled under the at-fault party's third-party policy: standard-class vehicles — 4,000 zł; SUVs and commercial vehicles — 6,000 zł; premium-class vehicles — 8,000 zł. Purchasing the protection package reduces the excess in accordance with the offer for the specific vehicle.",
          "Theft or total loss — settled in accordance with the rental agreement, the protection option chosen and the terms of the insurance policy.",
          "The excess is not an automatic penalty. It applies in accordance with the agreement, the policy and established liability; if the amount actually due in law is lower, the settlement does not exceed that amount.",
          "Smoking tobacco or e-cigarettes, or using products that leave smoke or odour — 500 zł, once the breach has been identified and documented. Independently of this fee, properly evidenced damage-repair costs may be claimed, without double recovery for the same loss.",
          "Carrying animals without the Lessor's consent — 500 zł, once the breach has been documented.",
          "Loss of or damage to a key or remote — up to 2,500 zł, or the lower actual replacement or coding cost, based on an estimate or invoice.",
          "Loss of the registration certificate, a number plate or another registration element — up to 500 zł per item, and no more than the justified cost including handling, once the cost has been evidenced.",
          "Loss of or damage to a wheel trim beyond normal wear — up to 300 zł each.",
          "Alloy rim — up to 1,500 zł each; steel rim — up to 600 zł each. Repair or replacement at the documented cost, and no more than the justified settlement.",
          "Burns, tears or permanent damage to upholstery or equipment — the actual reasonable cost of repair or restoration per an estimate or invoice, taking into account the condition and wear of the item.",
          "Any other missing equipment item — the actual replacement cost, taking wear into account where relevant.",
          "Entrusting the vehicle to a person not named in the rental agreement — 2,500 zł, plus properly evidenced loss resulting from the breach, if any.",
          "Towing another vehicle without the Lessor's consent — 500 zł, plus properly evidenced loss, if any.",
          "Use contrary to the intended purpose: competitions, rallies, training, driving instruction, drifting and the like — 1,500 zł, plus properly evidenced loss, if any.",
          "Dismantling, modifying or interfering with the vehicle or the GPS without the Lessor's consent — 2,500 zł, plus the reasonable cost of restoring the previous condition, once documented.",
          "Refuelling with the wrong fuel type — 3,000 zł, plus the cost of remedying the consequences, up to the amount of the legally due claim, once the event and the costs have been documented.",
          "Taking the vehicle outside Poland without the Lessor's prior written annex — 2,000 zł, plus reasonable vehicle-recovery and handling costs, if incurred.",
          "Moving the vehicle outside the European Union without the required consent — 5,000 zł, plus reasonable costs, to the extent permitted by law.",
          "Abandoning the vehicle away from the agreed location — up to 2,000 zł, plus the actual cost of recovering the vehicle, once documented and without automatic double charging.",
          "Making up missing fuel — 10 zł for each missing litre plus a 50 zł service fee, based on the fuel level recorded at handover and on return.",
          "Return requiring excessive cleaning — 100 zł; a commercial vehicle — 150 zł, where the soiling exceeds normal use and is documented.",
          "Upholstery cleaning — 500 zł; in a commercial vehicle — 700 zł, where the cleaning is genuinely necessary for reasons attributable to the Renter.",
          "Exceeding the mileage limit — the per-kilometre rate applicable to the specific model, based on the difference in odometer readings; the rate is stated in the rental agreement or the offer.",
          "A return delay of up to 1 hour — no charge for another day. A delay exceeding 1 hour — the next commenced day at the rate in the rental agreement, without double-charging the same period.",
          "Administrative fee for handling a domestic authority enquiry, a fine or a road charge — 150 zł per case; for handling a foreign-authority matter — 300 zł per case, and only where the Lessor actually performed administrative work and the fee is legally permissible. The fine, parking charge or road toll is charged to the person responsible in the amount stated in the decision or demand.",
          "The amounts above do not replace the requirement to establish liability for the specific damage. In relations with consumers they apply only to the extent permitted by law.",
          "The same loss is not compensated twice. If a cost has been covered by the insurer or a third party, the Renter's settlement takes that amount into account.",
          "If there is any discrepancy between this Schedule and the individual rental agreement, the provisions of the agreement prevail, subject to mandatory provisions of law.",
        ],
      },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    updatedLabel: `Last updated: ${UPDATED_PRIVACY}`,
    intro:
      "This policy describes how A&A Corporation collects and uses the personal data of people " +
      "using our website and services — data provided directly, data collected through cookies, and " +
      "data from the vehicles' on-board devices — in accordance with the GDPR (Regulation 2016/679).",
    metaDescription:
      "How A&A Corporation collects and uses the personal data of car rental " +
      "customers: details given when booking, cookies and data from the " +
      "vehicles' on-board devices, in accordance with the GDPR.",
    sections: [
      {
        h: "1. Controller and contact",
        p: [
          `The controller of the personal data of Renters, authorised drivers and website users is ${COMPANY}, ${ADDRESS_EN}.`,
          `For all matters concerning the processing of personal data you may contact us by e-mail at ${EMAIL}, by telephone on ${PHONE}, or in writing at the controller's registered office.`,
          "The controller has not appointed a data protection officer; requests are handled through the contact details above.",
        ],
      },
      {
        h: "2. Source of the data",
        p: [
          "Data comes directly from the data subject — through the booking form, e-mail correspondence, a telephone call or the rental agreement.",
          "Where the data was provided by someone else (e.g. an employer booking the rental, an attorney, or a Renter naming an additional driver), the controller receives identification and contact data and driving entitlement data from that person.",
        ],
      },
      {
        h: "3. Scope of data collected",
        p: [
          "When you book on the website we collect: first and last name, e-mail address, telephone number, date of birth, address (street, postcode, city), driving licence number and the reservation details (dates, pickup location, selected vehicle and extras).",
          "When the rental agreement is concluded and the vehicle is handed over we additionally collect the data required for the agreement: identity document type and number, PESEL number or its equivalent, driving licence details and, for companies, registration data and the details of the representative.",
          "The website does not accept online payments and does not collect payment card data. Payment is made by bank transfer or at handover; we receive settlement data only to the extent resulting from the transfer or from a card transaction processed by a payment terminal.",
          "During the rental we process the location data of the rented vehicle from the fitted GPS device, including the route travelled and mileage.",
        ],
      },
      {
        h: "4. Purposes and legal bases",
        p: [
          "Handling reservations, concluding and performing the rental agreement and contacting you about a reservation — art. 6(1)(b) GDPR.",
          "Issuing and retaining invoices and accounting records, meeting tax obligations and the obligation to identify to the authorities the person entrusted with the vehicle — art. 6(1)(c) GDPR.",
          "Establishing, pursuing and defending claims, including settling damage and breach fees — art. 6(1)(f) GDPR.",
          "Protection of the vehicle and property, fleet security, prevention of misuse, locating and recovering the vehicle in the event of theft, handling incidents and damage, and verifying material breaches of the agreement (GPS/telematics data) — art. 6(1)(f) GDPR, to the extent necessary and proportionate.",
          "Handling complaints and correspondence — art. 6(1)(f) GDPR.",
          "Sending commercial information and marketing our own services — solely on the basis of separate consent, art. 6(1)(a) GDPR in connection with electronic services and telecommunications law.",
        ],
      },
      {
        h: "5. Is providing data voluntary?",
        p: [
          "Providing the data in the booking form and when concluding the agreement is voluntary but necessary to handle the reservation and conclude the rental agreement. Without it the service cannot be provided.",
          "Providing data for marketing purposes is entirely voluntary and does not affect your ability to use our services.",
          "Consent to marketing and to receiving commercial information may be withdrawn at any time by contacting the controller. Withdrawal does not affect the lawfulness of processing carried out before it.",
        ],
      },
      {
        h: "6. Recipients of the data",
        p: [
          "Data may be disclosed or entrusted to: the controller's staff and associates; IT and hosting providers; the e-mail delivery provider; insurers and claims handlers; accounting and legal service providers; debt collection providers in the event of unpaid amounts; and public authorities entitled under the law (including the Police and tax authorities).",
          "Data is entrusted only to the extent necessary to provide the service and on the basis of data processing agreements.",
          "The website infrastructure and the reservation database are hosted on servers located within the European Economic Area.",
        ],
      },
      {
        h: "7. Transfers outside the EEA",
        p: [
          "For sending reservation e-mails we use a mail delivery provider that may also process data outside the European Economic Area.",
          "Any such transfer takes place solely on the basis of the mechanisms provided for in Chapter V GDPR — standard contractual clauses approved by the European Commission or an adequacy decision — together with additional safeguards.",
          "A copy of the safeguards applied is available on request from the controller.",
        ],
      },
      {
        h: "8. Retention periods",
        p: [
          "Data from a reservation that did not result in an agreement — for as long as needed to handle the enquiry, no longer than 12 months.",
          "Data relating to a rental agreement — for the term of the agreement and then until the limitation period for claims under it expires.",
          "Accounting and tax records — for the period required by law, as a rule 5 years from the end of the tax year.",
          "Vehicle location data — for the rental period and a short period afterwards, as needed to settle the rental and any incidents, after which it is deleted.",
          "Data processed on the basis of consent — until the consent is withdrawn.",
        ],
      },
      {
        h: "9. Your rights",
        p: [
          "You have the right of access to your data (art. 15 GDPR), to rectification (art. 16), erasure (art. 17), restriction of processing (art. 18), data portability (art. 20) and to object to processing based on legitimate interests (art. 21).",
          "You have the right to withdraw consent at any time, to the extent that data is processed on that basis.",
          `Please send requests to ${EMAIL}. We respond without undue delay and no later than one month from receipt.`,
          "You have the right to lodge a complaint with the President of the Personal Data Protection Office (ul. Stawki 2, 00-193 Warsaw, Poland).",
        ],
      },
      {
        h: "10. Cookies and similar technologies",
        p: [
          "The website does not collect any information automatically other than the information contained in cookies and in the browser's local storage.",
          "Cookies are IT data, in particular text files, stored on the user's end device. They usually contain the name of the website they come from, their storage time and a unique number.",
          "The entity placing cookies on the user's device and accessing them is the controller identified in section 1.",
          "The website uses only cookies necessary for it to function — session handling, security, and remembering your language, colour scheme and cookie decision. The record of the consent decision itself is necessary and is stored without separate consent.",
          "Analytics, marketing and profiling cookies are used only after consent is given in the consent banner.",
          "Once you consent to analytics cookies, the website uses Google Analytics 4, provided by Google Ireland Limited (Gordon House, Barrow Street, Dublin 4, Ireland). It collects visit statistics: the pages you view, the source of your visit, approximate location, and device and browser type. Until you consent, Google's script is not loaded at all and no data — including your IP address — is sent to Google. We do not use advertising or ad personalisation.",
          "Google may also process data outside the European Economic Area, including in the United States. Such transfers rely on the European Commission's adequacy decision (EU–US Data Privacy Framework) and on standard contractual clauses.",
          "Analytics consent can be withdrawn at any time via the “Cookie settings” link in the footer; withdrawal does not affect the lawfulness of processing carried out before it.",
          "Consent to non-essential cookies can be changed at any time via the “Cookie settings” link in the website footer, and through your browser settings. Restricting cookies may affect some website functions.",
        ],
      },
      {
        h: "11. The assistant (chat) on this website",
        p: [
          "The website provides a text assistant (“Ask AI”) that answers questions about the fleet, prices, availability and rental rules. Using it is voluntary — the same information is available by phone, by e-mail and through the contact form.",
          "The content of the conversation is stored: the user’s messages and the assistant’s replies, together with what the conversation established, such as the chosen model, the dates or the stated budget. If a user volunteers contact details in the conversation so that an offer can be prepared, those details are stored as an enquiry and handled in the same way as an enquiry from the contact form.",
          "We use conversations to handle the enquiry, to improve the quality of the answers and for the security of the website — including limiting abuse and automated flooding of the chat.",
          "Stored conversations are deleted 90 days after the last message. An enquiry created from a conversation is retained on the terms described in section 8, like any other enquiry.",
          "Please do not type data into the chat that is not needed for an answer — in particular national identification numbers, identity document numbers, payment card details or health information. A model, a date range and a way to reach you are enough to prepare an offer.",
          "Before a message is analysed for what the user is asking about, we automatically remove phone numbers, e-mail addresses, national identification numbers, document numbers and strings that look like a card number. The analysis is carried out using the infrastructure of the provider that operates the website’s artificial-intelligence features (Cloudflare, Inc.); that provider receives no data from the reservation system or from customer records — only the cleaned text of a single message.",
          "The assistant makes no decisions producing legal effects — it does not conclude a contract, confirm a reservation or grant discounts. The prices and availability it quotes come from the same price list and the same calendar as the reservation form.",
        ],
      },
      {
        h: "12. Automated decisions and profiling",
        p: [
          "Data is not used for decisions based solely on automated processing, including profiling, that produce legal effects concerning the data subject.",
        ],
      },
      {
        h: "13. Data security",
        p: [
          "We apply technical and organisational measures appropriate to the risk — encrypted transmission (HTTPS), access control for the reservation systems, logging of operations in the admin panel, and backups.",
          "Access to data is limited to authorised persons, to the extent necessary to perform their duties.",
        ],
      },
      {
        h: "14. Changes to this policy",
        p: [
          "This policy may be updated if the law, the scope of our services or the tools we use change. The current version, with the date of the last update, is published on the website.",
        ],
      },
    ],
  },
};

export function getLegalDoc(kind: LegalKind, locale: string): LegalDoc {
  return (locale === "en" ? en : pl)[kind];
}

/**
 * Renders a built-in document as HTML, so the admin rich text editor can be
 * seeded with the current wording the first time someone edits it. Text is
 * escaped — these strings become markup here for the first time.
 */
export function legalDocToHtml(doc: LegalDoc): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return doc.sections
    .map(
      (s) =>
        `<h2>${escape(s.h)}</h2>` +
        s.p.map((p) => `<p>${escape(p)}</p>`).join(""),
    )
    .join("");
}
