"use client";

import { pick } from "@/lib/i18n-pick";
import { useActionState, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createRecurring, deleteRecurring, generateRecurring } from "./actions";
import {
  RECURRING_INTERVALS,
  INTERVAL_LABEL,
  type RecurringRow,
} from "@/lib/admin/recurring-options";
import { EXPENSE_GROUPS, EXPENSE_LABEL } from "@/lib/admin/expense-options";
import { formatPln } from "@/lib/format";
import { SHOP_CURRENCY } from "@/lib/currency/shop";

const inputCls =
  "h-10 w-full border border-line-strong bg-surface-1 px-3 text-sm text-ink placeholder:text-ink-faint";
const labelCls = "label-tight text-[10px] text-ink-faint";

function todayValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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

function Row({ item }: { item: RecurringRow }) {
  const t = useTranslations("Admin.fleet");
  const locale = useLocale();
  const [busy, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const doGenerate = () =>
    start(async () => {
      setMessage(null);
      const res = await generateRecurring(item.id);
      if (!res.ok) {
        setMessage(res.error);
      } else {
        setMessage(
          res.created === 0
            ? t("nothingToAdd")
            : t("addedCount", { count: res.created ?? 0 }),
        );
      }
    });

  const doDelete = () =>
    start(async () => {
      const res = await deleteRecurring(item.id);
      if (!res.ok) {
        setMessage(res.error);
        setConfirm(false);
      }
    });

  return (
    <div className="border-line/60 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b py-3 last:border-0">
      <span className="min-w-[9rem] text-sm text-ink">
        {pick(EXPENSE_LABEL[item.category], locale)}
      </span>
      <span className="text-sm text-ink tabular-nums">
        {formatPln(item.amountGrosze, locale)}
      </span>
      <span className="text-silver text-xs">
        {pick(INTERVAL_LABEL[item.interval], locale)}
      </span>
      <span className="text-ink-faint text-xs tabular-nums">
        {t("rangeFrom", { date: formatDate(item.startOn, locale) })}
        {item.endOn
          ? ` ${t("rangeTo", { date: formatDate(item.endOn, locale) })}`
          : ""}
      </span>
      <span className="text-ink-faint text-xs">
        {t("generatedLabel", { count: item.generated })}
      </span>
      {!item.active && (
        <span className="border-line text-ink-faint border px-1.5 text-[10px]">
          {t("inactive")}
        </span>
      )}
      <span className="ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={doGenerate}
          disabled={busy || !item.active}
          className="text-silver text-xs hover:text-ink disabled:opacity-40"
        >
          {busy ? t("working") : t("addMissing")}
        </button>
        {confirm ? (
          <>
            <button
              type="button"
              onClick={doDelete}
              disabled={busy}
              className="text-red text-xs disabled:opacity-50"
            >
              {t("confirmQuestion")}
            </button>
            <button
              type="button"
              onClick={() => setConfirm(false)}
              className="text-ink-faint text-xs hover:text-ink"
            >
              {t("cancel")}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="text-ink-faint hover:text-red tap text-xs"
          >
            {t("remove")}
          </button>
        )}
      </span>
      {message && <span className="text-silver w-full text-xs">{message}</span>}
    </div>
  );
}

function AddRecurring({ carId }: { carId: string }) {
  const t = useTranslations("Admin.fleet");
  const locale = useLocale();
  const currency = currencySymbol(locale);
  const [state, action, pending] = useActionState(createRecurring, null);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="label border-line-strong mt-3 inline-flex h-9 items-center border px-4 text-xs text-ink transition-colors hover:border-ink hover:bg-ink/5"
      >
        {t("addRecurring")}
      </button>
    );
  }

  return (
    <form
      action={action}
      className="border-line-strong bg-graphite/60 mt-3 border p-4"
    >
      <input type="hidden" name="carId" value={carId} />
      <input type="hidden" name="active" value="on" />
      <p className="label mb-3 text-xs text-ink">{t("newRecurring")}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("kind")} *</span>
          <select name="category" defaultValue="leasing" className={inputCls}>
            {EXPENSE_GROUPS.map((g) => (
              <optgroup key={g.key} label={pick(g.label, locale)}>
                {g.categories.map((c) => (
                  <option key={c} value={c}>
                    {pick(EXPENSE_LABEL[c], locale)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("installment", { currency })} *</span>
          <input
            name="amount"
            inputMode="decimal"
            required
            placeholder="2 400,00"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("frequency")} *</span>
          <select name="interval" defaultValue="monthly" className={inputCls}>
            {RECURRING_INTERVALS.map((i) => (
              <option key={i} value={i}>
                {pick(INTERVAL_LABEL[i], locale)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("firstInstallment")} *</span>
          <input
            name="startOn"
            type="date"
            required
            defaultValue={todayValue()}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("endOptional")}</span>
          <input name="endOn" type="date" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("note")}</span>
          <input
            name="note"
            placeholder={t("recurringNotePlaceholder")}
            className={inputCls}
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="label bg-red hover:bg-red-hover inline-flex h-9 items-center px-5 text-xs text-white transition-colors disabled:opacity-50"
        >
          {pending ? t("adding") : t("add")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-ink-faint text-xs hover:text-ink"
        >
          {t("close")}
        </button>
        {state?.ok && (
          <span className="text-xs text-emerald-400">
            {t("savedAddMissing")}
          </span>
        )}
        {state && !state.ok && (
          <span className="text-red text-xs">{state.error}</span>
        )}
      </div>
    </form>
  );
}

/**
 * Recurring costs for one physical car.
 *
 * The definition alone changes no figure anywhere — "Dopisz brakujące" is what
 * writes the expense rows. That is deliberate and the copy says so: money
 * appearing in the accounts is an action somebody takes, not a side effect of
 * filling in a form.
 */
export function RecurringManager({
  carId,
  items,
}: {
  carId: string;
  items: RecurringRow[];
}) {
  const t = useTranslations("Admin.fleet");
  const [open, setOpen] = useState(false);

  return (
    <div className="border-line/60 border-t pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="tap-block flex w-full items-center justify-between gap-4 text-left"
      >
        <span className="label-tight text-ink-faint text-[10px]">
          {t("recurringHeading")}
        </span>
        <span className="flex items-center gap-3 text-xs">
          <span className="text-silver">
            {items.length === 0
              ? t("none")
              : t("recurringDefs", { count: items.length })}
          </span>
          <span className="text-ink-faint">{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open && (
        <div className="mt-3">
          <p className="text-ink-faint mb-3 text-xs">{t("recurringIntro")}</p>
          {items.length > 0 && (
            <div className="border-line bg-void/40 border px-4">
              {items.map((r) => (
                <Row key={r.id} item={r} />
              ))}
            </div>
          )}
          <AddRecurring carId={carId} />
        </div>
      )}
    </div>
  );
}
