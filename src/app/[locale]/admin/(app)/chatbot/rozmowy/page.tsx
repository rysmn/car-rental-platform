import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  getTranscript,
  listConversations,
  RETENTION_DAYS,
} from "@/lib/chat/repo";
import { getConversationSummary } from "@/lib/admin/chat-summary";
import { pick } from "@/lib/i18n-pick";
import { sanitizeAIInput } from "@/lib/chat/ai/sanitize";
import { formatDateTimePl } from "@/lib/format";
import { ChatbotTabs } from "../ChatbotTabs";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.chatbot" });
  return { title: t("conversations.metaTitle") };
}

export default async function ConversationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Admin.chatbot");
  const topic = (code: string) =>
    t.has(`topics.${code}`) ? t(`topics.${code}`) : code;

  const q = await searchParams;
  const openId = typeof q.rozmowa === "string" ? q.rozmowa : null;

  const [conversations, transcript, summary] = await Promise.all([
    listConversations(100),
    openId ? getTranscript(openId) : Promise.resolve([]),
    openId ? getConversationSummary(openId) : Promise.resolve(null),
  ]);

  return (
    <div className="max-w-5xl">
      <header className="mb-6">
        <h1 className="font-heading text-ink text-2xl font-bold">{t("conversations.title")}</h1>
        <p className="text-silver mt-1 text-sm">
          {t("conversations.subtitle", { days: RETENTION_DAYS })}
        </p>
      </header>

      <ChatbotTabs active="/admin/chatbot/rozmowy" />

      {openId && summary && (
        <section className="border-line-strong mb-6 border p-5">
          <h2 className="label text-ink mb-4 text-xs">{t("conversations.summaryTitle")}</h2>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[13rem_1fr]">
            {(
              [
                [
                  t("conversations.summary.time"),
                  `${formatDateTimePl(summary.startedAt)} → ${formatDateTimePl(summary.lastMessageAt)}`,
                ],
                [t("conversations.summary.language"), summary.locale.toUpperCase()],
                [
                  t("conversations.summary.intent"),
                  summary.intent ? topic(summary.intent) : "—",
                ],
                [
                  t("conversations.summary.model"),
                  summary.wanted
                    .filter((w) => w.model)
                    .map((w) => w.label)
                    .join(", ") || "—",
                ],
                [
                  t("conversations.summary.brand"),
                  [
                    ...new Set(
                      summary.wanted.map((w) => w.brand).filter(Boolean),
                    ),
                  ].join(", ") || "—",
                ],
                [
                  t("conversations.summary.segment"),
                  [
                    ...new Set(
                      summary.wanted.map((w) => w.segment).filter(Boolean),
                    ),
                  ].join(", ") || "—",
                ],
                [
                  t("conversations.summary.passengers"),
                  [
                    ...new Set(
                      summary.wanted.map((w) => w.seats).filter(Boolean),
                    ),
                  ].join(", ") || "—",
                ],
                [
                  t("conversations.summary.dates"),
                  summary.dateFrom
                    ? `${summary.dateFrom}${summary.dateTo ? ` → ${summary.dateTo}` : ""}`
                    : "—",
                ],
                [t("conversations.summary.location"), summary.locationName ?? "—"],
                [
                  t("conversations.summary.inFleet"),
                  summary.wanted.length === 0
                    ? t("conversations.values.carNotNamed")
                    : summary.wanted.every((w) => w.inFleet)
                      ? t("common.yes")
                      : summary.wanted.some((w) => w.inFleet)
                        ? t("common.partly")
                        : t("common.no"),
                ],
                [
                  t("conversations.summary.available"),
                  summary.wanted.some((w) => w.unavailable)
                    ? t("conversations.values.unavailableYes")
                    : summary.wanted.length === 0
                      ? "—"
                      : t("conversations.values.noShortage"),
                ],
                [
                  t("conversations.summary.alternatives"),
                  summary.alternativesShown ? t("common.yes") : t("common.no"),
                ],
                [
                  t("conversations.summary.clickedBook"),
                  summary.wentToBooking ? t("common.yes") : t("common.no"),
                ],
                [
                  t("conversations.summary.booking"),
                  t("conversations.values.bookingNotRecorded"),
                ],
                [
                  t("conversations.summary.lead"),
                  summary.leadCreated ? t("common.yes") : t("common.no"),
                ],
                [
                  t("conversations.summary.handoff"),
                  summary.handoff ? t("common.yes") : t("common.no"),
                ],
                [
                  t("conversations.summary.aiUsed"),
                  summary.aiUsed ? t("common.yes") : t("common.no"),
                ],
                [
                  t("conversations.summary.fallback"),
                  summary.aiFallback
                    ? t("conversations.values.fallbackYes")
                    : t("common.no"),
                ],
                [
                  t("conversations.summary.unanswered"),
                  summary.unansweredCount || "—",
                ],
                [
                  t("conversations.summary.noBookingReason"),
                  pick(summary.noBookingReason, locale),
                ],
              ] as [string, string | number][]
            ).map(([term, value]) => (
              <div key={term} className="contents">
                <dt className="text-ink-faint text-xs">{term}</dt>
                <dd className="text-silver text-sm">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {openId && (
        <section className="border-line-strong mb-10 border p-4">
          <h2 className="label text-ink mb-3 text-xs">{t("conversations.transcriptTitle")}</h2>
          {transcript.length === 0 ? (
            <p className="text-silver text-sm">
              {t("conversations.gone", { days: RETENTION_DAYS })}
            </p>
          ) : (
            <div className="space-y-3">
              {transcript.map((m) => (
                <div key={m.id}>
                  <p className="label-tight text-ink-faint text-[10px]">
                    {m.role === "user" ? t("conversations.roleCustomer") : t("conversations.roleAssistant")} ·{" "}
                    {formatDateTimePl(m.createdAt)}
                    {m.intent ? ` · ${topic(m.intent)}` : ""}
                  </p>
                  <p
                    className={`mt-1 text-sm whitespace-pre-line ${
                      m.role === "user" ? "text-ink" : "text-silver"
                    }`}
                  >
                    {/* Same masking the AI layer applies before anything leaves
                        the server: telephone numbers, e-mail addresses, card
                        and document numbers are replaced with a token. This
                        page exists to study how the assistant behaves and what
                        people want from it — neither question needs somebody's
                        phone number, and a screen nobody needs is a screen that
                        should not show it. Dates and car names survive, which
                        is what makes the transcript still readable. */}
                    {m.role === "user" ? sanitizeAIInput(m.body).text : m.body}
                  </p>
                </div>
              ))}
            </div>
          )}
          <Link
            href="/admin/chatbot/rozmowy"
            className="text-ink-faint hover:text-ink mt-4 inline-block text-xs"
          >
            {t("conversations.close")}
          </Link>
        </section>
      )}

      {conversations.length === 0 ? (
        <p className="border-line text-silver border px-5 py-8 text-center text-sm">
          {t("conversations.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-line text-ink-faint border-y">
                <th className="label-tight py-3 pr-4 text-[10px]">{t("conversations.headers.date")}</th>
                <th className="label-tight py-3 pr-4 text-[10px]">{t("conversations.headers.language")}</th>
                <th className="label-tight py-3 pr-4 text-[10px]">{t("conversations.headers.topic")}</th>
                <th className="label-tight py-3 pr-4 text-[10px]">{t("conversations.headers.car")}</th>
                <th className="label-tight py-3 pr-4 text-[10px]">{t("conversations.headers.dates")}</th>
                <th className="label-tight py-3 pr-4 text-[10px]">{t("conversations.headers.lead")}</th>
                <th className="label-tight py-3 pr-4 text-[10px]">
                  {t("conversations.headers.booking")}
                </th>
                <th className="label-tight py-3 pr-4 text-[10px]">{t("conversations.headers.unansweredShort")}</th>
                <th className="label-tight py-3 text-[10px]">{t("conversations.headers.status")}</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((c) => (
                <tr key={c.id} className="border-line/60 border-b">
                  <td className="py-3 pr-4">
                    <Link
                      href={{
                        pathname: "/admin/chatbot/rozmowy",
                        query: { rozmowa: c.id },
                      }}
                      className="text-ink tap-area underline underline-offset-2"
                    >
                      {formatDateTimePl(c.startedAt)}
                    </Link>
                  </td>
                  <td className="text-ink-faint py-3 pr-4 text-xs uppercase">
                    {c.locale}
                  </td>
                  <td className="text-silver py-3 pr-4 text-xs">
                    {c.topic ? topic(c.topic) : "—"}
                  </td>
                  <td className="text-silver py-3 pr-4 text-xs">
                    {c.carBrand ? `${c.carBrand} ${c.carModel}` : "—"}
                  </td>
                  <td className="text-silver py-3 pr-4 text-xs tabular-nums">
                    {c.dateFrom
                      ? `${c.dateFrom}${c.dateTo ? ` → ${c.dateTo}` : ""}`
                      : "—"}
                  </td>
                  <td className="py-3 pr-4 text-xs">
                    {c.leadCreated ? "✓" : "—"}
                  </td>
                  <td className="py-3 pr-4 text-xs">
                    {c.wentToBooking ? "✓" : "—"}
                  </td>
                  <td className="py-3 pr-4 text-xs tabular-nums">
                    {c.unansweredCount > 0 ? c.unansweredCount : "—"}
                  </td>
                  <td className="text-ink-faint py-3 text-xs">
                    {t.has(`convStatus.${c.status}`) ? t(`convStatus.${c.status}`) : c.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
