"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveReservation } from "./actions";
import { formatPln } from "@/lib/format";

type Unit = {
  id: string;
  plate: string | null;
  brand: string;
  model: string;
  dailyPriceGrosze: number;
};

/**
 * Przesiadka na inne auto — awaria albo upgrade, jednym kliknięciem.
 *
 * Lista jest zwinięta do przycisku, i to jest wybór: przenoszenie rezerwacji
 * jest rzadkie, a lista wolnych aut rozwinięta na stałe na stronie każdej
 * rezerwacji zachęca do klikania w nią z ciekawości. Rozwija się wtedy, kiedy
 * ktoś naprawdę tego szuka.
 *
 * Cena katalogowa nowego auta jest pokazana obok, ale **nie zmienia wyceny**
 * najmu — po to, żeby operator widział, czy oddaje klientowi lepsze auto, a
 * klient nie zobaczył za to nowego rachunku.
 */
export function MoveCar({
  reservationId,
  currentCarId,
  units,
  currentDailyGrosze,
}: {
  reservationId: string;
  currentCarId: string | null;
  units: Unit[];
  currentDailyGrosze: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const others = units.filter((u) => u.id !== currentCarId);

  return (
    <div className="border-line bg-graphite/40 mt-6 border p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="label-tight text-ink-faint text-[10px]">Zmiana auta</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="label-tight border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap inline-flex h-11 items-center border px-4 text-[10px] transition-colors"
        >
          {open ? "Zwiń" : `Pokaż wolne auta (${others.length})`}
        </button>
      </div>

      {open && (
        <>
          {others.length === 0 ? (
            <p className="text-ink-faint mt-4 text-sm">
              W tym terminie nie ma innego wolnego auta.
            </p>
          ) : (
            <ul className="divide-line mt-4 divide-y">
              {others.map((u) => (
                <li
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <span className="text-ink text-sm">
                    {u.brand} {u.model}
                    {u.plate && (
                      <span className="text-ink-faint ml-2">{u.plate}</span>
                    )}
                    <span className="text-ink-faint ml-3 text-xs tabular-nums">
                      {formatPln(u.dailyPriceGrosze, "pl")}/doba
                      {u.dailyPriceGrosze > currentDailyGrosze
                        ? " · wyższa klasa"
                        : u.dailyPriceGrosze < currentDailyGrosze
                          ? " · niższa klasa"
                          : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setError(null);
                      startTransition(async () => {
                        const res = await moveReservation({
                          id: reservationId,
                          carId: u.id,
                        });
                        if (res.ok) {
                          setOpen(false);
                          router.refresh();
                        } else setError(res.error);
                      });
                    }}
                    className="label-tight bg-red hover:bg-red-hover tap inline-flex h-11 items-center px-4 text-[10px] whitespace-nowrap text-white transition-colors disabled:opacity-60"
                  >
                    {pending ? "…" : "Przenieś tutaj"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="text-red mt-3 text-sm">{error}</p>}
          <p className="text-ink-faint mt-4 text-[11px]">
            Cena najmu nie zmienia się przy przesiadce — przeniesienie jest
            decyzją firmy, nie nową ofertą dla klienta.
          </p>
        </>
      )}
    </div>
  );
}
