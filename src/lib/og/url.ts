import { SITE_ORIGIN } from "@/lib/seo";

/**
 * URLs of the generated social cards.
 *
 * Kept apart from `lib/og/card` so that `generateMetadata` can reference a card
 * without importing `next/og` and the whole Satori renderer into the page
 * bundle. This module is strings only.
 */

/** What a card can be generated for. Anything else 404s at the route. */
export type OgKind = "landing" | "car" | "page";

export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/**
 * Absolute, because Open Graph consumers are not browsers — a relative
 * `og:image` is resolved by some scrapers and dropped by others.
 *
 * The `.png` suffix is load-bearing, not decoration: the i18n proxy's matcher
 * skips any path containing a dot, which is what keeps next-intl from trying to
 * locale-route these and 404ing them.
 */
export function ogImageUrl(kind: OgKind, id: string, locale: string): string {
  return `${SITE_ORIGIN}/og-image/${kind}/${encodeURIComponent(id)}/${encodeURIComponent(locale)}.png`;
}
