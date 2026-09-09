"use client";

import { useActionState, useState } from "react";
import type { FormResult } from "./actions";
import type { EditableModel } from "@/lib/admin/fleet";
import {
  CATEGORIES,
  GEARBOXES,
  FUELS,
  CATEGORY_LABEL,
  GEARBOX_LABEL,
  FUEL_LABEL,
  SEGMENT_LABEL,
  SEGMENT_HINT,
} from "@/lib/admin/fleet-options";
import { EDITABLE_SEGMENTS } from "@/lib/fleet/segments";
import {
  DRIVER_CLASSES,
  DRIVER_CLASS_LABEL,
} from "@/lib/fleet/driver-class";

type Action = (
  prev: FormResult | null,
  formData: FormData,
) => Promise<FormResult>;

function pln(grosze: number): string {
  return (grosze / 100).toString();
}

/** Client-side preview of the server's slug normalisation. Kept in sync with
 *  `slugify` in actions.ts — the server has the final say either way. */
function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** What each class is for, in the words an operator would use. */
const DRIVER_CLASS_HINT: Record<(typeof DRIVER_CLASSES)[number], string> = {
  standard: "Auta osobowe podstawowej klasy — np. RAV4, Tiguan.",
  premium: "Auta klasy wyższej i luksusowej — np. GLE, Panamera, Tesla.",
  van_bus: "Busy i auta 9-osobowe — np. Renault Trafic.",
};

const inputCls =
  "h-10 w-full border border-line-strong bg-surface-1 px-3 text-sm text-ink placeholder:text-ink-faint";
const labelCls = "label-tight text-[10px] text-ink-faint";

function Text({
  label,
  name,
  defaultValue,
  required,
  placeholder,
  type = "text",
  step,
  min,
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  required?: boolean;
  placeholder?: string;
  type?: string;
  step?: string;
  min?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelCls}>
        {label}
        {required && <span className="text-red"> *</span>}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        step={step}
        min={min}
        className={inputCls}
      />
    </label>
  );
}

function Select({
  label,
  name,
  options,
  labels,
  defaultValue,
}: {
  label: string;
  name: string;
  options: readonly string[];
  labels: Record<string, string>;
  defaultValue?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelCls}>{label}</span>
      <select name={name} defaultValue={defaultValue} className={inputCls}>
        {options.map((o) => (
          <option key={o} value={o}>
            {labels[o]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ModelForm({
  action,
  model,
}: {
  action: Action;
  model?: EditableModel;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  // Slug UX: while creating, the slug tracks brand + model automatically until
  // the admin edits it by hand — so they never have to think about it, and the
  // "invalid identifier" rejection they used to hit simply can't happen. When
  // editing an existing model the slug is seeded from what was saved.
  //
  // `slugOverride` is null until the admin types in the slug field; the shown
  // value is derived during render (no effect) so it stays in sync with brand +
  // model without a cascading re-render.
  const [brand, setBrand] = useState(model?.brand ?? "");
  const [modelName, setModelName] = useState(model?.model ?? "");
  const [slugOverride, setSlugOverride] = useState<string | null>(
    model?.slug ?? null,
  );
  const slug = slugOverride ?? slugify(`${brand} ${modelName}`);

  return (
    <form action={formAction} className="space-y-8">
      {model && <input type="hidden" name="id" value={model.id} />}

      <fieldset className="space-y-4">
        <legend className="label text-xs text-ink">Podstawowe dane</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={labelCls}>
              Marka<span className="text-red"> *</span>
            </span>
            <input
              name="brand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              required
              placeholder="BMW"
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>
              Model<span className="text-red"> *</span>
            </span>
            <input
              name="model"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              required
              placeholder="740d xDrive"
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className={labelCls}>Identyfikator URL (slug)</span>
            <input
              name="slug"
              value={slug}
              // Kept raw while typing (so hyphens are possible); the server
              // normalises on submit, so anything here is accepted.
              onChange={(e) => setSlugOverride(e.target.value)}
              placeholder="bmw-740d"
              className={`${inputCls} font-mono`}
            />
            <span className="text-ink-faint text-[11px]">
              Adres podstrony auta. Zostaw puste — utworzymy go z marki i
              modelu.
            </span>
          </label>
          <Text
            label="Rok"
            name="year"
            type="number"
            min="1990"
            defaultValue={model?.year}
            required
            placeholder="2024"
          />
          <Select
            label="Segment"
            name="category"
            options={CATEGORIES}
            labels={CATEGORY_LABEL}
            defaultValue={model?.category}
          />
          <Text
            label="Liczba miejsc"
            name="seats"
            type="number"
            min="1"
            defaultValue={model?.seats ?? 5}
            required
          />
          <Select
            label="Skrzynia biegów"
            name="gearbox"
            options={GEARBOXES}
            labels={GEARBOX_LABEL}
            defaultValue={model?.gearbox}
          />
          <Select
            label="Paliwo"
            name="fuel"
            options={FUELS}
            labels={FUEL_LABEL}
            defaultValue={model?.fuel}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="label text-xs text-ink">
          Klasy floty (filtry na stronie)
        </legend>
        <p className="text-ink-faint text-[11px]">
          Półka handlowa — decyduje o cenie i o tym, jak auto jest sprzedawane.
          Można zaznaczyć kilka. Nadwozia się tu nie ustawia: filtry „SUV”,
          „Sedan” i „Bus / Van” biorą się z typu nadwozia powyżej, „Elektryczne”
          z paliwa, a „Premium SUV” pojawia się sam, gdy auto jest jednocześnie
          SUV-em i ma zaznaczone „Luxury”. Dzięki temu nie da się oznaczyć
          diesla jako elektryka ani sedana jako SUV-a.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {EDITABLE_SEGMENTS.map((s) => (
            <label
              key={s}
              className="border-line-strong flex items-start gap-3 border p-3"
            >
              <input
                type="checkbox"
                name="segments"
                value={s}
                defaultChecked={model?.segments?.includes(s) ?? false}
                className="accent-red mt-0.5 size-4 shrink-0"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm text-ink">{SEGMENT_LABEL[s]}</span>
                <span className="text-ink-faint text-[11px]">
                  {SEGMENT_HINT[s]}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="label text-xs text-ink">
          Klasa wymogów kierowcy
        </legend>
        <p className="text-ink-faint text-[11px]">
          Decyduje o minimalnym wieku kierowcy i minimalnym stażu prawa jazdy
          dla tego auta. Same progi ustawiasz w{" "}
          <span className="text-silver">
            Zasady wynajmu → Wiek kierowcy i staż
          </span>{" "}
          — tutaj wybierasz tylko, która klasa obowiązuje. Wybór jest
          obowiązkowy: auto bez klasy nie ma żadnego wymogu.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {DRIVER_CLASSES.map((c) => (
            <label
              key={c}
              className="border-line-strong flex items-start gap-3 border p-3"
            >
              <input
                type="radio"
                name="driverClass"
                value={c}
                required
                defaultChecked={model?.driverClass === c}
                className="accent-red mt-0.5 size-4 shrink-0"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm text-ink">
                  {DRIVER_CLASS_LABEL[c]}
                </span>
                <span className="text-ink-faint text-[11px]">
                  {DRIVER_CLASS_HINT[c]}
                </span>
              </span>
            </label>
          ))}
        </div>
        {model && !model.driverClass ? (
          <p className="text-[11px] text-amber-500">
            To auto nie ma jeszcze klasy. Dopóki jej nie wybierzesz, nie
            obowiązuje przy nim żaden wymóg wieku ani stażu.
          </p>
        ) : null}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="label text-xs text-ink">Cennik</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Text
            label="Cena / doba (zł)"
            name="daily"
            type="number"
            step="0.01"
            min="0"
            defaultValue={model ? pln(model.dailyPriceGrosze) : ""}
            required
          />
          <Text
            label="Cena / miesiąc (zł)"
            name="monthly"
            type="number"
            step="0.01"
            min="0"
            defaultValue={model ? pln(model.monthlyPriceGrosze) : ""}
            required
          />
          <Text
            label="Kaucja (zł)"
            name="deposit"
            type="number"
            step="0.01"
            min="0"
            defaultValue={model ? pln(model.depositGrosze) : "0"}
          />
          <Text
            label="Limit km / doba"
            name="kmPerDayLimit"
            type="number"
            min="0"
            defaultValue={model?.kmPerDayLimit ?? 0}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="label text-xs text-ink">Prezentacja</legend>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Opis (PL)</span>
          <textarea
            name="descriptionPl"
            defaultValue={model?.descriptionPl ?? ""}
            rows={3}
            className="border-line-strong w-full border bg-surface-1 px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Opis (EN)</span>
          <textarea
            name="descriptionEn"
            defaultValue={model?.descriptionEn ?? ""}
            rows={3}
            className="border-line-strong w-full border bg-surface-1 px-3 py-2 text-sm text-ink"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Text
            label="Kolejność"
            name="sortOrder"
            type="number"
            min="0"
            defaultValue={model?.sortOrder ?? 0}
          />
          <label className="tap-block flex items-center gap-2 self-end pb-2">
            <input
              type="checkbox"
              name="published"
              defaultChecked={model?.published ?? true}
              className="accent-red size-4"
            />
            <span className="text-silver text-sm">
              Opublikowany (widoczny publicznie)
            </span>
          </label>
        </div>
      </fieldset>

      <div className="border-line flex items-center gap-4 border-t pt-6">
        <button
          type="submit"
          disabled={pending}
          className="label bg-red hover:bg-red-hover inline-flex h-11 items-center px-8 text-xs text-white transition-colors disabled:opacity-50"
        >
          {pending ? "Zapisywanie…" : model ? "Zapisz zmiany" : "Utwórz model"}
        </button>
        {state && !state.ok && (
          <span className="text-red text-sm">{state.error}</span>
        )}
        {state?.ok && (
          <span className="text-sm text-emerald-400">Zapisano ✓</span>
        )}
      </div>
    </form>
  );
}
