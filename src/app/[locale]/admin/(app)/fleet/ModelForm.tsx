"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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
import { pick, type Bilingual } from "@/lib/i18n-pick";
import {
  DRIVER_CLASSES,
  DRIVER_CLASS_LABEL,
} from "@/lib/fleet/driver-class";

type Action = (
  prev: FormResult | null,
  formData: FormData,
) => Promise<FormResult>;

/** Flatten a bilingual map to the request locale for the Select labels. */
function localized<K extends string>(
  map: Record<K, Bilingual>,
  locale: string,
): Record<K, string> {
  return Object.fromEntries(
    Object.entries<Bilingual>(map).map(([k, v]) => [k, pick(v, locale)]),
  ) as Record<K, string>;
}

function pln(grosze: number): string {
  return (grosze / 100).toString();
}

/** Symbol waluty w bieżącym locale (pl: „zł”, en: „PLN”). */
function currencySymbol(locale: string) {
  return (
    new Intl.NumberFormat(locale, { style: "currency", currency: "PLN" })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? "PLN"
  );
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
  const t = useTranslations("Admin.fleet");
  const locale = useLocale();
  const currency = currencySymbol(locale);
  const [state, formAction, pending] = useActionState(action, null);

  /** What each class is for, in the words an operator would use. */
  const driverClassHint: Record<(typeof DRIVER_CLASSES)[number], string> = {
    standard: t("driverClassHintStandard"),
    premium: t("driverClassHintPremium"),
    van_bus: t("driverClassHintVanBus"),
  };

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
        <legend className="label text-xs text-ink">{t("basicInfo")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={labelCls}>
              {t("brand")}<span className="text-red"> *</span>
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
              {t("modelName")}<span className="text-red"> *</span>
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
            <span className={labelCls}>{t("slug")}</span>
            <input
              name="slug"
              value={slug}
              // Kept raw while typing (so hyphens are possible); the server
              // normalises on submit, so anything here is accepted.
              onChange={(e) => setSlugOverride(e.target.value)}
              placeholder="bmw-740d"
              className={`${inputCls} font-mono`}
            />
            <span className="text-ink-faint text-[11px]">{t("slugHelp")}</span>
          </label>
          <Text
            label={t("year")}
            name="year"
            type="number"
            min="1990"
            defaultValue={model?.year}
            required
            placeholder="2024"
          />
          <Select
            label={t("segment")}
            name="category"
            options={CATEGORIES}
            labels={localized(CATEGORY_LABEL, locale)}
            defaultValue={model?.category}
          />
          <Text
            label={t("seats")}
            name="seats"
            type="number"
            min="1"
            defaultValue={model?.seats ?? 5}
            required
          />
          <Select
            label={t("gearbox")}
            name="gearbox"
            options={GEARBOXES}
            labels={localized(GEARBOX_LABEL, locale)}
            defaultValue={model?.gearbox}
          />
          <Select
            label={t("fuel")}
            name="fuel"
            options={FUELS}
            labels={localized(FUEL_LABEL, locale)}
            defaultValue={model?.fuel}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="label text-xs text-ink">{t("fleetClasses")}</legend>
        <p className="text-ink-faint text-[11px]">{t("fleetClassesIntro")}</p>
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
                <span className="text-sm text-ink">{pick(SEGMENT_LABEL[s], locale)}</span>
                <span className="text-ink-faint text-[11px]">
                  {pick(SEGMENT_HINT[s], locale)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="label text-xs text-ink">
          {t("driverClassHeading")}
        </legend>
        <p className="text-ink-faint text-[11px]">
          {t("driverClassIntroA")}{" "}
          <span className="text-silver">{t("rentalRulesPath")}</span>{" "}
          {t("driverClassIntroB")}
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
                  {pick(DRIVER_CLASS_LABEL[c], locale)}
                </span>
                <span className="text-ink-faint text-[11px]">
                  {driverClassHint[c]}
                </span>
              </span>
            </label>
          ))}
        </div>
        {model && !model.driverClass ? (
          <p className="text-[11px] text-amber-500">
            {t("driverClassMissing")}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="label text-xs text-ink">{t("pricing")}</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Text
            label={t("dailyPrice", { currency })}
            name="daily"
            type="number"
            step="0.01"
            min="0"
            defaultValue={model ? pln(model.dailyPriceGrosze) : ""}
            required
          />
          <Text
            label={t("monthlyPrice", { currency })}
            name="monthly"
            type="number"
            step="0.01"
            min="0"
            defaultValue={model ? pln(model.monthlyPriceGrosze) : ""}
            required
          />
          <Text
            label={t("deposit", { currency })}
            name="deposit"
            type="number"
            step="0.01"
            min="0"
            defaultValue={model ? pln(model.depositGrosze) : "0"}
          />
          <Text
            label={t("kmPerDayLimit")}
            name="kmPerDayLimit"
            type="number"
            min="0"
            defaultValue={model?.kmPerDayLimit ?? 0}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="label text-xs text-ink">{t("presentation")}</legend>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("descriptionPl")}</span>
          <textarea
            name="descriptionPl"
            defaultValue={model?.descriptionPl ?? ""}
            rows={3}
            className="border-line-strong w-full border bg-surface-1 px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("descriptionEn")}</span>
          <textarea
            name="descriptionEn"
            defaultValue={model?.descriptionEn ?? ""}
            rows={3}
            className="border-line-strong w-full border bg-surface-1 px-3 py-2 text-sm text-ink"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Text
            label={t("sortOrder")}
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
            <span className="text-silver text-sm">{t("publishedCheckbox")}</span>
          </label>
        </div>
      </fieldset>

      <div className="border-line flex items-center gap-4 border-t pt-6">
        <button
          type="submit"
          disabled={pending}
          className="label bg-red hover:bg-red-hover inline-flex h-11 items-center px-8 text-xs text-white transition-colors disabled:opacity-50"
        >
          {pending ? t("saving") : model ? t("saveChanges") : t("createModel")}
        </button>
        {state && !state.ok && (
          <span className="text-red text-sm">{state.error}</span>
        )}
        {state?.ok && (
          <span className="text-sm text-emerald-400">{t("saved")}</span>
        )}
      </div>
    </form>
  );
}
