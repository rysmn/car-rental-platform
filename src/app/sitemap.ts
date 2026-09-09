import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import type { AppHref } from "@/i18n/navigation";
import { absoluteUrl, BUILD_TIME } from "@/lib/seo";
import { getFleetSitemapEntries } from "@/lib/fleet/repo";
import { getSetting } from "@/lib/admin/settings";
import { AKTYWNE_LANDINGI } from "@/lib/marketing/landing";

/**
 * XML sitemap.
 *
 * Pages an admin has switched off are omitted — they 404, and listing a 404 in
 * the sitemap is exactly the kind of inconsistency Search Console reports as an
 * error. Each entry carries hreflang alternates so Google pairs the Polish and
 * English versions instead of treating them as duplicates.
 *
 * `lastModified` is a claim, not decoration. It used to be `new Date()` for
 * every URL on every fetch, which told Google that all fifteen pages had
 * changed seconds ago — every single time it looked. A crawler that catches a
 * sitemap lying about that stops reading the field, and then a genuinely
 * updated price takes as long to be recrawled as a page nobody has touched
 * since launch. So each URL now carries a date it can actually justify:
 *
 *   - car pages   → that model's `updated_at`, straight from the database
 *   - everything else → `BUILD_TIME`, the deploy that last changed its content
 *
 * Anything with no defensible date carries no `<lastmod>` at all.
 */

/**
 * Rendered per request, deliberately — same reasoning as the car detail page.
 *
 * Prerendering this at build time was silently wrong in production: the Docker
 * image is built without database access, so the fleet query fell back to the
 * fixture cars in `lib/fleet/data` and the shipped sitemap advertised four of
 * the seven models. The missing cars were live and linked from /fleet, but
 * never submitted to Google.
 *
 * A sitemap is a statement about what exists *now*; a car added in the admin
 * panel has to appear without a redeploy. The cost is two queries per fetch,
 * and crawlers fetch this a few times a day.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = await getSetting("pages");
  const cars = await getFleetSitemapEntries();

  type Entry = {
    path: AppHref;
    priority: number;
    enabled: boolean;
    lastModified: Date | null;
  };

  // priority is a hint about relative importance within this site only.
  const staticPaths: Entry[] = [
    { path: "/", priority: 1.0, enabled: true, lastModified: BUILD_TIME },
    { path: "/fleet", priority: 0.9, enabled: true, lastModified: BUILD_TIME },
    // The search landing pages rank for the city, airport and vehicle-class
    // queries the home page is too brand-led to win. They sit just under
    // /fleet, and come straight from the registry so a new one is listed here
    // the moment it exists — a landing page missing from the sitemap is a
    // landing page Google finds last.
    ...AKTYWNE_LANDINGI.map((route) => ({
      path: route.href,
      priority: route.priority,
      enabled: true,
      lastModified: BUILD_TIME,
    })),
    {
      path: "/faq",
      priority: 0.7,
      enabled: pages.faq,
      lastModified: BUILD_TIME,
    },
    {
      path: "/how-it-works",
      priority: 0.7,
      enabled: pages.howItWorks,
      lastModified: BUILD_TIME,
    },
    {
      path: "/about",
      priority: 0.6,
      enabled: pages.about,
      lastModified: BUILD_TIME,
    },
    {
      path: "/contact",
      priority: 0.6,
      enabled: pages.contact,
      lastModified: BUILD_TIME,
    },
    /*
     * Strona partnerska. Priorytet niżej niż flota i landingi, wyżej niż
     * dokumenty prawne: to treść, którą ktoś może wyszukać („wynajem aut
     * partnerstwo", „inwestycja w flotę"), ale nie po nią przychodzi
     * większość ruchu.
     */
    {
      path: "/partnership",
      priority: 0.5,
      enabled: true,
      lastModified: BUILD_TIME,
    },
    {
      path: "/regulamin",
      priority: 0.3,
      enabled: true,
      lastModified: BUILD_TIME,
    },
    {
      path: "/polityka-prywatnosci",
      priority: 0.3,
      enabled: true,
      lastModified: BUILD_TIME,
    },
  ];

  const carPaths: Entry[] = cars.map((car) => ({
    path: { pathname: "/fleet/[slug]", params: { slug: car.slug } } as const,
    priority: 0.8,
    enabled: true,
    lastModified: car.updatedAt,
  }));

  /*
   * Both languages get their own <loc>.
   *
   * The alternates block was already here, and Google does follow it — but a
   * language that never appears as a `<loc>` of its own is a language the
   * sitemap does not submit. The English URLs (the landing pages,
   * the fleet, the car pages and the rest) were reachable and indexable and
   * simply not on the list.
   *
   * Every emitted URL is the same page in another locale: same enabled flag,
   * same priority, same `lastModified`, and each one carries the full
   * alternates set, which is the pairing Google asks for.
   */
  return [...staticPaths, ...carPaths]
    .filter((entry) => entry.enabled)
    .flatMap((entry) => {
      const languages = Object.fromEntries(
        routing.locales.map((l) => [l, absoluteUrl(l, entry.path)]),
      );
      return routing.locales.map((locale) => ({
        url: absoluteUrl(locale, entry.path),
        // Omitted entirely when we have no date we can stand behind.
        ...(entry.lastModified ? { lastModified: entry.lastModified } : {}),
        changeFrequency: "weekly" as const,
        priority: entry.priority,
        alternates: { languages },
      }));
    });
}
