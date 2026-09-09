"use client";

import { useActionState } from "react";
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
  return (
    <div className="flex items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="label border-line-strong inline-flex h-10 items-center border px-5 text-xs text-ink transition-colors hover:border-ink hover:bg-ink/5 disabled:opacity-50"
      >
        {pending ? "Zapisywanie…" : "Zapisz"}
      </button>
      {state?.ok && (
        <span className="text-xs text-emerald-400">Zapisano ✓</span>
      )}
      {state && !state.ok && (
        <span className="text-red text-xs">{state.error}</span>
      )}
    </div>
  );
}

const FEE_LABEL: Record<string, string> = {
  extra_driver: "Dodatkowy kierowca",
  child_seat: "Fotelik dziecięcy",
  protection_package: "Pakiet ochronny",
  no_deposit: "Zniesienie kaucji",
};

export function ModelPriceRow({ model }: { model: PricingModel }) {
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
        label="1–2 dni"
        name="daily"
        defaultValue={pln(model.dailyPriceGrosze)}
        suffix="zł"
      />
      <Field
        label="3–6 dni"
        name="daily3to6"
        defaultValue={
          model.dailyPrice3to6Grosze === null
            ? ""
            : pln(model.dailyPrice3to6Grosze)
        }
        placeholder="—"
        suffix="zł"
      />
      <Field
        label="7–13 dni"
        name="daily7to13"
        defaultValue={
          model.dailyPrice7to13Grosze === null
            ? ""
            : pln(model.dailyPrice7to13Grosze)
        }
        placeholder="—"
        suffix="zł"
      />
      <Field
        label="14–29 dni"
        name="daily14to29"
        defaultValue={
          model.dailyPrice14to29Grosze === null
            ? ""
            : pln(model.dailyPrice14to29Grosze)
        }
        placeholder="—"
        suffix="zł"
      />
      <Field
        label="30+ dni (miesiąc)"
        name="monthly"
        defaultValue={pln(model.monthlyPriceGrosze)}
        suffix="zł"
      />
      <Field
        label="Kaucja"
        name="deposit"
        defaultValue={pln(model.depositGrosze)}
        suffix="zł"
      />
      <Field
        label="Limit km/dobę"
        name="kmPerDay"
        defaultValue={model.kmPerDayLimit}
        step="1"
        suffix="0 = ∞"
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
        label="Opłata za dodatkowy kilometr"
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
        suffix="zł/km ponad limit"
      />
      <SaveBar state={state} pending={pending} />
    </form>
  );
}

export function FeeRow({ fee }: { fee: PricingFee }) {
  const [state, action, pending] = useActionState(updateFee, null);
  return (
    <form
      action={action}
      className="border-line/60 flex flex-wrap items-end gap-4 border-b py-4 last:border-0"
    >
      <input type="hidden" name="id" value={fee.id} />
      <div className="min-w-40 flex-1">
        <p className="text-sm text-ink">{FEE_LABEL[fee.code] ?? fee.code}</p>
        <p className="text-ink-faint font-mono text-xs">{fee.code}</p>
      </div>
      <Field
        label="Kwota"
        name="amount"
        defaultValue={pln(fee.amountGrosze)}
        suffix="zł"
      />
      <label className="flex flex-col gap-1">
        <span className="label-tight text-ink-faint text-[10px]">
          Naliczanie
        </span>
        <select
          name="unit"
          defaultValue={fee.unit}
          className="border-line-strong h-10 border bg-surface-1 px-2 text-sm text-ink"
        >
          <option value="per_rental">za najem</option>
          <option value="per_day">za dobę</option>
        </select>
      </label>
      <label className="tap-block flex h-10 items-center gap-2 self-end">
        <input
          type="checkbox"
          name="active"
          defaultChecked={fee.active}
          className="accent-red size-4"
        />
        <span className="text-silver text-xs">Aktywna</span>
      </label>
      <SaveBar state={state} pending={pending} />
    </form>
  );
}

export function LocationRow({ location }: { location: PricingLocation }) {
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
        label="Opłata"
        name="fee"
        defaultValue={pln(location.feeGrosze)}
        suffix="zł"
      />
      <label className="tap-block flex h-10 items-center gap-2 self-end">
        <input
          type="checkbox"
          name="active"
          defaultChecked={location.active}
          className="accent-red size-4"
        />
        <span className="text-silver text-xs">Aktywna</span>
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
  const [state, action, pending] = useActionState(
    updateCancellationPolicy,
    null,
  );
  return (
    <form action={action} className="space-y-4 py-4">
      <div className="flex flex-wrap items-end gap-4">
        <Field
          label="Bezpłatne anulowanie do"
          name="freeHours"
          defaultValue={policy.freeHours}
          step="1"
          suffix="h przed odbiorem"
        />
        <Field
          label="Drugi próg"
          name="lateHours"
          defaultValue={policy.lateHours}
          step="1"
          suffix="h przed odbiorem"
        />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <Field
          label="Opłata między progami"
          name="tier1"
          defaultValue={pln(policy.tier1Grosze)}
          suffix="zł"
        />
        <Field
          label="Opłata poniżej drugiego progu"
          name="tier2"
          defaultValue={pln(policy.tier2Grosze)}
          suffix="zł"
        />
        <Field
          label="Nieodebranie auta"
          name="noShow"
          defaultValue={pln(policy.noShowGrosze)}
          suffix="zł"
        />
        <Field
          label="Tolerancja nieodebrania"
          name="noShowGraceMinutes"
          defaultValue={policy.noShowGraceMinutes}
          step="1"
          suffix="min po godzinie odbioru"
        />
      </div>
      <p className="text-ink-faint text-xs leading-relaxed">
        <strong className="text-silver">
          Zmiana progów 24 h / 12 h wymaga też poprawienia §5 Regulaminu
        </strong>{" "}
        — dokument prawny wymienia je z nazwy i nie czyta tej konfiguracji.
        Kwoty są bezpieczne: Regulamin odsyła po nie do rezerwacji i cennika.{" "}
        Opłata nigdy nie przekracza wartości rezerwacji — rezerwacja za 300 zł
        i nieodebranie wycenione na 500 zł daje 300 zł. Zmiana działa wyłącznie
        na nowe rezerwacje: już zawarte mają zapisane własne zasady i rozliczą
        się według nich. Nieodebranie oznacza obsługa ręcznie, po upływie
        tolerancji — nic nie nalicza się samo.
      </p>
      <SaveBar state={state} pending={pending} />
    </form>
  );
}
