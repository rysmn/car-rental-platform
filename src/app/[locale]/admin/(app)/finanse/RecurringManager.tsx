"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createBusinessRecurring,
  deleteBusinessRecurring,
  generateBusinessRecurring,
} from "./actions";
import {
  RECURRING_INTERVALS,
  INTERVAL_LABEL,
} from "@/lib/admin/recurring-options";
import type { BusinessRecurringRow } from "@/lib/admin/business-expenses";
import {
  BUSINESS_EXPENSE_GROUPS,
  BUSINESS_EXPENSE_LABEL,
} from "@/lib/admin/business-expense-options";
import { formatPln, formatDatePl } from "@/lib/format";

const inputCls =
  "h-10 w-full border border-line-strong bg-surface-1 px-3 text-sm text-ink placeholder:text-ink-faint";
const labelCls = "label-tight text-[10px] text-ink-faint";

function todayValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Row({ item }: { item: BusinessRecurringRow }) {
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
            ? "Nic do dopisania — wszystkie okresy już są."
            : `Dopisano ${res.created} pozycji.`,
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
        {BUSINESS_EXPENSE_LABEL[item.category]}
      </span>
      <span className="text-ink text-sm tabular-nums">
        {formatPln(item.amountGrosze, "pl")}
      </span>
      <span className="text-silver text-xs">
        {INTERVAL_LABEL[item.interval]}
      </span>
      {item.vendor && (
        <span className="text-silver text-xs">{item.vendor}</span>
      )}
      <span className="text-ink-faint text-xs tabular-nums">
        od {formatDatePl(item.startOn)}
        {item.endOn ? ` do ${formatDatePl(item.endOn)}` : ""}
      </span>
      <span className="text-ink-faint text-xs">dopisano {item.generated}</span>
      {!item.active && (
        <span className="border-line text-ink-faint border px-1.5 text-[10px]">
          wyłączona
        </span>
      )}
      <span className="ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={doGenerate}
          disabled={busy || !item.active}
          className="text-silver hover:text-ink text-xs disabled:opacity-40"
        >
          {busy ? "Pracuję…" : "Dopisz brakujące"}
        </button>
        {confirm ? (
          <>
            <button
              type="button"
              onClick={doDelete}
              disabled={busy}
              className="text-red text-xs disabled:opacity-50"
            >
              Na pewno?
            </button>
            <button
              type="button"
              onClick={() => setConfirm(false)}
              className="text-ink-faint hover:text-ink tap text-xs"
            >
              Anuluj
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="text-ink-faint hover:text-red tap text-xs"
          >
            Usuń
          </button>
        )}
      </span>
      {message && <span className="text-silver w-full text-xs">{message}</span>}
    </div>
  );
}

function AddRecurring() {
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
        + Dodaj abonament
      </button>
    );
  }

  return (
    <form
      action={action}
      className="border-line-strong bg-graphite/60 mt-3 border p-4"
    >
      <input type="hidden" name="active" value="on" />
      <p className="label text-ink mb-3 text-xs">Nowy koszt cykliczny</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Rodzaj *</span>
          <select
            name="category"
            defaultValue="accounting"
            className={inputCls}
          >
            {BUSINESS_EXPENSE_GROUPS.map((g) => (
              <optgroup key={g.key} label={g.label}>
                {g.categories.map((c) => (
                  <option key={c} value={c}>
                    {BUSINESS_EXPENSE_LABEL[c]}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Kwota jednej płatności (zł) *</span>
          <input
            name="amount"
            inputMode="decimal"
            required
            placeholder="600,00"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Częstotliwość *</span>
          <select name="interval" defaultValue="monthly" className={inputCls}>
            {RECURRING_INTERVALS.map((i) => (
              <option key={i} value={i}>
                {INTERVAL_LABEL[i]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Pierwsza płatność *</span>
          <input
            name="startOn"
            type="date"
            required
            defaultValue={todayValue()}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Koniec (opcjonalnie)</span>
          <input name="endOn" type="date" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Kontrahent</span>
          <input
            name="vendor"
            placeholder="Biuro Rachunkowe"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
          <span className={labelCls}>Opis</span>
          <input
            name="note"
            placeholder="Księgowość — umowa miesięczna"
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
          {pending ? "Dodawanie…" : "Dodaj"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-ink-faint hover:text-ink tap text-xs"
        >
          Zamknij
        </button>
        {state?.ok && (
          <span className="text-xs text-emerald-400">
            Zapisano ✓ — teraz kliknij „Dopisz brakujące”.
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
  const [open, setOpen] = useState(items.length > 0);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="border-line tap-block flex w-full items-center justify-between gap-4 border-b pb-2 text-left"
      >
        <span className="label-tight text-ink-faint text-[10px]">
          Koszty stałe i abonamenty
        </span>
        <span className="flex items-center gap-3 text-xs">
          <span className="text-silver">
            {items.length === 0 ? "brak" : `${items.length} definicji`}
          </span>
          <span className="text-ink-faint">{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open && (
        <div className="mt-3">
          <p className="text-ink-faint mb-3 text-xs">
            Wpisz raz to, co płacisz co miesiąc — księgowa, abonament reklamowy,
            hosting. Definicja sama w sobie nic nie dolicza: „Dopisz brakujące”
            tworzy prawdziwe pozycje kosztów za wszystkie okresy do dziś, a
            potem edytujesz je jak każdy inny koszt. Kliknięcie dwa razy nie
            zdubluje pozycji.
          </p>
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
