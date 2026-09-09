"use client";

import { useActionState, useState } from "react";
import { formatPln } from "@/lib/format";
import {
  oznaczNieodebranie,
  oznaczOplateZaplacona,
  umorzOplateAnulowania,
} from "./actions";
import type { NaleznoscAnulowania } from "@/lib/booking/cancellation-repo";

/**
 * Należność za anulowanie w panelu: ile, za co, co dalej.
 *
 * Trzy rzeczy naraz, bo obsługa patrzy na nie razem: co się naliczyło,
 * w jakim jest stanie i co można z tym zrobić. Kwota PIERWOTNA zostaje na
 * ekranie także po umorzeniu — zamówienie mówi wprost, żeby jej nie usuwać,
 * a ekran, który po umorzeniu pokazuje samo „0 zł", gubi to, co się wydarzyło.
 */

const ETYKIETA_STANU: Record<NaleznoscAnulowania["status"], string> = {
  not_applicable: "BEZPŁATNE",
  due: "DO ZAPŁATY",
  paid: "ZAPŁACONE",
  waived: "UMORZONE",
};

const STYL_STANU: Record<NaleznoscAnulowania["status"], string> = {
  not_applicable: "border-line text-ink-faint",
  due: "border-red text-red",
  paid: "border-line text-emerald-400",
  waived: "border-line text-silver",
};

const ETYKIETA_PROGU: Record<string, string> = {
  free: "ponad próg bezpłatny",
  tier1: "między progami",
  tier2: "poniżej drugiego progu",
  no_show: "nieodebranie auta",
};

const PRZYCISK =
  "label border-line-strong inline-flex h-9 items-center border px-4 text-xs text-ink transition-colors hover:border-ink hover:bg-ink/5 disabled:opacity-50";

export function CancellationFeePanel({
  reservationId,
  fee,
  mozliwyNoShow,
  powodNieodebrania,
}: {
  reservationId: string;
  /** `null`, gdy nic jeszcze nie naliczono — rezerwacja czynna albo stara. */
  fee: NaleznoscAnulowania | null;
  /** Czy status i zegar pozwalają dziś uznać rezerwację za nieodebraną. */
  mozliwyNoShow: boolean;
  /** Dlaczego nie — zdanie dla obsługi, gdy przycisku nie ma. */
  powodNieodebrania: string | null;
}) {
  const [stanUmorzenia, umorz, umarzanie] = useActionState(
    umorzOplateAnulowania,
    null,
  );
  const [stanWplaty, zaplac, wplacanie] = useActionState(
    oznaczOplateZaplacona,
    null,
  );
  const [stanNoShow, noShow, noShowTrwa] = useActionState(
    oznaczNieodebranie,
    null,
  );
  const [formularzUmorzenia, setFormularzUmorzenia] = useState(false);

  return (
    <div className="border-line bg-graphite/40 mt-6 border p-6">
      <h2 className="label-tight text-ink-faint mb-4 text-[10px]">
        Anulowanie i nieodebranie
      </h2>

      {fee ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-heading text-ink text-lg font-bold tabular-nums">
              {formatPln(fee.amountGrosze, "pl")}
            </span>
            <span
              className={`label-tight border px-2 py-1 text-[10px] ${STYL_STANU[fee.status]}`}
              data-fee-status={fee.status}
            >
              {ETYKIETA_STANU[fee.status]}
            </span>
            <span className="text-ink-faint text-xs">
              {fee.kind === "no_show" ? "nieodebranie" : "anulowanie"} ·{" "}
              {ETYKIETA_PROGU[fee.tier] ?? fee.tier}
            </span>
          </div>

          {/*
            Sufit pokazany, a nie tylko zastosowany: klient z rezerwacją za
            300 zł ma prawo wiedzieć, że cennik mówił 500, i obsługa też.
          */}
          {fee.policyGrosze > fee.amountGrosze && (
            <p className="text-ink-faint text-xs">
              Cennik: {formatPln(fee.policyGrosze, "pl")} — ograniczone
              wartością rezerwacji ({formatPln(fee.reservationTotalGrosze, "pl")}
              ).
            </p>
          )}

          <p className="text-ink-faint text-xs">
            Naliczono {fee.chargedAt.toLocaleString("pl-PL")}
            {fee.hoursToPickup !== null &&
              ` · ${fee.hoursToPickup.toFixed(1)} h do odbioru`}
          </p>

          {fee.status === "waived" && (
            <div className="border-line-strong border-l-2 pl-3">
              <p className="text-silver text-xs">
                Umorzone {fee.waivedAt?.toLocaleString("pl-PL")} · do zapłaty{" "}
                {formatPln(0, "pl")}
              </p>
              <p className="text-ink-faint mt-1 text-xs">
                Powód: {fee.waiveReason}
              </p>
              <p className="text-ink-faint mt-1 text-xs">
                Pierwotnie naliczono {formatPln(fee.amountGrosze, "pl")} — kwota
                zostaje w historii.
              </p>
            </div>
          )}

          {fee.status === "due" && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <form action={zaplac}>
                <input type="hidden" name="id" value={reservationId} />
                <button type="submit" disabled={wplacanie} className={PRZYCISK}>
                  {wplacanie ? "Zapisywanie…" : "Oznacz jako zapłaconą"}
                </button>
              </form>
              {!formularzUmorzenia && (
                <button
                  type="button"
                  className={PRZYCISK}
                  onClick={() => setFormularzUmorzenia(true)}
                  data-fee-waive-open
                >
                  Umorz opłatę
                </button>
              )}
            </div>
          )}

          {formularzUmorzenia && fee.status === "due" && (
            <form action={umorz} className="space-y-2 pt-2">
              <input type="hidden" name="id" value={reservationId} />
              <label className="block">
                <span className="label-tight text-ink-faint text-[10px]">
                  Powód umorzenia (zostaje w historii)
                </span>
                <input
                  name="reason"
                  required
                  minLength={3}
                  maxLength={500}
                  placeholder="np. awaria po naszej stronie, gest wobec stałego klienta"
                  className="border-line-strong bg-surface-1 text-ink mt-1 h-10 w-full border px-3 text-sm"
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={umarzanie} className={PRZYCISK}>
                  {umarzanie ? "Umarzanie…" : "Potwierdź umorzenie"}
                </button>
                <button
                  type="button"
                  className={PRZYCISK}
                  onClick={() => setFormularzUmorzenia(false)}
                >
                  Anuluj
                </button>
              </div>
            </form>
          )}

          {stanUmorzenia && !stanUmorzenia.ok && (
            <p className="text-red text-xs">{stanUmorzenia.error}</p>
          )}
          {stanWplaty && !stanWplaty.ok && (
            <p className="text-red text-xs">{stanWplaty.error}</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-ink-faint text-xs leading-relaxed">
            Nic nie naliczono. Opłata powstaje przy anulowaniu przez klienta
            albo przy oznaczeniu rezerwacji jako nieodebranej.
          </p>
          {mozliwyNoShow ? (
            <form action={noShow}>
              <input type="hidden" name="id" value={reservationId} />
              <button
                type="submit"
                disabled={noShowTrwa}
                className={PRZYCISK}
                data-mark-no-show
              >
                {noShowTrwa ? "Zapisywanie…" : "Klient się nie zjawił"}
              </button>
            </form>
          ) : (
            powodNieodebrania && (
              <p className="text-ink-faint text-xs">{powodNieodebrania}</p>
            )
          )}
          {stanNoShow && !stanNoShow.ok && (
            <p className="text-red text-xs">{stanNoShow.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
