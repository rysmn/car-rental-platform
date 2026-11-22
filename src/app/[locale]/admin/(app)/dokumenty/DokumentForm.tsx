"use client";

import { useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { pickFrom } from "@/lib/i18n-pick";
import { dodajWersje } from "@/lib/documents/actions";
import { ETYKIETY_KATEGORII, KATEGORIE } from "@/lib/documents/kategorie";

/**
 * Wgranie dokumentu albo nowej jego wersji — to jest ta sama operacja.
 *
 * Formularz NIE pyta o numer wersji i nie ma na niego pola. Numer liczy baza
 * z tego, co już jest pod tym samym identyfikatorem i językiem; dwa otwarte
 * okna panelu inaczej dałyby dwie „wersje 3". Operator podaje identyfikator
 * dokumentu — jeżeli taki już istnieje, to jest po prostu jego kolejne wydanie.
 */
export function DokumentForm() {
  const t = useTranslations("Admin.documents");
  const locale = useLocale();
  const [czeka, start] = useTransition();
  const [wynik, setWynik] = useState<{ ok: boolean; tekst: string } | null>(
    null,
  );
  const form = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={form}
      action={(fd) => {
        setWynik(null);
        start(async () => {
          const r = await dodajWersje(fd);
          if (r.ok) {
            setWynik({
              ok: true,
              tekst: t("savedAsVersion", { version: r.version }),
            });
            form.current?.reset();
          } else {
            setWynik({ ok: false, tekst: r.error });
          }
        });
      }}
      className="border-line space-y-4 border p-5"
    >
      <h2 className="font-heading text-ink text-base font-bold">
        {t("uploadHeading")}
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-ink-faint text-xs">{t("fieldSlug")}</span>
          <input
            name="slug"
            required
            placeholder={t("slugPlaceholder")}
            pattern="[a-z0-9\-]+"
            className="border-line bg-void text-ink h-11 w-full border px-3 text-sm"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-ink-faint text-xs">{t("fieldTitle")}</span>
          <input
            name="title"
            required
            placeholder={t("titlePlaceholder")}
            className="border-line bg-void text-ink h-11 w-full border px-3 text-sm"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-ink-faint text-xs">{t("fieldLocale")}</span>
          <select
            name="locale"
            className="border-line bg-void text-ink h-11 w-full border px-3 text-sm"
          >
            <option value="pl">{t("localePl")}</option>
            <option value="en">{t("localeEn")}</option>
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-ink-faint text-xs">{t("fieldCategory")}</span>
          <select
            name="category"
            defaultValue="booking"
            className="border-line bg-void text-ink h-11 w-full border px-3 text-sm"
          >
            {KATEGORIE.map((k) => (
              <option key={k} value={k}>
                {pickFrom(ETYKIETY_KATEGORII, k, locale)}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-ink-faint text-xs">
            {t("fieldEffectiveFrom")}
          </span>
          <input
            type="date"
            name="effectiveFrom"
            className="border-line bg-void text-ink h-11 w-full border px-3 text-sm"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-ink-faint text-xs">{t("fieldFile")}</span>
          <input
            type="file"
            name="plik"
            required
            accept="application/pdf"
            className="border-line bg-void text-ink w-full border p-2 text-sm"
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-ink-faint text-xs">{t("fieldDescription")}</span>
        <textarea
          name="description"
          rows={2}
          className="border-line bg-void text-ink w-full border px-3 py-2 text-sm"
        />
      </label>

      <label className="flex items-center gap-3">
        <input type="checkbox" name="aktywuj" className="h-5 w-5" />
        <span className="text-ink text-sm">{t("checkActivate")}</span>
      </label>

      <label className="flex items-center gap-3">
        <input type="checkbox" name="bilingual" className="h-5 w-5" />
        <span className="text-ink text-sm">{t("checkBilingual")}</span>
      </label>

      {wynik && (
        <p
          role="status"
          className={wynik.ok ? "text-ink text-sm" : "text-ink-muted text-sm"}
        >
          {wynik.tekst}
        </p>
      )}

      <button
        type="submit"
        disabled={czeka}
        className="label bg-red hover:bg-red-hover inline-flex h-11 items-center px-6 text-xs text-white transition-colors disabled:opacity-50"
      >
        {czeka ? t("saving") : t("saveVersion")}
      </button>
    </form>
  );
}
