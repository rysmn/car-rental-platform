"use server";

import { revalidatePath } from "next/cache";
import { bramaKrytyczna } from "@/lib/auth/critical";

import { recordAudit } from "@/lib/auth/audit";
import { getSetting, setSetting } from "@/lib/admin/settings";
import { adminActionFailed } from "@/lib/alerts/admin";

export type SaveResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

// Stable codes, translated by the caller (PublicStatusToggle).
const GENERIC_ERROR: SaveResult = {
  ok: false,
  error: "generic",
};

/**
 * Public vehicle statuses: on or off, for the whole site at once.
 *
 * ## Why the switch lives on the dashboard and not in Ustawienia
 *
 * It is read in the same breath as the fleet calendar directly above it. The
 * operator looks at the grid, sees that half the fleet is in service this week,
 * and decides whether visitors should see that too — that decision is made
 * looking at the calendar, so the switch is under the calendar.
 *
 * ## What it can and cannot do
 *
 * It hides a line of text on the public cards and nothing else. Availability,
 * the booking form's own checks and the assistant read the Availability Engine
 * directly and never come through the setting, so switching this off cannot
 * open a booking that should have been refused, and switching it on cannot
 * close one — see `lib/fleet/status-repo`.
 *
 * The whole public tree is revalidated because a status line appears on the
 * home page, the fleet grid, the landing pages, the saved list, the car page
 * and the comparison table — that is every public route worth naming.
 */
export async function updatePublicStatus(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  const brama = await bramaKrytyczna("flota.status");
  if (!brama.ok) return { ok: false, error: brama.error };
  const admin = brama.admin;

  const next = { enabled: formData.get("enabled") === "on" };

  try {
    const before = await getSetting("publicStatus");
    const after = await setSetting("publicStatus", next, admin.id);

    await recordAudit({
      adminId: admin.id,
      action: "settings.publicStatus.update",
      entity: "site_setting",
      entityId: "publicStatus",
      before,
      after,
    });

    revalidatePath("/", "layout");
    revalidatePath("/admin", "layout");

    return {
      ok: true,
      message: next.enabled ? "visible" : "hidden",
    };
  } catch (err) {
    adminActionFailed("updatePublicStatus", err);
    return GENERIC_ERROR;
  }
}
