import { getTranslations } from "next-intl/server";
import { LandingPage } from "@/components/marketing/LandingPage";
import {
  getLandingContent,
  landingFleet,
  landingJsonLd,
  relatedLandingLinks,
  type LandingKey,
} from "@/lib/marketing/landing";
import { landingFacts } from "@/lib/marketing/landing/facts";
import { getFleet } from "@/lib/fleet/repo";
import { getVisiblePublicModelStates } from "@/lib/fleet/status-repo";
import { getNextFreeDayByModel, isoDay } from "@/lib/booking/availability";
import { getSetting } from "@/lib/admin/settings";
import { serviceHours } from "@/lib/company/service-hours";
import { jsonLdHtml } from "@/lib/seo";

/**
 * Renders one landing page end to end from its registry key.
 *
 * Everything that differs between the six pages is data in the registry, so
 * this is the only place that loads the fleet, reads the page-visibility
 * settings and emits structured data. A `page.tsx` is then just the route
 * binding: a key, `generateMetadata`, and this component.
 */
export async function LandingRoute({
  landingKey,
  locale,
}: {
  landingKey: LandingKey;
  locale: string;
}) {
  const t = await getTranslations("Landing");
  // Opening hours come from the settings, not from the copy — the same three
  // facts the contact page and the assistant state. See `service-hours`.
  const company = await getSetting("company");
  const calaFlota = await getFleet();
  const fleet = landingFleet(landingKey, calaFlota);
  // The copy is resolved AFTER the strip, because the minimum driver age it
  // quotes is derived from the cars in that strip. See `landingFacts`.
  const rules = await getSetting("rentalRules");
  const content = getLandingContent(
    landingKey,
    locale,
    landingFacts(
      rules,
      fleet,
      locale,
      serviceHours(company, locale),
      calaFlota,
    ),
  );
  // Contact can be switched off in the admin panel — don't send a visitor, or a
  // crawler, to a 404.
  const pages = await getSetting("pages");
  const contactHref = pages.contact ? "/contact" : "/fleet";
  // One query for the strip. These pages never carry a date filter, so the
  // cards state today and claim nothing about any future term.
  const states = await getVisiblePublicModelStates();
  /*
    Landingi rysują tę samą `CarCard`, co flota, więc muszą mówić to samo
    zdanie o dostępności. Bez pierwszego wolnego dnia „Wynajem SUV Warszawa"
    pokazywałby „Zablokowany" przy aucie, które flota opisuje jako „Dostępny
    od 12.09" — i klient, który przyszedł z wyszukiwarki, dostawałby gorszą
    odpowiedź niż ten, który wszedł przez stronę główną.
  */
  const today = isoDay(new Date());
  const nextFreeByModel = await getNextFreeDayByModel(today);

  /*
    Dane strukturalne dostają DOKŁADNIE tę treść, którą wyświetla strona.

    Wcześniej `landingJsonLd` rozwiązywało tekst po raz drugi, po swojej
    stronie i bez `LandingFacts` — a to jedyne miejsce, które te fakty czyta.
    Skutek był mierzalny na produkcji: `/wynajem-aut-warszawa` publikowało
    w `FAQPage` odpowiedź „{minAge} lat, z ważnym prawem jazdy…", podczas gdy
    akapit obok mówił „21 lat". Teraz oba biorą ten sam obiekt, więc rozjazd
    nie jest już kwestią pamiętania o drugim wywołaniu.
  */
  const jsonLd = landingJsonLd(
    landingKey,
    locale,
    t("breadcrumbHome"),
    content,
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }}
      />
      <LandingPage
        content={content}
        fleet={fleet}
        contactHref={contactHref}
        fleetHeading={t("fleetHeading")}
        fleetCta={t("fleetCta")}
        ctaPrimary={t("ctaPrimary")}
        ctaSecondary={t("ctaSecondary")}
        faqHeading={t("faqHeading")}
        relatedHeading={t("relatedHeading")}
        states={states}
        nextFreeByModel={nextFreeByModel}
        today={today}
        related={relatedLandingLinks(landingKey, locale)}
      />
    </>
  );
}
