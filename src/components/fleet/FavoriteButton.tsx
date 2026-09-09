"use client";

import { useTranslations } from "next-intl";
import { useSaved } from "@/lib/favorites/store";
import { announceSavedChange } from "./SavedToast";

/**
 * The heart on a car card.
 *
 * Two placements, one component. `overlay` sits on the photo — a small glass
 * disc in the corner where neither the class chip (top-left) nor the sold-out
 * badge (top-right) already is. `inline` is a plain bordered button for the
 * saved list and the comparison, where there is no photo to sit on.
 *
 * ## Accessibility
 *
 * The label names the car and says what pressing will do — "Dodaj BMW 740d do
 * wybranych" — so a screen reader announces something useful rather than
 * "button, heart". `aria-pressed` carries the state, so the meaning does not
 * depend on the fill colour alone. It is a real `<button>`, so the keyboard
 * already works.
 *
 * The tap target is 44×44 at minimum, which is why the overlay variant has
 * padding well beyond the glyph.
 */
export function FavoriteButton({
  carId,
  carName,
  variant = "overlay",
}: {
  carId: string;
  carName: string;
  variant?: "overlay" | "inline";
}) {
  const t = useTranslations("Saved");
  const { ids, toggle } = useSaved();
  const saved = ids.includes(carId);

  const label = saved
    ? t("removeAria", { car: carName })
    : t("addAria", { car: carName });

  /*
   * `z-20` i `touch-manipulation`, odkąd pod spodem jeździ taśma ze zdjęciami.
   *
   * Taśma nasłuchuje `pointerdown`, żeby odróżnić dotknięcie od przesunięcia,
   * i leży w tym samym kontenerze co serce. Bez wyższej warstwy i bez
   * zatrzymania zdarzenia dotknięcie serca liczyłoby się JEDNOCZEŚNIE jako
   * dotknięcie zdjęcia — czyli jedno kliknięcie robiłoby dwie rzeczy naraz:
   * dodawało auto do wybranych i otwierało galerię.
   *
   * `touch-manipulation` zdejmuje z telefonu 300-milisekundowe czekanie na
   * ewentualne podwójne dotknięcie. To ono sprawiało, że serce „nie reaguje" —
   * reagowało, tylko jedną trzecią sekundy później, a w tym czasie palec zdążył
   * ruszyć i przeglądarka uznawała gest za przewijanie.
   */
  const shell =
    variant === "overlay"
      ? "absolute right-3 bottom-3 z-20 touch-manipulation inline-flex size-11 items-center justify-center rounded-full border border-line-strong bg-void/60 backdrop-blur-sm transition-colors hover:bg-void/80"
      : "inline-flex size-11 items-center justify-center border border-line-strong transition-colors hover:border-ink";

  return (
    <button
      type="button"
      // Zatrzymane JUŻ przy `pointerdown`, nie dopiero przy `click`: taśma
      // zdjęć zapamiętuje punkt startu właśnie w `pointerdown`, więc czekanie
      // do `click` byłoby spóźnione o całe zdarzenie.
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => {
        // The overlay sits inside a card whose photo is a link; without this a
        // tap on the heart would also navigate to the car.
        e.preventDefault();
        e.stopPropagation();
        /*
          Stan po kliknięciu bierzemy z tego, co było PRZED nim, a nie z `ids`
          po zmianie: `useSaved` odświeży się dopiero przy następnym
          renderowaniu, więc odczyt tutaj opisywałby poprzedni stan świata.
          `toggle` sam nie zwraca wyniku — i celowo tego nie zmieniam, bo
          magazyn ulubionych ma zostać nietknięty.
        */
        toggle(carId);
        announceSavedChange({ saved: !saved });
      }}
      aria-pressed={saved}
      aria-label={label}
      title={label}
      /*
        Stan czytelny bez patrzenia na samą ikonę: dodane auto dostaje czerwoną
        obwódkę i czerwoną poświatę wokół krążka, nie tylko wypełnione serce
        w środku. Palec, który właśnie zasłonił ikonę, widzi zmianę na jej
        krawędzi.
      */
      className={`${shell} tap ${
        saved
          ? "border-red text-red shadow-[0_0_0_3px_rgba(220,38,38,0.18)]"
          : "text-ink"
      }`}
    >
      {/* Filled vs outlined, so the state reads without relying on colour. */}
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="size-5"
        fill={saved ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 20.5s-7.5-4.7-7.5-9.6a4.2 4.2 0 0 1 7.5-2.6 4.2 4.2 0 0 1 7.5 2.6c0 4.9-7.5 9.6-7.5 9.6Z" />
      </svg>
    </button>
  );
}
