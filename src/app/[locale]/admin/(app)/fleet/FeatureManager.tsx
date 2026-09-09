"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import {
  addModelFeature,
  removeModelFeature,
  type FormResult,
} from "./actions";

/**
 * The equipment list shown on the public car page.
 *
 * Two ways in, because there are two kinds of entry: the things every other car
 * also has (one tap from the suggestion row) and the thing that makes this car
 * worth picking (typed). Suggestions already on the list disappear from the
 * row, so it shrinks as the card fills in rather than becoming a wall of
 * buttons that do nothing.
 */
const SUGGESTIONS = [
  "Apple CarPlay",
  "Android Auto",
  "Uchwyt na telefon",
  "Ładowarka indukcyjna",
  "Nawigacja GPS",
  "Kamera cofania",
  "Czujniki parkowania",
  "Podgrzewane fotele",
  "Podgrzewana kierownica",
  "Tempomat adaptacyjny",
  "Klimatyzacja automatyczna",
  "Dach panoramiczny",
  "Hak holowniczy",
  "Bagażnik dachowy",
  "Opony zimowe",
  "Bluetooth",
];

export function FeatureManager({
  modelId,
  features,
}: {
  modelId: string;
  features: string[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, add, adding] = useActionState<FormResult | null, FormData>(
    async (prev, formData) => {
      const res = await addModelFeature(prev, formData);
      if (res.ok) {
        formRef.current?.reset();
        inputRef.current?.focus();
      }
      return res;
    },
    null,
  );
  const [pending, startTransition] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);
  const busy = adding || pending;

  const taken = new Set(features.map((f) => f.toLowerCase()));
  const unused = SUGGESTIONS.filter((s) => !taken.has(s.toLowerCase()));

  const quickAdd = (label: string) => {
    setRowError(null);
    const data = new FormData();
    data.set("modelId", modelId);
    data.set("feature", label);
    startTransition(async () => {
      const res = await addModelFeature(null, data);
      if (!res.ok) setRowError(res.error);
    });
  };

  return (
    <section className="mt-14">
      <div className="mb-4">
        <h2 className="label text-xs text-ink">Wyposażenie</h2>
        <p className="text-ink-faint text-xs">
          Pokazuje się na stronie auta jako lista. Dodaj to, co klient
          faktycznie zauważy — CarPlay, uchwyt na telefon, opony zimowe.
        </p>
      </div>

      {features.length === 0 ? (
        <p className="border-line bg-graphite/40 text-silver border px-5 py-6 text-center text-sm">
          Brak wyposażenia. Dodaj pierwsze poniżej.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {features.map((f) => (
            <li key={f}>
              <span className="border-line-strong flex items-center gap-2 border px-3 py-2 text-sm text-ink">
                {f}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setRowError(null);
                    startTransition(async () => {
                      const res = await removeModelFeature(modelId, f);
                      if (!res.ok) setRowError(res.error);
                    });
                  }}
                  aria-label={`Usuń ${f}`}
                  className="text-ink-faint hover:text-red tap justify-center text-xs transition-colors pointer-coarse:w-11 disabled:opacity-30"
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {rowError && <p className="text-red mt-3 text-xs">{rowError}</p>}

      <form ref={formRef} action={add} className="mt-4 flex flex-wrap gap-3">
        <input type="hidden" name="modelId" value={modelId} />
        <input
          ref={inputRef}
          name="feature"
          maxLength={60}
          required
          placeholder="np. Apple CarPlay"
          className="border-line-strong placeholder:text-ink-faint h-10 min-w-0 flex-1 border bg-surface-1 px-3 text-sm text-ink"
        />
        <button
          type="submit"
          disabled={busy}
          className="label bg-red hover:bg-red-hover inline-flex h-10 shrink-0 items-center px-6 text-xs text-white transition-colors disabled:opacity-50"
        >
          {adding ? "Dodawanie…" : "Dodaj"}
        </button>
      </form>

      {state && !state.ok && (
        <p className="text-red mt-3 text-xs">{state.error}</p>
      )}

      {unused.length > 0 && (
        <div className="mt-5">
          <p className="label-tight text-ink-faint text-[10px]">
            Szybkie dodanie
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {unused.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => quickAdd(s)}
                className="border-line text-silver hover:border-line-strong tap border px-3 py-1.5 text-xs transition-colors hover:text-ink disabled:opacity-30"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
