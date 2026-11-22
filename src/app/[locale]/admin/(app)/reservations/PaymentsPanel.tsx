"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { pick, pickFrom } from "@/lib/i18n-pick";
import { addPayment, deletePayment, type PaymentResult } from "./actions";
import { formatPln } from "@/lib/format";
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  type PaymentStatus,
} from "@/lib/admin/payment-options";

const inputCls =
  "h-11 w-full border border-line-strong bg-surface-1 px-3 text-sm text-ink";
const labelCls = "label-tight text-[10px] text-ink-faint";

type Row = {
  id: string;
  amountGrosze: number;
  method: string;
  paidOn: string;
  note: string | null;
};

/**
 * Money in, against money owed.
 *
 * The headline is the three numbers an operator says down the phone —
 * "wartość 2 850, zapłacono 1 000, zostało 1 850" — and the colour says
 * whether that is fine or whether somebody has to ring the customer today.
 */
export function PaymentsPanel({
  reservationId,
  totalGrosze,
  paidGrosze,
  outstandingGrosze,
  status,
  payments,
  today,
}: {
  reservationId: string;
  totalGrosze: number;
  paidGrosze: number;
  outstandingGrosze: number;
  status: PaymentStatus;
  payments: Row[];
  today: string;
}) {
  const t = useTranslations("Admin.reservations.payments");
  const tm = useTranslations("Admin.reservations.methods");
  const locale = useLocale();
  const [addState, add, adding] = useActionState<
    PaymentResult | null,
    FormData
  >(addPayment, null);
  const [delState, remove, removing] = useActionState<
    PaymentResult | null,
    FormData
  >(deletePayment, null);

  const dayLabel = (iso: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pl-PL", {
      timeZone: "UTC",
      dateStyle: "short",
    }).format(new Date(`${iso}T00:00:00Z`));

  return (
    <div className="border-line bg-graphite/40 mt-6 border p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="label-tight text-ink-faint text-[10px]">{t("heading")}</h2>
        <span
          className={`label-tight border px-2 py-1 text-[10px] ${PAYMENT_STATUS_TONE[status]}`}
        >
          {pickFrom(PAYMENT_STATUS_LABEL, status, locale)}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className={labelCls}>{t("total")}</p>
          <p className="font-heading text-ink mt-1 text-lg tabular-nums">
            {formatPln(totalGrosze, locale)}
          </p>
        </div>
        <div>
          <p className={labelCls}>{t("paid")}</p>
          <p className="font-heading mt-1 text-lg text-emerald-400 tabular-nums">
            {formatPln(paidGrosze, locale)}
          </p>
        </div>
        <div>
          <p className={labelCls}>{t("outstanding")}</p>
          <p
            className={`font-heading mt-1 text-lg tabular-nums ${
              outstandingGrosze === 0 ? "text-ink" : "text-red"
            }`}
          >
            {formatPln(outstandingGrosze, locale)}
          </p>
        </div>
      </div>

      {payments.length > 0 && (
        <ul className="divide-line border-line mt-5 divide-y border-t">
          {payments.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <span className="text-ink text-sm tabular-nums">
                {formatPln(p.amountGrosze, locale)}
                <span className="text-ink-faint ml-3 text-xs">
                  {PAYMENT_METHOD_LABEL[p.method]
                    ? pick(PAYMENT_METHOD_LABEL[p.method], locale)
                    : p.method}{" "}
                  ·{" "}
                  {dayLabel(p.paidOn)}
                  {p.note ? ` · ${p.note}` : ""}
                </span>
              </span>
              <form action={remove}>
                <input type="hidden" name="id" value={p.id} />
                <input
                  type="hidden"
                  name="reservationId"
                  value={reservationId}
                />
                <button
                  disabled={removing}
                  className="label-tight text-ink-faint hover:text-red text-[10px] transition-colors disabled:opacity-60"
                >
                  {t("remove")}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={add} className="border-line mt-5 border-t pt-5">
        <input type="hidden" name="reservationId" value={reservationId} />
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className={labelCls}>{t("amount")}</span>
            <input
              name="amount"
              inputMode="decimal"
              placeholder={
                outstandingGrosze > 0
                  ? String(Math.round(outstandingGrosze / 100))
                  : "0"
              }
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>{t("method")}</span>
            <select name="method" className={inputCls}>
              <option value="cash">{tm("cash")}</option>
              <option value="card">{tm("card")}</option>
              <option value="transfer">{tm("transfer")}</option>
              <option value="online">{tm("online")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>{t("date")}</span>
            <input
              type="date"
              name="paidOn"
              defaultValue={today}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>{t("note")}</span>
            <input
              name="note"
              placeholder={t("notePlaceholder")}
              className={inputCls}
            />
          </label>
        </div>

        {(addState && !addState.ok) || (delState && !delState.ok) ? (
          <p className="text-red mt-3 text-xs">
            {(addState && !addState.ok && addState.error) ||
              (delState && !delState.ok && delState.error)}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={adding}
          className="label bg-red hover:bg-red-hover mt-4 inline-flex h-11 items-center px-6 text-xs text-white transition-colors disabled:opacity-60"
        >
          {adding ? t("saving") : t("add")}
        </button>
        <p className="text-ink-faint mt-3 text-[11px]">{t("hint")}</p>
      </form>
    </div>
  );
}
