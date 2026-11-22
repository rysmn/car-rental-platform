"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { type SaveResult, updateCancellationPolicy, updateFee, updateModelPricing, updatePickupLocation } from "./actions";
import type { CancellationPolicy } from "@/lib/booking/cancellation";
import type {
  PricingModel,
  PricingFee,
  PricingLocation,
} from "@/lib/admin/pricing";

/** integer grosze → editable złoty string ("45000" → "450", "45050" → "450.5") */
function pln(grosze: number): string {
  return (grosze / 100).toString();
}

function Field({
  label,
  name,
  defaultValue,
  step = "0.01",
  suffix,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue: string | number;
  step?: string;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label-tight text-ink-faint text-[10px]">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          step={step}
          min="0"
          className="border-line-strong h-10 w-24 border bg-surface-1 px-2 text-sm text-ink"
        />
        {suffix && <span className="text-ink-faint text-xs">{suffix}</span>}
      </span>
    </label>
  );
}

function SaveBar({
  state,
  pending,
}: {
  state: SaveResult | null;
  pending: boolean;
}) {
  const t = useTranslations("Admin.pricing");
  return (
    <div className="flex items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="label border-line-strong inline-flex h-10 items-center border px-5 text-xs text-ink transition-colors hover:border-ink hover:bg-ink/5 disabled:opacity-50"
      >
        {pending ? t("actions.saving") : t("actions.save")}
      </button>
      {state?.ok && (
        <span className="text-xs text-emerald-400">{t("actions.saved")}</span>
      )}
      {state && !state.ok && (
        <span className="text-red text-xs">{state.error}</span>
      )}
    </div>
  );
}

const FEE_CODES = [
  "extra_driver",
  "child_seat",
  "protection_package",
  "no_deposit",
] as const;

export function ModelPriceRow({ model }: { model: PricingModel }) {
  const t = useTranslations("Admin.pricing");
  const c = t("currency");
  const [state, action, pending] = useActionState(updateModelPricing, null);
  return (
    <form
      action={action}
      className="border-line/60 flex flex-wrap items-end gap-4 border-b py-4 last:border-0"
    >
      <input type="hidden" name="id" value={model.id} />
      <div className="min-w-40 flex-1">
        <p className="text-sm text-ink">
          {model.brand} {model.model}
        </p>
        <p className="text-ink-faint text-xs">{model.year}</p>
      </div>
      <Field
        label={t("car.tier1")}
        name="daily"
        defaultValue={pln(model.dailyPriceGrosze)}
        suffix={c}
      />
      <Field
        label={t("car.tier2")}
        name="daily3to6"
        defaultValue={
          model.dailyPrice3to6Grosze === null
            ? ""
            : pln(model.dailyPrice3to6Grosze)
        }
        placeholder="—"
        suffix={c}
      />
      <Field
        label={t("car.tier3")}
        name="daily7to13"
        defaultValue={
          model.dailyPrice7to13Grosze === null
            ? ""
            : pln(model.dailyPrice7to13Grosze)
        }
        placeholder="—"
        suffix={c}
      />
      <Field
        label={t("car.tier4")}
        name="daily14to29"
        defaultValue={
          model.dailyPrice14to29Grosze === null
            ? ""
            : pln(model.dailyPrice14to29Grosze)
        }
        placeholder="—"
        suffix={c}
      />
      <Field
        label={t("car.monthly")}
        name="monthly"
        defaultValue={pln(model.monthlyPriceGrosze)}
        suffix={c}
      />
      <Field
        label={t("car.deposit")}
        name="deposit"
        defaultValue={pln(model.depositGrosze)}
        suffix={c}
      />
      <Field
        label={t("car.kmPerDay")}
        name="kmPerDay"
        defaultValue={model.kmPerDayLimit}
        step="1"
        suffix={t("car.kmUnlimited")}
      />
      {/*
        Opłata za dodatkowy kilometr — TU i tylko tu właściciel ją ustawia.

        Stoi obok limitu kilometrów, bo to jedna decyzja rozpisana na dwa pola:
        ile kilometrów jest w cenie i ile kosztuje każdy następny. Rozdzielenie
        ich po dwóch ekranach kończy się zmianą jednego bez drugiego.

        Puste pole to NIE zero — to „stawki nie ustawiono". Wtedy strona,
        asystent i rozliczenie zwrotu nie pokazują nic i nic nie naliczają.
        Wpisanie zera panel odrzuci, bo „0,00 zł/km" jest obietnicą darmowego
        nadprzebiegu, a nie brakiem danych.
      */}
      <Field
        label={t("car.extraMileage")}
        name="extraMileage"
        /*
          Dwa miejsca po przecinku w polu, nie „4.5".
          `pln()` daje najkrótszy zapis liczby i dla okrągłych cen („450") jest
          to zaletą. Stawka za kilometr jest kwotą groszową i „4.5" wygląda
          przy niej na urwane — a to jedyne pole tego formularza, w którym
          grosze są regułą, a nie wyjątkiem.
        */
        defaultValue={
          model.extraMileageFeeGrosze === null
            ? ""
            : (model.extraMileageFeeGrosze / 100).toFixed(2)
        }
        placeholder="—"
        suffix={t("car.extraMileageSuffix")}
      />
      <SaveBar state={state} pending={pending} />
    </form>
  );
}

export function FeeRow({ fee }: { fee: PricingFee }) {
  const t = useTranslations("Admin.pricing");
  const c = t("currency");
  const [state, action, pending] = useActionState(updateFee, null);
  const known = (FEE_CODES as readonly string[]).includes(fee.code);
  return (
    <form
      action={action}
      className="border-line/60 flex flex-wrap items-end gap-4 border-b py-4 last:border-0"
    >
      <input type="hidden" name="id" value={fee.id} />
      <div className="min-w-40 flex-1">
        <p className="text-sm text-ink">
          {known
            ? t(`fees.names.${fee.code as (typeof FEE_CODES)[number]}`)
            : fee.code}
        </p>
        <p className="text-ink-faint font-mono text-xs">{fee.code}</p>
      </div>
      <Field
        label={t("fees.amount")}
        name="amount"
        defaultValue={pln(fee.amountGrosze)}
        suffix={c}
      />
      <label className="flex flex-col gap-1">
        <span className="label-tight text-ink-faint text-[10px]">
          {t("fees.unit")}
        </span>
        <select
          name="unit"
          defaultValue={fee.unit}
          className="border-line-strong h-10 border bg-surface-1 px-2 text-sm text-ink"
        >
          <option value="per_rental">{t("fees.perRental")}</option>
          <option value="per_day">{t("fees.perDay")}</option>
        </select>
      </label>
      <label className="tap-block flex h-10 items-center gap-2 self-end">
        <input
          type="checkbox"
          name="active"
          defaultChecked={fee.active}
          className="accent-red size-4"
        />
        <span className="text-silver text-xs">{t("active")}</span>
      </label>
      <SaveBar state={state} pending={pending} />
    </form>
  );
}

export function LocationRow({ location }: { location: PricingLocation }) {
  const t = useTranslations("Admin.pricing");
  const c = t("currency");
  const [state, action, pending] = useActionState(updatePickupLocation, null);
  return (
    <form
      action={action}
      className="border-line/60 flex flex-wrap items-end gap-4 border-b py-4 last:border-0"
    >
      <input type="hidden" name="id" value={location.id} />
      <div className="min-w-40 flex-1">
        <p className="text-sm text-ink">{location.name}</p>
        <p className="text-ink-faint font-mono text-xs">{location.slug}</p>
      </div>
      <Field
        label={t("locations.fee")}
        name="fee"
        defaultValue={pln(location.feeGrosze)}
        suffix={c}
      />
      <label className="tap-block flex h-10 items-center gap-2 self-end">
        <input
          type="checkbox"
          name="active"
          defaultChecked={location.active}
          className="accent-red size-4"
        />
        <span className="text-silver text-xs">{t("active")}</span>
      </label>
      <SaveBar state={state} pending={pending} />
    </form>
  );
}

/**
 * Polityka anulowania — jeden formularz na całą sekcję, nie sześć osobnych.
 *
 * Sześć pól opisuje JEDNĄ zasadę i muszą być spójne między sobą (drugi próg
 * nie wyżej niż bezpłatny, bliżej odbioru nie taniej). Zapisywanie ich
 * pojedynczo pozwalałoby zostawić konfigurację w stanie przejściowym, którego
 * schemat nie dopuszcza — i pierwsze pole odbijałoby się od walidacji, dopóki
 * nie zmieniono by drugiego.
 */
export function CancellationPolicyForm({
  policy,
}: {
  policy: CancellationPolicy;
}) {
  const t = useTranslations("Admin.pricing");
  const c = t("currency");
  const [state, action, pending] = useActionState(
    updateCancellationPolicy,
    null,
  );
  const hours = t("cancellation.hoursBeforePickup");
  return (
    <form action={action} className="space-y-4 py-4">
      <div className="flex flex-wrap items-end gap-4">
        <Field
          label={t("cancellation.freeUntil")}
          name="freeHours"
          defaultValue={policy.freeHours}
          step="1"
          suffix={hours}
        />
        <Field
          label={t("cancellation.secondThreshold")}
          name="lateHours"
          defaultValue={policy.lateHours}
          step="1"
          suffix={hours}
        />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <Field
          label={t("cancellation.tier1")}
          name="tier1"
          defaultValue={pln(policy.tier1Grosze)}
          suffix={c}
        />
        <Field
          label={t("cancellation.tier2")}
          name="tier2"
          defaultValue={pln(policy.tier2Grosze)}
          suffix={c}
        />
        <Field
          label={t("cancellation.noShow")}
          name="noShow"
          defaultValue={pln(policy.noShowGrosze)}
          suffix={c}
        />
        <Field
          label={t("cancellation.noShowGrace")}
          name="noShowGraceMinutes"
          defaultValue={policy.noShowGraceMinutes}
          step="1"
          suffix={t("cancellation.minutesAfterPickup")}
        />
      </div>
      <p className="text-ink-faint text-xs leading-relaxed">
        <strong className="text-silver">{t("cancellation.noteTitle")}</strong>{" "}
        {t("cancellation.noteBody")}
      </p>
      <SaveBar state={state} pending={pending} />
    </form>
  );
}
