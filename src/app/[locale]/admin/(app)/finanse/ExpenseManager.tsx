"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createBusinessExpense,
  updateBusinessExpense,
  deleteBusinessExpense,
  type FormResult,
} from "./actions";
import type { BusinessExpenseRow } from "@/lib/admin/business-expenses";
import {
  BUSINESS_EXPENSE_GROUPS,
  BUSINESS_EXPENSE_LABEL,
  type BusinessExpenseCategory,
} from "@/lib/admin/business-expense-options";
import { formatPln, formatDatePl } from "@/lib/format";

const inputCls =
  "h-10 w-full border border-line-strong bg-surface-1 px-3 text-sm text-ink placeholder:text-ink-faint";
const labelCls = "label-tight text-[10px] text-ink-faint";

/** Today in the local calendar, as the value a date input expects. */
function todayValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Feedback({ state }: { state: FormResult | null }) {
  if (!state) return null;
  if (state.ok)
    return <span className="text-xs text-emerald-400">Zapisano ✓</span>;
  return <span className="text-red text-xs">{state.error}</span>;
}

/**
 * The category picker, grouped by `<optgroup>`.
 *
 * The groups are the same ones the Finanse page totals by, so the shape an
 * operator learns while entering costs is the shape they later read them in.
 */
function CategorySelect({ value }: { value?: BusinessExpenseCategory }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelCls}>Rodzaj *</span>
      <select
        name="category"
        defaultValue={value ?? "ads_google"}
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
  );
}

function ExpenseFields({ expense }: { expense?: BusinessExpenseRow }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <CategorySelect value={expense?.category} />
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Kwota (zł) *</span>
        <input
          name="amount"
          inputMode="decimal"
          required
          defaultValue={expense ? (expense.amountGrosze / 100).toFixed(2) : ""}
          placeholder="450,00"
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Data *</span>
        <input
          name="incurredOn"
          type="date"
          required
          defaultValue={expense?.incurredOn ?? todayValue()}
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Kontrahent</span>
        <input
          name="vendor"
          defaultValue={expense?.vendor ?? ""}
          placeholder="Meta Platforms"
          className={inputCls}
        />
      </label>
      {/* Period. Leave both empty for a one-off cost. Filled in, the amount is
          spread over the days it buys — a year of hosting then shows as a
          twelfth a month instead of one cliff that distorts every comparison. */}
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Okres od (opcjonalnie)</span>
        <input
          name="periodStart"
          type="date"
          defaultValue={expense?.periodStart ?? ""}
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Okres do</span>
        <input
          name="periodEnd"
          type="date"
          defaultValue={expense?.periodEnd ?? ""}
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>
          Faktura (PDF, JPG, PNG)
          {expense?.invoicePath ? " — wybierz plik, by podmienić" : ""}
        </span>
        <input
          type="file"
          name="invoice"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="text-silver file:label-tight file:border-line-strong file:text-ink-faint file:bg-surface-1 file:text-ink w-full text-xs file:mr-3 file:border file:px-3 file:py-2 file:text-[10px]"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Opis</span>
        <input
          name="note"
          defaultValue={expense?.note ?? ""}
          placeholder="Kampania sierpień, faktura 12/2026"
          className={inputCls}
        />
      </label>
    </div>
  );
}

function ExpenseRow({ expense }: { expense: BusinessExpenseRow }) {
  const [state, action, pending] = useActionState(updateBusinessExpense, null);
  const [editing, setEditing] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [delError, setDelError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const doDelete = () => {
    setDelError(null);
    startDelete(async () => {
      const res = await deleteBusinessExpense(expense.id);
      if (!res.ok) {
        setDelError(res.error);
        setConfirm(false);
      }
    });
  };

  if (!editing) {
    return (
      <div className="border-line/60 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b py-3 last:border-0">
        <span className="text-ink-faint w-20 shrink-0 text-xs tabular-nums">
          {formatDatePl(expense.incurredOn)}
        </span>
        <span className="text-ink min-w-[9rem] text-sm">
          {BUSINESS_EXPENSE_LABEL[expense.category]}
        </span>
        <span className="text-ink text-sm tabular-nums">
          {formatPln(expense.amountGrosze, "pl")}
        </span>
        {expense.vendor && (
          <span className="text-silver text-xs">{expense.vendor}</span>
        )}
        {expense.invoicePath && (
          // Plain anchor and a new tab: this is a file served by an
          // authenticated route, not a page the client router can navigate to.
          <a
            href={expense.invoicePath}
            target="_blank"
            rel="noopener noreferrer"
            className="text-silver hover:text-ink text-xs underline underline-offset-2"
          >
            faktura
          </a>
        )}
        {expense.recurringId && (
          <span className="border-line text-ink-faint border px-1.5 text-[10px]">
            abonament
          </span>
        )}
        {expense.periodStart && expense.periodEnd && (
          <span className="text-ink-faint text-xs tabular-nums">
            {formatDatePl(expense.periodStart)}–
            {formatDatePl(expense.periodEnd)}
          </span>
        )}
        {expense.note && (
          <span className="text-silver text-xs">{expense.note}</span>
        )}
        <span className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-ink-faint hover:text-ink tap text-xs"
          >
            Edytuj
          </button>
          {confirm ? (
            <>
              <button
                type="button"
                onClick={doDelete}
                disabled={deleting}
                className="text-red text-xs disabled:opacity-50"
              >
                {deleting ? "Usuwanie…" : "Na pewno?"}
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
        {delError && (
          <span className="text-red w-full text-xs">{delError}</span>
        )}
      </div>
    );
  }

  return (
    <form
      action={action}
      encType="multipart/form-data"
      className="border-line/60 border-b py-4 last:border-0"
    >
      <input type="hidden" name="id" value={expense.id} />
      <ExpenseFields expense={expense} />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 inline-flex h-9 items-center border px-4 text-xs transition-colors disabled:opacity-50"
        >
          {pending ? "Zapisywanie…" : "Zapisz"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-ink-faint hover:text-ink tap text-xs"
        >
          Zamknij
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

function AddExpense() {
  const [state, action, pending] = useActionState(createBusinessExpense, null);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="label bg-red hover:bg-red-hover mt-4 inline-flex h-10 items-center px-5 text-xs text-white transition-colors"
      >
        + Dodaj koszt
      </button>
    );
  }

  return (
    // The action is passed straight through, NOT wrapped in a handler that
    // remounts the form to clear it. `useActionState`'s dispatch returns void,
    // so awaiting it does not wait for the server — the remount would fire
    // immediately and blow away the "Zapisano ✓" the operator needs to see.
    // Fields keeping their values is also friendlier when entering a stack of
    // invoices in one sitting.
    <form
      action={action}
      encType="multipart/form-data"
      className="border-line-strong bg-graphite/60 mt-4 border p-4"
    >
      <p className="label text-ink mb-3 text-xs">Nowy koszt firmowy</p>
      <ExpenseFields />
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
        <Feedback state={state} />
      </div>
    </form>
  );
}

/**
 * The company cost list for the chosen window.
 *
 * Not collapsed by default, unlike the per-car version: this IS the page, not a
 * side panel on something else. The list is what the operator came to read.
 */
export function ExpenseManager({
  expenses,
}: {
  expenses: BusinessExpenseRow[];
}) {
  const total = expenses.reduce((n, e) => n + e.amountGrosze, 0);

  return (
    <div>
      {/* "Wystawione" and not "razem": this totals the amounts DATED in the
          window, while the structure above totals the amount that FALLS ON it
          after period spreading. For a year of hosting paid in January the two
          are legitimately different numbers, and an operator who reads both as
          "razem" is entitled to think one of them is broken. */}
      <div className="border-line text-ink-faint flex flex-wrap items-baseline justify-between gap-3 border-b pb-2">
        <span className="label-tight text-[10px]">
          {expenses.length === 0
            ? "Brak kosztów w tym okresie"
            : `${expenses.length} pozycji`}
        </span>
        {expenses.length > 0 && (
          <span className="text-ink text-sm tabular-nums">
            wystawione w tym okresie: {formatPln(total, "pl")}
          </span>
        )}
      </div>

      {expenses.length > 0 && (
        <div className="border-line bg-void/40 mt-3 border px-4">
          {expenses.map((e) => (
            <ExpenseRow key={e.id} expense={e} />
          ))}
        </div>
      )}
      <AddExpense />
    </div>
  );
}
