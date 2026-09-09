"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateReservationStatus } from "./actions";
import {
  ACTION_LABEL,
  STATUS_TRANSITIONS,
  type ReservationStatus,
} from "@/lib/admin/reservation-status";
import { cn } from "@/lib/utils";

const ERR: Record<string, string> = {
  overlap:
    "Termin nakłada się na istniejącą potwierdzoną rezerwację tego auta.",
  illegal: "Niedozwolona zmiana statusu.",
  not_found: "Nie znaleziono rezerwacji.",
  invalid: "Nieprawidłowe dane.",
  server: "Wystąpił błąd. Spróbuj ponownie.",
};

export function StatusActions({
  id,
  status,
}: {
  id: string;
  status: ReservationStatus;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Rejecting is two-step: the button opens a reason field, then a second click
  // sends it. Every other transition stays a single click.
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  /*
    `?? []` NIE jest tu zamiataniem problemu pod dywan — prawdziwa naprawa
    stoi w `reservation-status.ts`, gdzie doszedł brakujący status i gdzie
    kompletności map pilnuje teraz kompilator.

    To zabezpieczenie zostaje z innego powodu: `status` przychodzi z BAZY,
    a baza potrafi wyprzedzić kod. Nowa wartość enumu wchodzi migracją, która
    na produkcji jest wykonywana PRZED podmianą obrazu (bo tak jest bezpiecznie
    — patrz procedura wdrożeniowa). Między jednym a drugim istnieje okno,
    w którym stary kod widzi status, którego nie zna. Ten wiersz decyduje, czy
    w tym oknie panel pokaże kartę bez przycisków, czy wywali się błędem
    renderowania — a dokładnie to drugie stało się 27.08.2026 właścicielowi
    na jego własnej rezerwacji.
  */
  const allowed = STATUS_TRANSITIONS[status] ?? [];

  if (allowed.length === 0) return null;

  const act = (to: ReservationStatus, note?: string) => {
    setError(null);
    start(async () => {
      const res = await updateReservationStatus({ id, to, reason: note });
      if (!res.ok) setError(ERR[res.error] ?? ERR.server);
      else {
        setRejecting(false);
        setReason("");
        router.refresh();
      }
    });
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {allowed.map((to) => (
          <button
            key={to}
            type="button"
            disabled={pending}
            onClick={() =>
              to === "rejected" ? setRejecting((v) => !v) : act(to)
            }
            className={cn(
              "label inline-flex h-11 items-center justify-center px-6 text-xs transition-colors disabled:opacity-50",
              to === "confirmed"
                ? "bg-red hover:bg-red-hover text-white"
                : "border-line-strong border text-ink hover:border-ink hover:bg-ink/5",
              to === "rejected" && rejecting && "border-white bg-white/5",
            )}
          >
            {ACTION_LABEL[to]}
          </button>
        ))}
      </div>

      {rejecting && (
        <div className="border-line-strong bg-graphite/60 mt-4 border p-4">
          <label
            htmlFor="reject-reason"
            className="label-tight text-ink-faint text-[10px]"
          >
            Powód odrzucenia (trafi do wiadomości e-mail dla klienta)
          </label>
          <textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="np. Wybrany termin jest już niedostępny."
            className="border-line-strong mt-2 w-full border bg-surface-1 px-3 py-2 text-sm text-ink"
          />
          <p className="text-ink-faint mt-1 text-[11px]">
            Możesz zostawić puste — klient otrzyma wtedy ogólną wiadomość.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => act("rejected", reason)}
              className="label bg-red hover:bg-red-hover inline-flex h-10 items-center px-5 text-xs text-white transition-colors disabled:opacity-50"
            >
              {pending ? "Wysyłanie…" : "Odrzuć i powiadom klienta"}
            </button>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="text-ink-faint text-xs transition-colors hover:text-ink"
            >
              Anuluj
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-red mt-3 text-xs">{error}</p>}
    </div>
  );
}
