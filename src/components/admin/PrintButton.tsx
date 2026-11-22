"use client";

import { useTranslations } from "next-intl";

/**
 * Opens the browser's print dialog, which is where the PDF comes from.
 *
 * A client component for one `onClick`, rather than a server-rendered `<a>`:
 * there is no URL that means "print this". Labelled with both words on purpose
 * — an operator looking for a PDF will not click a button that only says
 * "Drukuj", and "Zapisz jako PDF" is the actual option waiting behind it.
 */
export function PrintButton() {
  const t = useTranslations("Admin.components");
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="label bg-red hover:bg-red-hover inline-flex h-9 items-center px-4 text-xs text-white transition-colors"
    >
      {t("print")}
    </button>
  );
}
