"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/auth/audit";
import { adminActionFailed } from "@/lib/alerts/admin";

/**
 * The only writes the chatbot section performs.
 *
 * Both concern a lead an operator is working: its status and their own note.
 * Nothing here edits a transcript — a conversation is a record of what
 * happened, and a record somebody can rewrite is not a record. Deleting a lead
 * is deliberately absent too; retention is handled by the purge job on a clock,
 * not by a button that can remove evidence of a complaint.
 */

export type LeadResult = { ok: true } | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LEAD_STATUSES = [
  "new",
  "contact",
  "offer",
  "reservation",
  "closed",
] as const;

const schemaLead = z.object({
  id: z.string().regex(UUID_RE),
  status: z.enum(LEAD_STATUSES),
  note: z
    .string()
    .max(2000)
    .transform((s) => s.trim() || null),
});

export async function updateLead(
  _prev: LeadResult | null,
  formData: FormData,
): Promise<LeadResult> {
  const admin = await requirePermission("skrzynka.obsluz");
  const parsed = schemaLead.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { ok: false, error: "Nieprawidłowe dane." };
  const d = parsed.data;

  try {
    const db = getDb();
    const [before] = await db
      .select({ status: schema.chatLeads.status, note: schema.chatLeads.note })
      .from(schema.chatLeads)
      .where(eq(schema.chatLeads.id, d.id))
      .limit(1);
    if (!before) return { ok: false, error: "Nie znaleziono zgłoszenia." };

    await db
      .update(schema.chatLeads)
      .set({ status: d.status, note: d.note, updatedAt: new Date() })
      .where(eq(schema.chatLeads.id, d.id));

    await recordAudit({
      adminId: admin.id,
      action: "chat.lead.update",
      entity: "chat_lead",
      entityId: d.id,
      before,
      after: { status: d.status, note: d.note },
    });
    revalidatePath("/admin/chatbot/leady");
    revalidatePath("/admin/chatbot");
    return { ok: true };
  } catch (err) {
    adminActionFailed("updateLead", err);
    return { ok: false, error: "Wystąpił błąd. Spróbuj ponownie." };
  }
}

/* ── Odpowiedzi do FAQ, pisane i zatwierdzane przez człowieka ────────────── */

/**
 * The rule these three actions exist to enforce: **no answer reaches a customer
 * until a person has written and approved the words.**
 *
 * A draft is created from a question the assistant could not answer, with an
 * EMPTY answer — nothing is generated, not by the parser and not by the model.
 * The assistant searches published entries only, and an entry cannot be
 * published without text in it. So the worst case is an administrator who
 * writes a poor answer, which is a normal editorial problem with a normal
 * editorial fix, rather than a machine-written sentence about insurance that
 * nobody ever read.
 */

const faqDraftSchema = z.object({
  question: z.string().trim().min(3).max(300),
  locale: z.enum(["pl", "en"]),
});

export async function createFaqDraft(
  _prev: LeadResult | null,
  formData: FormData,
): Promise<LeadResult> {
  const admin = await requirePermission("czat.ustawienia");
  const parsed = faqDraftSchema.safeParse({
    question: formData.get("question"),
    locale: formData.get("locale"),
  });
  if (!parsed.success) return { ok: false, error: "Nieprawidłowe pytanie." };

  try {
    const db = getDb();
    const [row] = await db
      .insert(schema.chatFaq)
      .values({
        locale: parsed.data.locale,
        question: parsed.data.question,
        // Deliberately empty. Somebody has to type the answer.
        answer: "",
        status: "draft",
        sourceQuestion: parsed.data.question,
        createdBy: admin.id,
      })
      .returning({ id: schema.chatFaq.id });

    await recordAudit({
      adminId: admin.id,
      action: "chat.faq.draft",
      entity: "chat_faq",
      entityId: row.id,
      before: null,
      after: { question: parsed.data.question, locale: parsed.data.locale },
    });
    revalidatePath("/admin/chatbot/pytania");
    return { ok: true };
  } catch (err) {
    adminActionFailed("createFaqDraft", err);
    return { ok: false, error: "Nie udało się utworzyć szkicu." };
  }
}

const faqSaveSchema = z.object({
  id: z.string().regex(UUID_RE),
  question: z.string().trim().min(3).max(300),
  answer: z.string().trim().max(4000),
  publish: z.boolean(),
});

export async function saveFaqEntry(
  _prev: LeadResult | null,
  formData: FormData,
): Promise<LeadResult> {
  const admin = await requirePermission("czat.ustawienia");
  const parsed = faqSaveSchema.safeParse({
    id: formData.get("id"),
    question: formData.get("question"),
    answer: formData.get("answer") ?? "",
    publish: formData.get("publish") === "1",
  });
  if (!parsed.success) return { ok: false, error: "Nieprawidłowe dane." };
  const d = parsed.data;

  // Publishing an empty answer would let the assistant reply with silence and
  // count it as having helped.
  if (d.publish && d.answer.length < 3) {
    return { ok: false, error: "Nie można opublikować pustej odpowiedzi." };
  }

  try {
    const db = getDb();
    const [before] = await db
      .select()
      .from(schema.chatFaq)
      .where(eq(schema.chatFaq.id, d.id))
      .limit(1);
    if (!before) return { ok: false, error: "Nie znaleziono wpisu." };

    await db
      .update(schema.chatFaq)
      .set({
        question: d.question,
        answer: d.answer,
        status: d.publish ? "published" : "draft",
        publishedBy: d.publish ? admin.id : before.publishedBy,
        publishedAt: d.publish ? new Date() : before.publishedAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.chatFaq.id, d.id));

    await recordAudit({
      adminId: admin.id,
      action: d.publish ? "chat.faq.publish" : "chat.faq.save",
      entity: "chat_faq",
      entityId: d.id,
      before: {
        question: before.question,
        answer: before.answer,
        status: before.status,
      },
      after: {
        question: d.question,
        answer: d.answer,
        status: d.publish ? "published" : "draft",
      },
    });
    revalidatePath("/admin/chatbot/pytania");
    return { ok: true };
  } catch (err) {
    adminActionFailed("saveFaqEntry", err);
    return { ok: false, error: "Nie udało się zapisać." };
  }
}

export async function deleteFaqEntry(
  _prev: LeadResult | null,
  formData: FormData,
): Promise<LeadResult> {
  const admin = await requirePermission("czat.ustawienia");
  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) return { ok: false, error: "Nieprawidłowe dane." };

  try {
    const db = getDb();
    const [before] = await db
      .select()
      .from(schema.chatFaq)
      .where(eq(schema.chatFaq.id, id))
      .limit(1);
    if (!before) return { ok: false, error: "Nie znaleziono wpisu." };

    await db.delete(schema.chatFaq).where(eq(schema.chatFaq.id, id));
    await recordAudit({
      adminId: admin.id,
      action: "chat.faq.delete",
      entity: "chat_faq",
      entityId: id,
      before: { question: before.question, status: before.status },
      after: null,
    });
    revalidatePath("/admin/chatbot/pytania");
    return { ok: true };
  } catch (err) {
    adminActionFailed("deleteFaqEntry", err);
    return { ok: false, error: "Nie udało się usunąć." };
  }
}
