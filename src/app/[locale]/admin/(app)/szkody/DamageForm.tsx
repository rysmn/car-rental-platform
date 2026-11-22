"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  createDamage,
  updateDamage,
  type DamageResult,
} from "./actions";
import {
  DAMAGE_STATUSES,
  type DamageRecord,
  type DamageStatus,
} from "@/lib/admin/damage-options";

const inputCls =
  "h-11 w-full border border-line-strong bg-surface-1 px-3 text-sm text-ink";
const labelCls = "label-tight text-[10px] text-ink-faint";

/**
 * Jedna szkoda: auto, najem, koszt i to, kto płaci.
 *
 * Klient NIE jest polem formularza — bierze się z najmu. Szkoda należy do
 * tego, kto miał auto, a pozwolenie na wpisanie innego nazwiska to najprostsza
 * droga do naprawy w cudzej historii; a historia klienta jest jedynym miejscem
 * w tym panelu, gdzie pomyłka chodzi za człowiekiem latami.
 */
export function DamageForm({
  cars,
  reservations,
  existing,
}: {
  cars: { id: string; label: string }[];
  reservations: { id: string; label: string; carId: string }[];
  existing: DamageRecord | null;
}) {
  const t = useTranslations("Admin.damages");
  const router = useRouter();
  const [state, submit, pending] = useActionState<DamageResult | null, FormData>(
    existing ? updateDamage : createDamage,
    null,
  );
  const [carId, setCarId] = useState(existing?.carId ?? cars[0]?.id ?? "");
  const [status, setStatus] = useState<DamageStatus>(
    existing?.status ?? "reported",
  );
  const [insurer, setInsurer] = useState(existing?.insurer ?? "");

  if (state?.ok && state.id && !existing) router.push(`/admin/szkody/${state.id}`);

  // Najmy tego auta — lista wszystkich rezerwacji floty byłaby nie do
  // przejrzenia, a szkoda i tak może należeć wyłącznie do najmu tego auta.
  const forCar = reservations.filter((r) => r.carId === carId);

  return (
    <form action={submit} className="space-y-5">
      {existing && <input type="hidden" name="id" value={existing.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("form.car")}</span>
          <select
            name="carId"
            value={carId}
            onChange={(e) => setCarId(e.target.value)}
            className={inputCls}
          >
            {cars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("form.rental")}</span>
          <select
            name="reservationId"
            defaultValue={existing?.reservationId ?? ""}
            className={inputCls}
          >
            <option value="">{t("form.noRental")}</option>
            {forCar.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <span className="text-ink-faint text-[11px]">{t("form.rentalHint")}</span>
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("form.occurredOn")}</span>
          <input
            type="date"
            name="occurredOn"
            defaultValue={
              existing?.occurredOn ?? new Date().toISOString().slice(0, 10)
            }
            className={inputCls}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("form.status")}</span>
          <select
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as DamageStatus)}
            className={inputCls}
          >
            {DAMAGE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
          <span className="text-ink-faint text-[11px]">
            {t(`statusHint.${status}`)}
          </span>
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className={labelCls}>{t("form.title")}</span>
        <input
          name="title"
          defaultValue={existing?.title ?? ""}
          placeholder={t("form.titlePlaceholder")}
          className={inputCls}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelCls}>{t("form.description")}</span>
        <textarea
          name="description"
          rows={4}
          defaultValue={existing?.description ?? ""}
          placeholder={t("form.descriptionPlaceholder")}
          className="border-line-strong bg-surface-1 text-ink w-full border px-3 py-2 text-sm"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("form.repairCost")}</span>
          <input
            name="repairCost"
            inputMode="decimal"
            defaultValue={
              existing ? (existing.repairCostGrosze / 100).toFixed(2) : ""
            }
            placeholder="0"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("form.excess")}</span>
          <input
            name="excess"
            inputMode="decimal"
            defaultValue={
              existing ? (existing.excessGrosze / 100).toFixed(2) : ""
            }
            placeholder="0"
            className={inputCls}
          />
          <span className="text-ink-faint text-[11px]">
            {insurer.trim() ? t("form.excessHintInsurer") : t("form.excessHintNone")}
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("form.insurer")}</span>
          <input
            name="insurer"
            value={insurer}
            onChange={(e) => setInsurer(e.target.value)}
            placeholder={t("form.insurerPlaceholder")}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{t("form.claimNumber")}</span>
          <input
            name="claimNumber"
            defaultValue={existing?.claimNumber ?? ""}
            className={inputCls}
          />
        </label>
      </div>

      {state && !state.ok && <p className="text-red text-sm">{state.error}</p>}
      {state?.ok && existing && (
        <p className="text-sm text-emerald-400">{t("form.saved")}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="label bg-red hover:bg-red-hover inline-flex h-12 items-center px-6 text-xs text-white transition-colors disabled:opacity-60"
      >
        {pending
          ? t("form.saving")
          : existing
            ? t("form.submitUpdate")
            : t("form.submitCreate")}
      </button>
    </form>
  );
}
