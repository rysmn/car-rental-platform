"use client";

import { useEffect, useState } from "react";
import { buttonBase, buttonVariants } from "@/components/ui/Button";

/**
 * Przyklejony pas rezerwacji na telefonie.
 *
 *     ┌──────────────────────────────────────────┐
 *     │  OD 850 ZŁ / DOBA        [ ZAREZERWUJ ]  │
 *     └──────────────────────────────────────────┘
 *
 * ## Po co
 *
 * Na telefonie strona auta ma cztery i pół ekranu, a formularz rezerwacji stoi
 * na końcu — za galerią, ceną, cennikiem, kalendarzem, sześcioma kratkami
 * danych, wyposażeniem i opisem. Klient, który przewinął połowę i się zdecydował,
 * nie miał gdzie kliknąć: musiał przewijać dalej w ciemno albo wracać na górę.
 * Pas trzyma cenę i jedno wezwanie w zasięgu kciuka przez całą drogę.
 *
 * ## Trzy rzeczy, które muszą się nie pobić
 *
 * Dół ekranu na tej stronie bywa zajęty i pas nie ma prawa niczego przykryć:
 *
 *   1. **Pasek zgód na cookie.** Mierzony po `[data-consent-banner]` — tym
 *      samym znacznikiem, którym mierzy go uruchamiacz asystenta. Pas siada
 *      NAD nim, nie na nim.
 *   2. **Klawiatura ekranowa.** `visualViewport` mówi, ile ekranu zabrała.
 *      Pas wtedy znika: klient pisze w formularzu, czyli już rezerwuje, więc
 *      przycisk „zarezerwuj" nie ma czego dodać, a zabrałby dwa wiersze pola.
 *   3. **Sam formularz.** Gdy `#rezerwacja` jest na ekranie, pas znika —
 *      wezwanie do miejsca, na które klient właśnie patrzy, to tylko zasłonięty
 *      kawałek strony.
 *
 * Uruchamiacz asystenta podnosi się o wysokość pasa sam: pas wystawia swój
 * znacznik `[data-pasek-rezerwacji]`, a `ChatWidget` liczy oba dolne elementy
 * jednym pomiarem. Żaden z nich nie zna klas drugiego.
 *
 * ## Czego nie robi
 *
 * Nie rezerwuje. Nie ma własnego kalendarza, własnej ceny ani własnego pojęcia
 * o dostępności — cena przychodzi gotowa ze strony (Pricing Engine), a klik
 * prowadzi do jedynego formularza, jaki ta strona ma. Drugi formularz w pasie
 * oznaczałby drugie miejsce, w którym trzeba pilnować zgodności z silnikiem
 * dostępności.
 */

/** Poniżej tylu pikseli różnicy między viewportami nie ma klawiatury. */
const PROG_KLAWIATURY_PX = 24;

export function MobileBookingBar({
  href,
  cta,
  ariaLabel,
  children,
}: {
  /** Kotwica formularza — pełny adres z prefiksem języka albo samo `#…`. */
  href: string;
  /** Napis na przycisku: „ZAREZERWUJ" / „BOOK". */
  cta: string;
  /** Nazwa całego pasa dla czytnika ekranu. */
  ariaLabel: string;
  /** Cena — gotowy węzeł ze strony, żeby pas nie liczył jej po swojemu. */
  children: React.ReactNode;
}) {
  const [dolneWarstwy, setDolneWarstwy] = useState(0);
  const [klawiatura, setKlawiatura] = useState(false);
  const [formularzWidoczny, setFormularzWidoczny] = useState(false);

  /* Wysokość paska zgód — ten sam znacznik, co w `ChatWidget`. */
  useEffect(() => {
    const zmierz = () => {
      const el = document.querySelector<HTMLElement>("[data-consent-banner]");
      setDolneWarstwy(el ? Math.round(el.getBoundingClientRect().height) : 0);
    };
    zmierz();
    const mo = new MutationObserver(zmierz);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", zmierz);
    return () => {
      mo.disconnect();
      window.removeEventListener("resize", zmierz);
    };
  }, []);

  /* Klawiatura ekranowa — różnica między viewportem układu a widocznym. */
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const zmierz = () => {
      const zasloniete = window.innerHeight - vv.height - vv.offsetTop;
      setKlawiatura(zasloniete > PROG_KLAWIATURY_PX);
    };
    zmierz();
    vv.addEventListener("resize", zmierz);
    vv.addEventListener("scroll", zmierz);
    return () => {
      vv.removeEventListener("resize", zmierz);
      vv.removeEventListener("scroll", zmierz);
    };
  }, []);

  /*
    Czy formularz jest na ekranie.

    `IntersectionObserver`, a nie nasłuch przewijania: przeglądarka liczy to
    sama, poza wątkiem układu, i nie budzi nas trzydzieści razy na sekundę
    podczas przewijania palcem.
  */
  useEffect(() => {
    const cel = document.getElementById("rezerwacja");
    if (!cel) return;
    const io = new IntersectionObserver(
      ([wpis]) => setFormularzWidoczny(wpis.isIntersecting),
      { rootMargin: "-64px 0px 0px 0px" },
    );
    io.observe(cel);
    return () => io.disconnect();
  }, []);

  const schowany = klawiatura || formularzWidoczny;

  return (
    <div
      data-pasek-rezerwacji=""
      aria-label={ariaLabel}
      aria-hidden={schowany}
      style={{ bottom: dolneWarstwy }}
      /*
        `lg:hidden`, bo od tej szerokości panel rezerwacji stoi przyklejony
        w prawej kolumnie i jest widoczny przez całą stronę bez żadnego pasa.

        `translate-y-full` zamiast `display: none` przy chowaniu: element
        zostaje w drzewie, więc `IntersectionObserver` i pomiar paska zgód nie
        muszą startować od nowa, a zjazd w dół czyta się jak ustąpienie
        miejsca, a nie jak zniknięcie.
      */
      className={`border-line bg-void/95 fixed inset-x-0 z-[45] border-t backdrop-blur-sm transition-transform duration-200 lg:hidden print:hidden ${
        schowany ? "pointer-events-none translate-y-full" : "translate-y-0"
      }`}
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="min-w-0">{children}</div>
        {/*
          Zwykłe `<a>`, nie `Link`: adres przychodzi gotowy ze strony, która zna
          język, a kotwica na tej samej stronie nie potrzebuje routera. Przy
          okazji działa też wtedy, gdy JavaScript się nie wykonał.
        */}
        <a
          href={href}
          /* Schowany pas wypada też z kolejności tabulacji — inaczej klawisz
             Tab wchodzi w przycisk, którego na ekranie nie ma. */
          tabIndex={schowany ? -1 : undefined}
          /*
            Klasy z `Button`, nie ich kopia. Odnośnik do kotwicy na tej samej
            stronie nie przechodzi przez `ButtonLink` (ten routuje przez
            next-intl i przyjmuje wyłącznie trasy), więc bierze te same dwa
            zestawy, z których `ButtonLink` się składa. Ręcznie przepisany
            styl przycisku raz już kosztował ten serwis widoczny przycisk —
            patrz komentarz przy `buttonBase`.
          */
          className={`${buttonBase} ${buttonVariants.primary} h-11 shrink-0 px-6 text-xs`}
        >
          {cta}
        </a>
      </div>
    </div>
  );
}
