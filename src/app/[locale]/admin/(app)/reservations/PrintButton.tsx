"use client";

import { useTranslations } from "next-intl";

/**
 * „Drukuj / Zapisz PDF" — jedno dotknięcie do pliku.
 *
 * Na telefonie systemowy arkusz druku ma pozycję „Zapisz jako PDF" i to jest
 * cała droga do pliku, który operator wysyła mailem. Dlatego przycisk mówi obie
 * rzeczy naraz: kto chce papier, dostanie papier, kto chce plik — plik.
 */
export function PrintButton() {
  const t = useTranslations("Admin.reservations.print");
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="label bg-red hover:bg-red-hover tap inline-flex h-11 items-center px-6 text-xs text-white transition-colors"
    >
      {t("button")}
    </button>
  );
}
