"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { pickFrom } from "@/lib/i18n-pick";
import { setCustomerFlag, type FlagResult } from "./actions";
import {
  CUSTOMER_FLAGS,
  CUSTOMER_FLAG_HINT,
  CUSTOMER_FLAG_LABEL,
  type CustomerFlag,
} from "@/lib/admin/customer-flags";

/**
 * Flaga wewnętrzna i notatka biura.
 *
 * Jedna rzecz, którą ten formularz robi twardo: „Nie wynajmować" bez
 * uzasadnienia jest odrzucane. Za pół roku nikt nie będzie pamiętał, dlaczego
 * ten człowiek nie może wynająć auta, a flaga bez powodu zamienia się w zasadę,
 * której nikt nie umie zdjąć.
 */
export function FlagForm({
  customerId,
  flag,
  notes,
}: {
  customerId: string;
  flag: CustomerFlag;
  notes: string | null;
}) {
  const [state, save, saving] = useActionState<FlagResult | null, FormData>(
    setCustomerFlag,
    null,
  );
  const [picked, setPicked] = useState<CustomerFlag>(flag);
  const t = useTranslations("Admin.customers");
  const locale = useLocale();

  return (
    <form action={save} className="space-y-4">
      <input type="hidden" name="id" value={customerId} />

      <div className="flex flex-wrap gap-2">
        {CUSTOMER_FLAGS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setPicked(f)}
            className={`tap inline-flex h-11 items-center border px-4 text-xs transition-colors ${
              picked === f
                ? "border-ink bg-ink/10 text-ink"
                : "border-line-strong text-ink-faint hover:border-ink hover:text-ink"
            }`}
          >
            {pickFrom(CUSTOMER_FLAG_LABEL, f, locale)}
          </button>
        ))}
      </div>
      <input type="hidden" name="flag" value={picked} />
      <p className="text-ink-faint text-[11px]">{pickFrom(CUSTOMER_FLAG_HINT, picked, locale)}</p>

      <label className="flex flex-col gap-1">
        <span className="label-tight text-ink-faint text-[10px]">
          {picked === "blocked" ? t("flagNoteRequired") : t("flagNoteLabel")}
        </span>
        <textarea
          name="notes"
          rows={3}
          defaultValue={notes ?? ""}
          placeholder={t("flagNotePlaceholder")}
          className="border-line-strong bg-surface-1 text-ink w-full border px-3 py-2 text-sm"
        />
      </label>

      {state && !state.ok && <p className="text-red text-sm">{state.error}</p>}
      {state?.ok && (
        <p className="text-sm text-emerald-400">{t("flagSaved")}</p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 inline-flex h-11 items-center border px-5 text-xs transition-colors disabled:opacity-60"
      >
        {saving ? t("flagSaving") : t("flagSave")}
      </button>
    </form>
  );
}
