"use server";

import { revalidatePath } from "next/cache";
import { bramaKrytyczna } from "@/lib/auth/critical";
import { redirect } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { getDb, schema } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guard";
import { DEADLINE_KINDS } from "@/lib/admin/deadline-options";
import { markDone } from "@/lib/admin/deadlines";
import { recordAudit } from "@/lib/auth/audit";
import { saveImage, deleteImage } from "@/lib/storage/media";
import { saveInvoice, deleteInvoice } from "@/lib/storage/invoices";
import {
  CATEGORIES,
  GEARBOXES,
  FUELS,
  CAR_STATUSES,
  PREP_STATUSES,
  nextPrepStatus,
} from "@/lib/admin/fleet-options";
import { EDITABLE_SEGMENTS } from "@/lib/fleet/segments";
import { DRIVER_CLASSES } from "@/lib/fleet/driver-class";
import { EXPENSE_CATEGORIES } from "@/lib/admin/expense-options";
import {
  RECURRING_INTERVALS,
  occurrencesUpTo,
  type RecurringInterval,
} from "@/lib/admin/recurring-options";
import { adminActionFailed } from "@/lib/alerts/admin";

export type FormResult = { ok: true } | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Turns anything a human types into a valid URL slug: strips Polish diacritics
 * ("Gość" → "gosc"), lowercases, and collapses every run of non-alphanumerics
 * into a single hyphen. This is why the slug field never rejects an admin's
 * input for being "invalid" — whatever they type is normalised into shape, and
 * a blank field is filled from the brand + model instead.
 */
function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining marks: ą ć ę ó ś ź ż
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l") // ł/Ł don't decompose under NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "450" | "450,50" | "450.50" → integer grosze; empty → 0. */
const moneyPln = z.preprocess(
  (v) =>
    typeof v === "string"
      ? Number(v.replace(/\s/g, "").replace(",", ".") || "0")
      : v,
  z
    .number()
    .min(0)
    .max(1_000_000)
    .transform((n) => Math.round(n * 100)),
);

const dateOrNull = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
);

const bool = z.preprocess((v) => v === "on" || v === "true", z.boolean());

const ModelSchema = z
  .object({
    // Normalised, not validated: whatever the admin types is slugified into
    // shape. Left blank, it is derived from brand + model in the refine below.
    slug: z.preprocess(
      (v) => (typeof v === "string" ? slugify(v) : v),
      z.string().max(60),
    ),
    brand: z.string().trim().min(1).max(60),
    model: z.string().trim().min(1).max(60),
    year: z.coerce.number().int().min(1990).max(2100),
    category: z.enum(CATEGORIES),
    seats: z.coerce.number().int().min(1).max(9),
    gearbox: z.enum(GEARBOXES),
    fuel: z.enum(FUELS),
    kmPerDayLimit: z.coerce.number().int().min(0).max(100_000),
    daily: moneyPln,
    monthly: moneyPln,
    deposit: moneyPln,
    sortOrder: z.coerce.number().int().min(0).max(9999),
    published: bool,
    // Checkbox group: unticking every box posts nothing at all, so a missing
    // key means "no classes", not a malformed form. Unknown values are dropped
    // rather than rejected — the only writer is the checkbox list, and failing
    // the whole save over a stale tab's value would help nobody.
    segments: z.preprocess(
      (v) =>
        (Array.isArray(v) ? v : []).filter((s): s is string =>
          (EDITABLE_SEGMENTS as readonly string[]).includes(s as string),
        ),
      z.array(z.enum(EDITABLE_SEGMENTS)),
    ),
    /**
     * Which driver-requirement class this car falls under.
     *
     * Required, with no default and no empty option — a car created without a
     * class would have no minimum age, and nobody would find out until a
     * nineteen-year-old booked it. The thresholds are not here: they are in
     * Admin → Zasady wynajmu and change without a deployment.
     */
    driverClass: z.enum(DRIVER_CLASSES),
    descriptionPl: z
      .string()
      .max(5000)
      .transform((s) => s.trim() || null),
    descriptionEn: z
      .string()
      .max(5000)
      .transform((s) => s.trim() || null),
  })
  // A blank slug falls back to "<brand>-<model>"; a slug that survived
  // slugification but still isn't well-formed (e.g. the admin typed only
  // punctuation) is the one remaining case worth flagging.
  .transform((d) => ({
    ...d,
    slug: d.slug || slugify(`${d.brand}-${d.model}`),
  }))
  .refine((d) => SLUG_RE.test(d.slug), { path: ["slug"] });

const CarSchema = z.object({
  modelId: z.string().regex(UUID_RE),
  plate: z
    .string()
    .trim()
    .min(1)
    .max(15)
    .transform((s) => s.toUpperCase()),
  vin: z
    .string()
    .trim()
    .min(5)
    .max(20)
    .transform((s) => s.toUpperCase()),
  mileageKm: z.coerce.number().int().min(0).max(2_000_000),
  status: z.enum(CAR_STATUSES),
  // "" means the turnaround is not being tracked on this car, which is where
  // every car starts. Coercing that to "ready" would have the form assert a
  // car is clean and fuelled because nobody touched the dropdown.
  prepStatus: z.preprocess(
    (v) => (String(v ?? "").trim() === "" ? null : v),
    z.enum(PREP_STATUSES).nullable(),
  ),
  prepNote: z
    .string()
    .trim()
    .max(200)
    .transform((s) => s || null)
    .nullable()
    .catch(null),
  registeredOn: dateOrNull,
  insuranceExpiry: dateOrNull,
  acExpiry: dateOrNull,
  inspectionExpiry: dateOrNull,
  serviceDue: dateOrNull,
  // Blank stays NULL rather than 0: an interval of zero would report every
  // car as overdue for a service the moment it moved.
  serviceIntervalKm: z.preprocess(
    (v) => (String(v ?? "").trim() === "" ? null : v),
    z.coerce.number().int().min(0).max(500_000).nullable(),
  ),
  lastServiceKm: z.preprocess(
    (v) => (String(v ?? "").trim() === "" ? null : v),
    z.coerce.number().int().min(0).max(2_000_000).nullable(),
  ),
  oilIntervalKm: z.preprocess(
    (v) => (String(v ?? "").trim() === "" ? null : v),
    z.coerce.number().int().min(0).max(200_000).nullable(),
  ),
  lastOilKm: z.preprocess(
    (v) => (String(v ?? "").trim() === "" ? null : v),
    z.coerce.number().int().min(0).max(2_000_000).nullable(),
  ),
  // "" means nobody has recorded which tyres are on the car, which is a
  // different state from "całoroczne" and must not become one.
  tyresFitted: z.preprocess(
    (v) => (String(v ?? "").trim() === "" ? null : v),
    z.enum(["summer", "winter", "all_season"]).nullable(),
  ),
  tyresChangedOn: dateOrNull,
  // Left blank, the purchase price stays NULL rather than becoming 0 — see the
  // column comment: a zero would make every payback figure read "already paid
  // back", which is the most flattering possible lie about a car nobody has
  // costed. `moneyPln` coerces "" to 0, so the empty case is handled here.
  purchasePrice: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.union([moneyPln, z.null()]),
  ),
  purchasedOn: dateOrNull,
  // Depreciation schedule. Both optional; the economics engine claims no
  // depreciation unless it has the residual value AND the period.
  residualValue: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.union([moneyPln, z.null()]),
  ),
  depreciationMonths: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.union([z.coerce.number().int().min(1).max(600), z.null()]),
  ),
  notes: z
    .string()
    .max(2000)
    .transform((s) => s.trim() || null),
});

/**
 * One running cost.
 *
 * `incurredOn` is required and has no default: an expense with a guessed date
 * lands in the wrong month of every chart, and "today" is exactly the wrong
 * guess for a receipt somebody is entering a week later.
 */
const ExpenseSchema = z
  .object({
    carId: z.string().regex(UUID_RE),
    category: z.enum(EXPENSE_CATEGORIES),
    amount: moneyPln,
    incurredOn: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/),
    odometerKm: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? null : v),
      z.union([z.coerce.number().int().min(0).max(2_000_000), z.null()]),
    ),
    periodStart: dateOrNull,
    periodEnd: dateOrNull,
    note: z
      .string()
      .max(500)
      .transform((s) => s.trim() || null),
  })
  // Half a period is not a period. Accepting one end would spread the cost from
  // a date to itself, i.e. silently ignore what the admin was trying to say.
  .refine((d) => (d.periodStart == null) === (d.periodEnd == null), {
    path: ["periodEnd"],
  })
  .refine(
    (d) =>
      d.periodStart == null ||
      d.periodEnd == null ||
      d.periodEnd >= d.periodStart,
    { path: ["periodEnd"] },
  );

/** Message-catalogue keys for field names (see Admin.fleet.fieldLabels). */
const FIELD_LABEL: Record<string, string> = {
  slug: "fieldSlug",
  brand: "fieldBrand",
  model: "fieldModel",
  year: "fieldYear",
  seats: "fieldSeats",
  daily: "fieldDaily",
  monthly: "fieldMonthly",
  plate: "fieldPlate",
  vin: "fieldVin",
  mileageKm: "fieldMileage",
  purchasePrice: "fieldPurchasePrice",
  purchasedOn: "fieldPurchasedOn",
  residualValue: "fieldResidualValue",
  depreciationMonths: "fieldDepreciationMonths",
  periodStart: "fieldPeriodStart",
  periodEnd: "fieldPeriodEnd",
  amount: "fieldAmount",
  incurredOn: "fieldIncurredOn",
  category: "fieldCategory",
  odometerKm: "fieldOdometerKm",
  driverClass: "fieldDriverClass",
};

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function zodError(e: z.ZodError, t: Translator): FormResult {
  const first = e.issues[0];
  const key = first?.path[0];
  const label =
    typeof key === "string" ? (FIELD_LABEL[key] ? t(FIELD_LABEL[key]) : key) : "";
  return {
    ok: false,
    error: label
      ? t("errCheckField", { field: label })
      : t("errInvalidForm"),
  };
}

function hasCode(err: unknown, code: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === code
  );
}
const isUnique = (e: unknown) => hasCode(e, "23505"); // unique_violation
const isFkInUse = (e: unknown) => hasCode(e, "23503"); // foreign_key_violation

/**
 * `Object.fromEntries` keeps only the last value for a repeated key, which is
 * exactly wrong for a checkbox group — every ticked class but one would be
 * dropped on save. Segments are read with `getAll` and spliced back in.
 */
function modelFields(formData: FormData): Record<string, unknown> {
  return {
    ...Object.fromEntries(formData),
    segments: formData.getAll("segments"),
  };
}

function modelRow(d: z.infer<typeof ModelSchema>) {
  return {
    slug: d.slug,
    brand: d.brand,
    model: d.model,
    year: d.year,
    category: d.category,
    seats: d.seats,
    gearbox: d.gearbox,
    fuel: d.fuel,
    kmPerDayLimit: d.kmPerDayLimit,
    dailyPriceGrosze: d.daily,
    monthlyPriceGrosze: d.monthly,
    depositGrosze: d.deposit,
    segments: d.segments,
    driverClass: d.driverClass,
    sortOrder: d.sortOrder,
    published: d.published,
    descriptionPl: d.descriptionPl,
    descriptionEn: d.descriptionEn,
    // `images` is deliberately absent — the gallery manager writes that column
    // on its own. Including it here would let a stale details form overwrite a
    // photo uploaded in another tab with the value it read at page load.
  };
}

// ── Models ───────────────────────────────────────────────────────────────────

export async function createModel(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  const t = await getTranslations("Admin.fleet");
  const admin = await requirePermission("flota.edytuj");
  const parsed = ModelSchema.safeParse(modelFields(formData));
  if (!parsed.success) return zodError(parsed.error, t);
  const values = modelRow(parsed.data);

  const db = getDb();
  let newId: string;
  try {
    const [row] = await db
      .insert(schema.carModels)
      .values(values)
      .returning({ id: schema.carModels.id });
    newId = row.id;
  } catch (err) {
    if (isUnique(err))
      return { ok: false, error: t("errSlugTaken") };
    adminActionFailed("createModel", err);
    return { ok: false, error: t("errGeneric") };
  }

  await recordAudit({
    adminId: admin.id,
    action: "fleet.model.create",
    entity: "car_model",
    entityId: newId,
    after: values,
  });
  revalidatePath("/admin/fleet");
  redirect(`/admin/fleet/${newId}`);
}

export async function updateModel(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  const t = await getTranslations("Admin.fleet");
  const admin = await requirePermission("flota.edytuj");
  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) return { ok: false, error: t("errInvalidData") };
  const parsed = ModelSchema.safeParse(modelFields(formData));
  if (!parsed.success) return zodError(parsed.error, t);
  const values = modelRow(parsed.data);

  const db = getDb();
  try {
    const [before] = await db
      .select()
      .from(schema.carModels)
      .where(eq(schema.carModels.id, id))
      .limit(1);
    if (!before) return { ok: false, error: t("errModelNotFound") };

    /*
     * Values this form no longer offers are kept, not silently dropped.
     *
     * Three cars still carry `premium-suv` from before the axes were split
     * (21.08.2026). The class is computed now — `luxury` ∧ `category = suv` —
     * so the stored copy changes nothing while this code is running. It matters
     * on the way back: a rollback to the previous release would find those rows
     * stripped by whichever save happened in between, and the premium-SUV chip
     * would come back empty. Saving a car must not quietly rewrite a column the
     * editor stopped showing.
     */
    const legacy = (before.segments ?? []).filter(
      (s) => !(EDITABLE_SEGMENTS as readonly string[]).includes(s),
    );
    const segments = [...new Set([...values.segments, ...legacy])];

    await db
      .update(schema.carModels)
      .set({ ...values, segments, updatedAt: new Date() })
      .where(eq(schema.carModels.id, id));

    await recordAudit({
      adminId: admin.id,
      action: "fleet.model.update",
      entity: "car_model",
      entityId: id,
      before,
      after: values,
    });
    revalidatePath("/admin/fleet");
    revalidatePath(`/admin/fleet/${id}`);
    return { ok: true };
  } catch (err) {
    if (isUnique(err))
      return { ok: false, error: t("errSlugTaken") };
    adminActionFailed("updateModel", err);
    return { ok: false, error: t("errGeneric") };
  }
}

export async function deleteModel(id: string): Promise<FormResult> {
  const t = await getTranslations("Admin.fleet");
  const brama = await bramaKrytyczna("flota.usun");
  if (!brama.ok) return { ok: false, error: brama.error };
  const admin = brama.admin;
  if (!UUID_RE.test(id)) return { ok: false, error: t("errInvalidData") };
  const db = getDb();

  const [[{ cars: carN }], [{ res: resN }]] = await Promise.all([
    db
      .select({ cars: count() })
      .from(schema.cars)
      .where(eq(schema.cars.modelId, id)),
    db
      .select({ res: count() })
      .from(schema.reservations)
      .where(eq(schema.reservations.carModelId, id)),
  ]);
  if (carN > 0)
    return {
      ok: false,
      error: t("errModelHasUnits"),
    };
  if (resN > 0)
    return {
      ok: false,
      error:
        t("errModelHasBookings"),
    };

  try {
    await db.delete(schema.carModels).where(eq(schema.carModels.id, id));
  } catch (err) {
    if (isFkInUse(err))
      return {
        ok: false,
        error: t("errModelInUse"),
      };
    adminActionFailed("deleteModel", err);
    return { ok: false, error: t("errGeneric") };
  }

  await recordAudit({
    adminId: admin.id,
    action: "fleet.model.delete",
    entity: "car_model",
    entityId: id,
  });
  revalidatePath("/admin/fleet");
  redirect("/admin/fleet");
}

// ── Cars (physical units) ────────────────────────────────────────────────────

export async function createCar(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  const t = await getTranslations("Admin.fleet");
  const admin = await requirePermission("flota.edytuj");
  const parsed = CarSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodError(parsed.error, t);
  const d = parsed.data;

  const db = getDb();
  try {
    const [row] = await db
      .insert(schema.cars)
      .values({
        modelId: d.modelId,
        plate: d.plate,
        vin: d.vin,
        mileageKm: d.mileageKm,
        status: d.status,
        registeredOn: d.registeredOn,
        insuranceExpiry: d.insuranceExpiry,
        acExpiry: d.acExpiry,
        inspectionExpiry: d.inspectionExpiry,
        serviceDue: d.serviceDue,
        serviceIntervalKm: d.serviceIntervalKm,
        lastServiceKm: d.lastServiceKm,
        oilIntervalKm: d.oilIntervalKm,
        lastOilKm: d.lastOilKm,
        tyresFitted: d.tyresFitted,
        tyresChangedOn: d.tyresChangedOn,
        purchasePriceGrosze: d.purchasePrice,
        purchasedOn: d.purchasedOn,
        residualValueGrosze: d.residualValue,
        depreciationMonths: d.depreciationMonths,
        prepStatus: d.prepStatus,
        prepUpdatedAt: d.prepStatus ? new Date() : null,
        prepNote: d.prepNote,
        notes: d.notes,
      })
      .returning({ id: schema.cars.id });

    await recordAudit({
      adminId: admin.id,
      action: "fleet.car.create",
      entity: "car",
      entityId: row.id,
      after: { plate: d.plate, vin: d.vin, status: d.status },
    });
    revalidatePath(`/admin/fleet/${d.modelId}`);
    return { ok: true };
  } catch (err) {
    if (isUnique(err))
      return { ok: false, error: t("errPlateVinTaken") };
    if (isFkInUse(err)) return { ok: false, error: t("errUnknownModel") };
    adminActionFailed("createCar", err);
    return { ok: false, error: t("errGeneric") };
  }
}

export async function updateCar(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  const t = await getTranslations("Admin.fleet");
  const admin = await requirePermission("flota.edytuj");
  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) return { ok: false, error: t("errInvalidData") };
  const parsed = CarSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodError(parsed.error, t);
  const d = parsed.data;

  const db = getDb();
  try {
    const [before] = await db
      .select()
      .from(schema.cars)
      .where(eq(schema.cars.id, id))
      .limit(1);
    if (!before) return { ok: false, error: t("errCarNotFound") };

    await db
      .update(schema.cars)
      .set({
        plate: d.plate,
        vin: d.vin,
        mileageKm: d.mileageKm,
        status: d.status,
        registeredOn: d.registeredOn,
        insuranceExpiry: d.insuranceExpiry,
        acExpiry: d.acExpiry,
        inspectionExpiry: d.inspectionExpiry,
        serviceDue: d.serviceDue,
        serviceIntervalKm: d.serviceIntervalKm,
        lastServiceKm: d.lastServiceKm,
        oilIntervalKm: d.oilIntervalKm,
        lastOilKm: d.lastOilKm,
        tyresFitted: d.tyresFitted,
        tyresChangedOn: d.tyresChangedOn,
        purchasePriceGrosze: d.purchasePrice,
        purchasedOn: d.purchasedOn,
        residualValueGrosze: d.residualValue,
        depreciationMonths: d.depreciationMonths,
        prepStatus: d.prepStatus,
        // Stamped only when the state actually MOVES. Refreshing it on every
        // save would reset the clock each time somebody corrected the mileage,
        // and "od kiedy to auto czeka" is the whole reason the column exists.
        prepUpdatedAt:
          d.prepStatus === before.prepStatus
            ? before.prepUpdatedAt
            : d.prepStatus === null
              ? null
              : new Date(),
        prepNote: d.prepNote,
        notes: d.notes,
        updatedAt: new Date(),
      })
      .where(eq(schema.cars.id, id));

    await recordAudit({
      adminId: admin.id,
      action: "fleet.car.update",
      entity: "car",
      entityId: id,
      before: { plate: before.plate, status: before.status },
      after: { plate: d.plate, status: d.status },
    });
    revalidatePath(`/admin/fleet/${d.modelId}`);
    return { ok: true };
  } catch (err) {
    if (isUnique(err))
      return { ok: false, error: t("errPlateVinTaken") };
    adminActionFailed("updateCar", err);
    return { ok: false, error: t("errGeneric") };
  }
}

export async function deleteCar(id: string): Promise<FormResult> {
  const t = await getTranslations("Admin.fleet");
  const brama = await bramaKrytyczna("flota.usun");
  if (!brama.ok) return { ok: false, error: brama.error };
  const admin = brama.admin;
  if (!UUID_RE.test(id)) return { ok: false, error: t("errInvalidData") };
  const db = getDb();

  const [before] = await db
    .select({ modelId: schema.cars.modelId, plate: schema.cars.plate })
    .from(schema.cars)
    .where(eq(schema.cars.id, id))
    .limit(1);
  if (!before) return { ok: false, error: t("errCarNotFound") };

  const [{ res: resN }] = await db
    .select({ res: count() })
    .from(schema.reservations)
    .where(eq(schema.reservations.carId, id));
  if (resN > 0)
    return {
      ok: false,
      error:
        t("errUnitHasBookings"),
    };

  try {
    await db.delete(schema.cars).where(eq(schema.cars.id, id));
  } catch (err) {
    if (isFkInUse(err))
      return {
        ok: false,
        error: t("errUnitInUse"),
      };
    adminActionFailed("deleteCar", err);
    return { ok: false, error: t("errGeneric") };
  }

  await recordAudit({
    adminId: admin.id,
    action: "fleet.car.delete",
    entity: "car",
    entityId: id,
    before: { plate: before.plate },
  });
  revalidatePath(`/admin/fleet/${before.modelId}`);
  return { ok: true };
}

/**
 * Move one car one link along the turnaround chain.
 *
 * The whole point is that this is a single tap on a phone in a car park —
 * opening the full unit form to change one dropdown is not something anybody
 * does while holding a fuel nozzle. It takes no target state from the caller:
 * the next state is computed from the current one, so a stale page cannot skip
 * the car from `inspection` straight to `ready`.
 *
 * `null` (not tracked) starts the chain at `inspection`, which is what a return
 * means. `ready` is the end — the next thing that happens to a ready car is a
 * handover, and that is a reservation, not a turnaround step.
 */
export async function advancePrep(id: string): Promise<FormResult> {
  const t = await getTranslations("Admin.fleet");
  const brama = await bramaKrytyczna("flota.status");
  if (!brama.ok) return { ok: false, error: brama.error };
  const admin = brama.admin;
  if (!UUID_RE.test(id)) return { ok: false, error: t("errInvalidData") };

  const db = getDb();
  const [before] = await db
    .select({
      modelId: schema.cars.modelId,
      plate: schema.cars.plate,
      prepStatus: schema.cars.prepStatus,
    })
    .from(schema.cars)
    .where(eq(schema.cars.id, id))
    .limit(1);
  if (!before) return { ok: false, error: t("errCarNotFound") };

  const next = before.prepStatus
    ? nextPrepStatus(before.prepStatus)
    : PREP_STATUSES[0];
  if (!next)
    return { ok: false, error: t("errUnitReady") };

  try {
    await db
      .update(schema.cars)
      .set({ prepStatus: next, prepUpdatedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.cars.id, id));
  } catch (err) {
    adminActionFailed("advancePrep", err);
    return { ok: false, error: t("errGeneric") };
  }

  await recordAudit({
    adminId: admin.id,
    action: "fleet.car.prep",
    entity: "car",
    entityId: id,
    before: { plate: before.plate, prepStatus: before.prepStatus },
    after: { plate: before.plate, prepStatus: next },
  });
  revalidatePath(`/admin/fleet/${before.modelId}`);
  return { ok: true };
}

/* ── Model photos ────────────────────────────────────────────────────────── */

const MAX_IMAGES = 20;

const UPLOAD_ERRORS: Record<string, string> = {
  empty: "errUploadEmpty",
  too_large: "errUploadTooLarge",
  unsupported_type: "errUploadType",
  write_failed: "errUploadWrite",
};

/**
 * Photos are read, mutated and written back as a whole array, because that is
 * how the column is shaped. Two admins editing the same car's gallery at the
 * same moment is not a case worth locking for — the audit log records who
 * wrote what, and the loser re-uploads.
 */
async function readImages(
  id: string,
): Promise<{ ok: true; images: string[] } | { ok: false; error: string }> {
  const t = await getTranslations("Admin.fleet");
  const db = getDb();
  const [row] = await db
    .select({ images: schema.carModels.images })
    .from(schema.carModels)
    .where(eq(schema.carModels.id, id))
    .limit(1);
  if (!row) return { ok: false, error: t("errModelNotFound") };
  return { ok: true, images: row.images ?? [] };
}

async function writeImages(
  admin: { id: string },
  id: string,
  before: string[],
  after: string[],
  action: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.carModels)
    .set({ images: after, updatedAt: new Date() })
    .where(eq(schema.carModels.id, id));

  await recordAudit({
    adminId: admin.id,
    action,
    entity: "car_model",
    entityId: id,
    before: { images: before },
    after: { images: after },
  });

  revalidatePath("/admin/fleet");
  revalidatePath(`/admin/fleet/${id}`);
  // The photo shows on the car page, the fleet grid and the home showcase, so
  // the whole public tree is the honest scope here.
  revalidatePath("/", "layout");
}

/** Appends one or more uploaded photos to a model's gallery. */
export async function uploadModelImages(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  const t = await getTranslations("Admin.fleet");
  const admin = await requirePermission("flota.edytuj");

  const id = String(formData.get("modelId") ?? "");
  if (!UUID_RE.test(id)) return { ok: false, error: t("errInvalidData") };

  const files = formData
    .getAll("images")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: t(UPLOAD_ERRORS.empty) };

  const current = await readImages(id);
  if (!current.ok) return current;

  if (current.images.length + files.length > MAX_IMAGES) {
    return {
      ok: false,
      error: t("errMaxImages", { max: MAX_IMAGES }),
    };
  }

  const stored: string[] = [];
  for (const file of files) {
    const saved = await saveImage(file);
    if (!saved.ok) {
      // Roll back this batch: a half-uploaded set would leave the admin
      // guessing which of the files they picked actually landed.
      await Promise.all(stored.map((url) => deleteImage(url).catch(() => {})));
      return {
        ok: false,
        error: t(UPLOAD_ERRORS[saved.error] ?? "errSaveFailed"),
      };
    }
    stored.push(saved.url);
  }

  const after = [...current.images, ...stored];
  try {
    await writeImages(
      admin,
      id,
      current.images,
      after,
      "fleet.model.images.add",
    );
  } catch (err) {
    await Promise.all(stored.map((url) => deleteImage(url).catch(() => {})));
    adminActionFailed("uploadModelImages", err);
    return { ok: false, error: t("errGeneric") };
  }
  return { ok: true };
}

/** Removes one photo, deleting the underlying file if we own it. */
export async function removeModelImage(
  id: string,
  url: string,
): Promise<FormResult> {
  const t = await getTranslations("Admin.fleet");
  const admin = await requirePermission("flota.edytuj");
  if (!UUID_RE.test(id)) return { ok: false, error: t("errInvalidData") };

  const current = await readImages(id);
  if (!current.ok) return current;
  if (!current.images.includes(url)) return { ok: true };

  const after = current.images.filter((u) => u !== url);
  try {
    await writeImages(
      admin,
      id,
      current.images,
      after,
      "fleet.model.images.remove",
    );
  } catch (err) {
    adminActionFailed("removeModelImage", err);
    return { ok: false, error: t("errGeneric") };
  }

  // Only after the row no longer points at it. `deleteImage` ignores anything
  // outside the upload directory, so bundled /fleet/*.jpg paths survive being
  // removed from a gallery and can be added back by hand.
  await deleteImage(url).catch(() => {});
  return { ok: true };
}

/**
 * Moves a photo one slot earlier or later. Position 0 is the cover — the frame
 * used on the fleet grid, the home showcase and social previews.
 */
/**
 * Reorder one photo. `cover` moves it to the front in a single step.
 *
 * The step-at-a-time arrows are fine for nudging, and hopeless for the thing
 * an operator most often wants: the fourth photo is the good one, make it the
 * cover. That took three presses, each a server round trip, on a phone in a car
 * park. `cover` is the same rewrite of the same array, so it inherits the same
 * audit entry and the same guard rails — it is not a second way to edit
 * photographs.
 */
export async function moveModelImage(
  id: string,
  url: string,
  direction: "up" | "down" | "cover",
): Promise<FormResult> {
  const t = await getTranslations("Admin.fleet");
  const admin = await requirePermission("flota.edytuj");
  if (!UUID_RE.test(id)) return { ok: false, error: t("errInvalidData") };

  const current = await readImages(id);
  if (!current.ok) return current;

  const from = current.images.indexOf(url);
  if (from === -1) return { ok: false, error: t("errPhotoNotFound") };
  const after = [...current.images];
  if (direction === "cover") {
    if (from === 0) return { ok: true };
    // Lifted out and put in front, so every other photo keeps its relative
    // order. A swap with position 0 would silently demote the old cover to
    // wherever this one happened to be, which is not what "make this the
    // cover" means.
    after.splice(from, 1);
    after.unshift(url);
  } else {
    const to = direction === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= current.images.length) return { ok: true };
    [after[from], after[to]] = [after[to], after[from]];
  }

  try {
    await writeImages(
      admin,
      id,
      current.images,
      after,
      "fleet.model.images.reorder",
    );
  } catch (err) {
    adminActionFailed("moveModelImage", err);
    return { ok: false, error: t("errGeneric") };
  }
  return { ok: true };
}

/* ── Availability blocks ─────────────────────────────────────────────────── */

/**
 * Blackout windows: servicing, a booking taken over the phone, owner use.
 *
 * These are what the public calendar paints red alongside confirmed bookings,
 * so writing one has to revalidate the public tree. A block names a physical
 * unit, because that is what a customer ends up driving away — "the whole
 * model" is expanded here into one row per unit rather than modelled as a
 * second kind of block that every availability query would then have to know
 * about.
 */
const BlockSchema = z
  .object({
    modelId: z.string().regex(UUID_RE),
    /** A unit id, or "all" for every unit of the model. */
    carId: z.union([z.literal("all"), z.string().regex(UUID_RE)]),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z
      .string()
      .trim()
      .max(200)
      .transform((s) => s || null),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "Data końcowa nie może być wcześniejsza niż początkowa.",
    path: ["endDate"],
  });

export async function createAvailabilityBlock(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  const t = await getTranslations("Admin.fleet");
  const brama = await bramaKrytyczna("flota.status");
  if (!brama.ok) return { ok: false, error: brama.error };
  const admin = brama.admin;

  const parsed = BlockSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodError(parsed.error, t);
  const d = parsed.data;

  const db = getDb();
  try {
    // Units are read back from the model rather than trusted from the form: a
    // posted car id belonging to somebody else's model would otherwise block a
    // car this page never showed.
    const units = await db
      .select({ id: schema.cars.id })
      .from(schema.cars)
      .where(eq(schema.cars.modelId, d.modelId));

    const targets =
      d.carId === "all"
        ? units.map((u) => u.id)
        : units.filter((u) => u.id === d.carId).map((u) => u.id);

    if (targets.length === 0) {
      return {
        ok: false,
        error: "Ten model nie ma egzemplarzy do zablokowania.",
      };
    }

    await db.insert(schema.availabilityBlocks).values(
      targets.map((carId) => ({
        carId,
        startDate: d.startDate,
        endDate: d.endDate,
        reason: d.reason,
        createdBy: admin.id,
      })),
    );

    await recordAudit({
      adminId: admin.id,
      action: "fleet.block.create",
      entity: "car_model",
      entityId: d.modelId,
      after: {
        cars: targets.length,
        startDate: d.startDate,
        endDate: d.endDate,
        reason: d.reason,
      },
    });

    revalidatePath(`/admin/fleet/${d.modelId}`);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    adminActionFailed("createAvailabilityBlock", err);
    return { ok: false, error: t("errGeneric") };
  }
}

export async function deleteAvailabilityBlock(
  id: string,
  modelId: string,
): Promise<FormResult> {
  const t = await getTranslations("Admin.fleet");
  const brama = await bramaKrytyczna("flota.status");
  if (!brama.ok) return { ok: false, error: brama.error };
  const admin = brama.admin;
  if (!UUID_RE.test(id) || !UUID_RE.test(modelId)) {
    return { ok: false, error: t("errInvalidData") };
  }

  const db = getDb();
  try {
    // Scoped to the model being edited, so an id from another page cannot
    // delete a block the admin is not looking at.
    const [block] = await db
      .select({
        id: schema.availabilityBlocks.id,
        carId: schema.availabilityBlocks.carId,
        startDate: schema.availabilityBlocks.startDate,
        endDate: schema.availabilityBlocks.endDate,
      })
      .from(schema.availabilityBlocks)
      .innerJoin(
        schema.cars,
        eq(schema.availabilityBlocks.carId, schema.cars.id),
      )
      .where(
        and(
          eq(schema.availabilityBlocks.id, id),
          eq(schema.cars.modelId, modelId),
        ),
      )
      .limit(1);
    if (!block) return { ok: false, error: t("errBlockNotFound") };

    await db
      .delete(schema.availabilityBlocks)
      .where(eq(schema.availabilityBlocks.id, id));

    await recordAudit({
      adminId: admin.id,
      action: "fleet.block.delete",
      entity: "car_model",
      entityId: modelId,
      before: block,
    });

    revalidatePath(`/admin/fleet/${modelId}`);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    adminActionFailed("deleteAvailabilityBlock", err);
    return { ok: false, error: t("errGeneric") };
  }
}

/* ── Model features (equipment) ──────────────────────────────────────────── */

const MAX_FEATURES = 30;
const FEATURE_MAX_LEN = 60;

/**
 * Equipment is edited one entry at a time, write-through, for the same reason
 * photos are: the details form below would otherwise submit whatever list it
 * read at page load and quietly undo anything added since.
 */
async function readFeatures(
  id: string,
): Promise<{ ok: true; features: string[] } | { ok: false; error: string }> {
  const t = await getTranslations("Admin.fleet");
  const db = getDb();
  const [row] = await db
    .select({ features: schema.carModels.features })
    .from(schema.carModels)
    .where(eq(schema.carModels.id, id))
    .limit(1);
  if (!row) return { ok: false, error: t("errModelNotFound") };
  return { ok: true, features: row.features ?? [] };
}

async function writeFeatures(
  admin: { id: string },
  id: string,
  before: string[],
  after: string[],
  action: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.carModels)
    .set({ features: after, updatedAt: new Date() })
    .where(eq(schema.carModels.id, id));

  await recordAudit({
    adminId: admin.id,
    action,
    entity: "car_model",
    entityId: id,
    before: { features: before },
    after: { features: after },
  });

  revalidatePath(`/admin/fleet/${id}`);
  revalidatePath("/", "layout");
}

export async function addModelFeature(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  const t = await getTranslations("Admin.fleet");
  const admin = await requirePermission("flota.edytuj");

  const id = String(formData.get("modelId") ?? "");
  if (!UUID_RE.test(id)) return { ok: false, error: t("errInvalidData") };

  const label = String(formData.get("feature") ?? "")
    .trim()
    .slice(0, FEATURE_MAX_LEN);
  if (!label) return { ok: false, error: t("errFeatureEmpty") };

  const current = await readFeatures(id);
  if (!current.ok) return current;

  // Case-insensitive duplicate check: "CarPlay" and "carplay" on the same card
  // reads as a mistake, and it is.
  if (current.features.some((f) => f.toLowerCase() === label.toLowerCase())) {
    return { ok: false, error: t("errFeatureDuplicate") };
  }
  if (current.features.length >= MAX_FEATURES) {
    return { ok: false, error: t("errMaxFeatures", { max: MAX_FEATURES }) };
  }

  try {
    await writeFeatures(
      admin,
      id,
      current.features,
      [...current.features, label],
      "fleet.model.features.add",
    );
  } catch (err) {
    adminActionFailed("addModelFeature", err);
    return { ok: false, error: t("errGeneric") };
  }
  return { ok: true };
}

export async function removeModelFeature(
  id: string,
  label: string,
): Promise<FormResult> {
  const t = await getTranslations("Admin.fleet");
  const admin = await requirePermission("flota.edytuj");
  if (!UUID_RE.test(id)) return { ok: false, error: t("errInvalidData") };

  const current = await readFeatures(id);
  if (!current.ok) return current;
  const after = current.features.filter((f) => f !== label);
  if (after.length === current.features.length) return { ok: true };

  try {
    await writeFeatures(
      admin,
      id,
      current.features,
      after,
      "fleet.model.features.remove",
    );
  } catch (err) {
    adminActionFailed("removeModelFeature", err);
    return { ok: false, error: t("errGeneric") };
  }
  return { ok: true };
}

/* ── Car expenses ─────────────────────────────────────────────────────────── */

const INVOICE_ERRORS: Record<string, string> = {
  empty: "errUploadEmpty",
  too_large: "errUploadTooLarge",
  unsupported_type: "errUploadTypeInvoice",
  write_failed: "errUploadWrite",
};

/**
 * Reads the optional invoice off the form.
 *
 * Returns `undefined` when no file was chosen, which the callers use to mean
 * "leave whatever is already attached alone" — distinct from a `null` that
 * would clear it. An empty file input posts a zero-byte File, not nothing,
 * which is why the size check comes first.
 */
async function readInvoice(
  formData: FormData,
): Promise<{ ok: true; url?: string } | { ok: false; error: string }> {
  const t = await getTranslations("Admin.fleet");
  const file = formData.get("invoice");
  if (!(file instanceof File) || file.size === 0) return { ok: true };
  const saved = await saveInvoice(file);
  if (!saved.ok) {
    return {
      ok: false,
      error: t(INVOICE_ERRORS[saved.error] ?? "errSaveFailed"),
    };
  }
  return { ok: true, url: saved.url };
}

/**
 * Which model page to revalidate after touching an expense.
 *
 * Expenses hang off a physical car, but the page that shows them is the model
 * editor, so every write has to look up the parent. It doubles as the
 * existence check — a car id that resolves to no model is not ours to write to.
 */
async function modelIdOfCar(carId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ modelId: schema.cars.modelId })
    .from(schema.cars)
    .where(eq(schema.cars.id, carId))
    .limit(1);
  return row?.modelId ?? null;
}

function revalidateEconomics(modelId: string, carId: string) {
  revalidatePath(`/admin/fleet/${modelId}`);
  // Both the fleet-wide table and this car's own P&L change with one receipt.
  revalidatePath("/admin/analytics");
  revalidatePath(`/admin/analytics/${carId}`);
}

export async function createExpense(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  const t = await getTranslations("Admin.fleet");
  const admin = await requirePermission("finanse.edytuj");
  const parsed = ExpenseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodError(parsed.error, t);
  const d = parsed.data;

  const modelId = await modelIdOfCar(d.carId);
  if (!modelId) return { ok: false, error: t("errCarNotFound") };

  const invoice = await readInvoice(formData);
  if (!invoice.ok) return { ok: false, error: invoice.error };

  try {
    const [row] = await getDb()
      .insert(schema.carExpenses)
      .values({
        carId: d.carId,
        category: d.category,
        amountGrosze: d.amount,
        incurredOn: d.incurredOn,
        odometerKm: d.odometerKm,
        periodStart: d.periodStart,
        periodEnd: d.periodEnd,
        invoicePath: invoice.url ?? null,
        note: d.note,
        createdBy: admin.id,
      })
      .returning({ id: schema.carExpenses.id });

    await recordAudit({
      adminId: admin.id,
      action: "fleet.expense.create",
      entity: "car_expense",
      entityId: row.id,
      after: {
        carId: d.carId,
        category: d.category,
        amountGrosze: d.amount,
        incurredOn: d.incurredOn,
      },
    });
    revalidateEconomics(modelId, d.carId);
    return { ok: true };
  } catch (err) {
    adminActionFailed("createExpense", err);
    return { ok: false, error: t("errGeneric") };
  }
}

export async function updateExpense(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  const t = await getTranslations("Admin.fleet");
  const admin = await requirePermission("finanse.edytuj");
  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) return { ok: false, error: t("errInvalidData") };
  const parsed = ExpenseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodError(parsed.error, t);
  const d = parsed.data;

  const db = getDb();
  try {
    const [before] = await db
      .select()
      .from(schema.carExpenses)
      .where(eq(schema.carExpenses.id, id))
      .limit(1);
    if (!before) return { ok: false, error: t("errExpenseNotFound") };

    // The car is taken from the stored row, never from the form: letting a
    // submitted carId move an expense between cars would silently rewrite two
    // cars' P&L from one edit box.
    const modelId = await modelIdOfCar(before.carId);
    if (!modelId) return { ok: false, error: t("errCarNotFound") };

    const invoice = await readInvoice(formData);
    if (!invoice.ok) return { ok: false, error: invoice.error };

    await db
      .update(schema.carExpenses)
      .set({
        category: d.category,
        amountGrosze: d.amount,
        incurredOn: d.incurredOn,
        odometerKm: d.odometerKm,
        periodStart: d.periodStart,
        periodEnd: d.periodEnd,
        // Only overwritten when a new file was actually chosen; saving the row
        // without touching the file input must not detach the invoice.
        ...(invoice.url ? { invoicePath: invoice.url } : {}),
        note: d.note,
        updatedAt: new Date(),
      })
      .where(eq(schema.carExpenses.id, id));

    // Remove the superseded scan only after the row committed, so a failure
    // cannot leave the record pointing at a file that no longer exists.
    if (invoice.url && before.invoicePath) {
      await deleteInvoice(before.invoicePath).catch(() => {});
    }

    await recordAudit({
      adminId: admin.id,
      action: "fleet.expense.update",
      entity: "car_expense",
      entityId: id,
      before: {
        category: before.category,
        amountGrosze: before.amountGrosze,
        incurredOn: before.incurredOn,
      },
      after: {
        category: d.category,
        amountGrosze: d.amount,
        incurredOn: d.incurredOn,
      },
    });
    revalidateEconomics(modelId, before.carId);
    return { ok: true };
  } catch (err) {
    adminActionFailed("updateExpense", err);
    return { ok: false, error: t("errGeneric") };
  }
}

export async function deleteExpense(id: string): Promise<FormResult> {
  const t = await getTranslations("Admin.fleet");
  const admin = await requirePermission("finanse.edytuj");
  if (!UUID_RE.test(id)) return { ok: false, error: t("errInvalidData") };

  const db = getDb();
  const [before] = await db
    .select()
    .from(schema.carExpenses)
    .where(eq(schema.carExpenses.id, id))
    .limit(1);
  if (!before) return { ok: false, error: t("errExpenseNotFound") };

  const modelId = await modelIdOfCar(before.carId);

  try {
    await db.delete(schema.carExpenses).where(eq(schema.carExpenses.id, id));
    await deleteInvoice(before.invoicePath).catch(() => {});
    await recordAudit({
      adminId: admin.id,
      action: "fleet.expense.delete",
      entity: "car_expense",
      entityId: id,
      before: {
        carId: before.carId,
        category: before.category,
        amountGrosze: before.amountGrosze,
        incurredOn: before.incurredOn,
      },
    });
    if (modelId) revalidateEconomics(modelId, before.carId);
    return { ok: true };
  } catch (err) {
    adminActionFailed("deleteExpense", err);
    return { ok: false, error: t("errGeneric") };
  }
}

/* ── Recurring costs ──────────────────────────────────────────────────────── */

const RecurringSchema = z
  .object({
    carId: z.string().regex(UUID_RE),
    category: z.enum(EXPENSE_CATEGORIES),
    amount: moneyPln,
    interval: z.enum(RECURRING_INTERVALS),
    startOn: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/),
    endOn: dateOrNull,
    note: z
      .string()
      .max(500)
      .transform((s) => s.trim() || null),
    active: bool,
  })
  .refine((d) => d.endOn == null || d.endOn >= d.startOn, { path: ["endOn"] });

export async function createRecurring(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  const t = await getTranslations("Admin.fleet");
  const admin = await requirePermission("finanse.edytuj");
  const parsed = RecurringSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodError(parsed.error, t);
  const d = parsed.data;

  const modelId = await modelIdOfCar(d.carId);
  if (!modelId) return { ok: false, error: t("errCarNotFound") };

  try {
    const [row] = await getDb()
      .insert(schema.recurringCosts)
      .values({
        carId: d.carId,
        category: d.category,
        amountGrosze: d.amount,
        interval: d.interval,
        startOn: d.startOn,
        endOn: d.endOn,
        note: d.note,
        active: d.active,
        createdBy: admin.id,
      })
      .returning({ id: schema.recurringCosts.id });

    await recordAudit({
      adminId: admin.id,
      action: "fleet.recurring.create",
      entity: "recurring_cost",
      entityId: row.id,
      after: {
        carId: d.carId,
        category: d.category,
        amountGrosze: d.amount,
        interval: d.interval,
        startOn: d.startOn,
      },
    });
    revalidateEconomics(modelId, d.carId);
    return { ok: true };
  } catch (err) {
    adminActionFailed("createRecurring", err);
    return { ok: false, error: t("errGeneric") };
  }
}

export async function deleteRecurring(id: string): Promise<FormResult> {
  const t = await getTranslations("Admin.fleet");
  const admin = await requirePermission("finanse.edytuj");
  if (!UUID_RE.test(id)) return { ok: false, error: t("errInvalidData") };

  const db = getDb();
  const [before] = await db
    .select()
    .from(schema.recurringCosts)
    .where(eq(schema.recurringCosts.id, id))
    .limit(1);
  if (!before) return { ok: false, error: t("errRecurringNotFound") };

  const modelId = await modelIdOfCar(before.carId);

  try {
    // The generated expense rows deliberately SURVIVE: they are real costs that
    // were really incurred, and deleting the schedule they came from must not
    // rewrite last year's accounts. The FK nulls their `recurring_id`, which
    // turns them into ordinary manual entries.
    await db
      .delete(schema.recurringCosts)
      .where(eq(schema.recurringCosts.id, id));

    await recordAudit({
      adminId: admin.id,
      action: "fleet.recurring.delete",
      entity: "recurring_cost",
      entityId: id,
      before: {
        carId: before.carId,
        category: before.category,
        amountGrosze: before.amountGrosze,
        interval: before.interval,
      },
    });
    if (modelId) revalidateEconomics(modelId, before.carId);
    return { ok: true };
  } catch (err) {
    adminActionFailed("deleteRecurring", err);
    return { ok: false, error: t("errGeneric") };
  }
}

/**
 * Write the expense rows this definition owes, up to today.
 *
 * Safe to press repeatedly: the unique index on (`recurring_id`,
 * `period_start`) rejects a period that already exists, and
 * `onConflictDoNothing` turns that rejection into a no-op rather than an error.
 * That is the whole idempotence mechanism — do not replace it with a "does it
 * exist?" query, which two quick clicks would both pass.
 */
export async function generateRecurring(
  id: string,
): Promise<FormResult & { created?: number }> {
  const t = await getTranslations("Admin.fleet");
  const admin = await requirePermission("finanse.edytuj");
  if (!UUID_RE.test(id)) return { ok: false, error: t("errInvalidData") };

  const db = getDb();
  const [def] = await db
    .select()
    .from(schema.recurringCosts)
    .where(eq(schema.recurringCosts.id, id))
    .limit(1);
  if (!def) return { ok: false, error: t("errRecurringNotFound") };
  if (!def.active)
    return {
      ok: false,
      error: t("errRecurringDisabled"),
    };

  const modelId = await modelIdOfCar(def.carId);
  if (!modelId) return { ok: false, error: t("errCarNotFound") };

  const today = new Date().toISOString().slice(0, 10);
  const periods = occurrencesUpTo(
    {
      interval: def.interval as RecurringInterval,
      startOn: String(def.startOn).slice(0, 10),
      endOn: def.endOn ? String(def.endOn).slice(0, 10) : null,
    },
    today,
  );
  if (periods.length === 0) {
    return { ok: true, created: 0 };
  }

  try {
    const inserted = await db
      .insert(schema.carExpenses)
      .values(
        periods.map((p) => ({
          carId: def.carId,
          category: def.category,
          amountGrosze: def.amountGrosze,
          incurredOn: p.periodStart,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          recurringId: def.id,
          note: def.note,
          createdBy: admin.id,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: schema.carExpenses.id });

    if (inserted.length > 0) {
      await recordAudit({
        adminId: admin.id,
        action: "fleet.recurring.generate",
        entity: "recurring_cost",
        entityId: def.id,
        after: { created: inserted.length, upTo: today },
      });
    }
    revalidateEconomics(modelId, def.carId);
    return { ok: true, created: inserted.length };
  } catch (err) {
    adminActionFailed("generateRecurring", err);
    return { ok: false, error: t("errGeneric") };
  }
}

/* ── Terminy i obowiązki przy aucie ───────────────────────────────────────── */

const deadlineInput = z.object({
  carId: z.string().uuid(),
  kind: z.enum(DEADLINE_KINDS),
  title: z.string().trim().min(2).max(160),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.preprocess(
    (v) => (String(v ?? "").trim() === "" ? null : String(v).replace(",", ".")),
    z.coerce.number().nullable(),
  ),
  note: z.string().trim().max(500),
});

export type DeadlineResult = { ok: true } | { ok: false; error: string };

/**
 * Attach a dated obligation to a car — a fine, a damage claim, a deposit, a
 * prep job, anything with a date. The alert list reads these directly, so
 * saving one here is the whole of "make it show up in ALERTY".
 */
export async function addDeadline(
  _prev: DeadlineResult | null,
  formData: FormData,
): Promise<DeadlineResult> {
  const t = await getTranslations("Admin.fleet");
  const admin = await requirePermission("flota.edytuj");
  const parsed = deadlineInput.safeParse({
    carId: formData.get("carId") ?? "",
    kind: formData.get("kind") ?? "other",
    title: formData.get("title") ?? "",
    dueOn: formData.get("dueOn") ?? "",
    amount: formData.get("amount") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return {
      ok: false,
      error:
        field === "title"
          ? t("errDeadlineName")
          : field === "dueOn"
            ? t("errDeadlineDate")
            : t("errDeadlineCheck"),
    };
  }
  const d = parsed.data;
  try {
    await getDb().insert(schema.carDeadlines).values({
      carId: d.carId,
      kind: d.kind,
      title: d.title,
      dueOn: d.dueOn,
      amountGrosze: d.amount == null ? null : Math.round(d.amount * 100),
      note: d.note || null,
      createdBy: admin.id,
    });
    await recordAudit({
      adminId: admin.id,
      action: "car.deadline.add",
      entity: "car",
      entityId: d.carId,
      after: { kind: d.kind, title: d.title, dueOn: d.dueOn },
    });
    revalidatePath("/admin");
    revalidatePath("/admin/alerty");
    revalidatePath("/admin/fleet");
    return { ok: true };
  } catch (err) {
    adminActionFailed("deadlineSave", err);
    return { ok: false, error: t("errDeadlineSave") };
  }
}

/** Mark it dealt with. The row stays — "opłacone 4.08" is an answer somebody needs later. */
export async function completeDeadline(
  _prev: DeadlineResult | null,
  formData: FormData,
): Promise<DeadlineResult> {
  const t = await getTranslations("Admin.fleet");
  const admin = await requirePermission("flota.edytuj");
  const id = String(formData.get("id") ?? "");
  const carId = String(formData.get("carId") ?? "");
  if (!UUID_RE.test(id) || !UUID_RE.test(carId)) {
    return { ok: false, error: t("errInvalidDataShort") };
  }
  try {
    await markDone(id, carId);
    await recordAudit({
      adminId: admin.id,
      action: "car.deadline.done",
      entity: "car",
      entityId: carId,
      after: { deadlineId: id },
    });
    revalidatePath("/admin");
    revalidatePath("/admin/alerty");
    revalidatePath("/admin/fleet");
    return { ok: true };
  } catch (err) {
    adminActionFailed("deadlineComplete", err);
    return { ok: false, error: t("errDeadlineDone") };
  }
}
