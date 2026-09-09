import type { QueryParams } from "next-intl/navigation";

/**
 * Where the fleet filters send the visitor.
 *
 * The same two filters sit above the fleet grid on `/fleet` and above the fleet
 * section of the home page, and each one filters the grid it belongs to — so
 * the target is the page the filter is currently on, not a fixed destination.
 */
export type FleetFilterTarget = "/" | "/fleet";

/**
 * Build a filter link for the given page.
 *
 * Written as a branch rather than `{ pathname: target }` because the localized
 * href type is a union of per-route object shapes: an object whose `pathname`
 * is itself a union satisfies none of them.
 */
export function filterHref(target: FleetFilterTarget, query: QueryParams) {
  return target === "/"
    ? { pathname: "/" as const, query }
    : { pathname: "/fleet" as const, query };
}
