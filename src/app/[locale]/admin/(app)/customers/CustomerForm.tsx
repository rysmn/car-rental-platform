"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createCustomer, type CustomerResult } from "./actions";

const inputCls =
  "h-11 w-full border border-line-strong bg-surface-1 px-3 text-sm text-ink placeholder:text-ink-faint";
const labelCls = "label-tight text-[10px] text-ink-faint";

/**
 * Add somebody to the directory without booking anything.
 *
 * The case this exists for: a call that ends in "I'll think about it". The
 * person is worth keeping; the rental is not real yet.
 */
export function CustomerForm() {
  const [state, action, pending] = useActionState<
    CustomerResult | null,
    FormData
  >(createCustomer, null);
  const t = useTranslations("Admin.customers");
  const kept = state && !state.ok ? state.values : undefined;
  const err = (k: string) =>
    state && !state.ok ? state.fieldErrors?.[k] : undefined;

  return (
    <form action={action} className="border-line bg-void border p-5">
      <p className="label text-[10px] text-ink">{t("addCustomer")}</p>

      {state?.ok && (
        <p className="mt-4 border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-400">
          {t("saved", { name: state.name })}
        </p>
      )}
      {state && !state.ok && state.error === "server" && (
        <p className="border-red/50 bg-red/10 text-red mt-4 border px-4 py-3 text-sm">
          {t("saveFailed")}
        </p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("fieldName")}</span>
          <input
            name="name"
            defaultValue={kept?.name ?? ""}
            autoComplete="off"
            className={inputCls}
          />
          {err("name") && (
            <span className="text-red text-[11px]">{err("name")}</span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("fieldPhone")}</span>
          <input
            name="phone"
            defaultValue={kept?.phone ?? ""}
            inputMode="tel"
            placeholder={t("placeholderPhone")}
            autoComplete="off"
            className={inputCls}
          />
          {err("phone") && (
            <span className="text-red text-[11px]">{err("phone")}</span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("fieldEmail")}</span>
          <input
            name="email"
            type="email"
            defaultValue={kept?.email ?? ""}
            autoComplete="off"
            className={inputCls}
          />
          {err("email") && (
            <span className="text-red text-[11px]">{err("email")}</span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("fieldNotes")}</span>
          <input
            name="notes"
            defaultValue={kept?.notes ?? ""}
            placeholder={t("placeholderNotes")}
            autoComplete="off"
            className={inputCls}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="label bg-red hover:bg-red-hover mt-5 inline-flex h-11 items-center px-6 text-xs text-white transition-colors disabled:opacity-60"
      >
        {pending ? t("saving") : t("saveCustomer")}
      </button>
      <p className="text-ink-faint mt-3 text-[11px]">
        {t("duplicateHint")}
      </p>
    </form>
  );
}
