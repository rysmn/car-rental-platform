"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createExpense,
  updateExpense,
  deleteExpense,
  type FormResult,
} from "./actions";
import type { CarExpenseRow } from "@/lib/admin/expenses";
import {
  EXPENSE_GROUPS,
  EXPENSE_LABEL,
  type ExpenseCategory,
} from "@/lib/admin/expense-options";
import { formatPln } from "@/lib/format";

const inputCls =
  "h-10 w-full border border-line-strong bg-surface-1 px-3 text-sm text-ink placeholder:text-ink-faint";
const labelCls = "label-tight text-[10px] text-ink-faint";

/** Today in the local calendar, as the value a date input expects. */
function todayValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatPl(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function Feedback({ state }: { state: FormResult | null }) {
  if (!state) return null;
  if (state.ok)
    return <span className="text-xs text-emerald-400">Zapisano ✓</span>;
  return <span className="text-red text-xs">{state.error}</span>;
}

/**
 * The category picker.
 *
 * Grouped by `<optgroup>` rather than presented as one flat list of eighteen
 * items: the groups are the same ones the economics page totals by, so the
 * shape an operator learns while entering costs is the shape they later read
 * them in.
 */
function CategorySelect({ value }: { value?: ExpenseCategory }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelCls}>Rodzaj *</span>
      <select
        name="category"
        defaultValue={value ?? "service"}
        className={inputCls}
      >
        {EXPENSE_GROUPS.map((g) => (
          <optgroup key={g.key} label={g.label}>
            {g.categories.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_LABEL[c]}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function ExpenseFields({ expense }: { expense?: CarExpenseRow }) {
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
        <span className={labelCls}>Przebieg (km)</span>
        <input
          name="odometerKm"
          type="number"
          min="0"
          defaultValue={expense?.odometerKm ?? ""}
          placeholder="82 000"
          className={inputCls}
        />
      </label>
      {/* Period. Leave both empty for a one-off cost. Filled in, the amount is
          spread over the days it buys — an annual premium then shows as a
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
          Faktura / paragon (PDF, JPG, PNG)
          {expense?.invoicePath ? " — wybierz plik, by podmienić" : ""}
        </span>
        <input
          type="file"
          name="invoice"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="text-silver file:label-tight file:border-line-strong file:text-ink-faint w-full text-xs file:mr-3 file:border file:bg-surface-1 file:px-3 file:py-2 file:text-[10px] file:text-ink"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Opis</span>
        <input
          name="note"
          defaultValue={expense?.note ?? ""}
          placeholder="Serwis ASO, faktura 12/2026"
          className={inputCls}
        />
      </label>
    </div>
  );
}

function ExpenseRow({ expense }: { expense: CarExpenseRow }) {
  const [state, action, pending] = useActionState(updateExpense, null);
  const [editing, setEditing] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [delError, setDelError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const doDelete = () => {
    setDelError(null);
    startDelete(async () => {
      const res = await deleteExpense(expense.id);
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
          {formatPl(expense.incurredOn)}
        </span>
        <span className="min-w-[9rem] text-sm text-ink">
          {EXPENSE_LABEL[expense.category]}
        </span>
        <span className="text-sm text-ink tabular-nums">
          {formatPln(expense.amountGrosze, "pl")}
        </span>
        {expense.odometerKm != null && (
          <span className="text-ink-faint text-xs tabular-nums">
            {expense.odometerKm.toLocaleString("pl-PL")} km
          </span>
        )}
        {expense.invoicePath && (
          // Plain anchor and a new tab: this is a file served by an
          // authenticated route, not a page the client router can navigate to.
          <a
            href={expense.invoicePath}
            target="_blank"
            rel="noopener noreferrer"
            className="text-silver text-xs underline underline-offset-2 hover:text-ink"
          >
            faktura
          </a>
        )}
        {expense.recurringId && (
          <span className="border-line text-ink-faint border px-1.5 text-[10px]">
            cykliczny
          </span>
        )}
        {expense.periodStart && expense.periodEnd && (
          <span className="text-ink-faint text-xs tabular-nums">
            {formatPl(expense.periodStart)}–{formatPl(expense.periodEnd)}
          </span>
        )}
        {expense.note && (
          <span className="text-silver text-xs">{expense.note}</span>
        )}
        <span className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-ink-faint text-xs hover:text-ink"
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
                className="text-ink-faint text-xs hover:text-ink"
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
      <input type="hidden" name="carId" value={expense.carId} />
      <ExpenseFields expense={expense} />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="label border-line-strong inline-flex h-9 items-center border px-4 text-xs text-ink transition-colors hover:border-ink hover:bg-ink/5 disabled:opacity-50"
        >
          {pending ? "Zapisywanie…" : "Zapisz"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-ink-faint text-xs hover:text-ink"
        >
          Zamknij
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

function AddExpense({ carId }: { carId: string }) {
  const [state, action, pending] = useActionState(createExpense, null);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="label border-line-strong mt-3 inline-flex h-9 items-center border px-4 text-xs text-ink transition-colors hover:border-ink hover:bg-ink/5"
      >
        + Dodaj wydatek
      </button>
    );
  }

  return (
    // The action is passed straight through, NOT wrapped in a handler that
    // remounts the form to clear it. `useActionState`'s dispatch returns void,
    // so awaiting it does not wait for the server — the remount would fire
    // immediately and blow away the "Zapisano ✓" the operator needs to see.
    // The fields keeping their values is also the friendlier behaviour when
    // entering several receipts for one car in a row.
    <form
      action={action}
      encType="multipart/form-data"
      className="border-line-strong bg-graphite/60 mt-3 border p-4"
    >
      <input type="hidden" name="carId" value={carId} />
      <p className="label mb-3 text-xs text-ink">Nowy wydatek</p>
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
          className="text-ink-faint text-xs hover:text-ink"
        >
          Zamknij
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/**
 * Expenses for one physical car.
 *
 * Collapsed by default and labelled with the running total, because the fleet
 * editor already shows every unit of a model: expanded lists would bury the
 * unit forms under a service history nobody opened the page to read.
 */
export function ExpenseManager({
  carId,
  plate,
  expenses,
}: {
  carId: string;
  plate: string;
  expenses: CarExpenseRow[];
}) {
  const [open, setOpen] = useState(false);
  const total = expenses.reduce((n, e) => n + e.amountGrosze, 0);

  return (
    <div className="border-line/60 border-t pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="tap-block flex w-full items-center justify-between gap-4 text-left"
      >
        <span className="label-tight text-ink-faint text-[10px]">
          Wydatki — {plate}
        </span>
        <span className="flex items-center gap-3 text-xs">
          <span className="text-silver tabular-nums">
            {expenses.length === 0
              ? "brak"
              : `${expenses.length} poz. · ${formatPln(total, "pl")}`}
          </span>
          <span className="text-ink-faint">{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open && (
        <div className="mt-3">
          {expenses.length > 0 && (
            <div className="border-line bg-void/40 border px-4">
              {expenses.map((e) => (
                <ExpenseRow key={e.id} expense={e} />
              ))}
            </div>
          )}
          <AddExpense carId={carId} />
        </div>
      )}
    </div>
  );
}
