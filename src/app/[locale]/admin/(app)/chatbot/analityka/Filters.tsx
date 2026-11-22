import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  filtersToQuery,
  type DemandFilters,
  type DemandRange,
} from "@/lib/admin/chat-demand";

/**
 * The filter bar — links, not a client component.
 *
 * Every choice is a URL. That costs a round trip and buys three things worth
 * more than the round trip: the page is shareable ("look at last month's
 * misses"), the back button works, and there is no client-side state that can
 * disagree with the numbers rendered beside it. The one form is the custom
 * range, which needs typed input and works with `method="get"` alone.
 */
const RANGES: DemandRange[] = ["today", "7d", "30d", "month", "custom"];

function Chip({
  href,
  active,
  children,
}: {
  href: Record<string, string>;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={{ pathname: "/admin/chatbot/analityka", query: href }}
      className={`label-tight tap border px-3 py-1.5 text-[10px] transition-colors ${
        active
          ? "border-ink text-ink"
          : "border-line text-ink-faint hover:border-ink-faint hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

export function Filters({ f }: { f: DemandFilters }) {
  const t = useTranslations("Admin.chatbot");
  return (
    <section className="border-line mb-10 border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-tight text-ink-faint mr-1 text-[10px]">
          {t("analytics.filters.period")}
        </span>
        {RANGES.map((r) => (
          <Chip
            key={r}
            active={f.range === r}
            href={filtersToQuery(f, {
              okres: r === "30d" ? null : r,
              ...(r === "custom" ? {} : { od: null, do: null }),
            })}
          >
            {t(`analytics.ranges.${r}`)}
          </Chip>
        ))}
      </div>

      {f.range === "custom" && (
        <form method="get" className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="okres" value="custom" />
          {f.locale && <input type="hidden" name="jezyk" value={f.locale} />}
          {f.kind && <input type="hidden" name="rodzaj" value={f.kind} />}
          {f.booked != null && (
            <input
              type="hidden"
              name="rezerwacja"
              value={f.booked ? "tak" : "nie"}
            />
          )}
          <label className="block">
            <span className="label-tight text-ink-faint block text-[10px]">
              {t("analytics.filters.from")}
            </span>
            <input
              type="date"
              name="od"
              defaultValue={f.from ?? ""}
              className="border-line bg-void text-ink mt-1 border px-2 py-1 text-xs"
            />
          </label>
          <label className="block">
            <span className="label-tight text-ink-faint block text-[10px]">
              {t("analytics.filters.to")}
            </span>
            <input
              type="date"
              name="do"
              defaultValue={f.to ?? ""}
              className="border-line bg-void text-ink mt-1 border px-2 py-1 text-xs"
            />
          </label>
          <button
            type="submit"
            className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 h-8 border px-4 text-[10px] transition-colors"
          >
            {t("analytics.filters.show")}
          </button>
        </form>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="label-tight text-ink-faint mr-1 text-[10px]">
          {t("analytics.filters.language")}
        </span>
        <Chip active={!f.locale} href={filtersToQuery(f, { jezyk: null })}>
          {t("analytics.filters.both")}
        </Chip>
        <Chip
          active={f.locale === "pl"}
          href={filtersToQuery(f, { jezyk: "pl" })}
        >
          PL
        </Chip>
        <Chip
          active={f.locale === "en"}
          href={filtersToQuery(f, { jezyk: "en" })}
        >
          EN
        </Chip>

        <span className="label-tight text-ink-faint mr-1 ml-4 text-[10px]">
          {t("analytics.filters.queryKind")}
        </span>
        <Chip active={!f.kind} href={filtersToQuery(f, { rodzaj: null })}>
          {t("analytics.filters.kindAll")}
        </Chip>
        <Chip
          active={f.kind === "model"}
          href={filtersToQuery(f, { rodzaj: "model" })}
        >
          {t("analytics.filters.kindModel")}
        </Chip>
        <Chip
          active={f.kind === "brand"}
          href={filtersToQuery(f, { rodzaj: "brand" })}
        >
          {t("analytics.filters.kindBrand")}
        </Chip>
        <Chip
          active={f.kind === "segment"}
          href={filtersToQuery(f, { rodzaj: "segment" })}
        >
          {t("analytics.filters.kindSegment")}
        </Chip>

        <span className="label-tight text-ink-faint mr-1 ml-4 text-[10px]">
          {t("analytics.filters.booking")}
        </span>
        <Chip
          active={f.booked == null}
          href={filtersToQuery(f, { rezerwacja: null })}
        >
          {t("analytics.filters.bookingAll")}
        </Chip>
        <Chip
          active={f.booked === true}
          href={filtersToQuery(f, { rezerwacja: "tak" })}
        >
          {t("analytics.filters.withBooking")}
        </Chip>
        <Chip
          active={f.booked === false}
          href={filtersToQuery(f, { rezerwacja: "nie" })}
        >
          {t("analytics.filters.withoutBooking")}
        </Chip>
      </div>

      {(f.model || f.segment) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="label-tight text-ink-faint mr-1 text-[10px]">
            {t("analytics.filters.narrowed")}
          </span>
          <Chip active href={filtersToQuery(f, { model: null, segment: null })}>
            {f.model ?? f.segment} ✕
          </Chip>
        </div>
      )}

      <p className="text-ink-faint mt-4 text-xs">
        {t("analytics.filters.sourceNote")}
      </p>
    </section>
  );
}
