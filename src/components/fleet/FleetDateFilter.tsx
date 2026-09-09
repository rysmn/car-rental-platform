"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { todayIso } from "@/lib/dates";
import { filterHref, type FleetFilterTarget } from "./filterTarget";

// Same box as the booking panel: fixed `h-11` so the two date fields match
// each other and the buttons they sit beside, whatever the phone's native
// date widget would rather be.
const inputCls =
  "field-box w-full min-w-0 rounded-none border border-line bg-surface-1 h-11 px-3 text-sm text-ink outline-none transition-colors focus:border-line-strong [color-scheme:dark]";

/**
 * Date filter above the fleet grid.
 *
 * Navigates rather than filtering in place: the dates end up in the URL, so a
 * shortlist for a specific week can be bookmarked, shared with whoever else is
 * on the trip, or reloaded without retyping. The server does the filtering, so
 * the page never ships an availability map for every car just to hide most of
 * them.
 *
 * `target` is the page the filter sits on. On the home page the fleet section
 * is halfway down, so navigation keeps the scroll position: the visitor stays
 * looking at the filter they just used instead of being thrown up to the hero.
 */
export function FleetDateFilter({
  from,
  to,
  target = "/fleet",
  keep = {},
}: {
  from?: string;
  to?: string;
  target?: FleetFilterTarget;
  /**
   * Filters already in the URL that this one must not throw away — today the
   * class and the budget. Without it, choosing dates would silently clear the
   * budget the visitor typed one control higher up the page.
   */
  keep?: Record<string, string>;
}) {
  const t = useTranslations("Fleet");
  const router = useRouter();
  const today = todayIso();
  const navOptions = { scroll: target !== "/" };

  const [start, setStart] = useState(from ?? "");
  const [end, setEnd] = useState(to ?? "");

  const invalid = Boolean(start && end && end < start);
  const ready = Boolean(start && end) && !invalid;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        router.push(
          filterHref(target, { ...keep, from: start, to: end }),
          navOptions,
        );
      }}
      className="border-line mt-10 border p-5 md:p-6"
    >
      <p className="label-tight text-silver text-[11px]">{t("filterTitle")}</p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1">
          <span className="label-tight text-silver text-[11px]">
            {t("filterFrom")}
          </span>
          <input
            type="date"
            min={today}
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={`${inputCls} mt-2`}
          />
        </label>

        <label className="block min-w-0 flex-1">
          <span className="label-tight text-silver text-[11px]">
            {t("filterTo")}
          </span>
          <input
            type="date"
            min={start || today}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={`${inputCls} mt-2`}
          />
        </label>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!ready}
            className="label bg-red hover:bg-red-hover inline-flex h-11 shrink-0 items-center px-6 text-xs whitespace-nowrap text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("filterSubmit")}
          </button>

          {(from || to) && (
            <button
              type="button"
              onClick={() => {
                setStart("");
                setEnd("");
                // Clears the DATES, not the page: whatever else the
                // visitor chose stays chosen.
                router.push(filterHref(target, { ...keep }), navOptions);
              }}
              className="label-tight border-line hover:border-line-strong text-ink-muted hover:text-ink inline-flex h-11 shrink-0 items-center border px-4 text-[11px] whitespace-nowrap transition-colors"
            >
              {t("filterClear")}
            </button>
          )}
        </div>
      </div>

      {invalid && <p className="text-red mt-3 text-xs">{t("filterInvalid")}</p>}
    </form>
  );
}
