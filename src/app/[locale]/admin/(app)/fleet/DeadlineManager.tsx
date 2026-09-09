"use client";

import { useActionState } from "react";
import { addDeadline, completeDeadline, type DeadlineResult } from "./actions";
import { formatPln } from "@/lib/format";
import {
  DEADLINE_KINDS,
  DEADLINE_LABEL,
  type DeadlineRow,
} from "@/lib/admin/deadline-options";

const inputCls =
  "h-11 w-full border border-line-strong bg-surface-1 px-3 text-sm text-ink";
const labelCls = "label-tight text-[10px] text-ink-faint";

/**
 * Dated obligations for one car: fines, damages, deposits, prep jobs, anything.
 *
 * This is the escape hatch that stops the alert list being a closed set. The
 * system works out expiries, mileages and bookings by itself; everything else
 * an operator knows and the system cannot, they type here — and it appears in
 * ALERTY on its date without anybody wiring up a new feature.
 */
export function DeadlineManager({
  carId,
  plate,
  deadlines,
  today,
}: {
  carId: string;
  plate: string;
  deadlines: DeadlineRow[];
  today: string;
}) {
  const [addState, add, adding] = useActionState<
    DeadlineResult | null,
    FormData
  >(addDeadline, null);
  const [doneState, done] = useActionState<DeadlineResult | null, FormData>(
    completeDeadline,
    null,
  );

  const open = deadlines.filter((d) => !d.doneAt);
  const closed = deadlines.filter((d) => d.doneAt);

  return (
    <div className="border-line border p-4">
      <p className="label-tight text-ink-faint text-[10px]">
        Terminy i obowiązki · {plate}
      </p>

      {open.length > 0 && (
        <ul className="divide-line mt-3 divide-y">
          {open.map((d) => {
            const late = d.dueOn <= today;
            return (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <span className="text-sm text-ink">
                  <span className="label-tight border-line mr-2 border px-1.5 py-0.5 text-[10px]">
                    {DEADLINE_LABEL[d.kind]}
                  </span>
                  {d.title}
                  <span
                    className={`ml-2 text-xs ${late ? "text-red" : "text-ink-faint"}`}
                  >
                    {d.dueOn.split("-").reverse().join(".")}
                    {d.amountGrosze != null
                      ? ` · ${formatPln(d.amountGrosze, "pl")}`
                      : ""}
                  </span>
                </span>
                <form action={done}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="carId" value={carId} />
                  <button className="label-tight border-line-strong hover:border-ink hover:bg-ink/5 h-8 border px-3 text-[10px] transition-colors">
                    Zrobione
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      <form action={add} className="mt-4 grid gap-3 sm:grid-cols-5">
        <input type="hidden" name="carId" value={carId} />
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Rodzaj</span>
          <select name="kind" className={inputCls}>
            {DEADLINE_KINDS.map((k) => (
              <option key={k} value={k}>
                {DEADLINE_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={labelCls}>Nazwa</span>
          <input
            name="title"
            placeholder="np. mandat ITD, kaucja Kowalski"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Termin</span>
          <input
            type="date"
            name="dueOn"
            defaultValue={today}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Kwota (zł)</span>
          <input name="amount" inputMode="decimal" className={inputCls} />
        </label>
        <div className="sm:col-span-5">
          <button
            type="submit"
            disabled={adding}
            className="label border-line-strong hover:border-ink hover:bg-ink/5 inline-flex h-10 items-center border px-5 text-xs text-ink transition-colors disabled:opacity-60"
          >
            {adding ? "Zapisywanie…" : "Dodaj termin"}
          </button>
          {addState && !addState.ok && (
            <span className="text-red ml-3 text-xs">{addState.error}</span>
          )}
          {doneState && !doneState.ok && (
            <span className="text-red ml-3 text-xs">{doneState.error}</span>
          )}
        </div>
      </form>

      {closed.length > 0 && (
        <p className="text-ink-faint mt-3 text-[11px]">
          Zamknięte: {closed.length}
        </p>
      )}
    </div>
  );
}
