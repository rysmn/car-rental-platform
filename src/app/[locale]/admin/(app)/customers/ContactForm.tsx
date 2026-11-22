"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { updateCustomerContact, type ContactResult } from "./actions";

/**
 * Dane kontaktowe klienta: tylko odczyt, a edycja dopiero po kliknięciu.
 *
 * Formularz nie jest widoczny na stałe — operator najczęściej tylko czyta
 * numer, a przypadkowa zmiana w polu tekstowym byłaby łatwa do przeoczenia.
 */
export function ContactForm({
  customerId,
  name,
  phone,
  email,
  emailShown,
}: {
  customerId: string;
  name: string;
  phone: string;
  email: string | null;
  emailShown: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [state, save, saving] = useActionState<ContactResult | null, FormData>(
    updateCustomerContact,
    null,
  );
  const t = useTranslations("Admin.customers");
  const fe = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const field =
    "border-line-strong bg-surface-1 text-ink h-11 w-full border px-3 text-sm";

  // Po udanym zapisie wracamy do odczytu; serwer odświeża wartości.
  useEffect(() => {
    if (state?.ok) setEditing(false);
  }, [state]);

  if (!editing) {
    return (
      <div className="space-y-4">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="label-tight text-ink-faint text-[10px]">{t("contactName")}</dt>
            <dd className="text-ink mt-1 text-sm">{name}</dd>
          </div>
          <div>
            <dt className="label-tight text-ink-faint text-[10px]">{t("contactPhone")}</dt>
            <dd className="text-ink mt-1 text-sm">{phone}</dd>
          </div>
          <div>
            <dt className="label-tight text-ink-faint text-[10px]">{t("contactEmail")}</dt>
            <dd className="text-ink mt-1 text-sm break-all">{emailShown ?? "—"}</dd>
          </div>
        </dl>
        {state?.ok && <p className="text-sm text-emerald-400">{t("contactSaved")}</p>}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 inline-flex h-11 items-center border px-5 text-xs transition-colors"
        >
          {t("contactEdit")}
        </button>
      </div>
    );
  }

  return (
    <form action={save} className="space-y-4">
      <input type="hidden" name="id" value={customerId} />

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="label-tight text-ink-faint text-[10px]">{t("contactName")}</span>
          <input name="name" defaultValue={name} required className={field} />
          {fe.name && <span className="text-red text-xs">{fe.name}</span>}
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-tight text-ink-faint text-[10px]">{t("contactPhone")}</span>
          <input name="phone" defaultValue={phone} required className={field} />
          {fe.phone && <span className="text-red text-xs">{fe.phone}</span>}
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-tight text-ink-faint text-[10px]">{t("contactEmail")}</span>
          <input name="email" type="email" defaultValue={email ?? ""} className={field} />
          {fe.email && <span className="text-red text-xs">{fe.email}</span>}
        </label>
      </div>

      {state && !state.ok && !Object.keys(fe).length && (
        <p className="text-red text-sm">{state.error}</p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 inline-flex h-11 items-center border px-5 text-xs transition-colors disabled:opacity-50"
        >
          {saving ? t("contactSaving") : t("contactSave")}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="label text-ink-faint hover:text-ink inline-flex h-11 items-center px-4 text-xs transition-colors"
        >
          {t("contactCancel")}
        </button>
      </div>
    </form>
  );
}
