"use client";

import { useTranslations } from "next-intl";

/**
 * One date range for the whole comparison.
 *
 * A plain GET form, so the chosen range lands in the URL and the server does
 * the pricing — the same route a bookmarked or shared comparison takes. Nothing
 * is calculated in the browser, which is what keeps these figures identical to
 * the ones the booking form will produce.
 */
export function DateRangeForm({
  cars,
  from,
  to,
  action,
}: {
  cars: string;
  from: string;
  to: string;
  action: string;
}) {
  const t = useTranslations("Compare");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      method="get"
      action={action}
      className="border-line flex flex-wrap items-end gap-4 border-y py-4"
    >
      <input type="hidden" name="cars" value={cars} />
      <label className="flex flex-col gap-1">
        <span className="label-tight text-ink-faint text-[10px]">{t("from")}</span>
        <input
          type="date"
          name="od"
          defaultValue={from}
          min={today}
          className="border-line-strong bg-surface-1 text-ink h-11 border px-3 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label-tight text-ink-faint text-[10px]">{t("to")}</span>
        <input
          type="date"
          name="do"
          defaultValue={to}
          min={from || today}
          className="border-line-strong bg-surface-1 text-ink h-11 border px-3 text-sm"
        />
      </label>
      <button
        type="submit"
        className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap inline-flex h-11 items-center border px-5 text-xs transition-colors"
      >
        {t("apply")}
      </button>
    </form>
  );
}
