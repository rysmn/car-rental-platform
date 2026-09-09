"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Krótkie potwierdzenie po dotknięciu serca.
 *
 * ## Po co
 *
 * Serce na karcie auta nie mówiło nic. Zmieniało się wypełnienie ikony w rogu
 * fotografii — czyli dokładnie tam, gdzie nie patrzy palec, który je właśnie
 * zasłonił. Klient dotykał, nie widział skutku i nie wiedział, że serwis ma
 * listę wybranych aut ani gdzie ona jest. Funkcja była zbudowana i praktycznie
 * nieodkrywalna.
 *
 * ## Dlaczego osobnym zdarzeniem, a nie przez magazyn ulubionych
 *
 * `lib/favorites/store` jest nietknięty i ma tak zostać: to on trzyma prawdę
 * o tym, CO jest wybrane, i ma jedno zadanie. Komunikat mówi co innego —
 * że użytkownik WŁAŚNIE coś zrobił. Ta różnica ma znaczenie praktyczne:
 * magazyn zmienia się także wtedy, gdy w innej karcie przeglądarki ktoś usunie
 * auto (`storage`) albo gdy `pruneSaved` sprząta wycofany model. Komunikat
 * przywiązany do magazynu wyskakiwałby wtedy bez powodu, którego użytkownik
 * nie zrozumie.
 *
 * Dlatego kanał jest osobny i jednokierunkowy: przycisk ogłasza swoje
 * kliknięcie, ten komponent je pokazuje. Nic tu nie zapisuje, nic nie czyta
 * z pamięci i nic nie może zepsuć listy.
 *
 * ## Gdzie stoi
 *
 * U góry, pod belką — a nie na dole, gdzie mieszkają już pasek zgód na cookie
 * i uruchamiacz asystenta. Trzeci pływający element w tym samym rogu byłby
 * dokładnie tą kolizją, którą reszta tego projektu mierzy i usuwa.
 */

export const SAVED_TOAST_EVENT = "aa:saved-toast";

export type SavedToastDetail = {
  /** `true` = dodano, `false` = usunięto. */
  saved: boolean;
};

/** Ogłasza kliknięcie serca. Bezpieczne po stronie serwera — po prostu nic nie robi. */
export function announceSavedChange(detail: SavedToastDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SAVED_TOAST_EVENT, { detail }));
}

/** Ile komunikat zostaje na ekranie. Dość, żeby przeczytać; za mało, żeby przeszkadzać. */
const WIDOCZNY_MS = 2600;

export function SavedToast({
  added,
  removed,
  listLabel,
  listHref,
}: {
  /** „Dodano do ulubionych" */
  added: string;
  /** „Usunięto z ulubionych" */
  removed: string;
  /** „Zobacz wybrane" — skrót do listy, bo inaczej klient nie wie, gdzie ona jest. */
  listLabel: string;
  /** Adres listy, już z prefiksem języka — komponent nie zna tras. */
  listHref: string;
}) {
  const [stan, setStan] = useState<SavedToastDetail | null>(null);
  const zegar = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<SavedToastDetail>).detail;
      if (!detail) return;
      setStan(detail);
      if (zegar.current) clearTimeout(zegar.current);
      zegar.current = setTimeout(() => setStan(null), WIDOCZNY_MS);
    };
    window.addEventListener(SAVED_TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(SAVED_TOAST_EVENT, onToast);
      if (zegar.current) clearTimeout(zegar.current);
    };
  }, []);

  /*
    Region istnieje ZAWSZE, treść pojawia się w nim.

    Czytnik ekranu ogłasza zmianę w żywym regionie tylko wtedy, gdy region był
    już w drzewie, zanim treść się w nim znalazła. Region wstawiany razem
    z komunikatem bywa pomijany — to jest ten sam błąd, co `aria-live` dodawane
    dopiero przy błędzie formularza.
  */
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-20 z-[55] flex justify-center px-4 print:hidden"
    >
      {stan && (
        <div className="border-line-strong bg-void/95 pointer-events-auto flex items-center gap-3 border px-4 py-3 shadow-lg backdrop-blur-sm">
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className={`size-4 shrink-0 ${stan.saved ? "text-red" : "text-ink-faint"}`}
            fill={stan.saved ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 20.5s-7.5-4.7-7.5-9.6a4.2 4.2 0 0 1 7.5-2.6 4.2 4.2 0 0 1 7.5 2.6c0 4.9-7.5 9.6-7.5 9.6Z" />
          </svg>
          <span className="text-ink text-sm">
            {stan.saved ? added : removed}
          </span>
          {/*
            Zwykłe `<a>`, nie `Link` z next-intl: adres przychodzi gotowy
            z układu strony, który zna język. Komponent nie ma prawa zgadywać
            trasy, a pełne przeładowanie listy wybranych jest tu bez znaczenia
            — i tak czyta ona pamięć przeglądarki od nowa.
          */}
          {stan.saved && (
            <a
              href={listHref}
              className="label-tight text-silver hover:text-ink shrink-0 text-[11px] underline underline-offset-2 transition-colors"
            >
              {listLabel}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
