"use client";

import { useActionState } from "react";
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
  const kept = state && !state.ok ? state.values : undefined;
  const err = (k: string) =>
    state && !state.ok ? state.fieldErrors?.[k] : undefined;

  return (
    <form action={action} className="border-line bg-void border p-5">
      <p className="label text-[10px] text-ink">Dodaj klienta</p>

      {state?.ok && (
        <p className="mt-4 border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-400">
          Zapisano: {state.name}
        </p>
      )}
      {state && !state.ok && state.error === "server" && (
        <p className="border-red/50 bg-red/10 text-red mt-4 border px-4 py-3 text-sm">
          Nie udało się zapisać. Spróbuj ponownie.
        </p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Imię i nazwisko *</span>
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
          <span className={labelCls}>Telefon *</span>
          <input
            name="phone"
            defaultValue={kept?.phone ?? ""}
            inputMode="tel"
            placeholder="+48 …"
            autoComplete="off"
            className={inputCls}
          />
          {err("phone") && (
            <span className="text-red text-[11px]">{err("phone")}</span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>E-mail</span>
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
          <span className={labelCls}>Notatka</span>
          <input
            name="notes"
            defaultValue={kept?.notes ?? ""}
            placeholder="np. stały klient firmowy"
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
        {pending ? "Zapisywanie…" : "Zapisz klienta"}
      </button>
      <p className="text-ink-faint mt-3 text-[11px]">
        Numer już w bazie? Wpis zostanie zaktualizowany, nie zdublowany.
      </p>
    </form>
  );
}
