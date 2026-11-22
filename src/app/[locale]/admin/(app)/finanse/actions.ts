"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/auth/audit";
import { saveInvoice, deleteInvoice } from "@/lib/storage/invoices";
import { BUSINESS_EXPENSE_CATEGORIES } from "@/lib/admin/business-expense-options";
import {
  RECURRING_INTERVALS,
  occurrencesUpTo,
  type RecurringInterval,
} from "@/lib/admin/recurring-options";
import { adminActionFailed } from "@/lib/alerts/admin";

/**
 * Writes for company costs.
 *
 * Deliberately a sibling of `fleet/actions.ts` rather than an extension of it:
 * the two write different tables with different vocabularies, and the one thing
 * they must never do is share a code path that could put a marketing invoice on
 * a car's profit and loss.
 */

export type FormResult = { ok: true } | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

const text = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.trim() || null);

/** Field keys that appear in validation messages, translated per request. */
const FIELD_KEYS = [
  "category",
  "amount",
  "incurredOn",
  "periodStart",
  "periodEnd",
  "interval",
  "startOn",
  "endOn",
  "vendor",
  "note",
] as const;

async function zodError(e: z.ZodError): Promise<FormResult> {
  const t = await getTranslations("Admin.finance");
  const first = e.issues[0];
  const key = first?.path[0];
  const known = FIELD_KEYS.find((k) => k === key);
  return {
    ok: false,
    error: known
      ? t("errors.checkField", { field: t(`fields.${known}`) })
      : t("errors.invalidForm"),
  };
}

const ExpenseSchema = z
  .object({
    category: z.enum(BUSINESS_EXPENSE_CATEGORIES),
    amount: moneyPln,
    // Required and never defaulted to today: a cost typed a week after the fact
    // and silently stamped "now" lands in the wrong month of every chart.
    incurredOn: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/),
    periodStart: dateOrNull,
    periodEnd: dateOrNull,
    vendor: text(120),
    note: text(500),
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

/**
 * Reads the optional invoice off the form.
 *
 * `undefined` means "leave whatever is attached alone" — distinct from a null
 * that would clear it. An empty file input posts a zero-byte File, not nothing,
 * which is why the size check comes first.
 */
async function readInvoice(
  formData: FormData,
): Promise<{ ok: true; url?: string } | { ok: false; error: string }> {
  const file = formData.get("invoice");
  if (!(file instanceof File) || file.size === 0) return { ok: true };
  const saved = await saveInvoice(file);
  if (!saved.ok) {
    const t = await getTranslations("Admin.finance");
    const KEYS: Record<string, string> = {
      empty: "errors.invoiceEmpty",
      too_large: "errors.invoiceTooLarge",
      unsupported_type: "errors.invoiceType",
      write_failed: "errors.invoiceWrite",
    };
    return {
      ok: false,
      error: KEYS[saved.error] ? t(KEYS[saved.error]) : t("errors.invoiceGeneric"),
    };
  }
  return { ok: true, url: saved.url };
}

/**
 * A company cost changes the company result and nothing else — no model page,
 * no per-car P&L. Analityka is revalidated too because it shows fleet totals
 * beside the same months.
 */
function revalidateFinance() {
  revalidatePath("/admin/finanse");
  revalidatePath("/admin/analytics");
  revalidatePath("/admin");
}

/* ── Company expenses ─────────────────────────────────────────────────────── */

export async function createBusinessExpense(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  const admin = await requirePermission("finanse.edytuj");
  const t = await getTranslations("Admin.finance");
  const parsed = ExpenseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return await zodError(parsed.error);
  const d = parsed.data;

  const invoice = await readInvoice(formData);
  if (!invoice.ok) return { ok: false, error: invoice.error };

  try {
    const [row] = await getDb()
      .insert(schema.businessExpenses)
      .values({
        category: d.category,
        amountGrosze: d.amount,
        incurredOn: d.incurredOn,
        periodStart: d.periodStart,
        periodEnd: d.periodEnd,
        vendor: d.vendor,
        invoicePath: invoice.url ?? null,
        note: d.note,
        createdBy: admin.id,
      })
      .returning({ id: schema.businessExpenses.id });

    await recordAudit({
      adminId: admin.id,
      action: "finance.expense.create",
      entity: "business_expense",
      entityId: row.id,
      after: {
        category: d.category,
        amountGrosze: d.amount,
        incurredOn: d.incurredOn,
        vendor: d.vendor,
      },
    });
    revalidateFinance();
    return { ok: true };
  } catch (err) {
    adminActionFailed("createBusinessExpense", err);
    return { ok: false, error: await t("errors.generic") };
  }
}

export async function updateBusinessExpense(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  const admin = await requirePermission("finanse.edytuj");
  const t = await getTranslations("Admin.finance");
  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) return { ok: false, error: await t("errors.invalidData") };
  const parsed = ExpenseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return await zodError(parsed.error);
  const d = parsed.data;

  const db = getDb();
  try {
    const [before] = await db
      .select()
      .from(schema.businessExpenses)
      .where(eq(schema.businessExpenses.id, id))
      .limit(1);
    if (!before) return { ok: false, error: await t("errors.expenseNotFound") };

    const invoice = await readInvoice(formData);
    if (!invoice.ok) return { ok: false, error: invoice.error };

    await db
      .update(schema.businessExpenses)
      .set({
        category: d.category,
        amountGrosze: d.amount,
        incurredOn: d.incurredOn,
        periodStart: d.periodStart,
        periodEnd: d.periodEnd,
        vendor: d.vendor,
        // Only overwritten when a new file was actually chosen; saving the row
        // without touching the file input must not detach the invoice.
        ...(invoice.url ? { invoicePath: invoice.url } : {}),
        note: d.note,
        updatedAt: new Date(),
      })
      .where(eq(schema.businessExpenses.id, id));

    // Remove the superseded scan only after the row committed, so a failure
    // cannot leave the record pointing at a file that no longer exists.
    if (invoice.url && before.invoicePath) {
      await deleteInvoice(before.invoicePath).catch(() => {});
    }

    await recordAudit({
      adminId: admin.id,
      action: "finance.expense.update",
      entity: "business_expense",
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
    revalidateFinance();
    return { ok: true };
  } catch (err) {
    adminActionFailed("updateBusinessExpense", err);
    return { ok: false, error: await t("errors.generic") };
  }
}

export async function deleteBusinessExpense(id: string): Promise<FormResult> {
  const admin = await requirePermission("finanse.edytuj");
  const t = await getTranslations("Admin.finance");
  if (!UUID_RE.test(id)) return { ok: false, error: await t("errors.invalidData") };

  const db = getDb();
  const [before] = await db
    .select()
    .from(schema.businessExpenses)
    .where(eq(schema.businessExpenses.id, id))
    .limit(1);
  if (!before) return { ok: false, error: await t("errors.expenseNotFound") };

  try {
    await db
      .delete(schema.businessExpenses)
      .where(eq(schema.businessExpenses.id, id));
    await deleteInvoice(before.invoicePath).catch(() => {});
    await recordAudit({
      adminId: admin.id,
      action: "finance.expense.delete",
      entity: "business_expense",
      entityId: id,
      before: {
        category: before.category,
        amountGrosze: before.amountGrosze,
        incurredOn: before.incurredOn,
        vendor: before.vendor,
      },
    });
    revalidateFinance();
    return { ok: true };
  } catch (err) {
    adminActionFailed("deleteBusinessExpense", err);
    return { ok: false, error: await t("errors.generic") };
  }
}

/* ── Recurring company costs ──────────────────────────────────────────────── */

const RecurringSchema = z
  .object({
    category: z.enum(BUSINESS_EXPENSE_CATEGORIES),
    amount: moneyPln,
    interval: z.enum(RECURRING_INTERVALS),
    startOn: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/),
    endOn: dateOrNull,
    vendor: text(120),
    note: text(500),
    active: bool,
  })
  .refine((d) => d.endOn == null || d.endOn >= d.startOn, { path: ["endOn"] });

export async function createBusinessRecurring(
  _prev: FormResult | null,
  formData: FormData,
): Promise<FormResult> {
  const admin = await requirePermission("finanse.edytuj");
  const t = await getTranslations("Admin.finance");
  const parsed = RecurringSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return await zodError(parsed.error);
  const d = parsed.data;

  try {
    const [row] = await getDb()
      .insert(schema.businessRecurringCosts)
      .values({
        category: d.category,
        amountGrosze: d.amount,
        interval: d.interval,
        startOn: d.startOn,
        endOn: d.endOn,
        vendor: d.vendor,
        note: d.note,
        active: d.active,
        createdBy: admin.id,
      })
      .returning({ id: schema.businessRecurringCosts.id });

    await recordAudit({
      adminId: admin.id,
      action: "finance.recurring.create",
      entity: "business_recurring_cost",
      entityId: row.id,
      after: {
        category: d.category,
        amountGrosze: d.amount,
        interval: d.interval,
        startOn: d.startOn,
        vendor: d.vendor,
      },
    });
    revalidateFinance();
    return { ok: true };
  } catch (err) {
    adminActionFailed("createBusinessRecurring", err);
    return { ok: false, error: await t("errors.generic") };
  }
}

export async function deleteBusinessRecurring(id: string): Promise<FormResult> {
  const admin = await requirePermission("finanse.edytuj");
  const t = await getTranslations("Admin.finance");
  if (!UUID_RE.test(id)) return { ok: false, error: await t("errors.invalidData") };

  const db = getDb();
  const [before] = await db
    .select()
    .from(schema.businessRecurringCosts)
    .where(eq(schema.businessRecurringCosts.id, id))
    .limit(1);
  if (!before) return { ok: false, error: await t("errors.recurringNotFound") };

  try {
    // The generated rows deliberately SURVIVE: they are real costs that were
    // really incurred, and deleting the schedule they came from must not
    // rewrite last year's accounts. The FK nulls their `recurring_id`, which
    // turns them into ordinary manual entries.
    await db
      .delete(schema.businessRecurringCosts)
      .where(eq(schema.businessRecurringCosts.id, id));

    await recordAudit({
      adminId: admin.id,
      action: "finance.recurring.delete",
      entity: "business_recurring_cost",
      entityId: id,
      before: {
        category: before.category,
        amountGrosze: before.amountGrosze,
        interval: before.interval,
        vendor: before.vendor,
      },
    });
    revalidateFinance();
    return { ok: true };
  } catch (err) {
    adminActionFailed("deleteBusinessRecurring", err);
    return { ok: false, error: await t("errors.generic") };
  }
}

/**
 * Write the expense rows this subscription owes, up to today.
 *
 * Safe to press repeatedly: the unique index on (`recurring_id`,
 * `period_start`) rejects a period that already exists and
 * `onConflictDoNothing` turns that rejection into a no-op. That is the whole
 * idempotence mechanism — do not replace it with a "does it exist?" query,
 * which two quick clicks would both pass.
 */
export async function generateBusinessRecurring(
  id: string,
): Promise<FormResult & { created?: number }> {
  const admin = await requirePermission("finanse.edytuj");
  const t = await getTranslations("Admin.finance");
  if (!UUID_RE.test(id)) return { ok: false, error: await t("errors.invalidData") };

  const db = getDb();
  const [def] = await db
    .select()
    .from(schema.businessRecurringCosts)
    .where(eq(schema.businessRecurringCosts.id, id))
    .limit(1);
  if (!def) return { ok: false, error: await t("errors.recurringNotFound") };
  if (!def.active) {
    return {
      ok: false,
      error: await t("errors.recurringInactive"),
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const periods = occurrencesUpTo(
    {
      interval: def.interval as RecurringInterval,
      startOn: String(def.startOn).slice(0, 10),
      endOn: def.endOn ? String(def.endOn).slice(0, 10) : null,
    },
    today,
  );
  if (periods.length === 0) return { ok: true, created: 0 };

  try {
    const inserted = await db
      .insert(schema.businessExpenses)
      .values(
        periods.map((p) => ({
          category: def.category,
          amountGrosze: def.amountGrosze,
          incurredOn: p.periodStart,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          recurringId: def.id,
          vendor: def.vendor,
          note: def.note,
          createdBy: admin.id,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: schema.businessExpenses.id });

    if (inserted.length > 0) {
      await recordAudit({
        adminId: admin.id,
        action: "finance.recurring.generate",
        entity: "business_recurring_cost",
        entityId: def.id,
        after: { created: inserted.length, upTo: today },
      });
    }
    revalidateFinance();
    return { ok: true, created: inserted.length };
  } catch (err) {
    adminActionFailed("generateBusinessRecurring", err);
    return { ok: false, error: await t("errors.generic") };
  }
}
