import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/seo";

/**
 * robots.txt.
 *
 * The admin panel and API are disallowed. That is a crawling hint, not access
 * control — the real protection is the auth guard on those routes; this just
 * keeps them out of the index.
 *
 * `/api/media/` is the exception, and it has to be stated explicitly. Every
 * photograph an admin uploads — the hero, every car in the fleet — is served
 * from there, and the light-theme hero is rendered as a plain `<img>` pointing
 * straight at it. A blanket `Disallow: /api/` therefore told Googlebot it was
 * not allowed to fetch the site's own photographs: no Google Images, and an
 * image the crawler cannot load during rendering.
 *
 * Longest-match wins in the Robots Exclusion Standard, so `Allow: /api/media/`
 * (11 characters) beats `Disallow: /api/` (5) for exactly those URLs and
 * nothing else. Order in this array is cosmetic; specificity is what decides.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/api/media/"],
        disallow: ["/admin", "/en/admin", "/api/"],
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
