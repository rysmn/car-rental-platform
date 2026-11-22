"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { getDb, schema } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/auth/audit";
import { adminActionFailed } from "@/lib/alerts/admin";
import {
  CHECKLIST,
  CLEANLINESS_STATES,
  getHandover,
  syncOdometer,
} from "@/lib/admin/handovers";
import { deleteSignature, saveSignature } from "@/lib/storage/signatures";

const handoverInput = z.object({
  reservationId: z.string().uuid(),
  kind: z.enum(["pickup", "return"]),
  odometerKm: z.coerce
    .number()
    .int("odometerInteger")
    .min(0, "odometerNegative")
    .max(2_000_000, "odometerCheck"),
  fuelEighths: z.coerce.number().int().min(0).max(8),
  cleanliness: z.enum(CLEANLINESS_STATES),
  keysCount: z.coerce.number().int().min(0).max(4),
  damageNote: z.string().trim().max(1000),
  note: z.string().trim().max(1000),
  signedByName: z.string().trim().max(120),
  /** Data URL z płótna podpisu; pusty łańcuch znaczy „bez zmiany". */
  signature: z.string().max(600_000),
});

export type HandoverResult = { ok: true } | { ok: false; error: string };

/**
 * Write down what the car looked like as it changed hands.
 *
 * One protocol per direction, so this is an upsert rather than an insert: a
 * second row would be a second account of the same event with nothing to say
 * which is true. Corrections overwrite; the audit log keeps what it said
 * before, which is the honest place for a change of mind about a fact.
 *
 * The tick-list is rewritten wholesale on every save. Merging would leave an
 * item that was ticked in a previous version of the form silently ticked in a
 * protocol nobody ticked it in.
 */
export async function saveHandover(
  _prev: HandoverResult | null,
  formData: FormData,
): Promise<HandoverResult> {
  const admin = await requirePermission("wydania.prowadz");
  const t = await getTranslations("Admin.reservations.errors");
  const parsed = handoverInput.safeParse({
    reservationId: formData.get("reservationId") ?? "",
    kind: formData.get("kind") ?? "",
    odometerKm: String(formData.get("odometerKm") ?? "").replace(/\s/g, ""),
    fuelEighths: formData.get("fuelEighths") ?? "",
    cleanliness: formData.get("cleanliness") ?? "",
    keysCount: formData.get("keysCount") ?? "1",
    damageNote: formData.get("damageNote") ?? "",
    note: formData.get("note") ?? "",
    signedByName: formData.get("signedByName") ?? "",
    signature: formData.get("signature") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]
        ? t.has(parsed.error.issues[0].message)
          ? t(parsed.error.issues[0].message)
          : parsed.error.issues[0].message
        : t("handoverInvalid"),
    };
  }
  const d = parsed.data;

  try {
    const db = getDb();
    const before = await getHandover(d.reservationId, d.kind);

    // Podpis zapisywany PRZED wierszem: gdyby zapis pliku padł, protokół ma
    // zostać nietknięty, a nie wskazywać na plik, którego nie ma.
    let signatureUrl = before?.signatureUrl ?? null;
    let signedAt = before?.signedAt ? new Date(before.signedAt) : null;
    if (d.signature) {
      const saved = await saveSignature(d.signature);
      if (!saved.ok) {
        return {
          ok: false,
          error:
            saved.error === "too_large"
              ? t("signatureTooLarge")
              : t("signatureSaveFailed"),
        };
      }
      // Stary plik dopiero teraz — nowy już leży na dysku.
      await deleteSignature(signatureUrl);
      signatureUrl = saved.url;
      signedAt = new Date();
    }

    const values = {
      reservationId: d.reservationId,
      kind: d.kind,
      odometerKm: d.odometerKm,
      fuelEighths: d.fuelEighths,
      cleanliness: d.cleanliness,
      keysCount: d.keysCount,
      damageNote: d.damageNote || null,
      note: d.note || null,
      signatureUrl,
      signedByName: d.signedByName || before?.signedByName || null,
      signedAt,
      createdBy: admin.id,
      updatedAt: new Date(),
    };

    let handoverId = before?.id ?? null;
    if (handoverId) {
      await db
        .update(schema.reservationHandovers)
        .set(values)
        .where(eq(schema.reservationHandovers.id, handoverId));
    } else {
      const [row] = await db
        .insert(schema.reservationHandovers)
        .values(values)
        .returning({ id: schema.reservationHandovers.id });
      handoverId = row.id;
    }

    await db
      .delete(schema.handoverItems)
      .where(eq(schema.handoverItems.handoverId, handoverId));
    await db.insert(schema.handoverItems).values(
      CHECKLIST.map((item) => ({
        handoverId: handoverId as string,
        code: item.code,
        present: formData.get(`item_${item.code}`) === "on",
        note: null,
      })),
    );

    await syncOdometer(d.reservationId);
    await recordAudit({
      adminId: admin.id,
      action: before ? "reservation.handover.update" : "reservation.handover.add",
      entity: "reservation",
      entityId: d.reservationId,
      before: before
        ? { odometerKm: before.odometerKm, fuelEighths: before.fuelEighths }
        : undefined,
      after: {
        kind: d.kind,
        odometerKm: d.odometerKm,
        fuelEighths: d.fuelEighths,
        cleanliness: d.cleanliness,
      },
    });

    revalidatePath("/admin");
    revalidatePath(`/admin/reservations/${d.reservationId}`);
    return { ok: true };
  } catch (err) {
    adminActionFailed("Handover", err);
    return { ok: false, error: t("handoverSaveFailed") };
  }
}

/**
 * Remove a protocol written for the wrong rental.
 *
 * Rare and deliberate: the checklist is evidence, so it is deleted only when
 * it is about the wrong car entirely. The odometer columns are re-derived
 * afterwards, which is why this cannot be a plain `DELETE` from psql.
 */
export async function deleteHandover(
  _prev: HandoverResult | null,
  formData: FormData,
): Promise<HandoverResult> {
  const admin = await requirePermission("wydania.prowadz");
  const t = await getTranslations("Admin.reservations.errors");
  const reservationId = String(formData.get("reservationId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  if (kind !== "pickup" && kind !== "return") {
    return { ok: false, error: t("invalidData") };
  }
  try {
    const before = await getHandover(reservationId, kind);
    await deleteSignature(before?.signatureUrl ?? null);
    await getDb()
      .delete(schema.reservationHandovers)
      .where(
        and(
          eq(schema.reservationHandovers.reservationId, reservationId),
          eq(schema.reservationHandovers.kind, kind),
        ),
      );
    await syncOdometer(reservationId);
    await recordAudit({
      adminId: admin.id,
      action: "reservation.handover.delete",
      entity: "reservation",
      entityId: reservationId,
      before: { kind },
    });
    revalidatePath("/admin");
    revalidatePath(`/admin/reservations/${reservationId}`);
    return { ok: true };
  } catch (err) {
    adminActionFailed("handoverDelete", err);
    return { ok: false, error: t("handoverDeleteFailed") };
  }
}
