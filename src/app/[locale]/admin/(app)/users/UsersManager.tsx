"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createAdminAccount,
  updateAdminAccount,
  setAdminPassword,
  changeOwnPassword,
  unlockAdminAccount,
  deleteAdminAccount,
  type ActionResult,
} from "./actions";
import { MIN_PASSWORD_LENGTH, type UiAdmin } from "./constants";
import {
  ADMIN_ROLES,
  ROLE_LABEL as PERMISSION_ROLE_LABEL,
} from "@/lib/auth/permissions";

/*
  Etykiety ról. „Właściciel" zamiast „Superadmin" — bo tak o tym koncie mówi
  właściciel i bo słowo „superadmin" nie mówi nikomu, czym różni się od
  „administratora". Źródłem prawdy jest `lib/auth/permissions`; tutaj tylko
  z niego korzystamy, żeby panel i kontrola serwerowa nie rozjechały się co do
  tego, ile jest ról.
*/
const ROLE_LABEL = PERMISSION_ROLE_LABEL;

const INPUT =
  "border-line-strong h-10 w-full max-w-sm border bg-surface-1 px-3 text-sm text-ink";
const BUTTON =
  "label border-line-strong inline-flex h-10 items-center border px-5 text-xs text-ink transition-colors hover:border-ink hover:bg-ink/5 disabled:opacity-50";

function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return state.ok ? (
    <span className="text-xs text-emerald-400">
      {state.message ?? "Zapisano ✓"}
    </span>
  ) : (
    <span className="text-red text-xs">{state.error}</span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label-tight text-ink-faint text-[10px]">{label}</span>
      {children}
    </label>
  );
}

/* ── Own password ────────────────────────────────────────────────────────── */

export function OwnPasswordForm() {
  const [state, action, pending] = useActionState(changeOwnPassword, null);

  return (
    <form action={action} className="flex flex-col gap-5">
      <Field label="Aktualne hasło">
        <input
          type="password"
          name="current"
          required
          autoComplete="current-password"
          className={INPUT}
        />
      </Field>
      <Field label={`Nowe hasło (min. ${MIN_PASSWORD_LENGTH} znaków)`}>
        <input
          type="password"
          name="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          className={INPUT}
        />
      </Field>
      <Field label="Powtórz nowe hasło">
        <input
          type="password"
          name="confirm"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          className={INPUT}
        />
      </Field>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={BUTTON}>
          {pending ? "Zapisywanie…" : "Zmień hasło"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/* ── Create ──────────────────────────────────────────────────────────────── */

export function CreateAdminForm() {
  const [state, action, pending] = useActionState(createAdminAccount, null);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setOpen(true)} className={BUTTON}>
          + Dodaj użytkownika
        </button>
        {/* Keep the confirmation visible after the form collapses. */}
        <Feedback state={state} />
      </div>
    );
  }

  return (
    <form
      action={action}
      className="border-line flex flex-col gap-5 border p-5"
    >
      <Field label="E-mail">
        <input
          type="email"
          name="email"
          required
          autoComplete="off"
          className={INPUT}
        />
      </Field>
      <Field label="Imię i nazwisko">
        <input type="text" name="name" required className={INPUT} />
      </Field>
      <Field label="Rola">
        <select name="role" defaultValue="admin" className={INPUT}>
          {/* Lista ról rysowana ze wspólnego słownika — dodanie czwartej roli
              w `lib/auth/permissions` pojawia się tu samo, bez szukania po
              plikach, które o niej nie wiedzą. */}
          {ADMIN_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </Field>
      <Field label={`Hasło (min. ${MIN_PASSWORD_LENGTH} znaków)`}>
        <input
          type="text"
          name="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="off"
          className={`${INPUT} font-mono`}
        />
      </Field>
      <p className="text-ink-faint text-xs">
        Hasło jest widoczne, aby dało się je przepisać i przekazać nowemu
        użytkownikowi — potem nie da się go już odczytać, tylko ustawić nowe.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={BUTTON}>
          {pending ? "Tworzenie…" : "Utwórz konto"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-ink-faint text-xs hover:text-ink"
        >
          Anuluj
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/* ── List ────────────────────────────────────────────────────────────────── */

export function AdminList({
  admins,
  currentAdminId,
}: {
  admins: UiAdmin[];
  currentAdminId: string;
}) {
  return (
    <ul className="divide-line border-line divide-y border">
      {admins.map((a) => (
        <AdminRowItem key={a.id} admin={a} isSelf={a.id === currentAdminId} />
      ))}
    </ul>
  );
}

function AdminRowItem({ admin, isSelf }: { admin: UiAdmin; isSelf: boolean }) {
  const [panel, setPanel] = useState<"none" | "edit" | "password" | "delete">(
    "none",
  );

  const toggle = (next: "edit" | "password" | "delete") =>
    setPanel((p) => (p === next ? "none" : next));

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">
            {admin.name}
            {isSelf && (
              <span className="text-ink-faint ml-2 text-xs">(Ty)</span>
            )}
          </p>
          <p className="text-silver truncate text-xs">{admin.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tag>{ROLE_LABEL[admin.role]}</Tag>
          {!admin.active && <Tag tone="red">Nieaktywne</Tag>}
          {admin.locked && <Tag tone="red">Zablokowane</Tag>}
        </div>
      </div>

      <p className="text-ink-faint mt-2 text-xs">
        Ostatnie logowanie: {admin.lastLoginLabel} · utworzone{" "}
        {admin.createdLabel}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <RowLink active={panel === "edit"} onClick={() => toggle("edit")}>
          Edytuj
        </RowLink>
        <RowLink
          active={panel === "password"}
          onClick={() => toggle("password")}
        >
          Zmień hasło
        </RowLink>
        {admin.locked && <UnlockButton id={admin.id} />}
        {!isSelf && (
          <RowLink
            active={panel === "delete"}
            danger
            onClick={() => toggle("delete")}
          >
            Usuń
          </RowLink>
        )}
      </div>

      {panel === "edit" && <EditForm admin={admin} isSelf={isSelf} />}
      {panel === "password" && <PasswordForm admin={admin} />}
      {panel === "delete" && (
        <DeleteConfirm admin={admin} onCancel={() => setPanel("none")} />
      )}
    </li>
  );
}

function Tag({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "red";
}) {
  return (
    <span
      className={`label-tight rounded-full border px-2 py-0.5 text-[9px] ${
        tone === "red"
          ? "border-red text-red"
          : "border-line-strong text-silver"
      }`}
    >
      {children}
    </span>
  );
}

function RowLink({
  children,
  onClick,
  active,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`label-tight tap text-[10px] transition-colors ${
        danger
          ? "text-ink-faint hover:text-red"
          : "text-silver hover:text-ink"
      } ${active ? "text-ink underline" : ""}`}
    >
      {children}
    </button>
  );
}

function EditForm({ admin, isSelf }: { admin: UiAdmin; isSelf: boolean }) {
  const [state, action, pending] = useActionState(updateAdminAccount, null);

  return (
    <form
      action={action}
      className="border-line mt-4 flex flex-col gap-5 border p-5"
    >
      <input type="hidden" name="id" value={admin.id} />
      <Field label="Imię i nazwisko">
        <input
          type="text"
          name="name"
          defaultValue={admin.name}
          required
          className={INPUT}
        />
      </Field>
      <Field label="Rola">
        <select
          name="role"
          defaultValue={admin.role}
          disabled={isSelf}
          className={`${INPUT} disabled:opacity-50`}
        >
          {/* Lista ról rysowana ze wspólnego słownika — dodanie czwartej roli
              w `lib/auth/permissions` pojawia się tu samo, bez szukania po
              plikach, które o niej nie wiedzą. */}
          {ADMIN_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </Field>
      <label className="tap-block flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          name="active"
          defaultChecked={admin.active}
          disabled={isSelf}
          className="accent-red h-4 w-4"
        />
        <span className="text-sm text-ink">Konto aktywne</span>
      </label>
      {/* Disabled inputs are not submitted, so the own-account case posts its
          unchanged values through hidden fields instead. The server refuses
          self-demotion regardless — this only keeps the form honest. */}
      {isSelf && (
        <>
          <input type="hidden" name="role" value={admin.role} />
          <input type="hidden" name="active" value={admin.active ? "on" : ""} />
          <p className="text-ink-faint text-xs">
            Własnej roli ani aktywności nie można zmienić — to zabezpieczenie
            przed odcięciem sobie dostępu.
          </p>
        </>
      )}
      <p className="text-ink-faint text-xs">
        Nieaktywne konto nie może się zalogować i traci dostęp natychmiast, ale
        zachowuje historię w dzienniku zdarzeń.
      </p>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={BUTTON}>
          {pending ? "Zapisywanie…" : "Zapisz"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

function PasswordForm({ admin }: { admin: UiAdmin }) {
  const [state, action, pending] = useActionState(setAdminPassword, null);

  return (
    <form
      action={action}
      className="border-line mt-4 flex flex-col gap-5 border p-5"
    >
      <input type="hidden" name="id" value={admin.id} />
      <Field label={`Nowe hasło (min. ${MIN_PASSWORD_LENGTH} znaków)`}>
        <input
          type="text"
          name="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="off"
          className={`${INPUT} font-mono`}
        />
      </Field>
      <p className="text-ink-faint text-xs">
        Ustawia nowe hasło dla {admin.email} i zdejmuje ewentualną blokadę.
        Przekaż je bezpiecznym kanałem.
      </p>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={BUTTON}>
          {pending ? "Zapisywanie…" : "Ustaw hasło"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

function UnlockButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionResult | null>(null);

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => setState(await unlockAdminAccount(id)))
        }
        className="label-tight text-silver text-[10px] transition-colors hover:text-ink disabled:opacity-50"
      >
        {pending ? "Odblokowywanie…" : "Odblokuj"}
      </button>
      <Feedback state={state} />
    </span>
  );
}

function DeleteConfirm({
  admin,
  onCancel,
}: {
  admin: UiAdmin;
  onCancel: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="border-line mt-4 border p-5">
      <p className="text-silver text-sm">
        Usunąć konto <span className="text-ink">{admin.email}</span>{" "}
        bezpowrotnie? Wpisy w dzienniku zdarzeń pozostaną, ale bez powiązania z
        kontem.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await deleteAdminAccount(admin.id);
              // On success the row disappears with the revalidation.
              if (!res.ok) setError(res.error);
            })
          }
          className="label border-red text-red hover:bg-red inline-flex h-10 items-center border px-5 text-xs transition-colors hover:text-ink disabled:opacity-50"
        >
          {pending ? "Usuwanie…" : "Tak, usuń konto"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-ink-faint text-xs hover:text-ink"
        >
          Anuluj
        </button>
      </div>
      {error && <p className="text-red mt-3 text-sm">{error}</p>}
    </div>
  );
}
