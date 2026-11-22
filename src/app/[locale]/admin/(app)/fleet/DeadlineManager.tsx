"use client";

import { pick } from "@/lib/i18n-pick";
import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { addDeadline, completeDeadline, type DeadlineResult } from "./actions";
import { formatPln } from "@/lib/format";
import {
  DEADLINE_KINDS,
  DEADLINE_LABEL,
  type DeadlineRow,
} from "@/lib/admin/deadline-options";
import { SHOP_CURRENCY } from "@/lib/currency/shop";

const inputCls =
  "h-11 w-full border border-line-strong bg-surface-1 px-3 text-sm text-ink";
const labelCls = "label-tight text-[10px] text-ink-faint";

/** Symbol waluty w bieżącym locale (pl: „zł”, en: „PLN”). */
function currencySymbol(locale: string) {
  return (
    new Intl.NumberFormat(locale, { style: "currency", currency: SHOP_CURRENCY })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? SHOP_CURRENCY
  );
}

function formatDate(iso: string, locale: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Dated obligations for one car: fines, damages, deposits, prep jobs, anything.
 *
 * This is the escape hatch that stops the alert list being a closed set. The
 * system works out expiries, mileages and bookings by itself; everything else
 * an operator knows and the system cannot, they type here — and it appears in
 * ALERTY on its date without anybody wiring up a new feature.
 */
export function DeadlineManager({
  carId,
  plate,
  deadlines,
  today,
}: {
  carId: string;
  plate: string;
  deadlines: DeadlineRow[];
  today: string;
}) {
  const t = useTranslations("Admin.fleet");
  const locale = useLocale();
  const [addState, add, adding] = useActionState<
    DeadlineResult | null,
    FormData
  >(addDeadline, null);
  const [doneState, done] = useActionState<DeadlineResult | null, FormData>(
    completeDeadline,
    null,
  );

  const open = deadlines.filter((d) => !d.doneAt);
  const closed = deadlines.filter((d) => d.doneAt);

  return (
    <div className="border-line border p-4">
      <p className="label-tight text-ink-faint text-[10px]">
        {t("deadlinesHeading", { plate })}
      </p>

      {open.length > 0 && (
        <ul className="divide-line mt-3 divide-y">
          {open.map((d) => {
            const late = d.dueOn <= today;
            return (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <span className="text-sm text-ink">
                  <span className="label-tight border-line mr-2 border px-1.5 py-0.5 text-[10px]">
                    {pick(DEADLINE_LABEL[d.kind], locale)}
                  </span>
                  {d.title}
                  <span
                    className={`ml-2 text-xs ${late ? "text-red" : "text-ink-faint"}`}
                  >
                    {formatDate(d.dueOn, locale)}
                    {d.amountGrosze != null
                      ? ` · ${formatPln(d.amountGrosze, locale)}`
                      : ""}
                  </span>
                </span>
                <form action={done}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="carId" value={carId} />
                  <button className="label-tight border-line-strong hover:border-ink hover:bg-ink/5 h-8 border px-3 text-[10px] transition-colors">
                    {t("done")}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      <form action={add} className="mt-4 grid gap-3 sm:grid-cols-5">
        <input type="hidden" name="carId" value={carId} />
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("kind")}</span>
          <select name="kind" className={inputCls}>
            {DEADLINE_KINDS.map((k) => (
              <option key={k} value={k}>
                {pick(DEADLINE_LABEL[k], locale)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={labelCls}>{t("name")}</span>
          <input
            name="title"
            placeholder={t("deadlineTitlePlaceholder")}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("due")}</span>
          <input
            type="date"
            name="dueOn"
            defaultValue={today}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("amount", { currency: currencySymbol(locale) })}</span>
          <input name="amount" inputMode="decimal" className={inputCls} />
        </label>
        <div className="sm:col-span-5">
          <button
            type="submit"
            disabled={adding}
            className="label border-line-strong hover:border-ink hover:bg-ink/5 inline-flex h-10 items-center border px-5 text-xs text-ink transition-colors disabled:opacity-60"
          >
            {adding ? t("saving") : t("addDeadline")}
          </button>
          {addState && !addState.ok && (
            <span className="text-red ml-3 text-xs">{addState.error}</span>
          )}
          {doneState && !doneState.ok && (
            <span className="text-red ml-3 text-xs">{doneState.error}</span>
          )}
        </div>
      </form>

      {closed.length > 0 && (
        <p className="text-ink-faint mt-3 text-[11px]">
          {t("closedCount", { count: closed.length })}
        </p>
      )}
    </div>
  );
}
