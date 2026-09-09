/**
 * Static brand configuration (brand book §01, §12).
 *
 * Company contact data (phones, email, NIP/REGON/KRS, address, maps link,
 * hours) is admin-editable and lives in the DB — see `getSetting("company")`
 * in `lib/admin/settings.ts`. This file keeps only identity that never
 * changes without a rebrand.
 */
import type { AppHref } from "@/i18n/navigation";

export const siteConfig = {
  name: "A&A Corporation",
  tagline: "Premium Car Rental Warsaw",
  // Apex, NOT www — www 301s here, and a canonical must point at the URL that
  // actually serves the page, never at a redirect.
  url: "https://aacorporation.pl",

  /**
   * Coordinates of the pick-up point, for the LocalBusiness JSON-LD (see
   * lib/seo). Kept separate from the admin-editable `mapsUrl` because there is
   * no reliable way to geocode a Google Maps short link — if the pick-up point
   * ever moves, update both this and the `company.mapsUrl` setting together.
   */
  geo: { lat: 52.155208, lng: 21.129825 },
} as const;

/** Primary navigation. `key` maps to a translation in messages/*.json → Nav.<key>. */
export const mainNav = [
  { key: "fleet", href: "/fleet" },
  { key: "about", href: "/about" },
  { key: "howItWorks", href: "/how-it-works" },
  { key: "faq", href: "/faq" },
  { key: "contact", href: "/contact" },
] as const;

/**
 * Social profiles shown in the header.
 *
 * ⚠️ THESE ARE PLACEHOLDERS — replace each `href` with the real profile URL
 * before relying on them. An entry whose href is empty (or still "#") is not
 * rendered, so the icons simply disappear rather than linking nowhere.
 */
export const socialLinks = [
  { key: "instagram", label: "Instagram", href: "#" },
  { key: "facebook", label: "Facebook", href: "#" },
  { key: "tiktok", label: "TikTok", href: "#" },
] as const;

export type SocialKey = (typeof socialLinks)[number]["key"];

export type NavItem = { key: string; href: AppHref };

/**
 * Navigation filtered by the admin's page-visibility settings. `fleet` has no
 * toggle — it is the core of the site and always shown.
 */
export function visibleNav(pages: {
  faq: boolean;
  about: boolean;
  howItWorks: boolean;
  contact: boolean;
}): NavItem[] {
  const enabled: Record<string, boolean> = {
    fleet: true,
    about: pages.about,
    howItWorks: pages.howItWorks,
    faq: pages.faq,
    contact: pages.contact,
  };
  return mainNav.filter((item) => enabled[item.key] !== false);
}
