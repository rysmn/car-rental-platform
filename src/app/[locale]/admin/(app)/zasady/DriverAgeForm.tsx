"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { saveDriverAgeRules, type SaveResult } from "./actions";
import { FALLBACK_MIN_AGE } from "@/lib/booking/driver-age-floor";
import type { RentalRules } from "@/lib/admin/rental-rules";
import { DRIVER_CLASSES, type DriverClass } from "@/lib/fleet/driver-class";

/**
 * Six switches and one master switch.
 *
 * The labels are OBOWIĄZUJE / NIE OBOWIĄZUJE rather than ON / OFF, and that is
 * not decoration. Everywhere else in this panel a switch answers "may the
 * assistant say this?"; here it answers "does this requirement apply?". Two
 * meanings on one page is how a rule ends up being read backwards, so the two
 * look different.
 */

function Feedback({ state }: { state: SaveResult | null }) {
  const t = useTranslations("Admin.rules");
  if (!state) return null;
  if (state.ok)
    return (
      <span className="text-xs text-emerald-400">
        {state.message ?? t("actions.saved")}
      </span>
    );
  return <span className="text-red text-xs">{state.error}</span>;
}

function Stamp({
  stamp,
}: {
  stamp: { updatedAt: string | null; updatedBy: string | null };
}) {
  const t = useTranslations("Admin.rules");
  const locale = useLocale();
  return (
    <p className="text-ink-faint mt-1 text-[10px]">
      {stamp.updatedAt
        ? `${t("stamp.lastChange", {
            date: new Date(stamp.updatedAt).toLocaleString(
              locale === "en" ? "en-GB" : "pl-PL",
              { dateStyle: "short", timeStyle: "short" },
            ),
          })}${stamp.updatedBy ? t("stamp.by", { name: stamp.updatedBy }) : ""}`
        : t("stamp.never")}
    </p>
  );
}

/** One requirement: a switch, a number, and what each state means. */
function Requirement({
  name,
  title,
  unit,
  min,
  defaultOn,
  defaultYears,
  whenOn,
  whenOff,
  stamp,
  note,
}: {
  name: string;
  title: string;
  unit: string;
  min: number;
  defaultOn: boolean;
  defaultYears: number | null;
  whenOn: string;
  whenOff: string;
  stamp: { updatedAt: string | null; updatedBy: string | null };
  note?: string;
}) {
  const t = useTranslations("Admin.rules");
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="border-line/60 border-b py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-3">
        <label className="tap-block flex items-center gap-3">
          <input
            type="checkbox"
            name={`${name}.required`}
            defaultChecked={defaultOn}
            onChange={(e) => setOn(e.target.checked)}
            className="h-4 w-4 shrink-0"
          />
          <span className="text-ink text-sm">{title}</span>
        </label>
        <span
          className={`label-tight rounded-pill px-2 py-0.5 text-[9px] whitespace-nowrap ${
            on
              ? "bg-emerald-500/15 text-emerald-400"
              : "border-line text-ink-faint border"
          }`}
        >
          {on ? t("requirement.applies") : t("requirement.doesNotApply")}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <input
            type="number"
            name={`${name}.years`}
            min={min}
            max={99}
            defaultValue={defaultYears ?? ""}
            placeholder="—"
            aria-label={t("requirement.yearsAria", { title })}
            className="border-line-strong bg-surface-1 text-ink h-9 w-20 border px-2 text-center text-sm"
          />
          <span className="text-ink-faint text-xs">{unit}</span>
        </span>
      </div>
      <p className="text-ink-faint mt-1 text-xs">{on ? whenOn : whenOff}</p>
      {note ? <p className="mt-1 text-[11px] text-amber-500">{note}</p> : null}
      <Stamp stamp={stamp} />
    </div>
  );
}

/**
 * A requirement that exists on paper and cannot be switched on yet.
 *
 * Rendered instead of a working switch rather than as a disabled copy of one,
 * because a greyed-out toggle invites somebody to look for the permission that
 * would enable it. There is none — the reservation form does not collect the
 * date a licence was issued, so no value here could ever be checked against
 * anything. The row stays visible so the requirement is not forgotten.
 */
function LockedRequirement({ title }: { title: string }) {
  const t = useTranslations("Admin.rules");
  return (
    <div className="border-line/60 border-b py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-ink-faint text-sm">{title}</span>
        <span className="label-tight border-line text-ink-faint rounded-pill border px-2 py-0.5 text-[9px] whitespace-nowrap">
          {t("licence.unavailable")}
        </span>
      </div>
      <p className="text-ink-faint mt-1 text-xs">{t("licence.note")}</p>
      <p className="mt-1 text-[11px] text-amber-500">{t("licence.locked")}</p>
    </div>
  );
}

export function DriverAgeForm({
  rules,
  counts,
  unassignedPublished,
}: {
  rules: RentalRules;
  /** How many cars sit in each class — a rule for nobody is worth knowing. */
  counts: Record<DriverClass, number>;
  /** Published cars with no class: enforcement stays locked while any exist. */
  unassignedPublished: number;
}) {
  const t = useTranslations("Admin.rules");
  const [state, action, pending] = useActionState(saveDriverAgeRules, null);
  const d = rules.driverAge;
  const [enforce, setEnforce] = useState(d.enforcement.inBookingForm);

  return (
    <form action={action} className="mt-4 grid gap-6">
      {DRIVER_CLASSES.map((key) => {
        const c = d.classes[key];
        return (
          <div key={key} className="border-line border p-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="label text-ink text-xs">{c.label}</h3>
              <span className="text-ink-faint text-[10px]">
                {t("classes.count", { count: counts[key] })} ·{" "}
                {t(`classIntro.${key}`)}
              </span>
            </div>

            <Requirement
              name={`${key}.age`}
              title={t("requirement.minAge")}
              unit={t("requirement.yearsUnit")}
              min={FALLBACK_MIN_AGE}
              defaultOn={c.minAge.required}
              defaultYears={c.minAge.years}
              stamp={c.minAge}
              whenOn={
                enforce
                  ? t("requirement.onEnforced", {
                      years: c.minAge.years ?? FALLBACK_MIN_AGE,
                    })
                  : t("requirement.onStored", {
                      years: c.minAge.years ?? FALLBACK_MIN_AGE,
                      min: FALLBACK_MIN_AGE,
                    })
              }
              whenOff={t("requirement.off", { min: FALLBACK_MIN_AGE })}
            />

            <LockedRequirement title={t("requirement.licenceTenure")} />
          </div>
        );
      })}

      <div className="border-line border border-l-2 border-l-amber-500 p-4">
        <label className="tap-block flex items-start gap-3">
          <input
            type="checkbox"
            name="enforceInBookingForm"
            defaultChecked={d.enforcement.inBookingForm}
            disabled={unassignedPublished > 0}
            onChange={(e) => setEnforce(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0"
          />
          <span className="min-w-0">
            <span className="text-ink text-sm">
              {t("enforce.label")}
            </span>
            <span className="text-ink-faint mt-1 block text-xs">
              {enforce
                ? t("enforce.on", { min: FALLBACK_MIN_AGE })
                : t("enforce.off", { min: FALLBACK_MIN_AGE })}
            </span>
            <span className="mt-2 block text-[11px] text-amber-500">
              {t("enforce.floorNote", { min: FALLBACK_MIN_AGE })}
            </span>
          </span>
        </label>
        {unassignedPublished > 0 ? (
          <p className="mt-2 pl-7 text-[11px] text-amber-500">
            {t("enforce.blocked", { count: unassignedPublished })}
          </p>
        ) : null}
        <div className="pl-7">
          <Stamp stamp={d.enforcement} />
        </div>
      </div>

      <div>
        <label className="label-tight text-ink-faint text-[10px]" htmlFor="driverAgeNotes">
          {t("notes.label")}
        </label>
        <textarea
          id="driverAgeNotes"
          name="driverAgeNotes"
          rows={2}
          defaultValue={d.notes}
          placeholder={t("notes.placeholder")}
          className="border-line-strong bg-surface-1 text-ink placeholder:text-ink-faint mt-1 w-full border px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="label-tight border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap inline-flex items-center border px-4 text-[10px] transition-colors disabled:opacity-50"
        >
          {pending ? t("actions.saving") : t("actions.saveRequirements")}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
