import { getTranslations, setRequestLocale } from "next-intl/server";
import { listQuestions, listFaqDrafts } from "@/lib/admin/chat-questions";
import { sanitizeAIInput } from "@/lib/chat/ai/sanitize";
import { formatDateTimePl } from "@/lib/format";
import { ChatbotTabs } from "../ChatbotTabs";
import { AddToFaq, FaqDraftRow } from "./FaqEditor";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.chatbot" });
  return { title: t("questions.metaTitle") };
}

/**
 * The to-do list the assistant writes for itself — and, now, the one place an
 * answer to a listed question can be written.
 *
 * The rule the page used to enforce by having no input field at all still
 * holds, and is enforced better: an answer written here is published to the
 * FAQ, which means it appears on the public FAQ page AND in the assistant, from
 * one row. That was the original objection — answering only inside the bot
 * creates a second, invisible version of the rental terms — and merging the
 * sources answers it, where simply refusing to help did not.
 *
 * Nothing is generated. A draft starts with an empty answer; a person writes
 * the words and a person presses publish. No model output reaches a customer
 * through this screen.
 */
export default async function UnansweredPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ stan?: string }>;
}) {
  const { locale } = await params;
  const { stan } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("Admin.chatbot");

  const [allRows, drafts] = await Promise.all([
    listQuestions(200),
    listFaqDrafts(),
  ]);
  const lowConfidence = allRows.filter(
    (r) => r.kind === "low_confidence",
  ).length;
  const filter =
    stan === "niska-pewnosc" || stan === "bez-odpowiedzi" ? stan : "wszystkie";
  const rows =
    filter === "niska-pewnosc"
      ? allRows.filter((r) => r.kind === "low_confidence")
      : filter === "bez-odpowiedzi"
        ? allRows.filter((r) => r.kind !== "low_confidence")
        : allRows;
  const total = rows.reduce((n, r) => n + r.times, 0);

  return (
    // Wider than the other chatbot pages: the table carries nine columns and the
    // last one is the button. A primary action that only appears after the
    // reader scrolls a table sideways is an action most readers never find.
    <div className="max-w-6xl">
      <header className="mb-6">
        <h1 className="font-heading text-ink text-2xl font-bold">
          {t("questions.title")}
        </h1>
        <p className="text-silver mt-1 text-sm">
          {t("questions.subtitle")}
        </p>
      </header>

      <ChatbotTabs active="/admin/chatbot/pytania" />

      <div className="border-line-strong bg-graphite/60 mb-8 border-l-2 border-l-amber-500 p-4">
        <p className="text-silver text-sm">
          {t.rich("questions.notice", {
            strong: (chunks) => <strong className="font-normal">{chunks}</strong>,
          })}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="border-line text-silver border px-5 py-8 text-center text-sm">
          {t("common.allAnswered")}
        </p>
      ) : (
        <>
          <p className="text-ink-faint mb-4 text-xs">
            {t("questions.counts", { rows: rows.length, total })}
            {lowConfidence > 0 ? (
              <>
                {" · "}
                <strong className="font-normal text-amber-500">
                  {t("questions.lowConfidenceCount", { count: lowConfidence })}
                </strong>
              </>
            ) : null}
            .
          </p>
          {/* Filtering by link rather than by client state: this page is read,
              acted on and left, and a bookmarkable "show me the risky ones"
              is worth more here than an interaction. */}
          <nav className="mb-4 flex flex-wrap gap-2 text-xs">
            <a
              href="?stan=wszystkie"
              className={`tap border px-3 py-1.5 ${
                filter === "wszystkie"
                  ? "border-ink text-ink"
                  : "border-line text-silver hover:border-ink hover:text-ink"
              }`}
            >
              {t("questions.filters.all", { count: allRows.length })}
            </a>
            <a
              href="?stan=niska-pewnosc"
              className={`tap border px-3 py-1.5 ${
                filter === "niska-pewnosc"
                  ? "border-amber-500 text-amber-500"
                  : "border-line text-silver hover:border-ink hover:text-ink"
              }`}
            >
              {t("questions.filters.lowConfidence", { count: lowConfidence })}
            </a>
            <a
              href="?stan=bez-odpowiedzi"
              className={`tap border px-3 py-1.5 ${
                filter === "bez-odpowiedzi"
                  ? "border-ink text-ink"
                  : "border-line text-silver hover:border-ink hover:text-ink"
              }`}
            >
              {t("questions.filters.noAnswer", { count: allRows.length - lowConfidence })}
            </a>
          </nav>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-line text-ink-faint border-y">
                  <th className="label-tight py-3 pr-4 text-[10px]">{t("questions.headers.question")}</th>
                  <th className="label-tight py-3 pr-4 text-[10px]">{t("questions.headers.state")}</th>
                  <th className="label-tight py-3 pr-4 text-[10px]">{t("questions.headers.date")}</th>
                  <th className="label-tight py-3 pr-4 text-right text-[10px]">
                    {t("questions.headers.times")}
                  </th>
                  <th className="label-tight py-3 pr-4 text-[10px]">
                    {t("questions.headers.category")}
                  </th>
                  <th className="label-tight py-3 pr-4 text-[10px]">{t("questions.headers.intent")}</th>
                  <th className="label-tight py-3 pr-4 text-[10px]">
                    {t("questions.headers.inFaq")}
                  </th>
                  <th className="label-tight py-3 pr-4 text-right text-[10px]">
                    {t("questions.headers.gotAnswer")}
                  </th>
                  <th className="label-tight py-3 pr-4 text-right text-[10px]">
                    {t("questions.headers.wentHuman")}
                  </th>
                  <th className="label-tight py-3 text-[10px]">{t("questions.headers.action")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-line/60 border-b align-top">
                    {/* The visitor typed this, so it gets the same masking the
                        transcripts get: a phone number in a question is still a
                        phone number. */}
                    <td className="text-ink py-3 pr-4">
                      {sanitizeAIInput(r.question).text}
                      <span className="text-ink-faint ml-2 text-[10px] uppercase">
                        {r.locale}
                      </span>
                    </td>
                    {/* Two states, and the difference matters more than it
                        looks. "Bez odpowiedzi" is the assistant declining —
                        visible to the customer, honest, and merely unhelpful.
                        "Niska pewność" is an answer it gave from a weak match:
                        the customer walked away believing it. Before 20.08.2026
                        only the first kind reached this table. */}
                    <td className="py-3 pr-4 text-xs">
                      {r.kind === "low_confidence" ? (
                        <span
                          className="border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-amber-500"
                          title={t("questions.badges.lowConfidenceTitle")}
                        >
                          {t("questions.badges.lowConfidence")}
                        </span>
                      ) : (
                        <span className="text-ink-faint text-[10px] whitespace-nowrap">
                          {t("questions.badges.noAnswer")}
                        </span>
                      )}
                    </td>
                    <td className="text-ink-faint py-3 pr-4 text-xs">
                      {formatDateTimePl(r.lastAskedAt)}
                    </td>
                    <td className="text-ink py-3 pr-4 text-right text-xs tabular-nums">
                      {r.times}
                    </td>
                    <td className="text-silver py-3 pr-4 text-xs">
                      {r.category ?? "—"}
                    </td>
                    <td className="text-silver py-3 pr-4 text-xs">
                      {r.intent
                        ? t.has(`topics.${r.intent}`)
                          ? t(`topics.${r.intent}`)
                          : r.intent
                        : "—"}
                    </td>
                    {/* Covered by an entry the matcher can reach = a matching
                        problem, not a content one. Different fix entirely. */}
                    <td className="py-3 pr-4 text-xs">
                      {r.faqHit ? (
                        <span
                          className="text-amber-500"
                          title={t("questions.closestEntry", { question: r.faqHit.q })}
                        >
                          {t("questions.similar")}
                        </span>
                      ) : (
                        <span className="text-ink-faint">{t("common.no")}</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right text-xs tabular-nums">
                      {r.answeredLater || "—"}
                    </td>
                    <td className="py-3 pr-4 text-right text-xs tabular-nums">
                      {r.wentToHuman || "—"}
                    </td>
                    <td className="py-3 text-xs">
                      <AddToFaq
                        question={r.question}
                        locale={r.locale}
                        existing={r.draft}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-ink-faint mt-3 text-xs">
            {t("questions.countersNote")}
          </p>
        </>
      )}

      {/* ── Wpisy pisane w panelu ──────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="label text-ink text-xs">
          {t("questions.faq.draftsTitle", { count: drafts.length })}
        </h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          {t("questions.faq.draftsDesc")}
        </p>
        {drafts.length === 0 ? (
          <p className="border-line text-silver border px-5 py-8 text-center text-sm">
            {t("questions.faq.draftsEmpty")}
          </p>
        ) : (
          <div className="border-line border">
            {drafts.map((d) => (
              <FaqDraftRow
                key={d.id}
                id={d.id}
                question={d.question}
                answer={d.answer}
                status={d.status}
                locale={d.locale}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
