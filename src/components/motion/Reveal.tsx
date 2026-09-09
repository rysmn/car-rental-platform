"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Slow, heavy fade + translate reveal on scroll into view.
 * No bounce — a premium ease-out curve. Fully skipped under prefers-reduced-motion.
 *
 * ## `as="li"` — po co elementowi animującemu wybór znacznika (06.09.2026)
 *
 * Domyślny `<div>` jest właściwy wszędzie poza jednym miejscem: WEWNĄTRZ listy.
 * Zapis, który wyglądał niewinnie —
 *
 *     <ul>{items.map(x => <Reveal><li>…</li></Reveal>)}</ul>
 *
 * — wkłada `<div>` między `<ul>` a `<li>`, a to łamie strukturę listy w sposób,
 * który widzą czytniki ekranu: lista przestaje ogłaszać liczbę pozycji, a same
 * pozycje tracą rodzica. Audyt dostępności zgłaszał to jako `list`
 * (4 listy z niedozwolonym dzieckiem `div`) i `listitem` (30 pozycji bez
 * rodzica `<ul>`/`<ol>`) — łącznie 34 elementy na samej stronie głównej.
 *
 * Rozwiązaniem nie jest rezygnacja z animacji ani opakowanie odwrotne
 * (`<li><Reveal>` dokłada warstwę, która psuje `h-full` w kafelkach siatki),
 * tylko pozwolenie animacji, żeby BYŁA tą pozycją listy.
 *
 * ## BEZ FRAMER-MOTION (07.09.2026) — dlaczego i co dokładnie zostało
 *
 * Ten komponent stoi w 92 miejscach serwisu, więc to ON decydował o tym, że
 * `framer-motion` ląduje w pakiecie KAŻDEJ strony publicznej: 119 kB kodu do
 * rozpakowania i wykonania (~39 kB w transmisji) na animację, która jest
 * jednym przejściem `opacity` i `translateY`.
 *
 * Rachunek z produkcji: w rozbiciu LCP na fazy „Render Delay" — czyli czas
 * między pobraniem zdjęcia a jego namalowaniem — wynosił 1263 ms z 3436 ms
 * całości. To główny wątek zajęty parsowaniem i wykonywaniem JavaScriptu,
 * a `framer-motion` był jego największą pozycją spoza samego frameworka.
 *
 * Zastąpione tym, co przeglądarka ma wbudowane: `IntersectionObserver`
 * (kiedy pokazać) i przejście CSS (jak pokazać). Krzywa, czasy i przesunięcie
 * są PRZEPISANE JEDEN DO JEDNEGO z poprzedniej wersji:
 *
 *     duration 0.85 s · ease [0.22, 1, 0.36, 1] · y 28 px · margin -10%
 *
 * Zachowane jest też to, czego nie widać: animacja gra RAZ (obserwator
 * odłącza się po pierwszym wejściu w kadr, jak `viewport={{ once: true }}`),
 * a przy `prefers-reduced-motion` treść jest widoczna od razu, bez żadnego
 * przejścia.
 *
 * Stan początkowy (`opacity: 0`) jest renderowany PO STRONIE SERWERA, tak samo
 * jak robił to `framer-motion` — inaczej każdy element mignąłby w pełnej
 * widoczności, zanim skrypt zdążyłby go schować.
 */

/** Ta sama krzywa i te same czasy, co w poprzedniej wersji na framer-motion. */
const CZAS_MS = 850;
const KRZYWA = "cubic-bezier(0.22, 1, 0.36, 1)";

export function Reveal({
  children,
  className,
  delay = 0,
  y = 28,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  /** Znacznik wynikowy. `"li"` wyłącznie bezpośrednio w `<ul>`/`<ol>`. */
  as?: "div" | "li";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [pokazany, setPokazany] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    /*
      Ruch ograniczony na poziomie systemu — pokazujemy natychmiast i nie
      animujemy niczego. Sprawdzane w efekcie, a nie w renderze, bo na
      serwerze `matchMedia` nie istnieje, a rozjazd hydratacji byłby gorszy
      niż jedna klatka animacji.
    */
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      /*
        Ten sam wyjątek od reguły „bez setState w efekcie", co przy odtwarzaniu
        rozmowy z `sessionStorage` w `ChatWidget`: czytamy wartość ze źródła
        spoza Reacta, którego na serwerze NIE MA. Leniwy inicjalizator stanu
        wykonałby się także na serwerze i dałby rozjazd hydratacji — a tutaj
        stawką jest to, czy człowiek z ograniczonym ruchem w ogóle zobaczy
        treść pod pierwszym ekranem.
      */
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setPokazany(true);
      return;
    }

    /*
      Element, który przy pierwszym malowaniu JEST już w kadrze (a na stronie
      głównej to cała pierwsza sekcja), musi pokazać się od razu — obserwator
      zgłosi go w następnej klatce, więc bez tego byłoby widać mignięcie.
      `IntersectionObserver` woła zwrotkę natychmiast po `observe`, także dla
      elementów już widocznych, więc jeden mechanizm załatwia oba przypadki.
    */
    const obserwator = new IntersectionObserver(
      (wpisy) => {
        for (const wpis of wpisy) {
          if (!wpis.isIntersecting) continue;
          setPokazany(true);
          obserwator.disconnect();
        }
      },
      // Odpowiednik `viewport={{ margin: "-10% 0px" }}`: element liczy się jako
      // widoczny dopiero, gdy wejdzie 10 % wysokości okna ponad jego krawędź.
      { rootMargin: "-10% 0px" },
    );
    obserwator.observe(el);
    return () => obserwator.disconnect();
  }, []);

  const style: React.CSSProperties = {
    opacity: pokazany ? 1 : 0,
    transform: pokazany ? "none" : `translateY(${y}px)`,
    transition: `opacity ${CZAS_MS}ms ${KRZYWA} ${delay}s, transform ${CZAS_MS}ms ${KRZYWA} ${delay}s`,
    // Bez tego przeglądarka tworzy warstwę kompozytora dla każdego z 92
    // elementów naraz. `auto` mówi jej, żeby robiła to na czas animacji.
    willChange: pokazany ? undefined : "opacity, transform",
  };

  return as === "li" ? (
    <li
      ref={ref as React.RefObject<HTMLLIElement>}
      className={className}
      style={style}
    >
      {children}
    </li>
  ) : (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={className}
      style={style}
    >
      {children}
    </div>
  );
}
