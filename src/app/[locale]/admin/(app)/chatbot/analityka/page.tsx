import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  getChatDaily,
  getChatPreferences,
  getChatStats,
} from "@/lib/chat/repo";
import {
  getDemandByModel,
  getDemandWithoutBooking,
  getFunnel,
  getMissingFromFleet,
  getNoBookingReasons,
  getTopBrands,
  getTopSeats,
  getTopSegments,
  getUnavailableDemand,
  filtersToQuery,
  parseFilters,
  RANGE_LABEL,
  type DemandRow,
} from "@/lib/admin/chat-demand";
import { formatDateTimePl } from "@/lib/format";
import { ChatbotTabs } from "../ChatbotTabs";
import { Filters } from "./Filters";

export const metadata = { title: "Analityka chatbota" };

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
  CONTACT_HUMAN: "kontakt z człowiekiem",
  START_BOOKING: "rezerwacja",
  GREETING: "powitanie",
  UNKNOWN: "nierozpoznane",
  OUT_OF_SCOPE: "odrzucone",
};

const SEGMENT_LABEL: Record<string, string> = {
  van: "VAN / BUS",
  "premium-suv": "SUV / PREMIUM SUV",
  luxury: "LUKSUSOWY",
  executive: "KLASA BIZNES",
  electric: "ELEKTRYCZNY",
  business: "EKONOMICZNY",
};

function Bars({ rows }: { rows: { label: string; n: number }[] }) {
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <span className="text-silver w-40 shrink-0 truncate text-xs">
            {r.label}
          </span>
          <div className="bg-line h-2 flex-1">
            <div
              className="bg-red h-full"
              style={{ width: `${Math.max((r.n / max) * 100, 2)}%` }}
            />
          </div>
          <span className="text-ink-faint w-8 text-right text-xs tabular-nums">
            {r.n}
          </span>
        </div>
      ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-ink-faint text-xs">{children}</p>;
}

/** One step of the funnel, as a bar whose width is its share of the top step. */
function Step({
  label,
  value,
  of,
  hint,
}: {
  label: string;
  /**
   * `null` means the stage was not being measured for these conversations —
   * which is a different statement from "nobody reached it", and the row says
   * so rather than drawing an empty bar. A new event backfilled as zero reads
   * as a collapse in conversion that never happened.
   */
  value: number | null;
  of: number;
  hint?: string;
}) {
  const unmeasured = value === null;
  const pct = !unmeasured && of > 0 ? Math.round((value / of) * 100) : null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
      <span className="text-silver w-52 shrink-0 text-xs">{label}</span>
      <div className="bg-line h-2 min-w-24 flex-1">
        <div
          className="bg-red h-full"
          style={{
            width: `${!unmeasured && of > 0 ? Math.max((value / of) * 100, value > 0 ? 2 : 0) : 0}%`,
          }}
        />
      </div>
      <span className="text-ink w-12 text-right text-sm tabular-nums">
        {unmeasured ? "—" : value}
      </span>
      <span className="text-ink-faint w-12 text-right text-xs tabular-nums">
        {pct == null ? "—" : `${pct}%`}
      </span>
      {unmeasured && (
        <span className="label-tight border-line text-ink-faint border px-2 py-0.5 text-[10px]">
          nie mierzone
        </span>
      )}
      {hint && <span className="text-ink-faint w-full text-xs">{hint}</span>}
    </div>
  );
}

function DemandTable({
  rows,
  emptyText,
  filterQuery,
}: {
  rows: DemandRow[];
  emptyText: string;
  filterQuery: (label: string) => Record<string, string>;
}) {
  if (rows.length === 0) return <Empty>{emptyText}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-line text-ink-faint border-y">
            <th className="label-tight py-3 pr-4 text-[10px]">
              Model / potrzeba
            </th>
            <th className="label-tight py-3 pr-4 text-right text-[10px]">
              Zapytania
            </th>
            <th className="label-tight py-3 pr-4 text-right text-[10px]">
              Brak we flocie
            </th>
            <th className="label-tight py-3 pr-4 text-right text-[10px]">
              Brak dostępności
            </th>
            <th className="label-tight py-3 pr-4 text-right text-[10px]">
              Do rezerwacji
            </th>
            <th className="label-tight py-3 text-[10px]">Ostatnie</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-line/60 border-b">
              <td className="py-3 pr-4">
                <Link
                  href={{
                    pathname: "/admin/chatbot/analityka",
                    query: filterQuery(r.label),
                  }}
                  className="text-ink tap-area underline underline-offset-2"
                >
                  {r.label}
                </Link>
              </td>
              <td className="text-ink py-3 pr-4 text-right text-sm tabular-nums">
                {r.enquiries}
              </td>
              <td
                className={`py-3 pr-4 text-right text-sm tabular-nums ${
                  r.notInFleet > 0 ? "text-red" : "text-ink-faint"
                }`}
              >
                {r.notInFleet || "—"}
              </td>
              <td
                className={`py-3 pr-4 text-right text-sm tabular-nums ${
                  r.unavailable > 0 ? "text-amber-500" : "text-ink-faint"
                }`}
              >
                {r.unavailable || "—"}
              </td>
              <td className="text-silver py-3 pr-4 text-right text-sm tabular-nums">
                {r.toBooking || "—"}
              </td>
              <td className="text-ink-faint py-3 text-xs">
                {r.lastAt ? formatDateTimePl(r.lastAt) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Analityka — what customers wanted, and where the wanting stopped.
 *
 * The page has two halves with different jobs. The demand half answers "what
 * should we buy and what should we buy more of", and every number in it comes
 * from `chat_demand`, one row per interest per conversation. The funnel half
 * answers "where do we lose people", and comes from facts latched onto the
 * conversation while it was happening.
 *
 * Neither half guesses. Where the evidence runs out — a reason nobody can
 * infer, a step nothing measures — the page says so in words instead of drawing
 * a bar that looks like knowledge.
 */
export default async function ChatAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const f = parseFilters(await searchParams);

  const [
    stats,
    prefs,
    daily,
    demand,
    brands,
    segments,
    seats,
    missing,
    unavailable,
    noBooking,
    funnel,
    reasons,
  ] = await Promise.all([
    getChatStats(),
    getChatPreferences(),
    getChatDaily(14),
    getDemandByModel(f),
    getTopBrands(f),
    getTopSegments(f),
    getTopSeats(f),
    getMissingFromFleet(f),
    getUnavailableDemand(f),
    getDemandWithoutBooking(f),
    getFunnel(f),
    getNoBookingReasons(f),
  ]);

  const maxDay = Math.max(...daily.map((d) => d.n), 1);
  const period = RANGE_LABEL[f.range].toLowerCase();
  const drillTo = (label: string) => filtersToQuery(f, { model: label });

  return (
    <div className="max-w-5xl">
      <header className="mb-6">
        <h1 className="font-heading text-ink text-2xl font-bold">
          Analityka chatbota
        </h1>
        <p className="text-silver mt-1 text-sm">
          Czego klienci szukają — łącznie z samochodami, których nie mamy — i
          gdzie kończy się droga do rezerwacji.
        </p>
      </header>

      <ChatbotTabs active="/admin/chatbot/analityka" />

      <Filters f={f} />

      {/* ── Lejek ──────────────────────────────────────────────────────── */}
      <section>
        <h2 className="label text-ink text-xs">Lejek — {period}</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          {funnel.since
            ? `Liczony od ${formatDateTimePl(funnel.since)} — od tej chwili system zapisuje te fakty. Wcześniejsze rozmowy są pominięte, bo dla nich „nie zdarzyło się” i „nie mierzyliśmy” wyglądają identycznie, a licząc je razem wychodził lejek, w którym więcej osób klika „Rezerwuj”, niż w ogóle zobaczyło auto.`
            : "Brak danych — żadna rozmowa nie zapisała jeszcze tych faktów."}
        </p>
        <div className="border-line mt-4 border px-5 py-3">
          <Step
            label="Rozmowy"
            value={funnel.conversations}
            of={funnel.conversations}
          />
          <Step
            label="Szukali samochodu"
            value={funnel.searched}
            of={funnel.conversations}
          />
          <Step
            label="Zobaczyli pasujące auto"
            value={funnel.matched}
            of={funnel.conversations}
          />
          <Step
            label="Sprawdzili cenę (wycena na termin)"
            value={funnel.sawPrice}
            of={funnel.conversations}
          />
          <Step
            label="Kliknęli „Rezerwuj”"
            value={funnel.clickedBook}
            of={funnel.conversations}
          />
          <Step
            label="Otworzyli samochód"
            value={funnel.carOpened}
            of={funnel.conversations}
            hint="Kliknięcie „Zobacz samochód” w czacie. Do 22.08.2026 oba przyciski na karcie raportowały to samo zdarzenie, więc przeglądanie i chęć rezerwacji były jedną liczbą."
          />
          <Step
            label="Rozpoczęli formularz"
            value={funnel.startedForm}
            of={funnel.conversations}
            hint="Liczone z otwarcia strony rezerwacji z identyfikatorem rozmowy — nie z kliknięcia. Kto zamknie kartę po drodze, zostaje w kroku wyżej."
          />
          <Step
            label="Zakończyli rezerwację"
            value={funnel.reservations}
            of={funnel.conversations}
            hint="Liczone z pola source = chatbot na rezerwacji — z faktycznie powstałych rezerwacji, nie z kliknięć."
          />
        </div>
        <p className="text-ink-faint mt-3 text-xs">
          Każdy krok liczony z osobnego, rzeczywistego zdarzenia: „Rezerwuj” z
          kliknięcia w czacie, „rozpoczęli formularz” z otwarcia strony
          rezerwacji, „zakończyli rezerwację” z pola source na powstałej
          rezerwacji. Żaden nie jest przepisanym krokiem poprzednim.
        </p>

        <div className="border-line bg-line mt-4 grid gap-px border sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "Brak auta we flocie",
              value: funnel.noCar,
              hint: "prosili o coś, czego nie mamy",
            },
            {
              label: "Brak dostępności",
              value: funnel.unavailable,
              hint: "mamy, ale było zajęte",
            },
            {
              label: "Przekazane do pracownika",
              value: funnel.handoff,
              hint: "prośba o kontakt",
            },
            { label: "Leady", value: funnel.leads, hint: "zostawili kontakt" },
          ].map((t) => (
            <div key={t.label} className="bg-void p-5">
              <p className="label-tight text-ink-faint text-[10px]">
                {t.label}
              </p>
              <p className="font-heading text-ink mt-2 text-2xl font-bold tabular-nums">
                {t.value}
              </p>
              <p className="text-ink-faint mt-1 text-xs">{t.hint}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Popyt ──────────────────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="label text-ink text-xs">Popyt na samochody</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          Jeden wiersz na jedno zainteresowanie w jednej rozmowie. Klient, który
          trzy razy dopytuje o ten sam model, to jedno zapytanie — inaczej jedna
          osoba wyglądałaby jak trzy.
        </p>
        <DemandTable
          rows={demand}
          emptyText={`Brak zapytań w wybranym okresie (${period}).`}
          filterQuery={drillTo}
        />
      </section>

      <div className="mt-10 grid gap-10 sm:grid-cols-2">
        <section>
          <h2 className="label text-ink mb-4 text-xs">
            Najczęściej szukane marki
          </h2>
          {brands.length === 0 ? (
            <Empty>Brak danych.</Empty>
          ) : (
            <Bars rows={brands.map((b) => ({ label: b.name, n: b.n }))} />
          )}
        </section>

        <section>
          <h2 className="label text-ink mb-4 text-xs">
            Najczęściej szukane segmenty
          </h2>
          {segments.length === 0 ? (
            <Empty>Brak danych.</Empty>
          ) : (
            <Bars
              rows={segments.map((s) => ({
                label: SEGMENT_LABEL[s.name] ?? s.name,
                n: s.n,
              }))}
            />
          )}
        </section>

        <section>
          <h2 className="label text-ink mb-4 text-xs">
            Najczęściej szukana liczba miejsc
          </h2>
          {seats.length === 0 ? (
            <Empty>Brak danych.</Empty>
          ) : (
            <Bars
              rows={seats.map((s) => ({ label: `${s.name} osób`, n: s.n }))}
            />
          )}
        </section>

        <section>
          <h2 className="label text-ink mb-4 text-xs">
            Zapytania bez przejścia do rezerwacji
          </h2>
          {noBooking.length === 0 ? (
            <Empty>Brak danych.</Empty>
          ) : (
            <Bars
              rows={noBooking
                .slice(0, 8)
                .map((r) => ({ label: r.label, n: r.enquiries }))}
            />
          )}
        </section>
      </div>

      {/* ── Czego nie mamy ─────────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="label text-ink text-xs">
          Najczęściej szukane samochody, których nie ma we flocie
        </h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          Lista zakupowa. Kolumny 7 i 30 dni liczone są zawsze od dziś,
          niezależnie od filtra okresu — kolumna, która zmienia znaczenie razem
          z rozwijaną listą, jest kolumną, której nie da się zacytować.
        </p>
        {missing.length === 0 ? (
          <Empty>
            W wybranym okresie nikt nie pytał o samochód spoza floty.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-line text-ink-faint border-y">
                  <th className="label-tight py-3 pr-4 text-[10px]">Model</th>
                  <th className="label-tight py-3 pr-4 text-[10px]">Marka</th>
                  <th className="label-tight py-3 pr-4 text-right text-[10px]">
                    Zapytania
                  </th>
                  <th className="label-tight py-3 pr-4 text-[10px]">
                    Ostatnie zapytanie
                  </th>
                  <th className="label-tight py-3 pr-4 text-right text-[10px]">
                    7 dni
                  </th>
                  <th className="label-tight py-3 text-right text-[10px]">
                    30 dni
                  </th>
                </tr>
              </thead>
              <tbody>
                {missing.map((r) => (
                  <tr key={r.label} className="border-line/60 border-b">
                    <td className="text-ink py-3 pr-4">{r.model ?? r.label}</td>
                    <td className="text-silver py-3 pr-4 text-xs">
                      {r.brand ?? "—"}
                    </td>
                    <td className="text-ink py-3 pr-4 text-right text-sm tabular-nums">
                      {r.enquiries}
                    </td>
                    <td className="text-ink-faint py-3 pr-4 text-xs">
                      {r.lastAt ? formatDateTimePl(r.lastAt) : "—"}
                    </td>
                    <td className="text-silver py-3 pr-4 text-right text-sm tabular-nums">
                      {r.last7 || "—"}
                    </td>
                    <td className="text-silver py-3 text-right text-sm tabular-nums">
                      {r.last30 || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Braki dostępności ──────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="label text-ink text-xs">
          Auta, które mamy — a nie były wolne
        </h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          To jest inna decyzja niż lista wyżej: tu nie chodzi o kupno nowego
          modelu, tylko o drugą sztukę tego, który już zarabia.
        </p>
        <DemandTable
          rows={unavailable}
          emptyText="Nikt nie trafił na zajęty termin w wybranym okresie."
          filterQuery={drillTo}
        />
      </section>

      {/* ── Dlaczego bez rezerwacji ────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="label text-ink text-xs">
          Dlaczego nie doszło do rezerwacji
        </h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          Wyliczone z tego, co się wydarzyło, nie zgadywane. „Brak danych” to
          pełnoprawna odpowiedź i pojawia się zawsze, gdy ślady nie wskazują
          jednej przyczyny.
        </p>
        {reasons.length === 0 ? (
          <Empty>Brak rozmów bez rezerwacji w wybranym okresie.</Empty>
        ) : (
          <Bars rows={reasons.map((r) => ({ label: r.label, n: r.n }))} />
        )}
        <p className="text-ink-faint mt-3 text-xs">
          Pozycji „cena” tu nie ma świadomie: nic w systemie nie odróżnia
          klienta, który zobaczył cenę i zrezygnował, od tego, który zobaczył
          cenę i poszedł porównać. Liczba osób, które zobaczyły wycenę, jest w
          lejku wyżej — jako liczba, nie jako motyw.
        </p>
      </section>

      {/* ── Wcześniejsze wykresy ───────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="label text-ink text-xs">Rozmowy — ostatnie 14 dni</h2>
        <div className="border-line mt-4 flex items-end gap-1 border p-4">
          {daily.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center">
              <div
                className="bg-red w-full"
                style={{
                  height: `${Math.max((d.n / maxDay) * 90, d.n > 0 ? 2 : 0)}px`,
                }}
                title={`${d.day}: ${d.n}`}
              />
              <span className="text-ink-faint mt-2 text-[9px]">
                {d.day.slice(8)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-12 grid gap-10 sm:grid-cols-2">
        <section>
          <h2 className="label text-ink mb-4 text-xs">
            Najczęściej pytane samochody z floty
          </h2>
          {stats.topCars.length === 0 ? (
            <Empty>Brak danych.</Empty>
          ) : (
            <Bars
              rows={stats.topCars.map((c) => ({ label: c.name, n: c.n }))}
            />
          )}
        </section>

        <section>
          <h2 className="label text-ink mb-4 text-xs">O co pytają</h2>
          {prefs.intents.length === 0 ? (
            <Empty>Brak danych.</Empty>
          ) : (
            <Bars
              rows={prefs.intents.map((i) => ({
                label: TOPIC_LABEL[i.topic] ?? i.topic,
                n: i.n,
              }))}
            />
          )}
        </section>

        <section>
          <h2 className="label text-ink mb-4 text-xs">
            Najczęściej wybierane miejsca odbioru
          </h2>
          {prefs.locations.length === 0 ? (
            <Empty>Brak danych.</Empty>
          ) : (
            <Bars
              rows={prefs.locations.map((l) => ({ label: l.name, n: l.n }))}
            />
          )}
        </section>

        <section>
          <h2 className="label text-ink mb-4 text-xs">
            Najczęściej pytane terminy
          </h2>
          {prefs.months.length === 0 ? (
            <Empty>Brak danych.</Empty>
          ) : (
            <Bars
              rows={prefs.months.map((m) => ({ label: m.month, n: m.n }))}
            />
          )}
        </section>
      </div>
    </div>
  );
}
