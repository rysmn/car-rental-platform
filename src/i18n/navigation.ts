import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware navigation helpers. Use these instead of next/link + next/navigation.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);

/**
 * A link target this app knows about.
 *
 * Derived from `Link` rather than written out, so it tracks `routing.pathnames`
 * automatically: adding a route to that map is all it takes for wrapper
 * components (`ButtonLink`, the nav config) to accept the new destination.
 *
 * Routes with a dynamic segment take the object form — `{ pathname:
 * "/fleet/[slug]", params: { slug } }` — because a localized pathname cannot be
 * built by string interpolation when the Polish and English slugs differ.
 */
export type AppHref = Parameters<typeof getPathname>[0]["href"];
