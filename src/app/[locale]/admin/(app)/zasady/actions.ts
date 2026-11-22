"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/auth/audit";
import { getSetting, setSetting } from "@/lib/admin/settings";
import {
  FALLBACK_MIN_AGE,
  type RentalRules,
} from "@/lib/admin/rental-rules";
import { DRIVER_CLASSES, isDriverClass } from "@/lib/fleet/driver-class";
import { listDriverClasses, setDriverClasses } from "@/lib/admin/fleet";

export type SaveResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

async function genericError(): Promise<SaveResult> {
  const t = await getTranslations("Admin.rules");
  return { ok: false, error: t("errors.generic") };
}

/**
 * A rule change reaches the FAQ page and the assistant on the next request, so
 * the whole public tree is revalidated rather than one path — the same choice
 * the settings actions make, for the same reason.
 */
function revalidateEverywhere() {
  revalidatePath("/", "layout");
  revalidatePath("/admin/zasady");
}

/** Who and when, stamped on the rule the administrator actually touched. */
function stamp(admin: { name: string | null; email: string }) {
  return {
    updatedAt: new Date().toISOString(),
    updatedBy: admin.name?.trim() || admin.email,
  };
}

const checked = (form: FormData, name: string) => form.get(name) === "on";

/**
 * The three document switches, saved together.
 *
 * Together rather than one endpoint each because they are one decision in the
 * administrator's head — they sit under one heading and one Save button, and
 * three separate writes would mean three audit rows for one action.
 *
 * Every switch here answers "may we tell a customer this?". Turning one off
 * does not assert the opposite: `documentsStatements` simply stops producing
 * that sentence, and the assistant falls back to referring the customer to a
 * person. That is the owner's rule of 2026-08-20 and the whole reason the flag
 * is not called `accepted`.
 */
export async function saveDocumentRules(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  const admin = await requirePermission("zasady.zmien");

  try {
    const before = await getSetting("rentalRules");
    const s = stamp(admin);

    const next: RentalRules = {
      ...before,
      documents: {
        mobywatel: { ...before.documents.mobywatel, enabled: checked(formData, "mobywatel"), ...s },
        cardInDriverName: {
          ...before.documents.cardInDriverName,
          enabled: checked(formData, "cardInDriverName"),
          ...s,
        },
        nonEuLicence: {
          ...before.documents.nonEuLicence,
          enabled: checked(formData, "nonEuLicence"),
          notes: String(formData.get("nonEuLicenceNotes") ?? "").trim().slice(0, 2000),
          ...s,
        },
      },
    };

    const after = await setSetting("rentalRules", next, admin.id);

    await recordAudit({
      adminId: admin.id,
      action: "rules.documents.update",
      entity: "rental_rule",
      entityId: "documents",
      before: before.documents,
      after: after.documents,
    });

    revalidateEverywhere();
    const t = await getTranslations("Admin.rules");
    return { ok: true, message: t("messages.documentsSaved") };
  } catch {
    return genericError();
  }
}

/* ── Wiek kierowcy i staż prawa jazdy ────────────────────────────────────── */

/**
 * A number typed into the panel, or null when the field was left empty.
 *
 * Out-of-range values are rejected by the schema on save rather than clamped:
 * silently turning a mistyped 250 into 99 would leave an administrator
 * believing they had set something they had not.
 */
function years(form: FormData, name: string): number | null {
  const raw = String(form.get(name) ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * The six switches and the master switch, saved as one decision.
 *
 * Two things this action refuses to do, both of them deliberate:
 *
 *  - It will not switch enforcement on while a published car has no class.
 *    Such a car has no threshold, so enforcement would be quietly partial —
 *    the panel says so, and the server checks it again here because a stale
 *    tab could post the form after somebody added a car.
 *  - It will not save a requirement that is switched on with an empty number.
 *    "Obowiązuje, ale nie wiadomo ile" is not a rule anybody can apply.
 */
export async function saveDriverAgeRules(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  const admin = await requirePermission("zasady.zmien");

  try {
    const before = await getSetting("rentalRules");
    const s = stamp(admin);

    const classes = { ...before.driverAge.classes };
    for (const key of DRIVER_CLASSES) {
      const label = before.driverAge.classes[key].label;
      const ageOn = checked(formData, `${key}.age.required`);
      const ageYears = years(formData, `${key}.age.years`);

      if (ageOn && ageYears === null) {
        const t = await getTranslations("Admin.rules");
        return {
          ok: false,
          error: t("errors.ageEmpty", { label }),
        };
      }
      /**
       * Refused rather than quietly raised to 21.
       *
       * `effectiveDriverLimits` will not go below the floor whatever is stored,
       * so a smaller number here would simply have no effect — and a setting
       * that does nothing while the panel shows it is how somebody ends up
       * believing they lowered the age. Say no, and say why.
       */
      if (ageOn && ageYears !== null && ageYears < FALLBACK_MIN_AGE) {
        const t = await getTranslations("Admin.rules");
        return {
          ok: false,
          error: t("errors.ageBelowFloor", {
            label,
            min: FALLBACK_MIN_AGE,
          }),
        };
      }

      classes[key] = {
        ...before.driverAge.classes[key],
        minAge: {
          ...before.driverAge.classes[key].minAge,
          required: ageOn,
          years: ageYears,
          ...s,
        },
        /**
         * Licence tenure is not saved from the form at all, in either
         * direction. The field the rule would be checked against does not
         * exist yet (`LICENCE_TENURE_ENFORCEABLE`), and the owner's
         * instruction of 2026-08-21 is that nothing may tell a customer we
         * require a tenure we cannot verify. The panel renders the row
         * locked; this is the half that a stale tab or a hand-made POST
         * cannot get around.
         */
        licence: {
          ...before.driverAge.classes[key].licence,
          required: false,
          years: null,
          ...s,
        },
      };
    }

    const enforce = checked(formData, "enforceInBookingForm");
    if (enforce) {
      const unassigned = (await listDriverClasses()).filter(
        (m) => m.published && !m.driverClass,
      );
      if (unassigned.length > 0) {
        const t = await getTranslations("Admin.rules");
        return {
          ok: false,
          error: t("errors.enforceBlocked", {
            count: unassigned.length,
            cars: unassigned.map((m) => `${m.brand} ${m.model}`).join(", "),
          }),
        };
      }
    }

    const next: RentalRules = {
      ...before,
      driverAge: {
        ...before.driverAge,
        classes,
        enforcement: {
          ...before.driverAge.enforcement,
          inBookingForm: enforce,
          ...s,
        },
        notes: String(formData.get("driverAgeNotes") ?? "")
          .trim()
          .slice(0, 2000),
        ...s,
      },
    };

    const after = await setSetting("rentalRules", next, admin.id);

    await recordAudit({
      adminId: admin.id,
      action: "rules.driverAge.update",
      entity: "rental_rule",
      entityId: "driverAge",
      before: before.driverAge,
      after: after.driverAge,
    });

    revalidateEverywhere();
    const t = await getTranslations("Admin.rules");
    return { ok: true, message: t("messages.driverAgeSaved") };
  } catch {
    return genericError();
  }
}

/**
 * Which class each car belongs to.
 *
 * A second action rather than part of the one above, because it writes a
 * different table: the thresholds are a company rule and live in the settings
 * row, the class is a property of the car and lives on the car. The panel puts
 * them on one screen; the storage keeps them where they belong.
 */
export async function saveDriverClasses(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  const admin = await requirePermission("zasady.zmien");

  try {
    const before = await listDriverClasses();
    const changes = before
      .map((row) => {
        const raw = formData.get(`class.${row.id}`);
        const value = isDriverClass(raw) ? raw : null;
        return { id: row.id, driverClass: value };
      })
      .filter((c, i) => c.driverClass !== before[i].driverClass);

    if (changes.length === 0) {
      const t = await getTranslations("Admin.rules");
      return { ok: true, message: t("messages.classesUnchanged") };
    }

    const after = await setDriverClasses(changes);

    await recordAudit({
      adminId: admin.id,
      action: "rules.driverClass.update",
      entity: "car_model",
      entityId: changes.map((c) => c.id).join(","),
      before,
      after,
    });

    revalidateEverywhere();
    const t = await getTranslations("Admin.rules");
    return {
      ok: true,
      message: t("messages.classesSaved", { count: changes.length }),
    };
  } catch {
    return genericError();
  }
}
