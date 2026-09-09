"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/auth/audit";
import { adminActionFailed } from "@/lib/alerts/admin";
import { saveInvoice, deleteInvoice } from "@/lib/storage/invoices";
import { DAMAGE_STATUSES, getDamage } from "@/lib/admin/damages";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** „1 200,50" → 1200.5. Przecinek i spacje, bo tak pisze się kwoty po polsku. */
const money = z
  .string()
  .trim()
  .transform((v) => Number(v.replace(",", ".").replace(/\s/g, "") || "0"))
  .refine((v) => Number.isFinite(v) && v >= 0 && v <= 1_000_000, "Sprawdź kwotę");

const damageInput = z.object({
  carId: z.string().uuid("Wskaż auto"),
  reservationId: z.string().optional(),
  occurredOn: z.string().regex(DATE_RE, "Podaj datę zdarzenia"),
  title: z.string().trim().min(3, "Napisz, co się stało").max(200),
  description: z.string().trim().max(4000),
  status: z.enum(DAMAGE_STATUSES),
  repairCost: money,
  excess: money,
  insurer: z.string().trim().max(120),
  claimNumber: z.string().trim().max(120),
});

export type DamageResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

const PHOTO_ERRORS: Record<string, string> = {
  empty: "Nie wybrano pliku.",
  too_large: "Zdjęcie jest za duże — maksymalnie 8 MB.",
  unsupported_type: "Nieobsługiwany format. Dozwolone: JPG, PNG, WEBP, PDF.",
  write_failed: "Nie udało się zapisać pliku.",
};

function parse(formData: FormData) {
  return damageInput.safeParse({
    carId: formData.get("carId") ?? "",
    reservationId: String(formData.get("reservationId") ?? "") || undefined,
    occurredOn: formData.get("occurredOn") ?? "",
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    status: formData.get("status") ?? "reported",
    repairCost: String(formData.get("repairCost") ?? "0") || "0",
    excess: String(formData.get("excess") ?? "0") || "0",
    insurer: formData.get("insurer") ?? "",
    claimNumber: formData.get("claimNumber") ?? "",
  });
}

/**
 * The customer on a damage is taken FROM the rental, never typed.
 *
 * A damage belongs to whoever had the car, and letting an admin pick a
 * different name is how a repair ends up in the wrong person's history — the
 * one place where being wrong follows a customer around.
 */
async function customerOfReservation(
  reservationId: string | null,
): Promise<string | null> {
  if (!reservationId) return null;
  const [row] = await getDb()
    .select({ customerId: schema.reservations.customerId })
    .from(schema.reservations)
    .where(eq(schema.reservations.id, reservationId));
  return row?.customerId ?? null;
}

export async function createDamage(
  _prev: DamageResult | null,
  formData: FormData,
): Promise<DamageResult> {
  const admin = await requirePermission("wydania.prowadz");
  const parsed = parse(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Popraw dane szkody",
    };
  }
  const d = parsed.data;
  const reservationId =
    d.reservationId && UUID_RE.test(d.reservationId) ? d.reservationId : null;

  try {
    const [row] = await getDb()
      .insert(schema.damages)
      .values({
        carId: d.carId,
        reservationId,
        customerId: await customerOfReservation(reservationId),
        occurredOn: d.occurredOn,
        title: d.title,
        description: d.description || null,
        status: d.status,
        repairCostGrosze: Math.round(d.repairCost * 100),
        excessGrosze: Math.round(d.excess * 100),
        insurer: d.insurer || null,
        claimNumber: d.claimNumber || null,
        closedAt: d.status === "closed" ? new Date() : null,
        createdBy: admin.id,
      })
      .returning({ id: schema.damages.id });

    await recordAudit({
      adminId: admin.id,
      action: "damage.create",
      entity: "damage",
      entityId: row.id,
      after: { title: d.title, status: d.status, carId: d.carId },
    });
    revalidatePath("/admin/szkody");
    revalidatePath("/admin/fleet");
    return { ok: true, id: row.id };
  } catch (err) {
    adminActionFailed("damageCreate", err);
    return { ok: false, error: "Nie udało się zapisać szkody" };
  }
}

export async function updateDamage(
  _prev: DamageResult | null,
  formData: FormData,
): Promise<DamageResult> {
  const admin = await requirePermission("wydania.prowadz");
  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) return { ok: false, error: "Nieprawidłowe dane" };
  const parsed = parse(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Popraw dane szkody",
    };
  }
  const d = parsed.data;
  const reservationId =
    d.reservationId && UUID_RE.test(d.reservationId) ? d.reservationId : null;

  try {
    const before = await getDamage(id);
    if (!before) return { ok: false, error: "Nie ma takiej szkody" };

    await getDb()
      .update(schema.damages)
      .set({
        carId: d.carId,
        reservationId,
        customerId: await customerOfReservation(reservationId),
        occurredOn: d.occurredOn,
        title: d.title,
        description: d.description || null,
        status: d.status,
        repairCostGrosze: Math.round(d.repairCost * 100),
        excessGrosze: Math.round(d.excess * 100),
        insurer: d.insurer || null,
        claimNumber: d.claimNumber || null,
        // Zamknięcie ma datę tylko wtedy, gdy sprawa jest zamknięta — ponowne
        // otwarcie musi ją skasować, inaczej lista twierdzi, że sprawa
        // zamknięta w marcu wciąż trwa.
        closedAt:
          d.status === "closed"
            ? (before.closedAt ? new Date(before.closedAt) : new Date())
            : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.damages.id, id));

    await recordAudit({
      adminId: admin.id,
      action: "damage.update",
      entity: "damage",
      entityId: id,
      before: { status: before.status, repair: before.repairCostGrosze },
      after: { status: d.status, repair: Math.round(d.repairCost * 100) },
    });
    revalidatePath("/admin/szkody");
    revalidatePath(`/admin/szkody/${id}`);
    revalidatePath("/admin/fleet");
    return { ok: true, id };
  } catch (err) {
    adminActionFailed("damageUpdate", err);
    return { ok: false, error: "Nie udało się zapisać zmian" };
  }
}

export async function addDamagePhoto(
  _prev: DamageResult | null,
  formData: FormData,
): Promise<DamageResult> {
  const admin = await requirePermission("wydania.prowadz");
  const damageId = String(formData.get("damageId") ?? "");
  if (!UUID_RE.test(damageId)) return { ok: false, error: "Nieprawidłowe dane" };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: PHOTO_ERRORS.empty };
  }
  const saved = await saveInvoice(file);
  if (!saved.ok) {
    return { ok: false, error: PHOTO_ERRORS[saved.error] ?? "Błąd zapisu." };
  }
  try {
    await getDb().insert(schema.damagePhotos).values({
      damageId,
      url: saved.url,
      note: String(formData.get("note") ?? "").trim() || null,
    });
    await recordAudit({
      adminId: admin.id,
      action: "damage.photo.add",
      entity: "damage",
      entityId: damageId,
      after: { url: saved.url },
    });
    revalidatePath(`/admin/szkody/${damageId}`);
    return { ok: true, id: damageId };
  } catch (err) {
    // Plik już leży na dysku, a wiersza nie ma — sprzątamy, żeby nie zostawał
    // sierota, której nic nie tłumaczy.
    await deleteInvoice(saved.url);
    adminActionFailed("damagePhoto", err);
    return { ok: false, error: "Nie udało się dodać zdjęcia" };
  }
}

export async function deleteDamagePhoto(
  _prev: DamageResult | null,
  formData: FormData,
): Promise<DamageResult> {
  const admin = await requirePermission("wydania.prowadz");
  const id = String(formData.get("photoId") ?? "");
  const damageId = String(formData.get("damageId") ?? "");
  if (!UUID_RE.test(id) || !UUID_RE.test(damageId)) {
    return { ok: false, error: "Nieprawidłowe dane" };
  }
  try {
    const [row] = await getDb()
      .select({ url: schema.damagePhotos.url })
      .from(schema.damagePhotos)
      .where(eq(schema.damagePhotos.id, id));
    await getDb()
      .delete(schema.damagePhotos)
      .where(eq(schema.damagePhotos.id, id));
    await deleteInvoice(row?.url ?? null);
    await recordAudit({
      adminId: admin.id,
      action: "damage.photo.delete",
      entity: "damage",
      entityId: damageId,
      before: { url: row?.url ?? null },
    });
    revalidatePath(`/admin/szkody/${damageId}`);
    return { ok: true, id: damageId };
  } catch (err) {
    adminActionFailed("damagePhotoDelete", err);
    return { ok: false, error: "Nie udało się usunąć zdjęcia" };
  }
}
