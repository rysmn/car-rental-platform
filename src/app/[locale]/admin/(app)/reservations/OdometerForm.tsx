"use client";

import { useActionState } from "react";
import { updateOdometer, type OdometerResult } from "./actions";
import {
  nadprzebiegKm,
  oplataNadprzebiegGrosze,
} from "@/lib/booking/mileage";
import { formatPln, formatPlnDokladnie } from "@/lib/format";

/**
 * Odometer at handover and at return.
 *
 * The two numbers that turn the whole cost base into a cost per kilometre —
 * the only figure that compares a cheap car with an expensive one honestly.
 * Both optional: a reservation with one reading, or none, simply does not
 * contribute to the per-kilometre maths rather than distorting it.
 */
export function OdometerForm({
  reservationId,
  start,
  end,
  limitKm,
  stawkaGroszeZaKm,
}: {
  reservationId: string;
  start: number | null;
  end: number | null;
  /** Kilometry objęte najmem — z migawki rezerwacji, nie z cennika auta. */
  limitKm: number | null;
  /** Stawka za kilometr ponad limit — również z migawki. `null` = nie zapisano. */
  stawkaGroszeZaKm: number | null;
}) {
  const [state, action, pending] = useActionState<
    OdometerResult | null,
    FormData
  >(updateOdometer, null);

  const driven = start != null && end != null ? end - start : null;
  /*
    Nadprzebieg i opłata — policzone TU, ale regułą z `lib/booking/mileage`,
    tą samą, którą pokazał klientowi formularz rezerwacji. Panel nie ma
    własnej arytmetyki przebiegu i mieć jej nie może: rozjazd między tym, co
    obiecano przy rezerwacji, a tym, co policzono przy zwrocie, jest sporem
    z klientem, którego nie da się rozstrzygnąć na jego korzyść po fakcie.

    Liczy się dopiero wtedy, gdy SĄ oba odczyty licznika. Jeden odczyt albo
    żaden to nie „zero kilometrów ponad limit", tylko brak podstawy.
  */
  const ponadLimit = driven != null ? nadprzebiegKm(driven, limitKm) : null;
  const oplata =
    driven != null
      ? oplataNadprzebiegGrosze(driven, limitKm, stawkaGroszeZaKm)
      : null;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={reservationId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="label-tight text-ink-faint text-[10px]">
            Licznik przy wydaniu (km)
          </span>
          <input
            name="startOdometerKm"
            type="number"
            min="0"
            defaultValue={start ?? ""}
            placeholder="82 000"
            className="border-line-strong h-10 w-full border bg-surface-1 px-3 text-sm text-ink"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-tight text-ink-faint text-[10px]">
            Licznik przy zwrocie (km)
          </span>
          <input
            name="endOdometerKm"
            type="number"
            min="0"
            defaultValue={end ?? ""}
            placeholder="84 200"
            className="border-line-strong h-10 w-full border bg-surface-1 px-3 text-sm text-ink"
          />
        </label>
      </div>

      {driven != null && (
        <div className="text-xs tabular-nums">
          <p className="text-silver">
            Przejechano {driven.toLocaleString("pl-PL")} km
            {limitKm != null && (
              <span className="text-ink-faint">
                {" · limit "}
                {limitKm.toLocaleString("pl-PL")} km
              </span>
            )}
          </p>
          {limitKm != null && ponadLimit != null && ponadLimit > 0 && (
            <div className="border-line-strong mt-2 border-l-2 pl-3">
              <p className="text-ink">
                Przebieg ponad limit: {ponadLimit.toLocaleString("pl-PL")} km
              </p>
              {oplata != null && stawkaGroszeZaKm != null ? (
                <>
                  <p className="text-silver">
                    Stawka: {formatPlnDokladnie(stawkaGroszeZaKm, "pl")}/km
                    <span className="text-ink-faint">
                      {" (ze stawki zapisanej w rezerwacji)"}
                    </span>
                  </p>
                  <p className="text-ink font-bold">
                    Opłata za nadprzebieg: {formatPln(oplata, "pl")}
                  </p>
                </>
              ) : (
                /* Brak stawki w migawce — rezerwacja sprzed 01.09.2026.
                   Mówimy o tym wprost; podstawienie dzisiejszej stawki
                   zmieniłoby warunki zamkniętej umowy. */
                <p className="text-ink-faint">
                  Stawka nadprzebiegu nie była zapisana przy tej rezerwacji —
                  rozlicz ją ręcznie według umowy.
                </p>
              )}
            </div>
          )}
          {limitKm != null && ponadLimit === 0 && (
            <p className="text-ink-faint mt-1">
              Limit nieprzekroczony — brak opłaty za nadprzebieg.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="label border-line-strong inline-flex h-9 items-center border px-4 text-xs text-ink transition-colors hover:border-ink hover:bg-ink/5 disabled:opacity-50"
        >
          {pending ? "Zapisywanie…" : "Zapisz licznik"}
        </button>
        {state?.ok && (
          <span className="text-xs text-emerald-400">Zapisano ✓</span>
        )}
        {state && !state.ok && (
          <span className="text-red text-xs">{state.error}</span>
        )}
      </div>
      <p className="text-ink-faint text-xs">
        Zapisanie stanu przy zwrocie aktualizuje też przebieg egzemplarza we
        flocie.
      </p>
    </form>
  );
}
