"use client";

import { useActionState, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  createBusinessRecurring,
  deleteBusinessRecurring,
  generateBusinessRecurring,
} from "./actions";
import { RECURRING_INTERVALS } from "@/lib/admin/recurring-options";
import type { BusinessRecurringRow } from "@/lib/admin/business-expenses";
import {
  BUSINESS_EXPENSE_GROUPS,
} from "@/lib/admin/business-expense-options";
import { formatPln } from "@/lib/format";
import { formatIsoDate } from "./date-format";

const inputCls =
  "h-10 w-full border border-line-strong bg-surface-1 px-3 text-sm text-ink placeholder:text-ink-faint";
const labelCls = "label-tight text-[10px] text-ink-faint";

function todayValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Row({ item }: { item: BusinessRecurringRow }) {
  const t = useTranslations("Admin.finance");
  const locale = useLocale();
  const [busy, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const doGenerate = () =>
    start(async () => {
      setMessage(null);
      const res = await generateBusinessRecurring(item.id);
      if (!res.ok) {
        setMessage(res.error);
      } else {
        setMessage(
          res.created === 0
            ? t("recurring.nothingToAdd")
            : t("recurring.added", { count: res.created ?? 0 }),
        );
      }
    });

  const doDelete = () =>
    start(async () => {
      const res = await deleteBusinessRecurring(item.id);
      if (!res.ok) {
        setMessage(res.error);
        setConfirm(false);
      }
    });

  return (
    <div className="border-line/60 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b py-3 last:border-0">
      <span className="text-ink min-w-[9rem] text-sm">
        {t(`categories.${item.category}`)}
      </span>
      <span className="text-ink text-sm tabular-nums">
        {formatPln(item.amountGrosze, locale)}
      </span>
      <span className="text-silver text-xs">
        {t(`intervals.${item.interval}`)}
      </span>
      {item.vendor && (
        <span className="text-silver text-xs">{item.vendor}</span>
      )}
      <span className="text-ink-faint text-xs tabular-nums">
        {t("recurring.from", { date: formatIsoDate(item.startOn, locale) })}
        {item.endOn
          ? ` ${t("recurring.to", { date: formatIsoDate(item.endOn, locale) })}`
          : ""}
      </span>
      <span className="text-ink-faint text-xs">
        {t("recurring.generated", { count: item.generated })}
      </span>
      {!item.active && (
        <span className="border-line text-ink-faint border px-1.5 text-[10px]">
          {t("recurring.disabled")}
        </span>
      )}
      <span className="ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={doGenerate}
          disabled={busy || !item.active}
          className="text-silver hover:text-ink text-xs disabled:opacity-40"
        >
          {busy ? t("recurring.generating") : t("recurring.generate")}
        </button>
        {confirm ? (
          <>
            <button
              type="button"
              onClick={doDelete}
              disabled={busy}
              className="text-red text-xs disabled:opacity-50"
            >
              {t("actions.confirmDelete")}
            </button>
            <button
              type="button"
              onClick={() => setConfirm(false)}
              className="text-ink-faint hover:text-ink tap text-xs"
            >
              {t("actions.cancel")}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="text-ink-faint hover:text-red tap text-xs"
          >
            {t("actions.delete")}
          </button>
        )}
      </span>
      {message && <span className="text-silver w-full text-xs">{message}</span>}
    </div>
  );
}

function AddRecurring() {
  const t = useTranslations("Admin.finance");
  const [state, action, pending] = useActionState(
    createBusinessRecurring,
    null,
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 mt-3 inline-flex h-9 items-center border px-4 text-xs transition-colors"
      >
        {t("recurring.add")}
      </button>
    );
  }

  return (
    <form
      action={action}
      className="border-line-strong bg-graphite/60 mt-3 border p-4"
    >
      <input type="hidden" name="active" value="on" />
      <p className="label text-ink mb-3 text-xs">{t("recurring.newTitle")}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("form.kind")}</span>
          <select
            name="category"
            defaultValue="accounting"
            className={inputCls}
          >
            {BUSINESS_EXPENSE_GROUPS.map((g) => (
              <optgroup key={g.key} label={t(`groups.${g.key}`)}>
                {g.categories.map((c) => (
                  <option key={c} value={c}>
                    {t(`categories.${c}`)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("recurring.amount")}</span>
          <input
            name="amount"
            inputMode="decimal"
            required
            placeholder={t("form.amountPlaceholder")}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("recurring.interval")}</span>
          <select name="interval" defaultValue="monthly" className={inputCls}>
            {RECURRING_INTERVALS.map((i) => (
              <option key={i} value={i}>
                {t(`intervals.${i}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("recurring.startOn")}</span>
          <input
            name="startOn"
            type="date"
            required
            defaultValue={todayValue()}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("form.endOptional")}</span>
          <input name="endOn" type="date" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("form.vendor")}</span>
          <input
            name="vendor"
            placeholder={t("recurring.vendorPlaceholder")}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
          <span className={labelCls}>{t("form.note")}</span>
          <input
            name="note"
            placeholder={t("recurring.notePlaceholder")}
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
          {pending ? t("actions.adding") : t("actions.add")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-ink-faint hover:text-ink tap text-xs"
        >
          {t("actions.close")}
        </button>
        {state?.ok && (
          <span className="text-xs text-emerald-400">
            {t("recurring.saved")}
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
 * Company subscriptions — the accountant, the ad budget, the domain.
 *
 * The definition alone changes no figure anywhere; "Dopisz brakujące" is what
 * writes the expense rows. Deliberate, and the copy says so: money appearing in
 * the accounts is an action somebody takes, not a side effect of filling in a
 * form.
 */
export function RecurringManager({ items }: { items: BusinessRecurringRow[] }) {
  const t = useTranslations("Admin.finance");
  const [open, setOpen] = useState(items.length > 0);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="border-line tap-block flex w-full items-center justify-between gap-4 border-b pb-2 text-left"
      >
        <span className="label-tight text-ink-faint text-[10px]">
          {t("recurring.toggle")}
        </span>
        <span className="flex items-center gap-3 text-xs">
          <span className="text-silver">
            {items.length === 0
              ? t("recurring.none")
              : t("recurring.count", { count: items.length })}
          </span>
          <span className="text-ink-faint">{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open && (
        <div className="mt-3">
          <p className="text-ink-faint mb-3 text-xs">{t("recurring.intro")}</p>
          {items.length > 0 && (
            <div className="border-line bg-void/40 border px-4">
              {items.map((r) => (
                <Row key={r.id} item={r} />
              ))}
            </div>
          )}
          <AddRecurring />
        </div>
      )}
    </div>
  );
}
