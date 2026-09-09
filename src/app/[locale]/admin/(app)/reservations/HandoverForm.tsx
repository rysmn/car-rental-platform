"use client";

import { useActionState, useState } from "react";
import { saveHandover, type HandoverResult } from "./handover-actions";
import { SignaturePad } from "./SignaturePad";
import {
  CHECKLIST,
  CLEANLINESS_LABEL,
  CLEANLINESS_STATES,
  FUEL_LABEL,
  FUEL_STEPS,
  GROUP_LABEL,
  HANDOVER_KIND_GENITIVE,

  type Cleanliness,
  type HandoverKind,
  type HandoverRecord,
} from "@/lib/admin/handover-options";

/**
 * The protocol, filled in on a phone with one hand and the car in the other.
 *
 * Everything here is sized for a thumb rather than a mouse: fuel and
 * cleanliness are rows of buttons instead of dropdowns, and the tick-list rows
 * are full-width targets. The audit from etap 32 is the reason — on a phone
 * the finger lands on the LABEL, so the label has to be the control.
 *
 * Nothing is pre-ticked on a return. A checklist that arrives already filled
 * in is a checklist somebody scrolls past, and the whole value of this form is
 * that a person looked at each line beside the car.
 */
export function HandoverForm({
  reservationId,
  kind,
  existing,
  suggestedOdometer,
}: {
  reservationId: string;
  kind: HandoverKind;
  existing: HandoverRecord | null;
  suggestedOdometer: number | null;
}) {
  const [state, save, saving] = useActionState<HandoverResult | null, FormData>(
    saveHandover,
    null,
  );

  const [fuel, setFuel] = useState<number>(existing?.fuelEighths ?? 8);
  const [signature, setSignature] = useState("");
  const [clean, setClean] = useState<Cleanliness>(
    existing?.cleanliness ?? "clean",
  );
  const ticked = new Map(existing?.items.map((i) => [i.code, i.present]) ?? []);
  const defaultTicked = (code: string, standard: boolean) =>
    existing ? (ticked.get(code) ?? false) : kind === "pickup" && standard;

  const labelCls = "label-tight text-[10px] text-ink-faint";
  const inputCls =
    "h-12 w-full border border-line-strong bg-surface-1 px-3 text-base text-ink";

  return (
    <form action={save} className="space-y-6">
      <input type="hidden" name="reservationId" value={reservationId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="fuelEighths" value={fuel} />
      <input type="hidden" name="cleanliness" value={clean} />
      <input type="hidden" name="signature" value={signature} />

      <section className="border-line bg-graphite/40 border p-5">
        <h2 className="label-tight text-ink-faint mb-4 text-[10px]">Odczyty</h2>

        <label className="flex flex-col gap-1">
          <span className={labelCls}>Przebieg (km)</span>
          <input
            name="odometerKm"
            inputMode="numeric"
            defaultValue={
              existing?.odometerKm ?? suggestedOdometer ?? undefined
            }
            placeholder={
              suggestedOdometer != null ? String(suggestedOdometer) : "0"
            }
            className={inputCls}
          />
          {suggestedOdometer != null && !existing && (
            <span className="text-ink-faint text-[11px]">
              Ostatni znany stan licznika tego auta: {suggestedOdometer} km
            </span>
          )}
        </label>

        <p className={`${labelCls} mt-5`}>Paliwo</p>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {FUEL_STEPS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFuel(f)}
              className={`tap inline-flex h-12 items-center justify-center border text-xs transition-colors ${
                fuel === f
                  ? "border-ink bg-ink/10 text-ink"
                  : "border-line-strong text-ink-faint hover:border-ink hover:text-ink"
              }`}
            >
              {FUEL_LABEL[f]}
            </button>
          ))}
        </div>

        <p className={`${labelCls} mt-5`}>Czystość</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {CLEANLINESS_STATES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setClean(c)}
              className={`tap inline-flex h-12 items-center justify-center border text-xs transition-colors ${
                clean === c
                  ? "border-ink bg-ink/10 text-ink"
                  : "border-line-strong text-ink-faint hover:border-ink hover:text-ink"
              }`}
            >
              {CLEANLINESS_LABEL[c]}
            </button>
          ))}
        </div>

        <label className="mt-5 flex flex-col gap-1">
          <span className={labelCls}>Kluczyki (komplety)</span>
          <input
            name="keysCount"
            inputMode="numeric"
            defaultValue={existing?.keysCount ?? 1}
            className={inputCls}
          />
        </label>
      </section>

      {(["equipment", "documents"] as const).map((group) => (
        <section key={group} className="border-line bg-graphite/40 border p-5">
          <h2 className="label-tight text-ink-faint mb-2 text-[10px]">
            {GROUP_LABEL[group]}
          </h2>
          <ul className="divide-line divide-y">
            {CHECKLIST.filter((i) => i.group === group).map((item) => (
              <li key={item.code}>
                {/* Cały wiersz jest celem dotknięcia — na telefonie palec ląduje
                    w etykietę, nie w kratkę 16 px (audyt etapu 32). */}
                <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 py-2">
                  <span className="text-ink text-sm">{item.label}</span>
                  <input
                    type="checkbox"
                    name={`item_${item.code}`}
                    defaultChecked={defaultTicked(item.code, item.standard)}
                    className="border-line-strong accent-red h-6 w-6 shrink-0"
                  />
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="border-line bg-graphite/40 border p-5">
        <h2 className="label-tight text-ink-faint mb-4 text-[10px]">
          Uszkodzenia i uwagi
        </h2>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>
            Uszkodzenia widoczne przy {kind === "pickup" ? "wydaniu" : "zwrocie"}
          </span>
          <textarea
            name="damageNote"
            rows={3}
            defaultValue={existing?.damageNote ?? ""}
            placeholder="np. rysa na zderzaku tylnym, odprysk na masce"
            className="border-line-strong bg-surface-1 text-ink w-full border px-3 py-2 text-base"
          />
        </label>
        <label className="mt-4 flex flex-col gap-1">
          <span className={labelCls}>Uwagi</span>
          <textarea
            name="note"
            rows={2}
            defaultValue={existing?.note ?? ""}
            className="border-line-strong bg-surface-1 text-ink w-full border px-3 py-2 text-base"
          />
        </label>
      </section>

      <SignaturePad
        existingUrl={existing?.signatureUrl ?? null}
        label={
          kind === "pickup"
            ? "Podpis klienta przy wydaniu"
            : "Podpis klienta przy zwrocie"
        }
        onChange={setSignature}
      />

      {state && !state.ok && (
        <p className="text-red text-sm">{state.error}</p>
      )}
      {state && state.ok && (
        <p className="text-sm text-emerald-400">
          Protokół {HANDOVER_KIND_GENITIVE[kind]} zapisany.
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="label bg-red hover:bg-red-hover inline-flex h-14 w-full items-center justify-center px-6 text-sm text-white transition-colors disabled:opacity-60 sm:w-auto"
      >
        {saving ? "Zapisywanie…" : `Zapisz protokół ${HANDOVER_KIND_GENITIVE[kind]}`}
      </button>
    </form>
  );
}
