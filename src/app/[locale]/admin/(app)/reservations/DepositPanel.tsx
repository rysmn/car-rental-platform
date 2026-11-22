"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  addDepositEvent,
  deleteLastDepositEvent,
  type DepositResult,
} from "./actions";
import { formatPln } from "@/lib/format";
import {
  DEPOSIT_STATUSES,
  DEPOSIT_STATUS_HINT,
  DEPOSIT_STATUS_LABEL,
  DEPOSIT_STATUS_TONE,
  DEPOSIT_TAKES_AMOUNT,
  suggestedNextDeposit,
  type DepositEvent,
  type DepositStatus,
} from "@/lib/admin/deposit-options";
import { PAYMENT_METHOD_LABEL } from "@/lib/admin/payment-options";
import { pick, pickFrom } from "@/lib/i18n-pick";

const inputCls =
  "h-11 w-full border border-line-strong bg-surface-1 px-3 text-sm text-ink";
const labelCls = "label-tight text-[10px] text-ink-faint";

/**
 * The customer's money, and where it is right now.
 *
 * Deliberately separate from Płatności above it: what a customer pays for a
 * rental is income the moment it arrives, and a deposit is not — it is money
 * held on trust that has to go back. Mixing them into one balance is how a
 * firm ends up spending a deposit it owes and calling the month profitable.
 */
export function DepositPanel({
  reservationId,
  status,
  dueGrosze,
  securedGrosze,
  returnedGrosze,
  keptGrosze,
  events,
}: {
  reservationId: string;
  status: DepositStatus | null;
  dueGrosze: number;
  securedGrosze: number;
  returnedGrosze: number;
  keptGrosze: number;
  events: DepositEvent[];
}) {
  const t = useTranslations("Admin.reservations.deposit");
  const tm = useTranslations("Admin.reservations.methods");
  const locale = useLocale();
  const [addState, add, adding] = useActionState<DepositResult | null, FormData>(
    addDepositEvent,
    null,
  );
  const [delState, undo, undoing] = useActionState<
    DepositResult | null,
    FormData
  >(deleteLastDepositEvent, null);

  const suggested = suggestedNextDeposit(status);
  const [picked, setPicked] = useState<DepositStatus>(
    suggested ?? status ?? "held",
  );
  const last = events[events.length - 1];
  const error =
    (addState && !addState.ok && addState.error) ||
    (delState && !delState.ok && delState.error) ||
    null;

  const dayLabel = (iso: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pl-PL", {
      timeZone: "UTC",
      dateStyle: "short",
    }).format(new Date(`${iso}T00:00:00Z`));

  return (
    <div className="border-line bg-graphite/40 mt-6 border p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="label-tight text-ink-faint text-[10px]">{t("heading")}</h2>
        {status && (
          <span
            className={`label-tight border px-2 py-1 text-[10px] ${DEPOSIT_STATUS_TONE[status]}`}
          >
            {pickFrom(DEPOSIT_STATUS_LABEL, status, locale)}
          </span>
        )}
      </div>

      {status === null ? (
        <p className="text-ink-faint text-sm">{t("noDeposit")}</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className={labelCls}>{t("due")}</p>
              <p className="font-heading text-ink mt-1 text-lg tabular-nums">
                {formatPln(dueGrosze, locale)}
              </p>
            </div>
            <div>
              <p className={labelCls}>{t("secured")}</p>
              <p
                className={`font-heading mt-1 text-lg tabular-nums ${
                  securedGrosze > 0 ? "text-amber-400" : "text-ink"
                }`}
              >
                {formatPln(securedGrosze, locale)}
              </p>
            </div>
            <div>
              <p className={labelCls}>{t("returnedKept")}</p>
              <p className="font-heading text-ink mt-1 text-lg tabular-nums">
                {formatPln(returnedGrosze, locale)}
                {keptGrosze > 0 && (
                  <span className="text-red ml-2 text-sm">
                    / {formatPln(keptGrosze, locale)}
                  </span>
                )}
              </p>
            </div>
          </div>

          <p className="text-ink-faint mt-3 text-[11px]">
            {pickFrom(DEPOSIT_STATUS_HINT, status, locale)}
          </p>

          {events.length > 0 && (
            <ul className="divide-line border-line mt-5 divide-y border-t">
              {events.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <span className="text-ink min-w-0 text-sm">
                    {pickFrom(DEPOSIT_STATUS_LABEL, e.status, locale)}
                    {DEPOSIT_TAKES_AMOUNT[e.status] && (
                      <span className="ml-2 tabular-nums">
                        {formatPln(e.amountGrosze, locale)}
                        {e.keptGrosze > 0 && (
                          <span className="text-red">
                            {" "}
                            {t("keptSuffix", {
                              amount: formatPln(e.keptGrosze, locale),
                            })}
                          </span>
                        )}
                      </span>
                    )}
                    <span className="text-ink-faint ml-3 block text-xs sm:ml-3 sm:inline">
                      {e.method
                        ? `${PAYMENT_METHOD_LABEL[e.method] ? pick(PAYMENT_METHOD_LABEL[e.method], locale) : e.method} ·`
                        : ""}
                      {dayLabel(e.createdAt.slice(0, 10))}
                      {e.by ? ` · ${e.by}` : ""}
                      {e.note ? ` · ${e.note}` : ""}
                    </span>
                  </span>
                  {last && e.id === last.id && (
                    <form action={undo}>
                      <input type="hidden" name="id" value={e.id} />
                      <input
                        type="hidden"
                        name="reservationId"
                        value={reservationId}
                      />
                      <button
                        disabled={undoing}
                        className="label-tight text-ink-faint hover:text-red text-[10px] transition-colors disabled:opacity-60"
                      >
                        {t("undo")}
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form action={add} className="border-line mt-5 border-t pt-5">
            <input type="hidden" name="reservationId" value={reservationId} />
            <div className="grid gap-3 sm:grid-cols-4">
              <label className="flex flex-col gap-1">
                <span className={labelCls}>{t("step")}</span>
                <select
                  name="status"
                  value={picked}
                  onChange={(e) => setPicked(e.target.value as DepositStatus)}
                  className={inputCls}
                >
                  {DEPOSIT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {pickFrom(DEPOSIT_STATUS_LABEL, s, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>
                  {picked === "returned" || picked === "partially_kept"
                    ? t("toReturn")
                    : t("amount")}
                </span>
                <input
                  name="amount"
                  inputMode="decimal"
                  disabled={!DEPOSIT_TAKES_AMOUNT[picked]}
                  placeholder={String(
                    Math.round(
                      (picked === "held" || picked === "blocked"
                        ? dueGrosze
                        : securedGrosze) / 100,
                    ),
                  )}
                  className={`${inputCls} disabled:opacity-40`}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>{t("kept")}</span>
                <input
                  name="kept"
                  inputMode="decimal"
                  disabled={picked !== "partially_kept"}
                  placeholder="0"
                  className={`${inputCls} disabled:opacity-40`}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>{t("method")}</span>
                <select
                  name="method"
                  disabled={!DEPOSIT_TAKES_AMOUNT[picked]}
                  className={`${inputCls} disabled:opacity-40`}
                >
                  <option value="cash">{tm("cash")}</option>
                  <option value="card">{tm("card")}</option>
                  <option value="transfer">{tm("transfer")}</option>
                  <option value="online">{tm("online")}</option>
                </select>
              </label>
            </div>

            <label className="mt-3 flex flex-col gap-1">
              <span className={labelCls}>
                {picked === "partially_kept" ? t("noteRequired") : t("note")}
              </span>
              <input
                name="note"
                placeholder={
                  picked === "partially_kept"
                    ? t("notePlaceholderKept")
                    : t("notePlaceholder")
                }
                className={inputCls}
              />
            </label>

            {error && <p className="text-red mt-3 text-xs">{error}</p>}

            <button
              type="submit"
              disabled={adding}
              className="label bg-red hover:bg-red-hover mt-4 inline-flex h-11 items-center px-6 text-xs text-white transition-colors disabled:opacity-60"
            >
              {adding ? t("saving") : t("saveStep")}
            </button>
            <p className="text-ink-faint mt-3 text-[11px]">{t("hint")}</p>
          </form>
        </>
      )}
    </div>
  );
}
