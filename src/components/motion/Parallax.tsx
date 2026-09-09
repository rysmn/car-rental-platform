"use client";

import { useEffect, useRef } from "react";

/**
 * Gentle vertical parallax for hero imagery. Subtle by design — the element
 * drifts a few dozen pixels as it passes through the viewport. Disabled under
 * prefers-reduced-motion.
 *
 * ## BEZ FRAMER-MOTION (07.09.2026)
 *
 * Ten komponent i `Reveal` były jedynymi żywymi użyciami `framer-motion`
 * w serwisie (`ModelsShowcase` nikt nie importuje). Razem kosztowały 119 kB
 * kodu do rozpakowania i wykonania na KAŻDEJ stronie publicznej — za dwie
 * animacje, które przeglądarka umie zrobić sama.
 *
 * Odpowiednik `useScroll` + `useTransform` to tutaj dziesięć linijek: postęp
 * liczony z `getBoundingClientRect` w tym samym zakresie co poprzednio
 * („start end" → „end start", czyli od wejścia górnej krawędzi w dół okna do
 * wyjścia dolnej górą), przeliczony na przesunięcie od `-distance/2` do
 * `+distance/2`. Wartości i zakres są przepisane jeden do jednego, więc ruch
 * jest ten sam.
 *
 * Nasłuch jest `passive` i zsynchronizowany z klatką (`requestAnimationFrame`),
 * więc przewijanie nie czeka na tę pracę — to samo, co robił mechanizm
 * biblioteki, tylko bez biblioteki.
 */
export function Parallax({
  children,
  className,
  distance = 80,
}: {
  children: React.ReactNode;
  className?: string;
  distance?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const warstwa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pudelko = ref.current;
    const ruchoma = warstwa.current;
    if (!pudelko || !ruchoma) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let klatka = 0;
    const przelicz = () => {
      klatka = 0;
      const r = pudelko.getBoundingClientRect();
      const okno = window.innerHeight || 1;
      /*
        Postęp 0 → 1 na tym samym odcinku, co `offset: ["start end", "end start"]`:
        0, gdy górna krawędź dopiero wchodzi dołem okna; 1, gdy dolna krawędź
        wychodzi górą. Zaciśnięty, żeby poza kadrem nic nie liczyć w kółko.
      */
      const postep = (okno - r.top) / (okno + r.height);
      const p = postep < 0 ? 0 : postep > 1 ? 1 : postep;
      ruchoma.style.transform = `translate3d(0, ${(p - 0.5) * distance}px, 0)`;
    };
    const naPrzewinieciu = () => {
      if (klatka) return;
      klatka = requestAnimationFrame(przelicz);
    };

    przelicz();
    window.addEventListener("scroll", naPrzewinieciu, { passive: true });
    window.addEventListener("resize", naPrzewinieciu, { passive: true });
    return () => {
      if (klatka) cancelAnimationFrame(klatka);
      window.removeEventListener("scroll", naPrzewinieciu);
      window.removeEventListener("resize", naPrzewinieciu);
    };
  }, [distance]);

  return (
    <div ref={ref} className={className}>
      <div ref={warstwa} className="h-full w-full">
        {children}
      </div>
    </div>
  );
}
