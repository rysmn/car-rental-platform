import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  getTranscript,
  listConversations,
  RETENTION_DAYS,
} from "@/lib/chat/repo";
import { getConversationSummary } from "@/lib/admin/chat-summary";
import { sanitizeAIInput } from "@/lib/chat/ai/sanitize";
import { formatDateTimePl } from "@/lib/format";
import { ChatbotTabs } from "../ChatbotTabs";

export const metadata = { title: "Rozmowy" };

const STATUS_LABEL: Record<string, string> = {
  active: "w toku",
  handoff: "przekazana",
  closed: "zamknięta",
};

const TOPIC_LABEL: Record<string, string> = {
  FIND_CAR: "dobór auta",
  CHECK_AVAILABILITY: "dostępność",
  GET_PRICE: "cena",
  GET_DEPOSIT: "kaucja",
  GET_MILEAGE_LIMIT: "limit km",
  COMPARE_CARS: "porównanie",
  AIRPORT: "lotnisko",
  LONG_TERM: "długoterminowy",
  B2B: "firmy",
  FAQ: "FAQ",
  CONTACT_HUMAN: "kontakt",
  START_BOOKING: "rezerwacja",
  GREETING: "powitanie",
  UNKNOWN: "nierozpoznane",
  OUT_OF_SCOPE: "odrzucone",
};

export default async function ConversationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

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
        <h1 className="font-heading text-ink text-2xl font-bold">Rozmowy</h1>
        <p className="text-silver mt-1 text-sm">
          Zapisy rozmów z asystentem. Bez adresów IP i bez śladów przeglądarki —
          transkrypty kasują się same po {RETENTION_DAYS} dniach. Numery
          telefonów, adresy e-mail, numery kart i dokumentów są maskowane przy
          wyświetlaniu.
        </p>
      </header>

      <ChatbotTabs active="/admin/chatbot/rozmowy" />

      {openId && summary && (
        <section className="border-line-strong mb-6 border p-5">
          <h2 className="label text-ink mb-4 text-xs">Podsumowanie rozmowy</h2>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[13rem_1fr]">
            {(
              [
                [
                  "Czas",
                  `${formatDateTimePl(summary.startedAt)} → ${formatDateTimePl(summary.lastMessageAt)}`,
                ],
                ["Język", summary.locale.toUpperCase()],
                [
                  "Intent",
                  summary.intent
                    ? (TOPIC_LABEL[summary.intent] ?? summary.intent)
                    : "—",
                ],
                [
                  "Szukany model",
                  summary.wanted
                    .filter((w) => w.model)
                    .map((w) => w.label)
                    .join(", ") || "—",
                ],
                [
                  "Marka",
                  [
                    ...new Set(
                      summary.wanted.map((w) => w.brand).filter(Boolean),
                    ),
                  ].join(", ") || "—",
                ],
                [
                  "Segment",
                  [
                    ...new Set(
                      summary.wanted.map((w) => w.segment).filter(Boolean),
                    ),
                  ].join(", ") || "—",
                ],
                [
                  "Liczba pasażerów",
                  [
                    ...new Set(
                      summary.wanted.map((w) => w.seats).filter(Boolean),
                    ),
                  ].join(", ") || "—",
                ],
                [
                  "Termin",
                  summary.dateFrom
                    ? `${summary.dateFrom}${summary.dateTo ? ` → ${summary.dateTo}` : ""}`
                    : "—",
                ],
                ["Lokalizacja", summary.locationName ?? "—"],
                [
                  "Czy auto było we flocie",
                  summary.wanted.length === 0
                    ? "— (nie padła nazwa auta)"
                    : summary.wanted.every((w) => w.inFleet)
                      ? "tak"
                      : summary.wanted.some((w) => w.inFleet)
                        ? "częściowo"
                        : "nie",
                ],
                [
                  "Czy było dostępne",
                  summary.wanted.some((w) => w.unavailable)
                    ? "nie — termin zajęty"
                    : summary.wanted.length === 0
                      ? "—"
                      : "nie stwierdzono braku",
                ],
                [
                  "Czy pokazano alternatywy",
                  summary.alternativesShown ? "tak" : "nie",
                ],
                [
                  "Czy kliknięto „Rezerwuj”",
                  summary.wentToBooking ? "tak" : "nie",
                ],
                [
                  "Czy powstała rezerwacja",
                  "nie odnotowano — rezerwacja zapisuje źródło (chatbot), ale nie numer rozmowy",
                ],
                ["Czy powstał lead", summary.leadCreated ? "tak" : "nie"],
                [
                  "Czy przekazano do pracownika",
                  summary.handoff ? "tak" : "nie",
                ],
                ["Czy użyto Cloudflare", summary.aiUsed ? "tak" : "nie"],
                [
                  "Czy wystąpił fallback",
                  summary.aiFallback
                    ? "tak — model nie odpowiedział, odpowiedziały reguły"
                    : "nie",
                ],
                ["Pytania bez odpowiedzi", summary.unansweredCount || "—"],
                ["Dlaczego bez rezerwacji", summary.noBookingReason],
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
          <h2 className="label text-ink mb-3 text-xs">Przebieg rozmowy</h2>
          {transcript.length === 0 ? (
            <p className="text-silver text-sm">
              Ta rozmowa już nie istnieje — mogła zostać usunięta przez
              czyszczenie po {RETENTION_DAYS} dniach.
            </p>
          ) : (
            <div className="space-y-3">
              {transcript.map((m) => (
                <div key={m.id}>
                  <p className="label-tight text-ink-faint text-[10px]">
                    {m.role === "user" ? "Klient" : "Asystent"} ·{" "}
                    {formatDateTimePl(m.createdAt)}
                    {m.intent ? ` · ${TOPIC_LABEL[m.intent] ?? m.intent}` : ""}
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
            Zamknij
          </Link>
        </section>
      )}

      {conversations.length === 0 ? (
        <p className="border-line text-silver border px-5 py-8 text-center text-sm">
          Jeszcze nikt nie rozmawiał z asystentem.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-line text-ink-faint border-y">
                <th className="label-tight py-3 pr-4 text-[10px]">Data</th>
                <th className="label-tight py-3 pr-4 text-[10px]">Język</th>
                <th className="label-tight py-3 pr-4 text-[10px]">Temat</th>
                <th className="label-tight py-3 pr-4 text-[10px]">Auto</th>
                <th className="label-tight py-3 pr-4 text-[10px]">Termin</th>
                <th className="label-tight py-3 pr-4 text-[10px]">Lead</th>
                <th className="label-tight py-3 pr-4 text-[10px]">
                  Rezerwacja
                </th>
                <th className="label-tight py-3 pr-4 text-[10px]">Bez odp.</th>
                <th className="label-tight py-3 text-[10px]">Status</th>
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
                    {c.topic ? (TOPIC_LABEL[c.topic] ?? c.topic) : "—"}
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
                    {STATUS_LABEL[c.status] ?? c.status}
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
