"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/auth/audit";
import { markRead, transcriptForLead } from "@/lib/inbox/repo";
import { adminActionFailed } from "@/lib/alerts/admin";
import { formatDateTimePl } from "@/lib/format";

/**
 * Zapisy skrzynki.
 *
 * Zmiana STATUSU i notatka obsługi mieszkają dalej w `chatbot/actions.ts`
 * (`updateLead`) — to ta sama tabela i ta sama operacja, więc drugie takie
 * samo działanie obok byłoby dwiema wersjami jednej prawdy. Tutaj jest
 * wyłącznie to, czego tam nie było: OZNACZENIE JAKO PRZECZYTANE.
 *
 * Osobne, bo to nie jest zmiana stanu sprawy tylko fakt, że ktoś ją otworzył.
 * Nie idzie do audytu z tego samego powodu, z którego nie idzie tam odczyt
 * listy: dziennik audytu ma pokazywać, co ktoś ZROBIŁ ze sprawą klienta,
 * a nie że na nią spojrzał. Zaśmiecony audyt przestaje być czytany.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReadResult = { ok: boolean };

/** Jedna wiadomość z rozmowy, w kształcie, którego potrzebuje karta. */
export type TranscriptLine = {
  id: string;
  role: string;
  body: string;
  at: string;
};

/**
 * Pełna rozmowa za zgłoszeniem — na żądanie, po naciśnięciu „Pokaż rozmowę".
 *
 * `requireAdmin()` w pierwszej linii i to jest tu najważniejsze zdanie:
 * transkrypt zawiera wszystko, co klient napisał, łącznie z numerem, który
 * podał w połowie rozmowy. Ta funkcja jest serwerowa, więc jest osiągalna
 * z sieci pod wygenerowanym adresem — bez sprawdzenia sesji byłaby otwartym
 * czytnikiem rozmów po samym uuid zgłoszenia.
 */
export async function loadTranscript(id: string): Promise<TranscriptLine[]> {
  const admin = await requirePermission("skrzynka.podglad");
  if (!z.string().regex(UUID_RE).safeParse(id).success) return [];
  try {
    const rows = await transcriptForLead(id);
    /*
      ODCZYT też trafia do audytu — i to jest wyjątek od reguły „audyt zapisuje
      zmiany". Transkrypt zawiera wszystko, co klient napisał, łącznie
      z numerem telefonu podanym w połowie rozmowy. Pytanie „kto czytał
      korespondencję klientów" musi mieć odpowiedź; przy innych ekranach
      panelu nie musi, bo tam nie ma czego wynieść.
    */
    await recordAudit({
      adminId: admin.id,
      action: "inbox.transcript.read",
      entity: "chat_lead",
      entityId: id,
    });
    return rows.map((r) => ({
      id: r.id,
      role: r.role,
      body: r.body,
      at: formatDateTimePl(r.createdAt),
    }));
  } catch (err) {
    adminActionFailed("inbox.transcript", err);
    return [];
  }
}

export async function markRequestRead(id: string): Promise<ReadResult> {
  const admin = await requirePermission("skrzynka.obsluz");
  if (!z.string().regex(UUID_RE).safeParse(id).success) return { ok: false };
  try {
    await markRead(id);
    await recordAudit({
      adminId: admin.id,
      action: "inbox.mark_read",
      entity: "chat_lead",
      entityId: id,
    });
    // Odznaka w nagłówku panelu liczy nieprzeczytane, więc po otwarciu sprawy
    // musi zejść — a layout jest wspólny dla całego panelu.
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (err) {
    adminActionFailed("inbox.markRead", err);
    return { ok: false };
  }
}

/**
 * Zamknięcie sprawy jednym ruchem, prosto z listy.
 *
 * Istnieje, bo najczęstsza operacja na skrzynce to „załatwione, następne",
 * a wymuszanie rozwinięcia sprawy i wybrania statusu z listy tylko po to,
 * żeby ją zamknąć, sprawia, że skrzynka przestaje być sprzątana.
 */
const closeSchema = z.object({ id: z.string().regex(UUID_RE) });

export async function closeRequest(
  _prev: unknown,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requirePermission("skrzynka.obsluz");
  const t = await getTranslations("Admin.inbox");
  const parsed = closeSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: t("errors.invalidData") };

  try {
    const db = getDb();
    const [before] = await db
      .select({ status: schema.chatLeads.status })
      .from(schema.chatLeads)
      .where(eq(schema.chatLeads.id, parsed.data.id))
      .limit(1);
    if (!before) return { ok: false, error: t("errors.notFound") };

    await db
      .update(schema.chatLeads)
      .set({ status: "closed", readAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.chatLeads.id, parsed.data.id));

    await recordAudit({
      adminId: admin.id,
      action: "inbox.close",
      entity: "chat_lead",
      entityId: parsed.data.id,
      before,
      after: { status: "closed" },
    });
    revalidatePath("/admin/inbox");
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (err) {
    adminActionFailed("inbox.close", err);
    return { ok: false, error: t("errors.saveFailed") };
  }
}
