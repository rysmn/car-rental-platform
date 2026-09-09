import { setRequestLocale } from "next-intl/server";
import { listQuestions, listFaqDrafts } from "@/lib/admin/chat-questions";
import { sanitizeAIInput } from "@/lib/chat/ai/sanitize";
import { formatDateTimePl } from "@/lib/format";
import { ChatbotTabs } from "../ChatbotTabs";
import { AddToFaq, FaqDraftRow } from "./FaqEditor";

export const metadata = { title: "Pytania bez odpowiedzi" };

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
          Pytania bez odpowiedzi
        </h1>
        <p className="text-silver mt-1 text-sm">
          Czego klienci szukali, a asystent nie potrafił odpowiedzieć — oraz
          na co odpowiedział, choć nie był pewien. To jest lista rzeczy, których
          brakuje w FAQ, i najtańsze źródło wiedzy o tym, czego brakuje na
          stronie. Zacznij od pozycji „niska pewność”: tam klient odszedł
          przekonany, że dostał odpowiedź.
        </p>
      </header>

      <ChatbotTabs active="/admin/chatbot/pytania" />

      <div className="border-line-strong bg-graphite/60 mb-8 border-l-2 border-l-amber-500 p-4">
        <p className="text-silver text-sm">
          „Dodaj do FAQ” tworzy{" "}
          <strong className="font-normal">szkic z pustą odpowiedzią</strong>.
          Nic nie jest generowane automatycznie i nic nie trafia do klienta,
          dopóki nie napiszesz treści i nie klikniesz „Zatwierdź i opublikuj”.
          Opublikowany wpis pojawia się w dwóch miejscach naraz — na stronie FAQ
          i u asystenta — żeby nie powstała druga, niewidoczna wersja warunków
          wynajmu.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="border-line text-silver border px-5 py-8 text-center text-sm">
          Asystent odpowiedział na wszystko, o co go pytano.
        </p>
      ) : (
        <>
          <p className="text-ink-faint mb-4 text-xs">
            {rows.length} różnych pytań, {total} wystąpień łącznie
            {lowConfidence > 0 ? (
              <>
                {" · "}
                <strong className="font-normal text-amber-500">
                  {lowConfidence} z niską pewnością
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
              Wszystkie ({allRows.length})
            </a>
            <a
              href="?stan=niska-pewnosc"
              className={`tap border px-3 py-1.5 ${
                filter === "niska-pewnosc"
                  ? "border-amber-500 text-amber-500"
                  : "border-line text-silver hover:border-ink hover:text-ink"
              }`}
            >
              Niska pewność ({lowConfidence})
            </a>
            <a
              href="?stan=bez-odpowiedzi"
              className={`tap border px-3 py-1.5 ${
                filter === "bez-odpowiedzi"
                  ? "border-ink text-ink"
                  : "border-line text-silver hover:border-ink hover:text-ink"
              }`}
            >
              Bez odpowiedzi ({allRows.length - lowConfidence})
            </a>
          </nav>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-line text-ink-faint border-y">
                  <th className="label-tight py-3 pr-4 text-[10px]">Pytanie</th>
                  <th className="label-tight py-3 pr-4 text-[10px]">Stan</th>
                  <th className="label-tight py-3 pr-4 text-[10px]">Data</th>
                  <th className="label-tight py-3 pr-4 text-right text-[10px]">
                    Ile razy
                  </th>
                  <th className="label-tight py-3 pr-4 text-[10px]">
                    Kategoria
                  </th>
                  <th className="label-tight py-3 pr-4 text-[10px]">Intent</th>
                  <th className="label-tight py-3 pr-4 text-[10px]">
                    Jest w FAQ?
                  </th>
                  <th className="label-tight py-3 pr-4 text-right text-[10px]">
                    Dostał odpowiedź
                  </th>
                  <th className="label-tight py-3 pr-4 text-right text-[10px]">
                    Poszedł do człowieka
                  </th>
                  <th className="label-tight py-3 text-[10px]">Akcja</th>
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
                          title="Asystent odpowiedział, ale dopasowanie ledwo przekroczyło próg. Sprawdź, czy odpowiedź była trafna."
                        >
                          niska pewność
                        </span>
                      ) : (
                        <span className="text-ink-faint text-[10px] whitespace-nowrap">
                          bez odpowiedzi
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
                      {r.intent ? (TOPIC_LABEL[r.intent] ?? r.intent) : "—"}
                    </td>
                    {/* Covered by an entry the matcher can reach = a matching
                        problem, not a content one. Different fix entirely. */}
                    <td className="py-3 pr-4 text-xs">
                      {r.faqHit ? (
                        <span
                          className="text-amber-500"
                          title={`Najbliższy wpis: „${r.faqHit.q}”`}
                        >
                          podobne jest
                        </span>
                      ) : (
                        <span className="text-ink-faint">nie</span>
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
            „Dostał odpowiedź” i „poszedł do człowieka” liczone są do przodu:
            kiedy asystent zawiedzie, zapamiętuje to pytanie i rozlicza je przy
            następnej wiadomości w tej samej rozmowie. Dzięki temu widać różnicę
            między pytaniem źle sformułowanym, po którym klient sobie poradził,
            a takim, po którym się poddał.
          </p>
        </>
      )}

      {/* ── Wpisy pisane w panelu ──────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="label text-ink text-xs">
          Wpisy FAQ pisane w panelu ({drafts.length})
        </h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          Szkic jest niewidoczny dla klientów. Opublikowany wpis trafia od razu
          na stronę FAQ i do asystenta.
        </p>
        {drafts.length === 0 ? (
          <p className="border-line text-silver border px-5 py-8 text-center text-sm">
            Nie ma tu jeszcze żadnego wpisu. Użyj „Dodaj do FAQ” przy pytaniu
            powyżej.
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
