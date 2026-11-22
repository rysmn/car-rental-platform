"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { WersjaAkcje } from "./WersjaAkcje";
import { EdytujDokument } from "./EdytujDokument";

/**
 * Jeden wiersz wersji na liście — razem z rozwijaną edycją.
 *
 * Edycja otwiera się POD wierszem, nie w oknie modalnym: na telefonie modal
 * trzeba przewijać, a formularz i tak jest dłuższy niż ekran. Rozwinięcie
 * zostawia administratora tam, gdzie kliknął.
 */
export function WierszWersji({
  dokument,
  opis,
  mozeZarzadzac,
}: {
  dokument: {
    id: string;
    slug: string;
    locale: string;
    version: number;
    title: string;
    description: string | null;
    category: string;
    effectiveFrom: string | null;
    active: boolean;
    autoSend: boolean;
    bilingual: boolean;
    fileName: string;
  };
  /** Wiersz opisowy złożony po stronie serwera — data, rozmiar, obowiązywanie. */
  opis: string;
  mozeZarzadzac: boolean;
}) {
  const t = useTranslations("Admin.documents");
  const [edytuje, setEdytuje] = useState(false);

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-ink text-sm">
            {t("versionLabel", { version: dokument.version })}
            {dokument.active && (
              <span className="text-ink ml-2 text-xs">{t("inForce")}</span>
            )}
            {dokument.autoSend && dokument.active && (
              <span className="text-ink ml-2 text-xs">
                {t("sentToCustomer")}
                {dokument.bilingual ? t("bothLanguages") : t("plOnly")}
              </span>
            )}
          </p>
          <p className="text-ink-faint text-xs">{opis}</p>
        </div>
        <WersjaAkcje
          id={dokument.id}
          fileName={dokument.fileName}
          active={dokument.active}
          autoSend={dokument.autoSend}
          mozeZarzadzac={mozeZarzadzac}
          onEdytuj={() => setEdytuje((x) => !x)}
        />
      </div>

      {edytuje && (
        <EdytujDokument
          dokument={dokument}
          onZamknij={() => setEdytuje(false)}
        />
      )}
    </li>
  );
}
