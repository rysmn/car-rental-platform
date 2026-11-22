"use client";

import { pick } from "@/lib/i18n-pick";
import { useActionState, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  createCar,
  updateCar,
  deleteCar,
  advancePrep,
  type FormResult,
} from "./actions";
import type { FleetUnit } from "@/lib/admin/fleet";
import type { CarExpenseRow } from "@/lib/admin/expenses";
import {
  CAR_STATUSES,
  CAR_STATUS_LABEL,
  PREP_STATUSES,
  PREP_STATUS_LABEL,
  PREP_STATUS_HINT,
  nextPrepStatus,
} from "@/lib/admin/fleet-options";
import { ExpenseManager } from "./ExpenseManager";
import { RecurringManager } from "./RecurringManager";
import type { RecurringRow } from "@/lib/admin/recurring-options";
import { SHOP_CURRENCY } from "@/lib/currency/shop";

const inputCls =
  "h-10 w-full border border-line-strong bg-surface-1 px-3 text-sm text-ink placeholder:text-ink-faint";
const labelCls = "label-tight text-[10px] text-ink-faint";

/** Symbol waluty w bieżącym locale (pl: „zł”, en: „PLN”). */
function currencySymbol(locale: string) {
  return (
    new Intl.NumberFormat(locale, { style: "currency", currency: SHOP_CURRENCY })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? SHOP_CURRENCY
  );
}

function UnitFields({ unit }: { unit?: FleetUnit }) {
  const t = useTranslations("Admin.fleet");
  const locale = useLocale();
  const currency = currencySymbol(locale);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="flex flex-col gap-1">
        <span className={labelCls}>{t("plate")} *</span>
        <input
          name="plate"
          defaultValue={unit?.plate}
          required
          placeholder="WA 12345"
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>VIN *</span>
        <input
          name="vin"
          defaultValue={unit?.vin}
          required
          placeholder="WBA…"
          className={`${inputCls} font-mono`}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>{t("mileage")}</span>
        <input
          name="mileageKm"
          type="number"
          min="0"
          defaultValue={unit?.mileageKm ?? 0}
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>{t("status")}</span>
        <select
          name="status"
          defaultValue={unit?.status ?? "available"}
          className={inputCls}
        >
          {CAR_STATUSES.map((s) => (
            <option key={s} value={s}>
              {pick(CAR_STATUS_LABEL[s], locale)}
            </option>
          ))}
        </select>
      </label>
      {/* Turnaround, separate from Status on purpose: Status says whether the
          car may be rented at all, this says whether it is presentable right
          now. "Nie śledzone" is the honest default and does not gate anything —
          a car mid-wash stays bookable. */}
      <label className="flex flex-col gap-1">
        <span className={labelCls}>{t("prep")}</span>
        <select
          name="prepStatus"
          defaultValue={unit?.prepStatus ?? ""}
          className={inputCls}
        >
          <option value="">{t("prepNotTracked")}</option>
          {PREP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {pick(PREP_STATUS_LABEL[s], locale)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>{t("prepNote")}</span>
        <input
          name="prepNote"
          maxLength={200}
          defaultValue={unit?.prepNote ?? ""}
          placeholder={t("prepNotePlaceholder")}
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>{t("registeredOn")}</span>
        <input
          name="registeredOn"
          type="date"
          defaultValue={unit?.registeredOn ?? ""}
          className={inputCls}
        />
      </label>
      {/* Two policies, two dates: OC lapses on its own schedule and AC on
          another, and one field for both hid whichever expired second. */}
      <label className="flex flex-col gap-1">
        <span className={labelCls}>{t("ocExpiry")}</span>
        <input
          name="insuranceExpiry"
          type="date"
          defaultValue={unit?.insuranceExpiry ?? ""}
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>{t("acExpiry")}</span>
        <input
          name="acExpiry"
          type="date"
          defaultValue={unit?.acExpiry ?? ""}
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>{t("inspectionExpiry")}</span>
        <input
          name="inspectionExpiry"
          type="date"
          defaultValue={unit?.inspectionExpiry ?? ""}
          className={inputCls}
        />
      </label>
      {/* A plan, not a deadline: when the garage is booked. Feeds the same
          five-day reminder as the two dates above. */}
      <label className="flex flex-col gap-1">
        <span className={labelCls}>{t("serviceDue")}</span>
        <input
          name="serviceDue"
          type="date"
          defaultValue={unit?.serviceDue ?? ""}
          className={inputCls}
        />
      </label>
      {/* Service by distance. A date alone cannot say "serwis za 1 200 km" —
          a car doing 4 000 km a month and one doing 400 wear out on the same
          date and at completely different mileages. */}
      <label className="flex flex-col gap-1">
        <span className={labelCls}>{t("serviceInterval")}</span>
        <input
          name="serviceIntervalKm"
          inputMode="numeric"
          placeholder={t("eg", { example: "15000" })}
          defaultValue={unit?.serviceIntervalKm ?? ""}
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>{t("lastServiceKm")}</span>
        <input
          name="lastServiceKm"
          inputMode="numeric"
          defaultValue={unit?.lastServiceKm ?? ""}
          className={inputCls}
        />
      </label>
      {/* Oil runs on its own, shorter clock than the full service. */}
      <label className="flex flex-col gap-1">
        <span className={labelCls}>{t("oilInterval")}</span>
        <input
          name="oilIntervalKm"
          inputMode="numeric"
          placeholder={t("eg", { example: "10000" })}
          defaultValue={unit?.oilIntervalKm ?? ""}
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>{t("lastOilKm")}</span>
        <input
          name="lastOilKm"
          inputMode="numeric"
          defaultValue={unit?.lastOilKm ?? ""}
          className={inputCls}
        />
      </label>
      {/* Which tyres are ON the car — stated, not computed from the date.
          The alert exists precisely for the case where the season turned and
          nobody swapped them; a self-computing field would never warn. */}
      <label className="flex flex-col gap-1">
        <span className={labelCls}>{t("tyresFitted")}</span>
        <select
          name="tyresFitted"
          defaultValue={unit?.tyresFitted ?? ""}
          className={inputCls}
        >
          <option value="">{t("tyresNotGiven")}</option>
          <option value="summer">{t("tyresSummer")}</option>
          <option value="winter">{t("tyresWinter")}</option>
          <option value="all_season">{t("tyresAllSeason")}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>{t("tyresChangedOn")}</span>
        <input
          name="tyresChangedOn"
          type="date"
          defaultValue={unit?.tyresChangedOn ?? ""}
          className={inputCls}
        />
      </label>
      {/* The two fields the payback maths needs. Left empty, the car still gets
          margin and utilisation — it just reports "brak ceny zakupu" instead of
          a break-even date, which is the honest answer. */}
      <label className="flex flex-col gap-1">
        <span className={labelCls}>
          {t("purchasePrice", { currency })}
        </span>
        <input
          name="purchasePrice"
          inputMode="decimal"
          defaultValue={
            unit?.purchasePriceGrosze != null
              ? (unit.purchasePriceGrosze / 100).toFixed(2)
              : ""
          }
          placeholder="185 000"
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>{t("purchasedOn")}</span>
        <input
          name="purchasedOn"
          type="date"
          defaultValue={unit?.purchasedOn ?? ""}
          className={inputCls}
        />
      </label>
      {/* Depreciation. Usually the largest cost of owning a car and it never
          arrives as an invoice, so without these two fields the analytics
          report a margin the business does not actually have. */}
      <label className="flex flex-col gap-1">
        <span className={labelCls}>
          {t("residualValue", { currency })}
        </span>
        <input
          name="residualValue"
          inputMode="decimal"
          defaultValue={
            unit?.residualValueGrosze != null
              ? (unit.residualValueGrosze / 100).toFixed(2)
              : ""
          }
          placeholder="60 000"
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>{t("depreciationMonths")}</span>
        <input
          name="depreciationMonths"
          type="number"
          min="1"
          max="600"
          defaultValue={unit?.depreciationMonths ?? ""}
          placeholder="60"
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1 lg:col-span-1">
        <span className={labelCls}>{t("notes")}</span>
        <input
          name="notes"
          defaultValue={unit?.notes ?? ""}
          className={inputCls}
        />
      </label>
    </div>
  );
}

function Feedback({ state }: { state: FormResult | null }) {
  const t = useTranslations("Admin.fleet");
  if (!state) return null;
  if (state.ok)
    return <span className="text-xs text-emerald-400">{t("saved")}</span>;
  return <span className="text-red text-xs">{state.error}</span>;
}

export function UnitRow({
  unit,
  expenses,
  recurring,
  damages = [],
}: {
  unit: FleetUnit;
  expenses: CarExpenseRow[];
  recurring: RecurringRow[];
  /** Otwarte szkody TEGO egzemplarza — zamknięte tu nie należą. */
  damages?: { id: string; title: string; statusLabel: string }[];
}) {
  const t = useTranslations("Admin.fleet");
  const [state, action, pending] = useActionState(updateCar, null);
  const [deleting, startDelete] = useTransition();
  const [delError, setDelError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const doDelete = () => {
    setDelError(null);
    startDelete(async () => {
      const res = await deleteCar(unit.id);
      if (!res.ok) {
        setDelError(res.error);
        setConfirm(false);
      }
      // on success the row is revalidated away by the server
    });
  };

  return (
    // The expense panel is a SIBLING of the unit form, never a child: it
    // contains forms of its own, and a nested <form> is invalid HTML that
    // browsers resolve by silently dropping the inner one.
    <div className="border-line/60 border-b py-5 last:border-0">
      {/* Sibling of the form, not a child — it has a button of its own, and a
          nested form is invalid HTML the browser silently drops. */}
      <PrepStrip unit={unit} />
      {damages.length > 0 && (
        // Aktywna szkoda przy aucie — punkt 6 zamówienia. Czerwień, bo to jest
        // jedyny stan egzemplarza, o którym trzeba wiedzieć PRZED wydaniem go
        // klientowi, a nie przy najbliższej okazji.
        <ul className="border-red/40 bg-red/10 mb-3 border px-3 py-2">
          {damages.map((d) => (
            <li key={d.id} className="text-sm">
              <a
                href={`/admin/szkody/${d.id}`}
                className="text-ink tap-area -my-1 inline-block py-1 underline-offset-4 hover:underline"
              >
                {t("damageLink", { title: d.title })}
              </a>
              <span className="text-ink-faint ml-2 text-xs">{d.statusLabel}</span>
            </li>
          ))}
        </ul>
      )}
      <form action={action}>
        <input type="hidden" name="id" value={unit.id} />
        <input type="hidden" name="modelId" value={unit.modelId} />
        <UnitFields unit={unit} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="label border-line-strong inline-flex h-9 items-center border px-4 text-xs text-ink transition-colors hover:border-ink hover:bg-ink/5 disabled:opacity-50"
          >
            {pending ? t("saving") : t("save")}
          </button>
          {confirm ? (
            <>
              <span className="text-silver text-xs">{t("confirmQuestion")}</span>
              <button
                type="button"
                onClick={doDelete}
                disabled={deleting}
                className="label border-red text-red hover:bg-red inline-flex h-9 items-center border px-4 text-xs transition-colors hover:text-ink disabled:opacity-50"
              >
                {deleting ? t("deleting") : t("confirmYes")}
              </button>
              <button
                type="button"
                onClick={() => setConfirm(false)}
                className="text-ink-faint text-xs hover:text-ink"
              >
                {t("cancel")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className="label text-ink-faint hover:text-red tap inline-flex h-9 items-center px-2 text-xs transition-colors"
            >
              {t("remove")}
            </button>
          )}
          <Feedback state={state} />
          {delError && <span className="text-red text-xs">{delError}</span>}
        </div>
      </form>
      <div className="mt-5">
        <ExpenseManager
          carId={unit.id}
          plate={unit.plate}
          expenses={expenses}
        />
      </div>
      <div className="mt-4">
        <RecurringManager carId={unit.id} items={recurring} />
      </div>
    </div>
  );
}

/**
 * One-tap turnaround strip: where the car is in the chain, and the next step.
 *
 * Deliberately above the unit form and not inside it. This is the thing an
 * operator taps in a car park with a phone in one hand; making them open a
 * twenty-field form to change one dropdown is how a feature goes unused.
 *
 * A car nobody is tracking shows a single button that starts the chain, so the
 * common case — "wróciło, zaczynam kontrolę" — is also one tap.
 */
function PrepStrip({ unit }: { unit: FleetUnit }) {
  const t = useTranslations("Admin.fleet");
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const current = unit.prepStatus;
  const next = current ? nextPrepStatus(current) : PREP_STATUSES[0];

  const advance = () => {
    setError(null);
    start(async () => {
      const res = await advancePrep(unit.id);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="label-tight text-[10px] text-ink-faint">
        {t("prep")}
      </span>
      {current ? (
        <span
          className={`label-tight rounded-pill border px-2 py-0.5 text-[10px] ${
            current === "ready"
              ? "border-emerald-400/50 text-emerald-400"
              : "border-amber-500/50 text-amber-500"
          }`}
          title={pick(PREP_STATUS_HINT[current], locale)}
        >
          {pick(PREP_STATUS_LABEL[current], locale)}
        </span>
      ) : (
        <span className="text-ink-faint text-xs">{t("prepNotTrackedInline")}</span>
      )}
      {unit.prepNote && (
        <span className="text-silver text-xs">· {unit.prepNote}</span>
      )}
      {next && (
        <button
          type="button"
          onClick={advance}
          disabled={pending}
          className="label border-line-strong tap inline-flex h-9 items-center border px-3 text-xs text-ink transition-colors hover:border-ink hover:bg-ink/5 disabled:opacity-50"
        >
          {pending ? t("saving") : `→ ${pick(PREP_STATUS_LABEL[next], locale)}`}
        </button>
      )}
      {error && <span className="text-red text-xs">{error}</span>}
    </div>
  );
}

export function AddUnit({ modelId }: { modelId: string }) {
  const t = useTranslations("Admin.fleet");
  const [state, action, pending] = useActionState(createCar, null);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="label border-line-strong inline-flex h-10 items-center border px-5 text-xs text-ink transition-colors hover:border-ink hover:bg-ink/5"
      >
        {t("addUnit")}
      </button>
    );
  }

  return (
    <form
      action={action}
      className="border-line-strong bg-graphite/60 border p-5"
    >
      <input type="hidden" name="modelId" value={modelId} />
      <p className="label mb-4 text-xs text-ink">{t("newUnit")}</p>
      <UnitFields />
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="label bg-red hover:bg-red-hover inline-flex h-9 items-center px-5 text-xs text-white transition-colors disabled:opacity-50"
        >
          {pending ? t("adding") : t("add")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-ink-faint text-xs hover:text-ink"
        >
          {t("cancel")}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
