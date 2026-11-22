"use server";

import { revalidatePath } from "next/cache";
import { bramaKrytyczna } from "@/lib/auth/critical";
import { ADMIN_ROLES } from "@/lib/auth/permissions";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/auth/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { countActiveSuperadmins } from "@/lib/admin/admins";
import { MIN_PASSWORD_LENGTH } from "./constants";
import { adminActionFailed } from "@/lib/alerts/admin";
import { getTranslations } from "next-intl/server";

export type ActionResult =
  { ok: true; message?: string } | { ok: false; error: string };

type Tr = (key: string, values?: Record<string, string | number>) => string;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function genericFailure(t: Tr): ActionResult {
  return { ok: false, error: t("genericError") };
}

function passwordSchema(t: Tr) {
  return z
    .string()
    .min(MIN_PASSWORD_LENGTH, t("passwordMin", { min: MIN_PASSWORD_LENGTH }))
    .max(200, t("passwordMax"));
}

function createSchema(t: Tr) {
  return z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(200)
      .pipe(z.email(t("emailInvalid"))),
    name: z.string().trim().min(1, t("nameRequired")).max(120),
    /*
      Trzy role od rozdziału 13.6. Kolejność w enumie nie ma tu znaczenia — zbiór
      jest zamknięty, a co która rola może, rozstrzyga `lib/auth/permissions`,
      nie ten walidator.
    */
    role: z.enum(ADMIN_ROLES),
    password: passwordSchema(t),
  });
}

function firstError(err: z.ZodError, t: Tr): ActionResult {
  return { ok: false, error: err.issues[0]?.message ?? t("invalidData") };
}

/** Unique-violation on admins.email — the only conflict this table can raise. */
function isDuplicateEmail(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}

function revalidateUsers() {
  revalidatePath("/admin/users");
}

/* ── Create ──────────────────────────────────────────────────────────────── */

export async function createAdminAccount(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const brama = await bramaKrytyczna("konta.zarzadzaj");
  if (!brama.ok) return { ok: false, error: brama.error };
  const actor = brama.admin;
  const t = await getTranslations("Admin.users");

  const parsed = createSchema(t).safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role"),
    password: formData.get("password"),
  });
  if (!parsed.success) return firstError(parsed.error, t);
  const d = parsed.data;

  try {
    const db = getDb();
    const [created] = await db
      .insert(schema.admins)
      .values({
        email: d.email,
        name: d.name,
        role: d.role,
        passwordHash: await hashPassword(d.password),
      })
      .returning({ id: schema.admins.id });

    await recordAudit({
      adminId: actor.id,
      action: "admin.create",
      entity: "admin",
      entityId: created.id,
      after: { email: d.email, name: d.name, role: d.role },
    });
    revalidateUsers();
    return { ok: true, message: t("accountCreated", { email: d.email }) };
  } catch (err) {
    if (isDuplicateEmail(err)) {
      return { ok: false, error: t("duplicateEmail") };
    }
    adminActionFailed("createAdminAccount", err);
    return genericFailure(t);
  }
}

/* ── Edit (name / role / active) ─────────────────────────────────────────── */

function updateSchema(t: Tr) {
  return z.object({
    id: z.string().regex(UUID_RE),
    name: z.string().trim().min(1, t("nameRequired")).max(120),
    /*
      Trzy role od rozdziału 13.6. Kolejność w enumie nie ma tu znaczenia — zbiór
      jest zamknięty, a co która rola może, rozstrzyga `lib/auth/permissions`,
      nie ten walidator.
    */
    role: z.enum(ADMIN_ROLES),
    active: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  });
}

export async function updateAdminAccount(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const brama = await bramaKrytyczna("konta.zarzadzaj");
  if (!brama.ok) return { ok: false, error: brama.error };
  const actor = brama.admin;

  const t = await getTranslations("Admin.users");
  const parsed = updateSchema(t).safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    role: formData.get("role"),
    active: formData.get("active"),
  });
  if (!parsed.success) return firstError(parsed.error, t);
  const d = parsed.data;

  try {
    const db = getDb();
    const [before] = await db
      .select({
        id: schema.admins.id,
        email: schema.admins.email,
        name: schema.admins.name,
        role: schema.admins.role,
        active: schema.admins.active,
      })
      .from(schema.admins)
      .where(eq(schema.admins.id, d.id))
      .limit(1);
    if (!before) return { ok: false, error: t("notFound") };

    // Locking yourself out is the one mistake this screen can make irreversible
    // from the panel, so self-demotion and self-deactivation are refused here.
    if (before.id === actor.id && d.role !== "superadmin") {
      return { ok: false, error: t("cannotDemoteSelf") };
    }
    if (before.id === actor.id && !d.active) {
      return { ok: false, error: t("cannotDeactivateSelf") };
    }

    const losesSuperadmin =
      before.role === "superadmin" &&
      before.active &&
      (d.role !== "superadmin" || !d.active);
    if (losesSuperadmin && (await countActiveSuperadmins()) <= 1) {
      return { ok: false, error: t("lastSuperadmin") };
    }

    await db
      .update(schema.admins)
      .set({
        name: d.name,
        role: d.role,
        active: d.active,
        updatedAt: new Date(),
        // Re-activating an account clears any lockout it was carrying.
        ...(d.active && !before.active
          ? { failedAttempts: 0, lockedUntil: null }
          : {}),
      })
      .where(eq(schema.admins.id, d.id));

    await recordAudit({
      adminId: actor.id,
      action: "admin.update",
      entity: "admin",
      entityId: d.id,
      before,
      after: { ...before, name: d.name, role: d.role, active: d.active },
    });
    revalidateUsers();
    return { ok: true, message: t("saved") };
  } catch (err) {
    adminActionFailed("updateAdminAccount", err);
    return genericFailure(t);
  }
}

/* ── Password reset (superadmin sets someone else's password) ────────────── */

function setPasswordSchema(t: Tr) {
  return z.object({
    id: z.string().regex(UUID_RE),
    password: passwordSchema(t),
  });
}

export async function setAdminPassword(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const brama = await bramaKrytyczna("konta.zarzadzaj");
  if (!brama.ok) return { ok: false, error: brama.error };
  const actor = brama.admin;

  const t = await getTranslations("Admin.users");
  const parsed = setPasswordSchema(t).safeParse({
    id: formData.get("id"),
    password: formData.get("password"),
  });
  if (!parsed.success) return firstError(parsed.error, t);
  const d = parsed.data;

  try {
    const db = getDb();
    const [target] = await db
      .select({ id: schema.admins.id, email: schema.admins.email })
      .from(schema.admins)
      .where(eq(schema.admins.id, d.id))
      .limit(1);
    if (!target) return { ok: false, error: t("notFound") };

    await db
      .update(schema.admins)
      .set({
        passwordHash: await hashPassword(d.password),
        // A new password also lifts the brute-force lockout.
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.admins.id, d.id));

    // Never audit the password itself — only that it changed, and by whom.
    await recordAudit({
      adminId: actor.id,
      action: "admin.password.reset",
      entity: "admin",
      entityId: d.id,
      after: { email: target.email },
    });
    revalidateUsers();
    return { ok: true, message: t("passwordSetFor", { email: target.email }) };
  } catch (err) {
    adminActionFailed("setAdminPassword", err);
    return genericFailure(t);
  }
}

/* ── Own password (available to every admin) ─────────────────────────────── */

function changeOwnSchema(t: Tr) {
  return z
    .object({
      current: z.string().min(1, t("currentRequired")),
      password: passwordSchema(t),
      confirm: z.string(),
    })
    .refine((d) => d.password === d.confirm, {
      message: t("passwordsDiffer"),
      path: ["confirm"],
    });
}

export async function changeOwnPassword(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireAdmin();

  const t = await getTranslations("Admin.users");
  const parsed = changeOwnSchema(t).safeParse({
    current: formData.get("current"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return firstError(parsed.error, t);
  const d = parsed.data;

  try {
    const db = getDb();
    const [row] = await db
      .select({ passwordHash: schema.admins.passwordHash })
      .from(schema.admins)
      .where(eq(schema.admins.id, actor.id))
      .limit(1);
    if (!row) return { ok: false, error: t("notFound") };

    // Knowing the current password is what makes this safe to expose to every
    // admin — a hijacked open session still cannot silently take the account.
    if (!(await verifyPassword(row.passwordHash, d.current))) {
      return { ok: false, error: t("currentWrong") };
    }

    await db
      .update(schema.admins)
      .set({
        passwordHash: await hashPassword(d.password),
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.admins.id, actor.id));

    await recordAudit({
      adminId: actor.id,
      action: "admin.password.change",
      entity: "admin",
      entityId: actor.id,
    });
    revalidateUsers();
    return { ok: true, message: t("passwordChanged") };
  } catch (err) {
    adminActionFailed("changeOwnPassword", err);
    return genericFailure(t);
  }
}

/* ── Unlock ──────────────────────────────────────────────────────────────── */

export async function unlockAdminAccount(id: string): Promise<ActionResult> {
  const brama = await bramaKrytyczna("konta.zarzadzaj");
  if (!brama.ok) return { ok: false, error: brama.error };
  const actor = brama.admin;
  const t = await getTranslations("Admin.users");
  if (!UUID_RE.test(id)) return { ok: false, error: t("invalidData") };

  try {
    const db = getDb();
    await db
      .update(schema.admins)
      .set({ failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(schema.admins.id, id));

    await recordAudit({
      adminId: actor.id,
      action: "admin.unlock",
      entity: "admin",
      entityId: id,
    });
    revalidateUsers();
    return { ok: true, message: t("unlocked") };
  } catch (err) {
    adminActionFailed("unlockAdminAccount", err);
    return genericFailure(t);
  }
}

/* ── Delete ──────────────────────────────────────────────────────────────── */

export async function deleteAdminAccount(id: string): Promise<ActionResult> {
  const brama = await bramaKrytyczna("konta.zarzadzaj");
  if (!brama.ok) return { ok: false, error: brama.error };
  const actor = brama.admin;
  const t = await getTranslations("Admin.users");
  if (!UUID_RE.test(id)) return { ok: false, error: t("invalidData") };
  if (id === actor.id) {
    return { ok: false, error: t("cannotDeleteSelf") };
  }

  try {
    const db = getDb();
    const [target] = await db
      .select({
        id: schema.admins.id,
        email: schema.admins.email,
        name: schema.admins.name,
        role: schema.admins.role,
        active: schema.admins.active,
      })
      .from(schema.admins)
      .where(eq(schema.admins.id, id))
      .limit(1);
    if (!target) return { ok: false, error: t("notFound") };

    if (
      target.role === "superadmin" &&
      target.active &&
      (await countActiveSuperadmins()) <= 1
    ) {
      return { ok: false, error: t("lastSuperadminDelete") };
    }

    // The audit trail keeps this admin's past entries; `admin_id` is declared
    // ON DELETE SET NULL, so the history survives as "system" rather than
    // vanishing with the account.
    await db.delete(schema.admins).where(eq(schema.admins.id, id));

    await recordAudit({
      adminId: actor.id,
      action: "admin.delete",
      entity: "admin",
      entityId: id,
      before: target,
    });
    revalidateUsers();
    return { ok: true, message: t("accountDeleted", { email: target.email }) };
  } catch (err) {
    adminActionFailed("deleteAdminAccount", err);
    return genericFailure(t);
  }
}

/* ── Own profile (name and phone; every admin edits their own) ────────────── */

function ownProfileSchema(t: Tr) {
  return z.object({
    name: z.string().trim().min(1, t("nameRequired")).max(120),
    /**
     * Deliberately loose: "+48 884 762 950", "884762950" and "+48-884-762-950"
     * are the same number, and rejecting a format a person actually uses buys
     * nothing. Empty clears it.
     */
    phone: z
      .string()
      .trim()
      .max(40, t("phoneTooLong"))
      .transform((s) => s || null),
  });
}

/**
 * Name and phone only.
 *
 * The email is NOT editable here on purpose: it is the login identifier, and
 * changing it from a session that is already open is the one move that turns a
 * stolen session into a stolen account. It stays with account management, which
 * requires a superadmin.
 */
export async function updateOwnProfile(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireAdmin();
  const t = await getTranslations("Admin.users");

  const parsed = ownProfileSchema(t).safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") ?? "",
  });
  if (!parsed.success) return firstError(parsed.error, t);
  const d = parsed.data;

  try {
    const db = getDb();
    const [before] = await db
      .select({ name: schema.admins.name, phone: schema.admins.phone })
      .from(schema.admins)
      .where(eq(schema.admins.id, actor.id))
      .limit(1);

    await db
      .update(schema.admins)
      .set({ name: d.name, phone: d.phone, updatedAt: new Date() })
      .where(eq(schema.admins.id, actor.id));

    await recordAudit({
      adminId: actor.id,
      action: "admin.profile.update",
      entity: "admin",
      entityId: actor.id,
      before,
      after: { name: d.name, phone: d.phone },
    });
    revalidateUsers();
    revalidatePath("/admin/settings/konto");
    // The sidebar prints the admin's name on every page.
    revalidatePath("/admin", "layout");
    return { ok: true, message: t("profileSaved") };
  } catch (err) {
    adminActionFailed("updateOwnProfile", err);
    return genericFailure(t);
  }
}
