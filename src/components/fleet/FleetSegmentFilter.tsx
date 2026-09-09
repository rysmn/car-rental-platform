import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FLEET_SEGMENTS, type FleetSegment } from "@/lib/fleet/segments";
import { filterHref, type FleetFilterTarget } from "./filterTarget";

/**
 * Class filter above the fleet grid: All / Luxury / Executive / Premium SUV /
 * Electric / Business / Van.
 *
 * Links rather than client-side state, for the same reason the date filter
 * navigates: "the SUVs" becomes a URL somebody can bookmark or send to whoever
 * else is paying. Any date range already chosen rides along in the query, so
 * the two filters compose instead of clearing each other.
 *
 * A class nobody's car belongs to is left out — a chip that leads to an empty
 * page is a worse answer than not offering it. The active one always shows,
 * even at zero, so the way back is never hidden.
 *
 * `target` is the page the chips sit on, so the home page filters its own fleet
 * section instead of bouncing the visitor to `/fleet`. There the chips keep the
 * scroll position — the grid they change is right under them.
 */
export function FleetSegmentFilter({
  active,
  counts,
  range,
  target = "/fleet",
  keep = {},
}: {
  active: FleetSegment | null;
  counts: Map<FleetSegment, number>;
  range: { from: string; to: string } | null;
  target?: FleetFilterTarget;
  /** Other filters in the URL — today the budget — that ride along. */
  keep?: Record<string, string>;
}) {
  const t = useTranslations("Fleet");
  const dates = range
    ? { ...keep, from: range.from, to: range.to }
    : { ...keep };
  const scroll = target !== "/";

  const shown = FLEET_SEGMENTS.filter(
    (s) => (counts.get(s) ?? 0) > 0 || s === active,
  );
  if (shown.length === 0) return null;

  const chip = (isActive: boolean) =>
    `label-tight rounded-pill tap inline-flex h-9 items-center border px-4 text-[11px] transition-colors ${
      isActive
        ? "border-red bg-red text-white"
        : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
    }`;

  return (
    <div className="mt-8">
      <p className="label-tight text-silver text-[11px]">{t("segmentTitle")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={filterHref(target, dates)}
          scroll={scroll}
          aria-current={active === null ? "page" : undefined}
          className={chip(active === null)}
        >
          {t("segmentAll")}
        </Link>
        {shown.map((s) => (
          <Link
            key={s}
            href={filterHref(target, { ...dates, segment: s })}
            scroll={scroll}
            aria-current={active === s ? "page" : undefined}
            className={chip(active === s)}
          >
            {t(`segment.${s}`)}
            <span className="ml-2 opacity-60">{counts.get(s) ?? 0}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
