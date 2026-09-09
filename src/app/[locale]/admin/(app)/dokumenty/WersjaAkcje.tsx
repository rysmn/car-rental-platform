"use client";

import { useState, useTransition } from "react";
import {
  usunDokument,
  ustawAktywna,
  ustawAutoSend,
  wycofaj,
} from "@/lib/documents/actions";
import { DOCUMENT_URL_PREFIX } from "@/lib/documents/adres";

/**
 * Co da się zrobić z wersją dokumentu: otworzyć, uczynić obowiązującą,
 * wycofać z obiegu, włączyć automatyczną wysyłkę, usunąć.
 *
 * ## Dlaczego usuwanie wymaga dwóch kliknięć
 *
 * Bo trzecie kliknięcie jest nieodwracalne. Pierwsze zamienia przycisk
 * w pytanie, drugie odpowiada — bez okna modalnego, które na telefonie
 * i tak trzeba przewinąć. Wycofanie z obiegu takiego progu nie ma, bo niczego
 * nie niszczy.
 *
 * Serwer i tak odmówi usunięcia dokumentu, który ktoś dostał — to potwierdzenie
 * jest uprzejmością wobec administratora, nie zabezpieczeniem danych.
 */
export function WersjaAkcje({
  id,
  fileName,
  active,
  autoSend,
  mozeZarzadzac,
  onEdytuj,
}: {
  id: string;
  fileName: string;
  active: boolean;
  autoSend: boolean;
  mozeZarzadzac: boolean;
  onEdytuj: () => void;
}) {
  const [czeka, start] = useTransition();
  const [blad, setBlad] = useState<string | null>(null);
  const [pytamOUsuniecie, setPytam] = useState(false);

  const wykonaj = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBlad(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setBlad(r.error ?? "Nie udało się.");
      else setPytam(false);
    });
  };

  const PRZYCISK =
    "label border-line-strong text-ink hover:border-ink inline-flex h-11 items-center border px-4 text-xs transition-colors disabled:opacity-50";

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      {blad && (
        <p
          role="alert"
          className="text-ink-muted w-full text-xs leading-relaxed"
        >
          {blad}
        </p>
      )}

      {/*
        AUTO-SEND stoi PIERWSZY i jest jedyną kontrolką z własnym stanem
        widocznym z odległości — to jest to ustawienie, którego brak sprawił,
        że klient nie dostał umowy.

        Napis mówi PRAWDĘ o tym, kiedy przełącznik naprawdę działa. Do klienta
        przypinane są wyłącznie dokumenty z kategorii „Przy rezerwacji"; dla
        każdej innej kategorii włączony automat nie wyśle niczego, bo dokument
        nigdy nie zostaje przypięty do rezerwacji. Przycisk mówiący „WŁĄCZONA"
        przy protokole zwrotu obiecywałby coś, co się nie stanie — a to jest
        ten sam rodzaj cichej nieprawdy, przez który klient nie dostał umowy.
      */}
      {mozeZarzadzac && (
        <button
          type="button"
          disabled={czeka}
          onClick={() => wykonaj(() => ustawAutoSend(id, !autoSend))}
          aria-pressed={autoSend}
          /*
            Do 30.08.2026 stało tu ostrzeżenie o kategorii: wysyłka dotyczyła
            wyłącznie „Przy rezerwacji", więc przełącznik nad dokumentem z innej
            kategorii nic nie robił. Kategoria już o niczym nie decyduje —
            decyduje ten przełącznik. Został jeden warunek, który nadal potrafi
            go unieważnić, i on musi być widoczny: wersja nieobowiązująca nie
            idzie do nikogo, choćby wysyłkę miała włączoną.
          */
          title={
            active
              ? undefined
              : "Ta wersja nie obowiązuje, więc nie zostanie wysłana. Ustaw ją jako obowiązującą."
          }
          className={`label inline-flex h-11 items-center border px-4 text-xs transition-colors disabled:opacity-50 ${
            autoSend && active
              ? "border-ink text-ink"
              : "border-line-strong text-ink-faint hover:border-ink"
          }`}
        >
          {autoSend
            ? active
              ? "Wysyłka: WŁĄCZONA"
              : "Wysyłka: WŁĄCZONA (wersja nie obowiązuje)"
            : "Wysyłka: wyłączona"}
        </button>
      )}

      {mozeZarzadzac && (
        <button type="button" onClick={onEdytuj} className={PRZYCISK}>
          Edytuj
        </button>
      )}

      <a
        href={`${DOCUMENT_URL_PREFIX}/${fileName}`}
        target="_blank"
        rel="noreferrer"
        className={PRZYCISK}
      >
        Otwórz
      </a>

      {mozeZarzadzac &&
        (active ? (
          <button
            type="button"
            disabled={czeka}
            onClick={() => wykonaj(() => wycofaj(id))}
            className={PRZYCISK}
          >
            Wycofaj z obiegu
          </button>
        ) : (
          <button
            type="button"
            disabled={czeka}
            onClick={() => wykonaj(() => ustawAktywna(id))}
            className="label bg-red hover:bg-red-hover inline-flex h-11 items-center px-4 text-xs text-white transition-colors disabled:opacity-50"
          >
            Ustaw jako obowiązującą
          </button>
        ))}

      {mozeZarzadzac &&
        (pytamOUsuniecie ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-ink text-xs">Na pewno usunąć?</span>
            <button
              type="button"
              disabled={czeka}
              onClick={() => wykonaj(() => usunDokument(id))}
              className="label bg-red hover:bg-red-hover inline-flex h-11 items-center px-4 text-xs text-white transition-colors disabled:opacity-50"
            >
              Tak, usuń
            </button>
            <button
              type="button"
              onClick={() => {
                setPytam(false);
                setBlad(null);
              }}
              className={PRZYCISK}
            >
              Nie
            </button>
          </span>
        ) : (
          <button
            type="button"
            disabled={czeka}
            onClick={() => setPytam(true)}
            className="label border-line-strong text-ink-faint hover:border-ink hover:text-ink inline-flex h-11 items-center border px-4 text-xs transition-colors disabled:opacity-50"
          >
            Usuń
          </button>
        ))}
    </div>
  );
}
