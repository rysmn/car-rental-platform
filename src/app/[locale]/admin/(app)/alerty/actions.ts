"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { recordAudit } from "@/lib/auth/audit";
import { requirePermission } from "@/lib/auth/guard";
import {
  acknowledgeAlert,
  reopenAlert,
  resolveAlert,
} from "@/lib/alerts/repo";
import { adminActionFailed } from "@/lib/alerts/admin";

/**
 * The three things an operator can do to an alert.
 *
 * All of them go through `requireAdmin` first, and that is not a formality:
 * the alert register describes how the system breaks, which is a map for
 * anyone probing it. The read path is guarded by the panel's own layout; the
 * write path has to guard itself, because a Server Action is a public HTTP
 * endpoint whatever page it was defined next to.
 *
 * Nothing here deletes. "Rozwiązany" is a state, so a fault that comes back
 * reopens the row it was closed under and the history stays intact — see
 * `lib/alerts/record`.
 */

type Result = { ok: true } | { ok: false; error: string };

async function failed(): Promise<Result> {
  const t = await getTranslations("Admin.alerts");
  return { ok: false, error: t("errors.saveFailed") };
}

export async function markAlertRead(id: string): Promise<Result> {
  const admin = await requirePermission("alerty.podglad");
  try {
    await acknowledgeAlert(id);
    // Rejestr alertów jest dziennikiem incydentów; kto go „odhaczył" i kiedy,
    // jest częścią historii incydentu, a nie szczegółem technicznym.
    await recordAudit({
      adminId: admin.id,
      action: "alert.acknowledge",
      entity: "system_alert",
      entityId: id,
    });
    revalidatePath("/admin/alerty");
    return { ok: true };
  } catch (err) {
    adminActionFailed("markAlertRead", err);
    return failed();
  }
}

export async function markAlertResolved(id: string): Promise<Result> {
  const admin = await requirePermission("alerty.podglad");
  try {
    await resolveAlert(id, admin.email);
    await recordAudit({
      adminId: admin.id,
      action: "alert.resolve",
      entity: "system_alert",
      entityId: id,
    });
    revalidatePath("/admin/alerty");
    return { ok: true };
  } catch (err) {
    adminActionFailed("markAlertResolved", err);
    return failed();
  }
}

export async function markAlertOpen(id: string): Promise<Result> {
  const admin = await requirePermission("alerty.podglad");
  try {
    await reopenAlert(id);
    await recordAudit({
      adminId: admin.id,
      action: "alert.reopen",
      entity: "system_alert",
      entityId: id,
    });
    revalidatePath("/admin/alerty");
    return { ok: true };
  } catch (err) {
    adminActionFailed("markAlertOpen", err);
    return failed();
  }
}

/**
 * What the buttons on the page actually post to.
 *
 * One plain `<form>` per button, so the page needs no client component and the
 * controls work with JavaScript disabled or still loading — which on the phone
 * this panel gets used from is a real state, not a hypothetical one. The
 * operation travels as a hidden field rather than as three separate actions
 * because the three differ by one verb and nothing else.
 *
 * Validates the operation against a closed list: a Server Action is a public
 * endpoint, and `formData` is whatever the caller chose to send.
 */
export async function alertOperation(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const op = String(formData.get("op") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;

  if (op === "read") await markAlertRead(id);
  else if (op === "resolve") await markAlertResolved(id);
  else if (op === "open") await markAlertOpen(id);
}
