"use client";

import { useActionState, useState } from "react";
import { saveDriverClasses, type SaveResult } from "./actions";
import type { DriverClassRow } from "@/lib/admin/fleet";
import {
  DRIVER_CLASSES,
  DRIVER_CLASS_LABEL,
  type DriverClass,
} from "@/lib/fleet/driver-class";

/**
 * Which class each car belongs to, as one table.
 *
 * One choice per row rather than tick-boxes: a car belongs to exactly one
 * class, and two ticked boxes would leave the booking form deciding which
 * threshold wins — a question with no good answer inside a validation.
 *
 * "Brak" is a real, selectable state and is shown in amber. A car without a
 * class has no requirements at all, and that has to be visible rather than
 * quietly treated as Standard.
 *
 * The same field lives in Flota → edycja modelu; this table exists so ten cars
 * can be reviewed at once instead of through ten forms.
 */

function Feedback({ state }: { state: SaveResult | null }) {
  if (!state) return null;
  if (state.ok)
    return (
      <span className="text-xs text-emerald-400">
        {state.message ?? "Zapisano ✓"}
      </span>
    );
  return <span className="text-red text-xs">{state.error}</span>;
}

export function DriverClassForm({ models }: { models: DriverClassRow[] }) {
  const [state, action, pending] = useActionState(saveDriverClasses, null);
  const [picked, setPicked] = useState<Record<string, DriverClass | "">>(
    Object.fromEntries(models.map((m) => [m.id, m.driverClass ?? ""])),
  );

  const unassigned = models.filter(
    (m) => m.published && !picked[m.id],
  ).length;

  return (
    <form action={action} className="mt-4">
      <div className="border-line overflow-x-auto border">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-line border-b">
              <th className="label-tight text-ink-faint px-3 py-2 text-left text-[10px]">
                Samochód
              </th>
              {DRIVER_CLASSES.map((c) => (
                <th
                  key={c}
                  className="label-tight text-ink-faint px-3 py-2 text-center text-[10px] whitespace-nowrap"
                >
                  {DRIVER_CLASS_LABEL[c]}
                </th>
              ))}
              <th className="label-tight text-ink-faint px-3 py-2 text-center text-[10px]">
                Brak
              </th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => {
              const missing = !picked[m.id];
              return (
                <tr
                  key={m.id}
                  className="border-line/60 border-b last:border-0"
                >
                  <td className="px-3 py-2">
                    <span className="text-ink">
                      {m.brand} {m.model}
                    </span>
                    {!m.published ? (
                      <span className="text-ink-faint ml-2 text-[10px]">
                        nieopublikowane
                      </span>
                    ) : null}
                    {missing && m.published ? (
                      <span className="ml-2 text-[10px] text-amber-500">
                        bez klasy
                      </span>
                    ) : null}
                  </td>
                  {DRIVER_CLASSES.map((c) => (
                    <td key={c} className="px-3 py-2 text-center">
                      {/*
                        Kratka radia rysuje system i ma 16 px — palec ma ~44 px.
                        Zgodnie z regułą panelu celem jest etykieta, nie kratka:
                        label wypełnia komórkę i na dotyku rośnie do 44 px, więc
                        trafia się w pole, a nie w punkt. Bez nakładki `.tap-area`,
                        bo sąsiednie komórki są węższe niż 44 px i nakładki
                        podbierałyby sobie kliknięcia przy krawędzi.
                      */}
                      <label className="tap-block flex w-full cursor-pointer items-center justify-center">
                        <input
                          type="radio"
                          name={`class.${m.id}`}
                          value={c}
                          checked={picked[m.id] === c}
                          onChange={() =>
                            setPicked((p) => ({ ...p, [m.id]: c }))
                          }
                          aria-label={`${m.brand} ${m.model} — ${DRIVER_CLASS_LABEL[c]}`}
                          className="accent-red size-4"
                        />
                      </label>
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center">
                    <label className="tap-block flex w-full cursor-pointer items-center justify-center">
                      <input
                        type="radio"
                        name={`class.${m.id}`}
                        value=""
                        checked={picked[m.id] === ""}
                        onChange={() => setPicked((p) => ({ ...p, [m.id]: "" }))}
                        aria-label={`${m.brand} ${m.model} — bez klasy`}
                        className="size-4"
                      />
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p
        className={`mt-2 text-[11px] ${unassigned > 0 ? "text-amber-500" : "text-ink-faint"}`}
      >
        {unassigned > 0
          ? `Bez klasy: ${unassigned} z ${models.length}. Dopóki jakieś opublikowane auto nie ma klasy, nie da się włączyć egzekwowania w formularzu.`
          : `Wszystkie ${models.length} aut mają przypisaną klasę.`}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="label-tight border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap inline-flex items-center border px-4 text-[10px] transition-colors disabled:opacity-50"
        >
          {pending ? "Zapisywanie…" : "Zapisz przypisanie"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
