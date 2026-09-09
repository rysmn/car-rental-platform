"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Sekcja zwinięta NA TELEFONIE, w całości obecna w HTML.
 *
 * Powstało dla etapu 44B: strona główna mierzyła 21 797 px, czyli **25,8
 * ekranu** przy 390×844. Auta nie były zakopane (pierwsze na 2,11 ekranu) —
 * pod flotą stało kilkanaście ekranów tekstu, przez który trzeba było
 * przewinąć, żeby dojść do stopki.
 *
 * DLACZEGO ZWIJANIE, A NIE SKRACANIE. Serwis stoi na SEO: ma landingi,
 * `hreflang` i ruch z wyszukiwarki. Każde zdanie zostaje w DOM dokładnie
 * tam, gdzie było — wyszukiwarka widzi to samo co wczoraj. Zmienia się
 * wyłącznie to, ile z tego jest naraz widoczne palcem.
 *
 * DLACZEGO PRZYCINANIE SIEDZI W CSS, A NIE W STANIE REACTA. Gdyby o zwinięciu
 * decydował `useState`, serwer musiałby zgadnąć szerokość ekranu, której nie
 * zna: desktop dostałby najpierw treść przyciętą, a po hydratacji rozwiniętą
 * — czyli skok układu na każdym wejściu. Tutaj przycięcie wisi na
 * `@media (pointer: coarse)` w `globals.css`, więc **desktop nie zmienia się
 * o piksel** i nigdzie nie ma mignięcia. Stan Reacta przestawia sam atrybut
 * `data-open`, nic więcej.
 *
 * `pointer: coarse`, a nie breakpoint — ta sama zasada, co przy celach
 * dotykowych `.tap`: tablet w poziomie przy 1024 px to palec, a desktop
 * o tej samej szerokości to kursor.
 *
 * BEZ JAVASCRIPTU treść nie może zostać uwięziona: przycisk wyrenderuje się
 * z serwera, ale nic nie zrobi. Odwraca to jeden `<noscript>` w układzie
 * strony publicznej — patrz `(public)/layout.tsx`.
 */
export function MobileFold({
  label,
  labelOpen,
  previewRem = 20,
  fadeFrom = 65,
  children,
}: {
  /** Napis na przycisku, gdy sekcja jest zwinięta („Rozwiń cennik"). */
  label: string;
  /** Napis, gdy jest rozwinięta („Zwiń cennik"). */
  labelOpen: string;
  /**
   * Ile treści widać przed rozwinięciem, w `rem`.
   *
   * Podgląd ma pokazać, CZEGO dotyczy sekcja — dwa, trzy elementy siatki —
   * a nie samą krawędź tekstu.
   */
  previewRem?: number;
  /**
   * Od ilu procent wysokości podglądu zaczyna się zanikanie.
   *
   * Domyślne 65 % jest dobre dla tekstu: krawędź robi się miękka i widać,
   * że jest tego więcej. Dla FLOTY jest złe — zanik rozmywałby zdjęcia aut,
   * czyli jedyną rzecz, po którą klient tu przyszedł, i wyglądałoby to na
   * usterkę renderowania. Tam idzie 90 %: mięknie sam dolny brzeg.
   */
  fadeFrom?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  /**
   * Czy treść i tak mieści się w podglądzie.
   *
   * Sekcje strony głównej nie mają stałej wysokości: flota po filtrze dat albo
   * po wyborze segmentu potrafi zejść do dwóch aut, a wtedy nie ma czego
   * zwijać. Przycisk „Pokaż więcej", który niczego nie pokazuje, jest gorszy
   * niż jego brak — wygląda na działający.
   *
   * `null` znaczy „jeszcze nie zmierzono": do czasu pomiaru przycisku nie ma,
   * bo pojawiający się i znikający przycisk jest gorszy od takiego, który
   * pojawia się raz.
   */
  const [fits, setFits] = useState<boolean | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setFits(el.scrollHeight <= previewRem * 16 + 8);
    measure();
    // Zdjęcia aut dochodzą po pierwszym rysowaniu i zmieniają wysokość siatki,
    // więc jeden pomiar przy montowaniu kłamałby przy wolnym łączu.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [previewRem]);

  return (
    /*
      Przycięcie zależy WYŁĄCZNIE od `open`, nigdy od pomiaru.

      Pierwsza wersja miała tu `open || fits !== false` i to był błąd tej samej
      rodziny, przed którą broni się cały komponent: pomiar jest dostępny
      dopiero po hydratacji, więc serwer renderował sekcję nieprzyciętą,
      a przycięcie wskakiwało chwilę później — strona skakała w górę przy
      każdym wejściu z telefonu.

      Gdy treść i tak się mieści, `max-height` większy od niej nie robi NIC,
      więc przycinanie „na zapas" jest darmowe. Pomiar rozstrzyga tylko o tym,
      czy pokazać przycisk — bo to jedyna rzecz, która przy krótkiej treści
      byłaby myląca.
    */
    <div className="fold" data-open={open ? "true" : "false"}>
      <div
        ref={bodyRef}
        id={id}
        className="fold-body"
        style={
          {
            "--fold-h": `${previewRem}rem`,
            "--fold-fade": `${fadeFrom}%`,
          } as React.CSSProperties
        }
        /*
          Fokus, który wjeżdża w przyciętą część, ROZWIJA sekcję — zamiast być
          w niej uwięziony.

          Stała tu wcześniej odwrotna odpowiedź: `inert` na całym ciele, gdy
          sekcja jest zwinięta. Rozumowanie było słuszne (treść pod
          `overflow: hidden` nadal łapie klawiaturę), ale lekarstwo objęło
          również tę część, którą WIDAĆ — a w sekcji floty widać cztery karty
          samochodów. Na telefonie nie dało się przez to ani przesunąć zdjęcia,
          ani otworzyć galerii, ani dodać auta do wybranych: strona wyglądała
          na działającą i nie reagowała na palec. Zmierzone na Home przy 320
          i 390 px, `inert` obecny na `.fold-body` z widocznym podglądem
          2720 px.

          `onFocusCapture` odwraca zależność: nic nie jest wyłączane, a jeśli
          klawiatura dojdzie Tabem do elementu poza podglądem, sekcja się
          otwiera i element jest widoczny w chwili, w której dostaje ognisko.
          `capture`, bo zdarzenie `focus` nie bąbelkuje.
        */
        onFocusCapture={() => setOpen(true)}
      >
        {children}
      </div>
      {fits === false && (
        <button
          type="button"
          className="fold-toggle label-tight text-silver hover:text-ink tap mt-8 inline-block text-[11px] transition-colors"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? `${labelOpen} ↑` : `${label} ↓`}
        </button>
      )}
    </div>
  );
}
