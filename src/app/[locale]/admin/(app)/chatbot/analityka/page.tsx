import { getTranslations, setRequestLocale } from "next-intl/server";
import { useTranslations } from "next-intl";
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
  type DemandRow,
} from "@/lib/admin/chat-demand";
import { pick } from "@/lib/i18n-pick";
import { formatDateTimePl } from "@/lib/format";
import { ChatbotTabs } from "../ChatbotTabs";
import { Filters } from "./Filters";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.chatbot" });
  return { title: t("analytics.metaTitle") };
}

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
  const t = useTranslations("Admin.chatbot");
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
          {t("analytics.funnel.notMeasured")}
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
  const t = useTranslations("Admin.chatbot");
  if (rows.length === 0) return <Empty>{emptyText}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-line text-ink-faint border-y">
            <th className="label-tight py-3 pr-4 text-[10px]">
              {t("analytics.demand.cols.need")}
            </th>
            <th className="label-tight py-3 pr-4 text-right text-[10px]">
              {t("analytics.demand.cols.requests")}
            </th>
            <th className="label-tight py-3 pr-4 text-right text-[10px]">
              {t("analytics.demand.cols.notInFleet")}
            </th>
            <th className="label-tight py-3 pr-4 text-right text-[10px]">
              {t("analytics.demand.cols.unavailable")}
            </th>
            <th className="label-tight py-3 pr-4 text-right text-[10px]">
              {t("analytics.demand.cols.toBooking")}
            </th>
            <th className="label-tight py-3 text-[10px]">{t("analytics.demand.cols.last")}</th>
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
  const t = await getTranslations("Admin.chatbot");
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
  const period = t(`analytics.ranges.${f.range}`).toLowerCase();
  const drillTo = (label: string) => filtersToQuery(f, { model: label });

  return (
    <div className="max-w-5xl">
      <header className="mb-6">
        <h1 className="font-heading text-ink text-2xl font-bold">
          {t("analytics.title")}
        </h1>
        <p className="text-silver mt-1 text-sm">
          {t("analytics.subtitle")}
        </p>
      </header>

      <ChatbotTabs active="/admin/chatbot/analityka" />

      <Filters f={f} />

      {/* ── Lejek ──────────────────────────────────────────────────────── */}
      <section>
        <h2 className="label text-ink text-xs">{t("analytics.funnel.title", { period })}</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          {funnel.since
            ? t("analytics.funnel.since", { since: formatDateTimePl(funnel.since) })
            : t("analytics.funnel.none")}
        </p>
        <div className="border-line mt-4 border px-5 py-3">
          <Step
            label={t("analytics.funnel.steps.conversations")}
            value={funnel.conversations}
            of={funnel.conversations}
          />
          <Step
            label={t("analytics.funnel.steps.searched")}
            value={funnel.searched}
            of={funnel.conversations}
          />
          <Step
            label={t("analytics.funnel.steps.matched")}
            value={funnel.matched}
            of={funnel.conversations}
          />
          <Step
            label={t("analytics.funnel.steps.sawPrice")}
            value={funnel.sawPrice}
            of={funnel.conversations}
          />
          <Step
            label={t("analytics.funnel.steps.clickedBook")}
            value={funnel.clickedBook}
            of={funnel.conversations}
          />
          <Step
            label={t("analytics.funnel.steps.carOpened")}
            value={funnel.carOpened}
            of={funnel.conversations}
            hint={t("analytics.funnel.steps.carOpenedHint")}
          />
          <Step
            label={t("analytics.funnel.steps.startedForm")}
            value={funnel.startedForm}
            of={funnel.conversations}
            hint={t("analytics.funnel.steps.startedFormHint")}
          />
          <Step
            label={t("analytics.funnel.steps.finished")}
            value={funnel.reservations}
            of={funnel.conversations}
            hint={t("analytics.funnel.steps.finishedHint")}
          />
        </div>
        <p className="text-ink-faint mt-3 text-xs">
          {t("analytics.funnel.note")}
        </p>

        <div className="border-line bg-line mt-4 grid gap-px border sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: t("analytics.outcomes.noCar"),
              value: funnel.noCar,
              hint: t("analytics.outcomes.noCarHint"),
            },
            {
              label: t("analytics.outcomes.unavailable"),
              value: funnel.unavailable,
              hint: t("analytics.outcomes.unavailableHint"),
            },
            {
              label: t("analytics.outcomes.handoff"),
              value: funnel.handoff,
              hint: t("analytics.outcomes.handoffHint"),
            },
            { label: t("analytics.outcomes.leads"), value: funnel.leads, hint: t("analytics.outcomes.leadsHint") },
          ].map((tile) => (
            <div key={tile.label} className="bg-void p-5">
              <p className="label-tight text-ink-faint text-[10px]">
                {tile.label}
              </p>
              <p className="font-heading text-ink mt-2 text-2xl font-bold tabular-nums">
                {tile.value}
              </p>
              <p className="text-ink-faint mt-1 text-xs">{tile.hint}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Popyt ──────────────────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="label text-ink text-xs">{t("analytics.demand.title")}</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          {t("analytics.demand.desc")}
        </p>
        <DemandTable
          rows={demand}
          emptyText={t("analytics.demand.empty", { period })}
          filterQuery={drillTo}
        />
      </section>

      <div className="mt-10 grid gap-10 sm:grid-cols-2">
        <section>
          <h2 className="label text-ink mb-4 text-xs">
            {t("analytics.brands")}
          </h2>
          {brands.length === 0 ? (
            <Empty>{t("analytics.empty")}</Empty>
          ) : (
            <Bars rows={brands.map((b) => ({ label: b.name, n: b.n }))} />
          )}
        </section>

        <section>
          <h2 className="label text-ink mb-4 text-xs">
            {t("analytics.segments")}
          </h2>
          {segments.length === 0 ? (
            <Empty>{t("analytics.empty")}</Empty>
          ) : (
            <Bars
              rows={segments.map((s) => ({
                label: t.has(`segments.${s.name}`) ? t(`segments.${s.name}`) : s.name,
                n: s.n,
              }))}
            />
          )}
        </section>

        <section>
          <h2 className="label text-ink mb-4 text-xs">
            {t("analytics.seats")}
          </h2>
          {seats.length === 0 ? (
            <Empty>{t("analytics.empty")}</Empty>
          ) : (
            <Bars
              rows={seats.map((s) => ({ label: t("analytics.seatsCount", { count: Number(s.name) }), n: s.n }))}
            />
          )}
        </section>

        <section>
          <h2 className="label text-ink mb-4 text-xs">
            {t("analytics.noBooking")}
          </h2>
          {noBooking.length === 0 ? (
            <Empty>{t("analytics.empty")}</Empty>
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
          {t("analytics.missing.title")}
        </h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          {t("analytics.missing.desc")}
        </p>
        {missing.length === 0 ? (
          <Empty>
            {t("analytics.missing.empty")}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-line text-ink-faint border-y">
                  <th className="label-tight py-3 pr-4 text-[10px]">{t("analytics.missing.cols.model")}</th>
                  <th className="label-tight py-3 pr-4 text-[10px]">{t("analytics.missing.cols.brand")}</th>
                  <th className="label-tight py-3 pr-4 text-right text-[10px]">
                    {t("analytics.missing.cols.requests")}
                  </th>
                  <th className="label-tight py-3 pr-4 text-[10px]">
                    {t("analytics.missing.cols.lastRequest")}
                  </th>
                  <th className="label-tight py-3 pr-4 text-right text-[10px]">
                    {t("analytics.missing.cols.days7")}
                  </th>
                  <th className="label-tight py-3 text-right text-[10px]">
                    {t("analytics.missing.cols.days30")}
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
          {t("analytics.unavailableSection.title")}
        </h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          {t("analytics.unavailableSection.desc")}
        </p>
        <DemandTable
          rows={unavailable}
          emptyText={t("analytics.unavailableSection.empty")}
          filterQuery={drillTo}
        />
      </section>

      {/* ── Dlaczego bez rezerwacji ────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="label text-ink text-xs">
          {t("analytics.reasons.title")}
        </h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          {t("analytics.reasons.desc")}
        </p>
        {reasons.length === 0 ? (
          <Empty>{t("analytics.reasons.empty")}</Empty>
        ) : (
          <Bars rows={reasons.map((r) => ({ label: pick(r.label, locale), n: r.n }))} />
        )}
        <p className="text-ink-faint mt-3 text-xs">
          {t("analytics.reasons.priceNote")}
        </p>
      </section>

      {/* ── Wcześniejsze wykresy ───────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="label text-ink text-xs">{t("analytics.daily")}</h2>
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
            {t("analytics.topCars")}
          </h2>
          {stats.topCars.length === 0 ? (
            <Empty>{t("analytics.empty")}</Empty>
          ) : (
            <Bars
              rows={stats.topCars.map((c) => ({ label: c.name, n: c.n }))}
            />
          )}
        </section>

        <section>
          <h2 className="label text-ink mb-4 text-xs">{t("analytics.intents")}</h2>
          {prefs.intents.length === 0 ? (
            <Empty>{t("analytics.empty")}</Empty>
          ) : (
            <Bars
              rows={prefs.intents.map((i) => ({
                label: t.has(`topics.${i.topic}`) ? t(`topics.${i.topic}`) : i.topic,
                n: i.n,
              }))}
            />
          )}
        </section>

        <section>
          <h2 className="label text-ink mb-4 text-xs">
            {t("analytics.locations")}
          </h2>
          {prefs.locations.length === 0 ? (
            <Empty>{t("analytics.empty")}</Empty>
          ) : (
            <Bars
              rows={prefs.locations.map((l) => ({ label: l.name, n: l.n }))}
            />
          )}
        </section>

        <section>
          <h2 className="label text-ink mb-4 text-xs">
            {t("analytics.months")}
          </h2>
          {prefs.months.length === 0 ? (
            <Empty>{t("analytics.empty")}</Empty>
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
