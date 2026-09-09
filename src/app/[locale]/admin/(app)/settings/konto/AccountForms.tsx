"use client";

import { useActionState } from "react";
import {
  updateOwnProfile,
  changeOwnPassword,
  type ActionResult,
} from "../../users/actions";

const inputCls =
  "h-10 w-full border border-line-strong bg-surface-1 px-3 text-sm text-ink placeholder:text-ink-faint";
const labelCls = "label-tight text-[10px] text-ink-faint";

function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  if (state.ok)
    return (
      <span className="text-xs text-emerald-400">
        {state.message ?? "Zapisano ✓"}
      </span>
    );
  return <span className="text-red text-xs">{state.error}</span>;
}

export function ProfileForm({
  name,
  phone,
  email,
}: {
  name: string;
  phone: string | null;
  email: string;
}) {
  const [state, action, pending] = useActionState(updateOwnProfile, null);

  return (
    <form action={action} className="max-w-xl">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Imię i nazwisko</span>
          <input
            name="name"
            defaultValue={name}
            required
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Telefon</span>
          <input
            name="phone"
            defaultValue={phone ?? ""}
            placeholder="+48 884 762 950"
            className={inputCls}
          />
        </label>
      </div>

      {/* Shown, not editable — see the action's comment on why the login
          identifier does not change from inside an open session. */}
      <label className="mt-3 flex max-w-[calc(50%-0.375rem)] flex-col gap-1">
        <span className={labelCls}>E-mail (login)</span>
        <input
          value={email}
          readOnly
          disabled
          className={`${inputCls} cursor-not-allowed opacity-60`}
        />
      </label>
      <p className="text-ink-faint mt-2 text-xs">
        Adres e-mail jest loginem — zmienia się go w zarządzaniu kontami, nie
        tutaj. To celowe: gdyby dało się go zmienić z otwartej sesji, przejęta
        sesja oznaczałaby przejęte konto.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 inline-flex h-10 items-center border px-5 text-xs transition-colors disabled:opacity-50"
        >
          {pending ? "Zapisywanie…" : "Zapisz dane"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changeOwnPassword, null);

  return (
    <form action={action} className="max-w-xl">
      <div className="grid gap-3">
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Aktualne hasło</span>
          <input
            name="current"
            type="password"
            required
            autoComplete="current-password"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Nowe hasło (min. 10 znaków)</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="new-password"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Powtórz nowe hasło</span>
          <input
            name="confirm"
            type="password"
            required
            autoComplete="new-password"
            className={inputCls}
          />
        </label>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 inline-flex h-10 items-center border px-5 text-xs transition-colors disabled:opacity-50"
        >
          {pending ? "Zmienianie…" : "Zmień hasło"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
