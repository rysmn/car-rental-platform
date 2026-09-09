"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslations } from "next-intl";
import { CarPhoto } from "./CarPhoto";
import { CarMedia } from "./CarMedia";
import { VehicleStatus } from "./VehicleStatus";
import { PhotoLightbox } from "./PhotoLightbox";
import { kolejnoscDlaMotywu } from "@/lib/fleet/zdjecie-motywu";
import {
  subscribeTheme,
  getThemeSnapshot,
  getThemeServerSnapshot,
} from "@/components/layout/ThemeToggle";
import type { FleetState } from "@/lib/fleet/status";
import type { FleetCar } from "@/lib/fleet/types";

/**
 * The car's photo set on its detail page.
 *
 * Built on native scroll-snap rather than a carousel library: a phone swipe is
 * already a scroll, so the platform gives momentum, rubber-banding and
 * accessibility for free, and the first frame is real SSR'd markup instead of
 * something that pops in after hydration. The dots and the thumbnail strip only
 * read the scroll position — they never drive layout.
 *
 * With a single photo it degrades to exactly what was here before: one image,
 * no dots, no strip.
 */
export function CarGallery({
  car,
  sizes,
  badge,
  state = null,
  freeForDates = null,
  nextFreeDay = null,
  today,
}: {
  car: Pick<FleetCar, "images" | "brand" | "model">;
  sizes: string;
  badge?: string;
  /** Stan na dziś, albo null gdy operator wyłączył statusy publiczne. */
  state?: FleetState | null;
  /** Odpowiedź Availability Engine dla wybranego terminu; null gdy brak dat. */
  freeForDates?: boolean | null;
  /** Pierwszy wolny dzień modelu (`YYYY-MM-DD`) — patrz `VehicleStatus`. */
  nextFreeDay?: string | null;
  /** Dzisiejsza data `YYYY-MM-DD`, podana przez stronę. */
  today?: string;
}) {
  const t = useTranslations("Fleet");
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const images = car.images;
  const many = images.length > 1;

  /*
    Pełnoekranowa galeria — TA SAMA nakładka, co na kartach floty.

    Do 31.08.2026 dotknięcie zdjęcia na karcie auta nie robiło nic: taśma
    z kropkami i miniaturami była tu całą galerią, a `PhotoLightbox` znał
    wyłącznie `CarPhotos`, czyli kafelki na liście. Klient, który doszedł do
    strony konkretnego auta — a więc ten najbardziej zainteresowany — miał
    zdjęcia mniejsze niż ten, który tylko przewijał listę.

    Nie powstaje przez to drugi mechanizm: to jest ten sam komponent, ta sama
    reguła odróżniania dotknięcia od przesunięcia i ta sama kolejność zdjęć
    zależna od motywu (ciemny → nr 1, jasny → nr 2). Nakładka otwiera się na
    kadrze, który klient MA PRZED OCZAMI, a nie na zerowym.
  */
  const [galeria, setGaleria] = useState<number | null>(null);
  const jasny =
    useSyncExternalStore(
      subscribeTheme,
      getThemeSnapshot,
      getThemeServerSnapshot,
    ) === "light";
  const start = useRef<{ x: number; y: number } | null>(null);
  /** Powyżej tylu pikseli gest jest przesunięciem taśmy, nie dotknięciem. */
  const TOLERANCJA = 10;

  const otworz = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    if (
      Math.abs(e.clientX - s.x) > TOLERANCJA ||
      Math.abs(e.clientY - s.y) > TOLERANCJA
    ) {
      return;
    }
    setGaleria(index);
  };

  // Which slide is centred, derived from scrollLeft. rAF-throttled: the scroll
  // event fires far more often than the value can meaningfully change.
  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    setIndex((prev) => (prev === next ? prev : next));
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let frame = 0;
    const handler = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(onScroll);
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", handler);
    };
  }, [onScroll]);

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div>
      <div className="bg-surface-2 relative aspect-[16/9] w-full overflow-hidden md:aspect-[21/9]">
        {many ? (
          <div
            ref={trackRef}
            onPointerDown={(e) => {
              start.current = { x: e.clientX, y: e.clientY };
              // Ognisko nadawane ręcznie, z `preventScroll` — inaczej
              // przeglądarka przewinęłaby stronę do taśmy, zanim nakładka
              // zdąży się otworzyć. Ten sam powód co w `CarPhotos`.
              (e.currentTarget as HTMLElement).focus({ preventScroll: true });
            }}
            onPointerUp={otworz}
            role="button"
            tabIndex={0}
            aria-label={t("openGallery", {
              car: `${car.brand} ${car.model}`,
            })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setGaleria(index);
              }
            }}
            className="flex h-full w-full cursor-zoom-in snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden"
          >
            {images.map((src, i) => (
              <div
                key={src}
                className="relative h-full w-full shrink-0 snap-center"
              >
                <CarPhoto
                  images={images}
                  pozycja={i}
                  alt={`${car.brand} ${car.model} — ${i + 1}/${images.length}`}
                  sizes={sizes}
                  /* Dwa pierwsze: w jasnym motywie to drugie jest tym, które
                     odwiedzający zobaczy jako pierwsze. */
                  priority={i < 2}
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        ) : (
          <div
            onPointerDown={(e) => {
              start.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerUp={otworz}
            role="button"
            tabIndex={0}
            aria-label={t("openGallery", {
              car: `${car.brand} ${car.model}`,
            })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setGaleria(0);
              }
            }}
            className="h-full w-full cursor-zoom-in"
          >
            <CarMedia car={car} sizes={sizes} priority />
          </div>
        )}

        {galeria !== null && (
          <PhotoLightbox
            /* Kolejność WIDZIANA, nie zapisana — jak w `CarPhotos`. */
            images={kolejnoscDlaMotywu(images, jasny)}
            startIndex={galeria}
            alt={`${car.brand} ${car.model}`}
            labelClose={t("closeGallery")}
            onClose={() => setGaleria(null)}
          />
        )}

        {/*
          Górny rząd zdjęcia: klasa auta po lewej, stan po prawej. Jeden
          `justify-between` zamiast dwóch osobnych `absolute`, żeby przy
          wąskim ekranie i długim napisie nie było mowy o nachodzeniu.

          Strzałki galerii siedzą na środku wysokości, a kropki na dole —
          `top-0` nie wchodzi w drogę żadnej z nich. `pointer-events-none`,
          bo pod spodem jest przewijana taśma zdjęć.
        */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-5">
          {badge ? (
            <span className="label-tight rounded-pill border-line-strong bg-void/60 text-ink shrink-0 border px-3 py-1 text-[10px] backdrop-blur-sm">
              {badge}
            </span>
          ) : (
            <span />
          )}
          <VehicleStatus
            state={state}
            freeForDates={freeForDates}
            nextFreeDay={nextFreeDay}
            today={today}
            variant="onMedia"
            size="md"
            className="max-w-[60%] text-right"
          />
        </div>

        {/* The dots are 6px because that is how a page indicator should look.
            A 6px tap target is not, so each dot sits inside a 24×44 button —
            invisible, and the row still reads as a line of dots.

            Height reaches the full 44px on a touch device; width cannot. Ten
            photos at 44px wide need 440px and the narrowest phone we support
            is 320px, so widening here would either overflow the screen or
            make each dot's hit area overlap its neighbour's — which trades a
            small target for a wrong one. 24px stays.

            `tap-narrow` egzekwuje to zdanie. Bez niego globalna reguła
            `button { min-width: 44px }` spod `pointer: coarse` (globals.css)
            unieważniała `w-6` po cichu: rząd rósł do 440px, wyśrodkowany
            w 390px ekranie, więc kropka 1 i 10 wyjeżdżały poza ekran i nie
            dało się w nie trafić w ogóle. Zmierzone na `/fleet/jaguar-i-pace`
            (10 zdjęć): pierwsza kropka -25px, ostatnia 415px przy szerokości
            390px — i tak samo na każdej szerokości od 320 do 430. */}
        {many && (
          <div className="absolute inset-x-0 bottom-1 flex h-10 items-center justify-center md:hidden pointer-coarse:h-11">
            {images.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`${i + 1} / ${images.length}`}
                aria-current={i === index}
                className="tap-narrow flex h-10 w-6 items-center justify-center pointer-coarse:h-11"
              >
                <span
                  className={
                    i === index
                      ? "bg-ink h-1.5 w-5 transition-all"
                      : "bg-ink/40 h-1.5 w-1.5 transition-all"
                  }
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Desktop gets the whole set at a glance; a phone has the swipe.

          `overflow-x-auto`: seven 96px thumbnails plus their gaps need 744px,
          which does not fit a 768px tablet — the row was widening the page
          instead of scrolling itself. */}
      {many && (
        <div className="mt-3 hidden gap-3 overflow-x-auto md:flex">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`${i + 1} / ${images.length}`}
              className={
                i === index
                  ? "border-red relative aspect-[3/2] w-24 shrink-0 overflow-hidden border transition-colors"
                  : "border-line hover:border-line-strong relative aspect-[3/2] w-24 shrink-0 overflow-hidden border opacity-60 transition-all hover:opacity-100"
              }
            >
              <CarPhoto
                images={images}
                pozycja={i}
                alt=""
                sizes="96px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
