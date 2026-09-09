import { renderOgCard } from "@/lib/og/card";
import { routing } from "@/i18n/routing";
import {
  getLandingContent,
  landingLabel,
  LANDING_ROUTES,
  type LandingKey,
} from "@/lib/marketing/landing";
import { getCarModelBySlug } from "@/lib/fleet/repo";
import { formatPln, priceOnRequestLabel } from "@/lib/format";
import { lowestDailyRateGrosze } from "@/lib/booking/pricing";

/**
 * Generated Open Graph cards: `/og-image/<kind>/<id>/<locale>.png`.
 *
 * Sits at the app root rather than under `[locale]` for the same reason
 * `sitemap.ts` and `robots.ts` do — the locale is an argument here, not a
 * routing prefix, and these are machine endpoints with no site chrome.
 *
 * `id` is never rendered as text. Every branch below looks the id up in a
 * closed set (the landing registry, the fleet table) and 404s when it misses,
 * so this cannot be turned into a service that renders arbitrary attacker text
 * onto an image carrying the company's logo.
 */

export const dynamic = "force-dynamic";

const LANDING_KEYS = new Set<string>(LANDING_ROUTES.map((r) => r.key));

/** Long headlines wrap to four lines and clip; the tail is never the useful part. */
function clamp(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ parts: string[] }> },
) {
  const { parts } = await params;
  if (parts.length !== 3) return new Response("Not found", { status: 404 });

  const [kind, id, localeFile] = parts;
  const locale = localeFile.replace(/\.png$/, "");
  if (!(routing.locales as readonly string[]).includes(locale)) {
    return new Response("Not found", { status: 404 });
  }
  const en = locale === "en";

  if (kind === "landing") {
    if (!LANDING_KEYS.has(id)) {
      return new Response("Not found", { status: 404 });
    }
    const content = getLandingContent(id as LandingKey, locale);
    return renderOgCard({
      eyebrow: landingLabel(id as LandingKey, locale),
      title: clamp(content.h1, 72),
      footnote: clamp(content.eyebrow, 42),
    });
  }

  if (kind === "car") {
    const car = await getCarModelBySlug(id);
    if (!car) return new Response("Not found", { status: 404 });

    // The same function the Car/Offer markup and the price table use, so the
    // shared card cannot quote a figure the site does not honour. Note it
    // includes the monthly rate divided down, i.e. the genuinely lowest
    // per-day price — "od" is therefore true rather than optimistic.
    const cheapest = lowestDailyRateGrosze(car);

    return renderOgCard({
      eyebrow: en ? "Rental fleet" : "Flota",
      title: `${car.brand} ${car.model}`,
      // A share card is copied into chats and indexed by crawlers, and it
      // outlives the page it came from — so it never carries "od 0 zł / doba".
      footnote:
        cheapest > 0
          ? `${en ? "from" : "od"} ${formatPln(cheapest, locale)} / ${
              en ? "day" : "doba"
            }`
          : priceOnRequestLabel(locale),
      photos: car.images,
    });
  }

  if (kind === "page" && id === "fleet") {
    return renderOgCard({
      eyebrow: en ? "Warsaw · Gdańsk" : "Warszawa · Gdańsk",
      title: en ? "Our rental fleet" : "Nasza flota",
      footnote: en
        ? "Premium, SUV, electric, vans"
        : "Premium, SUV, elektryczne, busy",
    });
  }

  return new Response("Not found", { status: 404 });
}
