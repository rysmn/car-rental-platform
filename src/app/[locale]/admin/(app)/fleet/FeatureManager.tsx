"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { pick, type Bilingual } from "@/lib/i18n-pick";
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
/**
 * `key` is the value stored on the car (kept in Polish, as already saved);
 * `label` is only what the operator reads on the quick-add button.
 */
const SUGGESTIONS: { key: string; label: Bilingual }[] = [
  { key: "Apple CarPlay", label: { pl: "Apple CarPlay", en: "Apple CarPlay" } },
  { key: "Android Auto", label: { pl: "Android Auto", en: "Android Auto" } },
  { key: "Uchwyt na telefon", label: { pl: "Uchwyt na telefon", en: "Phone holder" } },
  { key: "Ładowarka indukcyjna", label: { pl: "Ładowarka indukcyjna", en: "Wireless charger" } },
  { key: "Nawigacja GPS", label: { pl: "Nawigacja GPS", en: "GPS navigation" } },
  { key: "Kamera cofania", label: { pl: "Kamera cofania", en: "Reversing camera" } },
  { key: "Czujniki parkowania", label: { pl: "Czujniki parkowania", en: "Parking sensors" } },
  { key: "Podgrzewane fotele", label: { pl: "Podgrzewane fotele", en: "Heated seats" } },
  { key: "Podgrzewana kierownica", label: { pl: "Podgrzewana kierownica", en: "Heated steering wheel" } },
  { key: "Tempomat adaptacyjny", label: { pl: "Tempomat adaptacyjny", en: "Adaptive cruise control" } },
  { key: "Klimatyzacja automatyczna", label: { pl: "Klimatyzacja automatyczna", en: "Automatic climate control" } },
  { key: "Dach panoramiczny", label: { pl: "Dach panoramiczny", en: "Panoramic roof" } },
  { key: "Hak holowniczy", label: { pl: "Hak holowniczy", en: "Tow bar" } },
  { key: "Bagażnik dachowy", label: { pl: "Bagażnik dachowy", en: "Roof rack" } },
  { key: "Opony zimowe", label: { pl: "Opony zimowe", en: "Winter tyres" } },
  { key: "Bluetooth", label: { pl: "Bluetooth", en: "Bluetooth" } },
];

export function FeatureManager({
  modelId,
  features,
}: {
  modelId: string;
  features: string[];
}) {
  const t = useTranslations("Admin.fleet");
  const locale = useLocale();
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
  const unused = SUGGESTIONS.filter((s) => !taken.has(s.key.toLowerCase()));

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
        <h2 className="label text-xs text-ink">{t("featuresHeading")}</h2>
        <p className="text-ink-faint text-xs">{t("featuresIntro")}</p>
      </div>

      {features.length === 0 ? (
        <p className="border-line bg-graphite/40 text-silver border px-5 py-6 text-center text-sm">
          {t("noFeatures")}
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
                  aria-label={t("removeFeature", { name: f })}
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
          placeholder={t("featurePlaceholder")}
          className="border-line-strong placeholder:text-ink-faint h-10 min-w-0 flex-1 border bg-surface-1 px-3 text-sm text-ink"
        />
        <button
          type="submit"
          disabled={busy}
          className="label bg-red hover:bg-red-hover inline-flex h-10 shrink-0 items-center px-6 text-xs text-white transition-colors disabled:opacity-50"
        >
          {adding ? t("adding") : t("add")}
        </button>
      </form>

      {state && !state.ok && (
        <p className="text-red mt-3 text-xs">{state.error}</p>
      )}

      {unused.length > 0 && (
        <div className="mt-5">
          <p className="label-tight text-ink-faint text-[10px]">
            {t("quickAdd")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {unused.map((s) => (
              <button
                key={s.key}
                type="button"
                disabled={busy}
                onClick={() => quickAdd(s.key)}
                className="border-line text-silver hover:border-line-strong tap border px-3 py-1.5 text-xs transition-colors hover:text-ink disabled:opacity-30"
              >
                + {pick(s.label, locale)}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
