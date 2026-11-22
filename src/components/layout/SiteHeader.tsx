"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/brand/Logo";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { SocialLinks } from "./SocialLinks";
import { SavedNavLink } from "./SavedNavLink";
import { SavedIconLink } from "./SavedIconLink";
import { ReviewsLink } from "./ReviewsLink";
import { ThemeToggle } from "./ThemeToggle";
import { MyReservationBadge } from "@/components/booking/MyReservationBadge";
import { MyReservationsNavLink } from "@/components/booking/MyReservationsNavLink";
import { ButtonLink } from "@/components/ui/Button";
import type { NavItem, SocialKey } from "@/lib/config/site";

export function SiteHeader({
  nav,
  social,
  reviewsHref,
}: {
  nav: NavItem[];
  social: { key: SocialKey; label: string; href: string }[];
  /**
   * „Przeczytaj wszystkie opinie" — adres z ustawień Google, rozstrzygnięty
   * przez `googleView` w warstwie serwerowej. `null` znaczy: przełącznik
   * paska opinii jest wyłączony albo nie ma ani Place ID, ani wizytówki —
   * i wtedy w belce nie ma gwiazdki. Belka nie ogląda adresu i nie zna
   * żadnego identyfikatora Google.
   */
  reviewsHref: string | null;
}) {
  const t = useTranslations("Nav");
  const [open, setOpen] = useState(false);
  const przyciskMenu = useRef<HTMLButtonElement>(null);

  /*
    Escape zamyka menu i oddaje fokus przyciskowi, który je otworzył.

    Panel jest rozwinięciem (`aria-expanded`), a nie oknem modalnym — belka
    zostaje widoczna, tła nie przykrywa i pułapki na fokus tu nie potrzeba.
    Brakowało jednak wyjścia: zmierzone na produkcji 01.09.2026 — Enter
    otwierał, Escape nie robił nic, więc klawiatura musiała przejść przez cały
    panel albo wracać Shift+Tabem do przycisku. Escape to pierwsze, co próbuje
    każdy, kto tego panelu nie chciał.

    Oddanie fokusu jest tu drugą połową roboty, nie ozdobą: bez niego panel
    znika spod kursora czytnika ekranu i następny Tab startuje od początku
    dokumentu.

    Nasłuch wisi tylko przy otwartym panelu — `open` jest w zależnościach, więc
    zamknięcie sprząta po sobie i strona z zamkniętym menu nie płaci za to
    niczym.
  */
  useEffect(() => {
    if (!open) return;
    const przyKlawiszu = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      przyciskMenu.current?.focus();
    };
    document.addEventListener("keydown", przyKlawiszu);
    return () => document.removeEventListener("keydown", przyKlawiszu);
  }, [open]);

  return (
    <header className="border-line bg-void/80 sticky top-0 z-50 border-b backdrop-blur-md">
      {/* No phone gutter — the bar runs the full width of the screen, matching
          the edge-to-edge content below it. The logo's own clear-space padding
          and the burger's 40px box keep both marks off the glass. */}
      {/*
        The gap between the mark and the controls closes on the narrowest
        screens. At 320px the row needed 378px — logo 103, gap 24, controls 235,
        padding 16 — and the excess is what dragged EVERY page into a sideways
        scroll, not the price table it was blamed on. Everything from 380px up
        is untouched, which is every phone in the analytics.
      */}
      {/*
        SZEROKOŚĆ WIERSZA — 1920 px, nie 1440 (03.09.2026).

        Limit 1440 był ustawiony pod kolumnę treści strony i przy szerokich
        monitorach oddawał ekranowi wszystko, czego belka najbardziej
        potrzebowała: przy 1536 px marnował 96 px, przy 1728 — 288, przy
        1920 — 480. Znak, nawigacja i sterowania stały wtedy zbite w środku,
        a po obu stronach zostawał pusty pas szerszy niż całe sterowania.

        Belka nie jest kolumną treści. Tło, obramowanie i rozmycie idą u niej
        od krawędzi do krawędzi już dziś, więc trzymanie jej zawartości
        w cudzej kolumnie nie kupowało niczego poza tym pustym pasem.
        Margines wiersza rośnie od `2xl` z 40 na 64 px, żeby przy 1728 i 1920 px
        znak nie kleił się do szkła. Stopnie są DWA, nie trzy, i to nie jest
        uproszczenie z lenistwa: trzeci próg (64 px dopiero od 1728) wymagałby
        breakpointu spoza wbudowanej siatki, a takie Tailwind układa w arkuszu
        PRZED `2xl` — zmierzone na obu zapisach, `min-[1728px]:px-16` i tokenie
        `--breakpoint-3xl` w `@theme`: w obu wygrywał `2xl` i przy 1728 px
        zostawało 48 px zamiast 64.

        Powyżej 1920 px wiersz znowu jest wyśrodkowany — od tej szerokości
        pusty pas po bokach jest tańszy niż nawigacja rozjechana na metr.
      */}
      <div
        data-belka="wiersz"
        className="mx-auto flex h-20 max-w-[2560px] items-center justify-between gap-2 px-2 md:px-[var(--belka-margines)] xl:gap-4"
      >
        {/*
          ZNAK I NAWIGACJA TO JEDNA GRUPA — i to jest sedno poprawki
          Chrome/Safari (03.09.2026).

          Wcześniej wiersz miał TRZY elementy (znak, nawigacja, sterowania)
          rozdzielane przez `justify-between`. Cały luz szedł wtedy w DWIE
          przerwy, więc każda różnica w pomiarze tekstu przesuwała nawigację:
          Safari mierzy te same napisy o kilka pikseli inaczej niż Chrome
          (ten sam plik fontu, inne zaokrąglanie szerokości znaków), a przy
          trzech elementach ta różnica dzieli się na dwie przerwy i widać ją
          jako inne położenie całej nawigacji.

          Teraz elementy są DWA: [znak + nawigacja] i [sterowania]. Lewa grupa
          jest przyklejona do lewej krawędzi, prawa do prawej, a różnica
          w pomiarze tekstu wchodzi wyłącznie w jedną, elastyczną przerwę
          pośrodku — czyli w miejsce, w którym nic nie stoi. Nic się już nie
          przesuwa względem niczego.

          `shrink-0` na obu grupach: bez tego przeglądarka „rozwiązuje"
          ciasnotę ściskaniem odnośników i łamaniem ich na dwie linie —
          a punkt, w którym zaczyna ściskać, jest inny w każdej przeglądarce.
          Z `shrink-0` i `whitespace-nowrap` przy odnośnikach ten stan nie
          istnieje w żadnej: albo wszystko mieści się bez zmian, albo mamy
          policzalny brak miejsca, którego pilnują pomiary poniżej.
        */}
        <div
          data-belka="lewa"
          className="flex shrink-0 items-center gap-[var(--belka-znak)]"
        >
          {/* `shrink-0`: the logo is a flex item, so without it the row solves an
              overflow by squashing the mark — the brand book forbids distorting
              it, and it was rendering 8px wide between 768px and 1024px. */}
          <Logo priority className="shrink-0" />

          {/*
            PRÓG 1280 px — DECYZJA WŁAŚCICIELA 31.08.2026, POPARTA POMIAREM.

            Wcześniej pasek włączał się od 1400 px, bo polska nawigacja mierzyła
            794 px i przy 1280 nie było jej gdzie postawić. Właściciel
            zdecydował, że pasek ma działać od 1280 — więc nie przesuwamy progu
            w oderwaniu od treści, tylko najpierw robimy miejsce:

              · „WYBRANE SAMOCHODY" → „Ulubione"      (181 px → 88)
              · „Moje rezerwacje"   → „Rezerwacje"    (137 px → 94)
              · odstęp nawigacji 16 px → 12 px od `xl` (7 przerw = 28 px)
              · odstęp wiersza 24 px → 16 px od `xl`   (2 przerwy = 16 px)

            Adresy i mechanizmy obu funkcji bez zmian — skrócone są ETYKIETY,
            nie trasy.

            RACHUNEK PRZY 1280 px, po przebudowie z 03.09.2026: okno 1280 − 80
            marginesów = 1200 do rozdania. Lewa grupa 772 (znak 117 + przerwa 24
            + nawigacja 631) i sterowania 394 dają 1166 — zostaje 34 px na
            przerwę między grupami. Oba liczniki, „✓ N" przy Rezerwacjach
            i liczba przy Ulubionych, są `absolute` i nie kosztują ani piksela
            szerokości; bez tego drugiego zapas spadałby do 8 px za każdym
            razem, gdy klient zapisze pierwsze auto.

            To jest fizyczny limit tej szerokości, nie zaniedbanie: przy 1280 px
            pełny zestaw mieści się i ani jeden element nie jest ściśnięty, ale
            zapasu na cokolwiek więcej nie ma. Każdy nowy element w tym wierszu
            musi najpierw zabrać miejsce czemuś, co już tu stoi.

            ODSTĘP NAWIGACJI ZOSTAJE 12 px NA KAŻDEJ SZEROKOŚCI. Przy 36 px
            nawigacja potrzebuje 799 px; przy 1280 px nie ma z czego tego wziąć,
            a wyżej rozkręcanie samej nawigacji rozjeżdża grupę, która ma się
            czytać jako całość ze znakiem. Rytm na szerokich ekranach dostaje
            przerwa MIĘDZY grupami — ta rośnie z ekranem sama.

            `whitespace-nowrap`: bez tego napis, któremu zabrakło miejsca, łamie
            się na dwie linie, a moment złamania zależy od przeglądarki. To był
            drugi powód, dla którego Chrome i Safari wyglądały inaczej.

            Cztery miejsca muszą zmieniać się RAZEM: ta nawigacja, sterowania
            obok, wiersz z hamburgerem i panel hamburgera. Rozjechanie ich
            o jeden próg daje ekran bez żadnej nawigacji albo z dwiema naraz.
          */}
          <nav className="hidden items-center gap-4 xl:flex xl:gap-[var(--belka-nav)] pointer-coarse:gap-2">
            {nav.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="label-tight text-silver hover:text-ink tap justify-center text-xs whitespace-nowrap transition-colors"
              >
                {t(item.key)}
              </Link>
            ))}
            <Link
              href="/regulamin"
              className="label-tight text-silver hover:text-ink tap justify-center text-xs whitespace-nowrap transition-colors"
            >
              {t("terms")}
            </Link>
            {/* Ten sam odnośnik co zawsze, ale z „✓ 2", kiedy klient ma sprawę
                w toku. Na komputerze nie ma paska spod belki — jest za to pełna
                nawigacja — więc znacznik dostaje odnośnik, który już tu stoi.
                Znacznik jest `absolute`, więc licznik nie kosztuje szerokości. */}
            <MyReservationsNavLink className="label-tight text-silver hover:text-ink tap justify-center text-xs whitespace-nowrap transition-colors" />
            {/* `licznikNadNapisem` — ta sama sztuczka co przy Rezerwacjach
                i z tego samego powodu. Liczba stojąca w wierszu zabierała
                26 px dokładnie w chwili, gdy klient zapisze pierwsze auto,
                czyli zjadała 3/4 przerwy między grupami przy 1280 px. Nad
                napisem widać ją tak samo, a wiersz ma stałą szerokość
                niezależnie od tego, ile aut jest w ulubionych. W panelu pod
                hamburgerem licznik ZOSTAJE w wierszu — tam miejsca jest w bród,
                a wiersz panelu jest wysoki na 44 px i nie ma nad czym unosić. */}
            <SavedNavLink
              licznikNadNapisem
              className="label-tight text-silver hover:text-ink tap justify-center text-xs whitespace-nowrap transition-colors"
            />
          </nav>
        </div>

        {/*
          PRAWA STREFA — CZTERY GRUPY, TRZY RÓŻNE ODSTĘPY (03.09.2026).

              [PL/EN  zł/€  MOTYW]   [ZAREZERWUJ TERAZ]   [IG FB TT]   [★]
               ── ustawienia ──        ── CTA ──          ─ social ─   opinie

          Odstęp WEWNĄTRZ ustawień jest najmniejszy (16 → 20 px), między
          ustawieniami a CTA średni (16 → 32 px), a przed ikonami i przed
          gwiazdką największy (20 → 40 px). Dopiero ta trójka sprawia, że oko
          czyta cztery rzeczy zamiast siedmiu sterowań w rzędzie — samo
          rozsunięcie wszystkiego o tyle samo dałoby wiersz szerszy i tak samo
          nieczytelny.

          Marginesy, nie `gap`, i to jest świadome: `gap` na wspólnym rodzicu
          umie tylko JEDNĄ wartość, a tutaj potrzebne są trzy. Margines siedzi
          na GRUPIE, nigdy na pojedynczym odnośniku — pojedyncze marginesy przy
          linkach są dokładnie tym, czego zamówienie zakazuje, i słusznie:
          rozjeżdżają się przy pierwszej zmianie treści.

          PROGI WIDOCZNOŚCI. Ikony społecznościowe wchodzą od 1600 px, gwiazdka
          opinii od 1440 px. Nie jest to kaprys, tylko rachunek szerokości:
          social to 83 px plus odstęp, gwiazdka 36 px plus odstęp, a przy
          1440 px na jedno i drugie naraz zostaje 30 px przerwy między grupami
          — czyli dokładnie ten ścisk, który to zlecenie ma usunąć. Pierwsza
          ustępuje grupa, która nic nie traci: te same trzy odnośniki są
          w stopce KAŻDEJ strony, a opinie Google są w belce jedynym wejściem.
        */}
        <div
          data-belka="prawa"
          className="hidden shrink-0 items-center xl:flex"
        >
          {/* GRUPA C — ustawienia. Trzy kontrolki tego samego rodzaju:
              „pokaż mi tę stronę tak, jak ją czytam". Język przy walucie, bo
              odwiedzający, który właśnie przełączył na EN, jest dokładnie tym,
              który za chwilę szuka euro. Waluta nie renderuje się wcale, gdy
              kurs nie jest znany. */}
          <div
            data-belka="ustawienia"
            className="flex items-center gap-[var(--belka-ustawienia)]"
          >
            <LocaleSwitcher />
            <ThemeToggle
              labels={{ light: t("themeLight"), dark: t("themeDark") }}
            />
          </div>

          {/* GRUPA D — jedyne CTA w belce. Odstęp przed nim jest dwa razy
              większy niż odstępy wewnątrz ustawień, żeby czerwony przycisk nie
              czytał się jako czwarta kontrolka w tym samym rzędzie. */}
          <span data-belka="cta" className="ms-[var(--belka-grupa)]">
            <ButtonLink href="/fleet" size="sm">
              {t("book")}
            </ButtonLink>
          </span>

          {/* GRUPA E — social. Wyszarzone i nieklikalne, dopóki w panelu
              (Ustawienia → Social) nie ma adresów; `SocialLinks` sam o tym
              decyduje i nie zmienia przez to szerokości. */}
          <span
            data-belka="social"
            className="ms-[var(--belka-strefa)] hidden min-[1600px]:block"
          >
            <SocialLinks links={social} />
          </span>

          {/* GRUPA F — opinie Google. Renderuje się WYŁĄCZNIE wtedy, gdy
              ustawienia dają działający adres; `null` znaczy „nie ma ikony",
              nigdy „ikona do niczego". Patrz `ReviewsLink` i `googleView`. */}
          {reviewsHref && (
            /* Widoczność na opakowaniu, nie na samym odnośniku: `hidden`
               i `inline-flex` ustawiają tę samą właściwość, więc o wyniku
               decydowałaby kolejność reguł w arkuszu, a nie kolejność klas
               w JSX. Ta sama zasada, co przy ikonach społecznościowych. */
            <span
              data-belka="opinie"
              className="ms-[var(--belka-strefa)] hidden min-[1440px]:block"
            >
              <ReviewsLink href={reviewsHref} label={t("reviews")} />
            </span>
          )}
        </div>

        {/* Mobile controls — language and theme sit in the bar beside the
            burger rather than inside the panel. Both are one-tap settings a
            visitor reaches for before reading anything, and burying them
            behind the menu made switching to English a two-step hunt. */}
        {/* `gap-0.5` poniżej 380px, nie `gap-1`. Pod `pointer: coarse` reguła
            `.tap` podnosi ikony do 44×44, więc pasek sterowań jest szerszy, niż
            sugerują klasy `w-9`: przy 320px cały wiersz mierzył 324px i KAŻDA
            strona jechała w bok o 4 piksele. Trzy odstępy po 2px zamiast 4px
            oddają 6px — z zapasem. Ikony mają własny margines wewnętrzny
            (18px symbol w 44px pudełku), więc wizualnie nic się nie skleja.
            Od 380px w górę bez zmian. */}
        {/*
          BELKA TELEFONU — pięć rzeczy i ani jednej więcej (02.09.2026):

              [ZNAK]  [♡]  [PL/EN]  [zł/€]  [☰]

          Doszły serce i waluta. Żeby zmieściły się UCZCIWIE — z pełnym polem
          dotyku, a nie przez ściśnięcie przycisków — musiały ustąpić dwie
          rzeczy, które stały tu wcześniej:

            · SŁUCHAWKA prowadziła na `/contact`, czyli dokładnie tam, gdzie
              prowadzi „Kontakt" w menu pod hamburgerem. Znikł skrót, nie
              funkcja: ta sama strona, o jedno dotknięcie dalej.
            · PRZEŁĄCZNIK MOTYWU zjechał do panelu, w miejsce po walucie.
              Motyw wybiera się raz w życiu; walutę i język — przy każdej
              cenie, którą się czyta.

          Waluta jest tu, a nie w panelu, bo o cenach decyduje się patrząc na
          nie. Poprzedni komentarz w tym miejscu tłumaczył, że na to nie ma
          miejsca — i miał rację przy ówczesnym składzie belki. Po zdjęciu
          słuchawki i motywu miejsce jest, co zmierzono na wszystkich
          szerokościach z zamówienia.
        */}
        <div className="flex shrink-0 items-center gap-0.5 pr-0 min-[380px]:gap-1 min-[380px]:pr-1 min-[430px]:gap-1.5 xl:hidden">
          <SavedIconLink />
          {/*
            `min-w-7` zamiast `min-w-8` — osiem pikseli na parę, szesnaście
            razem, i to jest cena szóstego elementu w tym wierszu. Pole
            trafienia zostaje pełne: `.tap-area` rozciąga `::after` do 44 × 44
            niezależnie od tego, jak szerokie jest pudełko. Na desktopie, gdzie
            miejsca jest w bród, zostaje 32 px.
          */}
          <LocaleSwitcher className="[&_a]:min-w-7 min-[430px]:[&_a]:min-w-8" />
          {/*
            MOTYW WRACA DO BELKI (decyzja właściciela 02.09.2026).

            Zszedł stąd godzinę wcześniej, żeby zrobić miejsce sercu i walucie;
            właściciel chce go z powrotem i miejsce się znalazło — nie przez
            ściśnięcie celów dotyku, tylko przez `.tap-narrow`, czyli wyjątek
            opisany w `globals.css` dokładnie dla rzędu sąsiadujących
            kontrolek. Wiersz ma teraz sześć elementów i siedem celów dotyku,
            każdy z pełnym polem 44 × 44.
          */}
          <ThemeToggle
            labels={{ light: t("themeLight"), dark: t("themeDark") }}
            className="tap-narrow tap-area"
          />
          <button
            ref={przyciskMenu}
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={t("menu")}
            aria-expanded={open}
            className="tap-narrow tap-area flex h-10 w-9 shrink-0 flex-col items-center justify-center gap-[6px] min-[430px]:w-10"
          >
            <span
              className="bg-ink block h-px w-6 transition-transform duration-300"
              style={
                open
                  ? { transform: "translateY(3.5px) rotate(45deg)" }
                  : undefined
              }
            />
            <span
              className="bg-ink block h-px w-6 transition-transform duration-300"
              style={
                open
                  ? { transform: "translateY(-3.5px) rotate(-45deg)" }
                  : undefined
              }
            />
          </button>
        </div>
      </div>

      {/*
        „✓ Moja rezerwacja" — pasek pod belką, na całą szerokość, tylko na
        telefonie i tylko wtedy, gdy klient ma sprawę w toku. Świadomie NIE
        w wierszu sterowań obok hamburgera: tamten wiersz przy 320 px miał już
        cztery kontrolki i cztery piksele zapasu. Sam decyduje, czy się
        pokazać — patrz `MyReservationBadge`.
      */}
      <MyReservationBadge />

      {/* Mobile panel */}
      {open && (
        <div className="border-line bg-void border-t xl:hidden">
          <nav className="mx-auto flex max-w-[1440px] flex-col px-6 py-4">
            {nav.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setOpen(false)}
                className="label-tight border-line text-silver hover:text-ink border-b py-4 text-sm"
              >
                {t(item.key)}
              </Link>
            ))}
            <Link
              href="/regulamin"
              onClick={() => setOpen(false)}
              className="label-tight border-line text-silver hover:text-ink border-b py-4 text-sm"
            >
              {t("terms")}
            </Link>
            <MyReservationsNavLink
              onClick={() => setOpen(false)}
              className="label-tight border-line text-silver hover:text-ink block border-b py-4 text-sm"
            />
            <SavedNavLink className="label-tight border-line text-silver hover:text-ink block border-b py-4 text-sm" />
            {/* Language and theme are not repeated here — they live in the bar
                above, which stays visible with the panel open.

                The currency does NOT live in that bar, and this is why. At
                320px the mobile control row already measured 324px and dragged
                every page into a sideways scroll; the fix left it with about
                four pixels of slack, which a fourth control would spend twice
                over. So the switch goes here, where there is room for it to be
                labelled — and `/fleet` carries a second copy beside the filters,
                on the one page where somebody is actually reading prices. */}
            {/*
              WALUTA W PANELU — wyłącznie poniżej 360 px.

              Od 360 px waluta stoi w belce i ta sama kontrolka w dwóch
              miejscach naraz byłaby dwoma miejscami, w których klient szuka
              tego samego. Poniżej 360 px belka nie mieści piątego elementu bez
              zjechania poniżej progu dotyku — a wtedy lepszy jest jeden
              przycisk dalej niż jeden przycisk za mały. Zmierzone: 320 px to
              jedyna szerokość, na której to wchodzi w grę.
            */}

            {/*
              Motyw wrócił do belki, więc tutaj zostaje wyłącznie poniżej
              360 px — tam, gdzie w belce stoi już waluta zamiast niego.
              Ta sama zasada, co przy walucie: kontrolka w dwóch widocznych
              naraz miejscach to dwa miejsca, w których klient szuka tego
              samego.
            */}
            <div className="border-line flex items-center justify-between border-b py-4 min-[360px]:hidden">
              <span className="label-tight text-silver text-sm">
                {t("theme")}
              </span>
              <ThemeToggle
                labels={{ light: t("themeLight"), dark: t("themeDark") }}
              />
            </div>
            <div className="flex items-center pt-5">
              <ButtonLink href="/fleet" size="sm">
                {t("book")}
              </ButtonLink>
            </div>
            <SocialLinks links={social} className="pt-5" />
          </nav>
        </div>
      )}
    </header>
  );
}
