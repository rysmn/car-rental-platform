import "server-only";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { matchFaq } from "@/lib/chat/faq";
import { getFaq } from "@/lib/marketing/content";

/**
 * The unanswered list, with enough context to act on a row.
 *
 * The column that changes how the list is read is "already in the FAQ?". A
 * question the assistant failed on that IS covered by an existing entry is a
 * matching problem — the words are there and the matcher did not reach them,
 * and the fix is an alias, not a new answer. One that is genuinely uncovered is
 * a content problem. Those two look identical in a bare list of questions,
 * which is why this runs the real matcher rather than eyeballing similarity:
 * the same code path the assistant used, so its verdict here is the verdict it
 * gave the customer.
 */

export type QuestionRow = {
  id: string;
  question: string;
  normalized: string;
  locale: string;
  category: string | null;
  intent: string | null;
  times: number;
  /**
   * `unanswered` — the assistant said it did not know.
   * `low_confidence` — it answered anyway, from a match barely above the floor.
   *
   * The second kind is the one worth reading first. A question the assistant
   * declined is a gap the customer knows about; a question it answered badly is
   * a gap only the customer found out about.
   */
  kind: "unanswered" | "low_confidence";
  answeredLater: number;
  wentToHuman: number;
  lastAskedAt: Date;
  /** The closest FAQ entry, when one is close enough to count as covered. */
  faqHit: { q: string; score: number } | null;
  /** A draft or published answer already exists for this question. */
  draft: { id: string; status: string } | null;
};

export async function listQuestions(limit = 200): Promise<QuestionRow[]> {
  const db = getDb();
  const [rows, drafts] = await Promise.all([
    db
      .select()
      .from(schema.chatUnanswered)
      .orderBy(
        desc(schema.chatUnanswered.times),
        desc(schema.chatUnanswered.lastAskedAt),
      )
      .limit(limit),
    db.select().from(schema.chatFaq),
  ]);

  const byQuestion = new Map(
    drafts.map((d) => [`${d.locale}::${d.question.trim().toLowerCase()}`, d]),
  );

  const faqPl = getFaq("pl");
  const faqEn = getFaq("en");

  return rows.map((r) => {
    // Both the static FAQ and anything an administrator has published: the
    // assistant searches both, so this must too, or a question answered by a
    // freshly published entry would still be listed as uncovered.
    const base = r.locale === "en" ? faqEn : faqPl;
    const extra = drafts
      .filter(
        (d) =>
          d.status === "published" &&
          d.locale === r.locale &&
          d.answer.trim().length > 0,
      )
      .map((d) => ({ q: d.question, a: d.answer }));
    const hit = matchFaq(r.question, [...base, ...extra]);
    const draft = byQuestion.get(
      `${r.locale}::${r.question.trim().toLowerCase()}`,
    );
    return {
      id: r.id,
      question: r.question,
      normalized: r.normalized,
      locale: r.locale,
      category: r.category,
      intent: r.intent,
      times: r.times,
      kind: r.kind === "low_confidence" ? "low_confidence" : "unanswered",
      answeredLater: r.answeredLater,
      wentToHuman: r.wentToHuman,
      lastAskedAt: new Date(r.lastAskedAt),
      faqHit: hit ? { q: hit.entry.q, score: hit.score } : null,
      draft: draft ? { id: draft.id, status: draft.status } : null,
    };
  });
}

/* ── Administrator-written FAQ entries ───────────────────────────────────── */

export type FaqDraft = {
  id: string;
  locale: string;
  question: string;
  answer: string;
  status: "draft" | "published";
  sourceQuestion: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
};

export async function listFaqDrafts(): Promise<FaqDraft[]> {
  const rows = await getDb()
    .select()
    .from(schema.chatFaq)
    .orderBy(desc(schema.chatFaq.updatedAt));
  return rows.map((r) => ({
    id: r.id,
    locale: r.locale,
    question: r.question,
    answer: r.answer,
    status: r.status,
    sourceQuestion: r.sourceQuestion,
    publishedAt: r.publishedAt ? new Date(r.publishedAt) : null,
    updatedAt: new Date(r.updatedAt),
  }));
}
