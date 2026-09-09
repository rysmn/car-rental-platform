"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

/**
 * Pełna galeria jednego auta — na całym ekranie, nad stroną.
 *
 * ## Jedno źródło zdjęć
 *
 * Nie ma tu żadnego własnego zbioru zdjęć: dostaje tę samą tablicę
 * `car.images`, którą karta pokazuje w miniaturze, a strona auta w galerii —
 * czyli to, co administrator ustawił w panelu. Osobnej galerii „dla telefonu"
 * nie ma i nie może być: drugi zbiór to drugi porządek zdjęć i pierwsza okładka
 * inna niż na karcie.
 *
 * ## Powrót dokładnie tam, skąd klient wyszedł
 *
 * Przez nieruszanie pozycji, a nie przez jej przywracanie — szczegóły
 * i porzucona wersja z `position: fixed` w komentarzu przy blokadzie niżej.
 *
 * ## Zamknięcie
 *
 * Trzy drogi, bo każdy sięga po inną: przycisk „✕", klawisz Escape i dotknięcie
 * tła obok zdjęcia. Historia przeglądarki NIE jest tu używana — galeria nie
 * jest adresem i cofnięcie się w przeglądarce ma opuścić stronę auta, a nie
 * zamknąć nakładkę.
 */
export function PhotoLightbox({
  images,
  startIndex,
  alt,
  onClose,
  labelClose,
}: {
  images: readonly string[];
  startIndex: number;
  alt: string;
  onClose: () => void;
  labelClose: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(startIndex);
  const many = images.length > 1;

  useEffect(() => {
    /*
      Blokada przewijania tła BEZ ruszania pozycji strony.

      Pierwsza wersja robiła to klasycznie: `position: fixed` na `<body>`
      z ujemnym `top`, a przy zamknięciu przywracała `scrollY`. Działało na
      papierze i nie działało w praktyce — po zamknięciu strona lądowała przy
      karcie, w którą klient dotknął, a nie tam, gdzie czytał. Przywracanie
      pozycji przegrywało z tym, co przeglądarka robi z ogniskiem i układem po
      zdjęciu `position: fixed`, i przegrywało także w `requestAnimationFrame`.

      Najprostsze rozwiązanie jest tu najlepsze: skoro pozycji nie ruszamy,
      nie trzeba jej przywracać. `overflow: hidden` zatrzymuje przewijanie
      tła i NIE przesuwa dokumentu ani o piksel, więc po zamknięciu klient
      jest dokładnie tam, gdzie był. Na iOS tło potrafi jeszcze drgnąć pod
      nakładką — to wada kosmetyczna, a utrata miejsca w czytanej liście nie
      jest kosmetyczna.
    */
    const el = document.documentElement;
    const body = document.body;
    const zapisane = { html: el.style.overflow, body: body.style.overflow };
    el.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      el.style.overflow = zapisane.html;
      body.style.overflow = zapisane.body;
    };
  }, []);

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el || images.length === 0) return;
    const cel = Math.max(0, Math.min(images.length - 1, i));
    el.scrollTo({ left: cel * el.clientWidth, behavior: "smooth" });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (!many) return;
      if (e.key === "ArrowRight") goTo(index + 1);
      if (e.key === "ArrowLeft") goTo(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Ustawienie kadru startowego bez animacji — klient ma zobaczyć to zdjęcie,
  // w które dotknął, a nie przejazd od pierwszego.
  useEffect(() => {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: startIndex * el.clientWidth });
  }, [startIndex]);

  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    setIndex((prev) => (prev === next ? prev : next));
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={(e) => {
        // Tło zamyka; samo zdjęcie i przyciski zatrzymują zdarzenie u siebie.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <span className="label-tight text-white/80 text-xs tabular-nums">
          {images.length > 0 ? `${index + 1} / ${images.length}` : ""}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={labelClose}
          className="tap flex size-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex flex-1 [touch-action:pan-x_pan-y] snap-x snap-mandatory overflow-x-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((src, i) => (
          <div
            key={src}
            className="relative h-full w-full shrink-0 snap-center"
          >
            <Image
              src={src}
              alt={`${alt} — ${i + 1}/${images.length}`}
              fill
              sizes="100vw"
              priority={i === startIndex}
              className="object-contain"
            />
          </div>
        ))}
      </div>

      {many && (
        <div className="flex items-center justify-center gap-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`${i + 1} / ${images.length}`}
              className="tap-area flex h-6 w-6 items-center justify-center"
            >
              <span
                className={`rounded-pill block h-1.5 w-1.5 transition-colors ${
                  i === index ? "bg-white" : "bg-white/35"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
