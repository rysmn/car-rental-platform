"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { CarCard } from "@/components/fleet/CarCard";
import { pruneSaved, useSaved } from "@/lib/favorites/store";
import { COMPARE_MAX, COMPARE_MIN } from "@/lib/fleet/compareLimits";
import type { FleetState } from "@/lib/fleet/status";
import type { FleetCar } from "@/lib/fleet/types";

/**
 * The saved list, assembled in the browser from ids and the live fleet.
 *
 * The server hands over the whole published fleet and this picks out what the
 * visitor saved. That is deliberate: the alternative — sending the ids to the
 * server to fetch — would put a list of what one person is looking at into a
 * request, and would still have to be re-fetched on every toggle. Here a heart
 * flips and the list updates with no round trip at all.
 *
 * ## Two states, not one
 *
 * The heart means "keep this car". The checkbox means "compare this one now".
 * They are separate because a visitor with five saved cars still compares three
 * at most, and clearing a comparison should not throw away what they saved.
 */
export function SavedList({
  fleet,
  states = {},
  nextFree = {},
  today,
}: {
  fleet: FleetCar[];
  /** modelId → today's state; empty when the operator has hidden statuses. */
  states?: Record<string, FleetState>;
  /** modelId → pierwszy wolny dzień `YYYY-MM-DD`; puste, gdy nieznany. */
  nextFree?: Record<string, string>;
  /** Dzisiejsza data `YYYY-MM-DD`, policzona na serwerze. */
  today?: string;
}) {
  const t = useTranslations("Saved");
  const router = useRouter();
  const { ids, remove } = useSaved();
  const [rawPicked, setRawPicked] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const existing = useMemo(() => fleet.map((c) => c.id), [fleet]);

  /*
   * A car retired in the admin panel leaves the visitor's list the first time
   * they look at it. Without this the id would sit in storage for ever,
   * rendering nothing and counting towards the badge.
   */
  useEffect(() => {
    pruneSaved(existing);
  }, [existing]);

  const cars = useMemo(
    () =>
      ids
        .map((id) => fleet.find((c) => c.id === id))
        .filter((c): c is FleetCar => Boolean(c)),
    [ids, fleet],
  );

  /*
   * The selection is DERIVED against the saved list rather than synced to it.
   *
   * Unsaving a car has to un-pick it, and doing that in an effect means a render
   * with a stale selection followed by a second one to correct it. Filtering at
   * read time makes the wrong state unrepresentable instead of short-lived.
   */
  const picked = useMemo(
    () => rawPicked.filter((id) => ids.includes(id)),
    [rawPicked, ids],
  );

  const toggle = (id: string) => {
    setNotice(null);
    setRawPicked((p) => {
      if (p.includes(id)) return p.filter((x) => x !== id);
      if (p.filter((x) => ids.includes(x)).length >= COMPARE_MAX) {
        setNotice(t("compareMax"));
        return p;
      }
      return [...p, id];
    });
  };

  if (cars.length === 0) {
    return (
      <div className="border-line flex flex-col items-start gap-5 border-t py-14">
        <p className="text-silver text-sm">{t("empty")}</p>
        <ButtonLink href="/fleet" size="sm">
          {t("emptyCta")}
        </ButtonLink>
      </div>
    );
  }

  const canCompare = picked.length >= COMPARE_MIN;

  return (
    <div className="flex flex-col gap-8">
      {/*
        The comparison bar sits above the grid and sticks while scrolling: with
        four or five saved cars the button would otherwise be off-screen at the
        moment the visitor finishes choosing.
      */}
      <div className="border-line bg-void/80 sticky top-20 z-30 flex flex-wrap items-center gap-x-4 gap-y-2 border-y py-3 backdrop-blur-md">
        <p className="label-tight text-ink-faint text-[11px]">
          {t("pickToCompare")} ({picked.length}/{COMPARE_MAX})
        </p>
        <button
          type="button"
          disabled={!canCompare}
          onClick={() =>
            router.push({
              pathname: "/compare",
              query: { cars: picked.join(",") },
            })
          }
          className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap inline-flex h-11 items-center border px-5 text-xs transition-colors disabled:opacity-40"
        >
          {canCompare ? t("compareN", { count: picked.length }) : t("compare")}
        </button>
        {!canCompare && (
          <span className="text-ink-faint text-xs">{t("compareMin")}</span>
        )}
        {notice && <span className="text-red text-xs">{notice}</span>}
      </div>

      <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {cars.map((car) => (
          <div key={car.id} className="flex flex-col gap-3">
            <CarCard
              car={car}
              headingLevel="h2"
              state={states[car.id] ?? null}
              nextFreeDay={nextFree[car.id] ?? null}
              today={today}
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <label className="text-silver flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={picked.includes(car.id)}
                  onChange={() => toggle(car.id)}
                  className="accent-red size-4"
                />
                {t("pickToCompare")}
              </label>
              <button
                type="button"
                onClick={() => remove(car.id)}
                className="label-tight text-ink-faint hover:text-red tap text-[11px] transition-colors"
              >
                {t("remove")}
              </button>
              <Link
                href={{ pathname: "/fleet/[slug]", params: { slug: car.slug } }}
                className="label-tight text-ink-faint hover:text-ink tap text-[11px] transition-colors"
              >
                {t("details")}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
