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
import { PhotoLightbox } from "./PhotoLightbox";
import { kolejnoscDlaMotywu } from "@/lib/fleet/zdjecie-motywu";
import { subscribeTheme, getThemeSnapshot, getThemeServerSnapshot } from "@/components/layout/ThemeToggle";
import type { FleetCar } from "@/lib/fleet/types";

/**
 * Zdjęcia auta na karcie floty: przesuwanie palcem i wejście do pełnej galerii.
 *
 * ## Co było zepsute
 *
 * Karta pokazywała `car.images[0]` i nic poza tym. Auto z siedmioma zdjęciami
 * wyglądało na telefonie jak auto z jednym — reszta była wyłącznie na stronie
 * szczegółów, do której trzeba było wejść, żeby się o niej dowiedzieć.
 *
 * ## Dlaczego natywne przewijanie, a nie własna obsługa dotyku
 *
 * Kuszące jest policzyć `touchstart`/`touchend` i przesunąć zdjęcie samemu.
 * To jednak oznacza odebranie przeglądarce gestu, który ona rozumie lepiej:
 * pęd, odbicie na krańcach, przerwanie przewijania palcem w trakcie animacji
 * i — najważniejsze — rozróżnienie gestu POZIOMEGO od PIONOWEGO. Własny
 * `preventDefault` na `touchmove` blokuje przewijanie strony w pionie i jest
 * to najczęstszy sposób, w jaki karuzela psuje telefon.
 *
 * Dlatego taśma to zwykły `overflow-x: auto` ze `scroll-snap`, dokładnie jak
 * w `CarGallery` na stronie auta. Przeglądarka sama decyduje, czy palec jedzie
 * w bok, czy w dół; `touch-action: pan-y pinch-zoom` mówi jej wprost, że pion
 * należy do strony.
 *
 * ## Jak odróżniamy przesunięcie od dotknięcia
 *
 * Dotknięcie zdjęcia otwiera pełną galerię, ale przesunięcie palcem NIE MOŻE
 * jej otwierać — a oba kończą się zdarzeniem `click`. Zapamiętujemy więc punkt
 * `pointerdown` i otwieramy galerię tylko wtedy, gdy palec przejechał mniej niż
 * `TAP_TOLERANCE`. Sześć pikseli, bo tyle wynosi drżenie ręki przy dotknięciu,
 * a każdy prawdziwy swipe jest wielokrotnie dłuższy.
 */

/** Ile pikseli może przejechać palec, żeby to nadal było dotknięcie. */
const TAP_TOLERANCE = 6;

export function CarPhotos({
  car,
  sizes,
  priority,
}: {
  car: Pick<FleetCar, "images" | "brand" | "model">;
  sizes: string;
  priority?: boolean;
}) {
  const t = useTranslations("Fleet");
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  /*
    Galeria mieszka TUTAJ, nie w karcie.

    Karta jest komponentem serwerowym — nazwa, cena, dane techniczne i stan
    pojazdu nie potrzebują ani grama JavaScriptu. Gdyby stan galerii siedział
    w karcie, cała karta musiałaby pojechać do przeglądarki razem z opisem
    i tabelą parametrów, dwanaście razy na stronie floty. Interaktywna jest
    wyłącznie taśma ze zdjęciami i to ona nosi nakładkę.
  */
  const [galeria, setGaleria] = useState<number | null>(null);
  const jasny =
    useSyncExternalStore(
      subscribeTheme,
      getThemeSnapshot,
      getThemeServerSnapshot,
    ) === "light";
  const start = useRef<{ x: number; y: number } | null>(null);
  const images = car.images;
  const many = images.length > 1;

  // Który kadr jest na środku — wyliczane z pozycji przewijania, nie odwrotnie.
  // Kropki i licznik tylko CZYTAJĄ taśmę i nigdy nią nie sterują poza kliknięciem.
  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    setIndex((prev) => (prev === next ? prev : next));
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el || !many) return;
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
  }, [onScroll, many]);

  if (images.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(120%_120%_at_50%_0%,#181818,#000)]">
        <span className="font-heading text-ink/10 text-3xl font-bold tracking-[0.12em] uppercase">
          {car.brand}
        </span>
      </div>
    );
  }

  const otworz = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = Math.abs(e.clientX - s.x);
    const dy = Math.abs(e.clientY - s.y);
    if (dx > TAP_TOLERANCE || dy > TAP_TOLERANCE) return; // to był swipe
    setGaleria(index);
  };

  return (
    <>
      <div
        ref={trackRef}
        /*
          `touch-action: pan-x pan-y` — OBA kierunki, i to jest cała sztuczka.

          Kuszące jest napisać tu samo `pan-y` z myślą „pion należy do strony".
          To znaczy jednak coś innego, niż się wydaje: `pan-y` mówi przeglądarce,
          że na tym elemencie wolno panoramować WYŁĄCZNIE w pionie — czyli
          zabrania dokładnie tego gestu, dla którego ta taśma istnieje. Palec
          w bok przestaje ją przewijać i karuzela wygląda na zepsutą, choć jest
          poprawnie zbudowana.

          Wymienione oba kierunki: w poziomie przewija się taśma, w pionie —
          strona pod nią. Przeglądarka rozstrzyga to sama po kierunku pierwszych
          pikseli ruchu i robi to lepiej niż jakikolwiek własny `touchmove`.
        */
        className="flex h-full w-full [touch-action:pan-x_pan-y] snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onPointerDown={(e) => {
          start.current = { x: e.clientX, y: e.clientY };
          /*
            Ognisko ustawiane RĘCZNIE, z `preventScroll`.

            Taśma jest elementem, na który da się wejść klawiaturą (`tabIndex`),
            więc dotknięcie jej nadaje jej ognisko — a przeglądarka, nadając
            ognisko, przewija element do widoku. Skutek był taki, że dotknięcie
            zdjęcia w połowie listy floty przesuwało stronę do tej karty, jeszcze
            zanim galeria zdążyła się otworzyć; po zamknięciu klient stał więc
            w innym miejscu niż przed dotknięciem, choć nakładka niczego nie
            ruszała.

            Ustawienie ogniska tutaj, z `preventScroll: true`, wyprzedza
            zachowanie domyślne: element JEST ogniskiem, a strona się nie rusza.
          */
          (e.currentTarget as HTMLElement).focus({ preventScroll: true });
        }}
        onPointerUp={otworz}
        role="button"
        tabIndex={0}
        aria-label={t("openGallery", { car: `${car.brand} ${car.model}` })}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setGaleria(index);
          }
        }}
      >
        {images.map((src, i) => (
          <div key={src} className="relative h-full w-full shrink-0 snap-center">
            <CarPhoto
              images={images}
              pozycja={i}
              alt={`${car.brand} ${car.model}${many ? ` — ${i + 1}/${images.length}` : ""}`}
              sizes={sizes}
              /*
                Dwa pierwsze kadry, nie jeden: w jasnym motywie od razu widać
                ten drugi, a serwer nie wie, który motyw dostanie. Wskazanie
                tylko kadru zerowego kazałoby połowie odwiedzających czekać na
                zdjęcie, które i tak jest pierwszym, jakie zobaczą.
              */
              priority={priority && i < 2}
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            />
          </div>
        ))}
      </div>

      {galeria !== null && (
        <PhotoLightbox
          /*
            Kolejność WIDZIANA, nie zapisana. `galeria` to numer kadru taśmy,
            a w jasnym motywie kadr zerowy pokazuje zdjęcie nr 2 — gdyby
            nakładka dostała surową listę, dotknięcie zdjęcia otwierałoby inne.
            Motywu wolno tu zapytać: to dzieje się po kliknięciu, więc długo po
            tym, jak przeglądarka go zna.
          */
          images={kolejnoscDlaMotywu(images, jasny)}
          startIndex={galeria}
          alt={`${car.brand} ${car.model}`}
          labelClose={t("closeGallery")}
          onClose={() => setGaleria(null)}
        />
      )}

      {many && (
        <>
          {/*
            Licznik i kropki w LEWYM DOLNYM rogu.

            Prawy górny zajmuje stan pojazdu, prawy dolny serce — a to dwie
            rzeczy, których zasłonić nie wolno. Lewy dolny jest jedynym wolnym
            narożnikiem i zarazem tym, w którym nie zakrywa się twarzy auta.
            `pointer-events-none`, bo pod spodem jest taśma i pigułka nie ma
            prawa zjadać przesunięcia.
          */}
          <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2">
            <span className="label-tight status-scrim rounded-pill text-white px-2 py-0.5 text-[10px] tabular-nums">
              {index + 1} / {images.length}
            </span>
            <span className="hidden items-center gap-1 min-[380px]:flex">
              {images.map((src, i) => (
                <span
                  key={src}
                  className={`rounded-pill h-1 w-1 transition-colors ${
                    i === index ? "bg-white" : "bg-white/40"
                  }`}
                />
              ))}
            </span>
          </div>
        </>
      )}
    </>
  );
}
