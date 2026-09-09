"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import {
  createAvailabilityBlock,
  deleteAvailabilityBlock,
  type FormResult,
} from "./actions";
import type { AdminBlock } from "@/lib/admin/availability";

const inputCls =
  "h-10 w-full min-w-0 border border-line-strong bg-surface-1 px-3 text-sm text-ink placeholder:text-ink-faint";
const labelCls = "label-tight text-[10px] text-ink-faint";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatPl(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/**
 * Blackout windows for one model.
 *
 * This is the manual half of availability: confirmed bookings block a car by
 * themselves, and everything else an operator knows — it is in for servicing,
 * someone booked it over the phone, the owner is using it — lives here. Both
 * end up the same red squares on the public calendar.
 *
 * Blocking defaults to the whole model, because that is the common case (a week
 * where none of them go out); a single plate is one dropdown away for the "only
 * this one is in the shop" case.
 */
export function BlockManager({
  modelId,
  units,
  blocks,
}: {
  modelId: string;
  units: { id: string; plate: string }[];
  blocks: AdminBlock[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, submit, saving] = useActionState<FormResult | null, FormData>(
    async (prev, formData) => {
      const res = await createAvailabilityBlock(prev, formData);
      if (res.ok) formRef.current?.reset();
      return res;
    },
    null,
  );
  const [pending, startTransition] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);
  const busy = saving || pending;

  const today = todayIso();
  // A block that has already ended is history, not something to scan past when
  // checking what is blocked next.
  const upcoming = blocks.filter((b) => b.endDate >= today);
  const past = blocks.length - upcoming.length;

  return (
    <section className="mt-14">
      <div className="mb-4">
        <h2 className="label text-xs text-ink">Blokady dostępności</h2>
        <p className="text-ink-faint text-xs">
          Dni, w których auto nie jest do wynajęcia — serwis, rezerwacja
          telefoniczna, użytek własny. Na stronie auta pokazują się na czerwono,
          tak samo jak potwierdzone rezerwacje.
        </p>
      </div>

      {units.length === 0 ? (
        <p className="border-line bg-graphite/40 text-silver border px-5 py-6 text-center text-sm">
          Najpierw dodaj egzemplarz — blokada dotyczy konkretnego auta.
        </p>
      ) : (
        <>
          {upcoming.length === 0 ? (
            <p className="border-line bg-graphite/40 text-silver border px-5 py-6 text-center text-sm">
              Brak blokad. Auto jest wolne we wszystkie dni bez rezerwacji.
            </p>
          ) : (
            <ul className="border-line divide-line divide-y border">
              {upcoming.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <span className="text-sm text-ink">
                    {formatPl(b.startDate)} – {formatPl(b.endDate)}
                    <span className="text-ink-faint ml-3 text-xs">
                      {b.plate ?? "—"}
                      {b.reason ? ` · ${b.reason}` : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!confirm("Usunąć tę blokadę?")) return;
                      setRowError(null);
                      startTransition(async () => {
                        const res = await deleteAvailabilityBlock(
                          b.id,
                          modelId,
                        );
                        if (!res.ok) setRowError(res.error);
                      });
                    }}
                    className="label-tight text-red text-[10px] transition-opacity hover:opacity-70 disabled:opacity-30"
                  >
                    Usuń
                  </button>
                </li>
              ))}
            </ul>
          )}

          {past > 0 && (
            <p className="text-ink-faint mt-2 text-xs">
              Blokady zakończone: {past} (ukryte).
            </p>
          )}

          {rowError && <p className="text-red mt-3 text-xs">{rowError}</p>}

          <form
            ref={formRef}
            action={submit}
            className="border-line mt-4 grid gap-4 border p-5 sm:grid-cols-2 lg:grid-cols-4"
          >
            <input type="hidden" name="modelId" value={modelId} />

            <label className="flex flex-col gap-1">
              <span className={labelCls}>Auto</span>
              <select name="carId" defaultValue="all" className={inputCls}>
                <option value="all">Wszystkie ({units.length})</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.plate}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className={labelCls}>Od</span>
              <input
                type="date"
                name="startDate"
                required
                defaultValue={today}
                className={`${inputCls} [color-scheme:dark]`}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className={labelCls}>Do</span>
              <input
                type="date"
                name="endDate"
                required
                defaultValue={today}
                className={`${inputCls} [color-scheme:dark]`}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className={labelCls}>Powód (opcjonalnie)</span>
              <input
                name="reason"
                maxLength={200}
                placeholder="serwis"
                className={inputCls}
              />
            </label>

            <div className="sm:col-span-2 lg:col-span-4">
              <button
                type="submit"
                disabled={busy}
                className="label bg-red hover:bg-red-hover inline-flex h-10 items-center px-6 text-xs text-white transition-colors disabled:opacity-50"
              >
                {saving ? "Zapisywanie…" : "Zablokuj terminy"}
              </button>
            </div>
          </form>

          {state && !state.ok && (
            <p className="text-red mt-3 text-xs">{state.error}</p>
          )}
        </>
      )}
    </section>
  );
}
