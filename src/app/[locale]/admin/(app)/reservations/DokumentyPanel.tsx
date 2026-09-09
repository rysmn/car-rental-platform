"use client";

import { useState, useTransition } from "react";
import { wyslijDokumentyRecznie } from "@/lib/documents/actions";
import { DOCUMENT_URL_PREFIX } from "@/lib/documents/adres";

export type DokumentWiersz = {
  id: string;
  title: string;
  fileName: string;
  autoSend: boolean;
  stan: "sent" | "failed" | "not_sent";
  sentAt: string | null;
  sendError: string | null;
  sendAttempts: number;
};

/**
 * Co klient dostał — i czy naprawdę dostał.
 *
 * ## Dlaczego ten panel powstał
 *
 * Właściciel zgłosił, że klient nie dostał umowy po rezerwacji. Dokument BYŁ
 * przypięty do rezerwacji, więc z panelu wyglądał na załatwiony — a wysłany
 * nie był, bo w mailu szedł tylko odnośnik do strony wymagającej klucza z tej
 * samej przeglądarki. Panel nie miał jak tego pokazać, bo nie odróżniał
 * „przypisano" od „wyszło".
 *
 * Teraz odróżnia i mówi to jednym słowem:
 *   WYSŁANO   — poczta przyjęła wiadomość,
 *   BŁĄD      — próbowano i się nie udało (z powodem),
 *   NIEWYSŁANY — nigdy nie próbowano, zwykle bo automat jest wyłączony.
 *
 * SENT nigdy nie znaczy „funkcja została zawołana".
 */
export function DokumentyPanel({
  reservationId,
  dokumenty,
  mozeWysylac,
}: {
  reservationId: string;
  dokumenty: DokumentWiersz[];
  mozeWysylac: boolean;
}) {
  const [czeka, start] = useTransition();
  const [wynik, setWynik] = useState<{ ok: boolean; tekst: string } | null>(
    null,
  );
  const [pytamOPonowienie, setPytam] = useState(false);

  if (dokumenty.length === 0) {
    return (
      <p className="text-ink-muted text-sm leading-relaxed">
        Do tej rezerwacji nie przypięto żadnych dokumentów. Dokumenty z
        kategorii „Przy rezerwacji” są przypinane w chwili potwierdzenia —
        jeżeli lista jest pusta, w katalogu nie było wtedy ani jednego
        obowiązującego.
      </p>
    );
  }

  const wyslij = (ponow: boolean) => {
    setWynik(null);
    start(async () => {
      const r = await wyslijDokumentyRecznie(reservationId, ponow);
      setWynik({ ok: r.ok, tekst: r.komunikat });
      setPytam(false);
    });
  };

  const cosNieWyszlo = dokumenty.some((d) => d.stan !== "sent");

  return (
    <div className="space-y-4">
      <ul className="divide-line divide-y">
        {dokumenty.map((d) => (
          <li
            key={d.id}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
          >
            <div className="min-w-0">
              <a
                href={`${DOCUMENT_URL_PREFIX}/${d.fileName}`}
                target="_blank"
                rel="noreferrer"
                className="text-ink tap-area -my-1 inline-block py-1 text-sm underline-offset-4 hover:underline"
              >
                {d.title}
              </a>
              <p className="text-ink-faint text-xs">
                {d.autoSend ? "wysyłka automatyczna" : "wysyłka wyłączona"}
                {d.sendAttempts > 0 && ` · prób: ${d.sendAttempts}`}
              </p>
              {d.stan === "failed" && d.sendError && (
                <p className="text-ink-muted mt-1 text-xs">{d.sendError}</p>
              )}
            </div>
            <p className="text-xs whitespace-nowrap">
              {d.stan === "sent" ? (
                <span className="text-ink">
                  WYSŁANO
                  {d.sentAt ? ` · ${d.sentAt}` : ""}
                </span>
              ) : d.stan === "failed" ? (
                <span className="text-red">BŁĄD WYSYŁKI</span>
              ) : (
                <span className="text-ink-muted">NIEWYSŁANY</span>
              )}
            </p>
          </li>
        ))}
      </ul>

      {wynik && (
        <p
          role="status"
          className={wynik.ok ? "text-ink text-sm" : "text-ink-muted text-sm"}
        >
          {wynik.tekst}
        </p>
      )}

      {mozeWysylac && (
        <div className="flex flex-wrap gap-2">
          {/*
            Zwykła wysyłka pomija to, co już wyszło — dlatego nie potrzebuje
            potwierdzenia. Ponowienie wysyła KOPIĘ czegoś, co klient już ma,
            więc pyta. To jedyna droga, którą wolno przełamać ochronę przed
            podwójną wysyłką, i ma to być decyzja człowieka.
          */}
          {cosNieWyszlo && (
            <button
              type="button"
              disabled={czeka}
              onClick={() => wyslij(false)}
              className="label bg-red hover:bg-red-hover inline-flex h-11 items-center px-5 text-xs text-white transition-colors disabled:opacity-50"
            >
              {czeka ? "Wysyłanie…" : "Wyślij klientowi"}
            </button>
          )}
          {pytamOPonowienie ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-ink text-xs">
                Wysłać kopię wszystkich dokumentów ponownie?
              </span>
              <button
                type="button"
                disabled={czeka}
                onClick={() => wyslij(true)}
                className="label bg-red hover:bg-red-hover inline-flex h-11 items-center px-4 text-xs text-white transition-colors disabled:opacity-50"
              >
                Tak, wyślij
              </button>
              <button
                type="button"
                onClick={() => setPytam(false)}
                className="label border-line-strong text-ink hover:border-ink inline-flex h-11 items-center border px-4 text-xs transition-colors"
              >
                Nie
              </button>
            </span>
          ) : (
            <button
              type="button"
              disabled={czeka}
              onClick={() => setPytam(true)}
              className="label border-line-strong text-ink hover:border-ink inline-flex h-11 items-center border px-4 text-xs transition-colors disabled:opacity-50"
            >
              Wyślij ponownie
            </button>
          )}
        </div>
      )}
    </div>
  );
}
