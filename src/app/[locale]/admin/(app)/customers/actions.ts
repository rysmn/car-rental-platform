"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/auth/audit";
import { normalisePhone, upsertCustomer } from "@/lib/admin/customers";
import { adminActionFailed } from "@/lib/alerts/admin";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { CUSTOMER_FLAGS } from "@/lib/admin/customer-flags";
import { getTranslations } from "next-intl/server";

type Tr = (key: string, values?: Record<string, string | number>) => string;

function customerInputSchema(t: Tr) {
  return z.object({
    name: z.string().trim().min(2, t("errNameInvalid")).max(120),
    phone: z.string().trim().min(6, t("errPhoneInvalid")).max(40),
    email: z
      .string()
      .trim()
      .max(200)
      .refine(
        (v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        t("errEmailInvalid"),
      ),
    notes: z.string().trim().max(1000),
  });
}

export type CustomerResult =
  | { ok: true; id: string; name: string }
  | {
      ok: false;
      error: "validation" | "server";
      fieldErrors?: Record<string, string>;
      values?: Record<string, string>;
    };

/**
 * Add a customer by hand, before or without a booking.
 *
 * Deliberately the same `upsertCustomer` the phone booking uses: entering
 * somebody who already exists updates their record instead of failing with a
 * duplicate-key error, which is the only sane behaviour when the person on the
 * phone cannot remember whether they rented from you last year.
 */
export async function createCustomer(
  _prev: CustomerResult | null,
  formData: FormData,
): Promise<CustomerResult> {
  const admin = await requirePermission("klienci.podglad");
  const t = await getTranslations("Admin.customers");

  const values: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string" && !k.startsWith("$")) values[k] = v;
  }

  const parsed = customerInputSchema(t).safeParse({
    name: formData.get("name") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "validation", fieldErrors, values };
  }

  const d = parsed.data;
  if (normalisePhone(d.phone).length < 7) {
    return {
      ok: false,
      error: "validation",
      fieldErrors: { phone: t("errPhoneIncomplete") },
      values,
    };
  }

  try {
    const id = await upsertCustomer(d);
    if (!id) return { ok: false, error: "server", values };

    await recordAudit({
      adminId: admin.id,
      action: "customer.upsert",
      entity: "customer",
      entityId: id,
      after: { name: d.name, phone: normalisePhone(d.phone) },
    });

    revalidatePath("/admin/customers");
    return { ok: true, id, name: d.name };
  } catch (err) {
    adminActionFailed("customerSave", err);
    return { ok: false, error: "server", values };
  }
}

/* ── Flaga wewnętrzna i notatka ───────────────────────────────────────────── */

const flagInput = z.object({
  id: z.string().uuid(),
  flag: z.enum(CUSTOMER_FLAGS),
  notes: z.string().trim().max(1000),
});

export type FlagResult = { ok: true } | { ok: false; error: string };

/**
 * Ustaw wewnętrzną flagę klienta i notatkę biura.
 *
 * „Nie wynajmować" bez uzasadnienia jest odmówione **przez tę akcję**, nie
 * przez sumienie operatora: za pół roku nikt nie będzie pamiętał, dlaczego ten
 * człowiek nie może wynająć auta, a flaga bez powodu zamienia się w zasadę,
 * której nikt nie umie zdjąć. Kto stawia flagę, ten pisze dlaczego — i zostaje
 * po nim wpis w dzienniku zdarzeń.
 */
export async function setCustomerFlag(
  _prev: FlagResult | null,
  formData: FormData,
): Promise<FlagResult> {
  const admin = await requirePermission("klienci.podglad");
  const t = await getTranslations("Admin.customers");
  const parsed = flagInput.safeParse({
    id: formData.get("id") ?? "",
    flag: formData.get("flag") ?? "none",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { ok: false, error: t("errFixInput") };
  const d = parsed.data;

  if (d.flag === "blocked" && !d.notes) {
    return {
      ok: false,
      error: t("errFlagReason"),
    };
  }

  try {
    const [before] = await getDb()
      .select({ flag: schema.customers.flag, notes: schema.customers.notes })
      .from(schema.customers)
      .where(eq(schema.customers.id, d.id));
    if (!before) return { ok: false, error: t("errNoCustomer") };

    await getDb()
      .update(schema.customers)
      .set({ flag: d.flag, notes: d.notes || null, updatedAt: new Date() })
      .where(eq(schema.customers.id, d.id));

    await recordAudit({
      adminId: admin.id,
      action: "customer.flag",
      entity: "customer",
      entityId: d.id,
      before: { flag: before.flag },
      after: { flag: d.flag },
    });
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${d.id}`);
    return { ok: true };
  } catch (err) {
    adminActionFailed("customerFlag", err);
    return { ok: false, error: t("errFlagSaveFailed") };
  }
}

/* ── Dane kontaktowe: imię, telefon, e-mail ───────────────────────────────── */

export type ContactResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Poprawia imię, telefon i e-mail klienta.
 *
 * Klient jest identyfikowany po `id`, nie po telefonie, więc poprawka numeru
 * nie scala ani nie blokuje rekordów. Zmiana jest zapisana w dzienniku
 * zdarzeń z wartościami sprzed i po.
 */
export async function updateCustomerContact(
  _prev: ContactResult | null,
  formData: FormData,
): Promise<ContactResult> {
  const admin = await requirePermission("klienci.podglad");
  const t = await getTranslations("Admin.customers");

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: t("errNoCustomer") };
  }

  const parsed = customerInputSchema(t)
    .omit({ notes: true })
    .safeParse({
      name: formData.get("name") ?? "",
      phone: formData.get("phone") ?? "",
      email: formData.get("email") ?? "",
    });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: t("errFixInput"), fieldErrors };
  }
  const d = parsed.data;
  const phone = normalisePhone(d.phone);
  if (phone.length < 7) {
    return {
      ok: false,
      error: t("errFixInput"),
      fieldErrors: { phone: t("errPhoneIncomplete") },
    };
  }

  try {
    const db = getDb();
    const [before] = await db
      .select({
        name: schema.customers.name,
        phone: schema.customers.phone,
        email: schema.customers.email,
      })
      .from(schema.customers)
      .where(eq(schema.customers.id, id));
    if (!before) return { ok: false, error: t("errNoCustomer") };

    const email = d.email.trim() || null;
    await db
      .update(schema.customers)
      .set({
        name: d.name,
        phone,
        phoneDisplay: d.phone,
        email,
        updatedAt: new Date(),
      })
      .where(eq(schema.customers.id, id));

    await recordAudit({
      adminId: admin.id,
      action: "customer.contact",
      entity: "customer",
      entityId: id,
      before: { name: before.name, phone: before.phone, email: before.email },
      after: { name: d.name, phone, email },
    });
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${id}`);
    return { ok: true };
  } catch (err) {
    adminActionFailed("customerContact", err);
    return { ok: false, error: t("errFlagSaveFailed") };
  }
}
