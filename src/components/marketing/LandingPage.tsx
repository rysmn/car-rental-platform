import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import { CtaBand } from "@/components/marketing/CtaBand";
import { FaqList } from "@/components/marketing/FaqList";
import { CarCard } from "@/components/fleet/CarCard";
import { Link } from "@/i18n/navigation";
import type { LandingContent } from "@/lib/marketing/landing";
import type { FleetState } from "@/lib/fleet/status";
import type { FleetCar } from "@/lib/fleet/types";
import type { AppHref } from "@/i18n/navigation";

/**
 * Shared shell for the SEO landing pages.
 *
 * The pages differ only in copy and in which cars their fleet strip shows, so
 * the layout lives here once: a new landing page needs a copy file and a
 * registry entry, never a new component.
 *
 * The fleet strip is deliberate, not decoration: a landing page that only talks
 * about renting cars, without linking to the cars, is a dead end for a visitor
 * and a leaf node for a crawler. These links are how the page passes on the
 * authority it earns — and the same is true of the related-pages row, which is
 * what keeps six landing pages a connected cluster rather than six orphans
 * reachable only from the footer.
 */
export function LandingPage({
  content,
  fleet,
  contactHref,
  fleetHeading,
  fleetCta,
  ctaPrimary,
  ctaSecondary,
  faqHeading,
  relatedHeading,
  related = [],
  states,
  nextFreeByModel,
  today,
}: {
  content: LandingContent;
  fleet: FleetCar[];
  /**
   * Today's state per model id — empty when the operator has hidden statuses.
   * Passed in rather than fetched here so this component stays the pure view it
   * is, and so the six landing routes share one query through `LandingRoute`.
   */
  states: Map<string, FleetState>;
  /** modelId → pierwszy wolny dzień `YYYY-MM-DD`; patrz `VehicleStatus`. */
  nextFreeByModel?: Map<string, string>;
  /** Dzisiejsza data `YYYY-MM-DD`, policzona na serwerze. */
  today?: string;
  contactHref: AppHref;
  fleetHeading: string;
  fleetCta: string;
  ctaPrimary: string;
  ctaSecondary: string;
  faqHeading: string;
  relatedHeading?: string;
  related?: { key: string; href: AppHref; label: string }[];
}) {
  return (
    <>
      <Container className="py-16 md:py-24">
        <div className="max-w-3xl">
          <Reveal>
            <p className="label text-red text-xs">{content.eyebrow}</p>
            <h1 className="font-heading mt-4 text-4xl font-bold md:text-6xl">
              {content.h1}
            </h1>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="text-ink-muted mt-6 text-base leading-relaxed md:text-lg">
              {content.lead}
            </p>
          </Reveal>
        </div>

        <div className="mt-10 max-w-3xl space-y-5">
          {content.intro.map((p, i) => (
            <Reveal key={p} delay={Math.min(i, 3) * 0.06}>
              <p className="text-silver text-sm leading-relaxed md:text-base">
                {p}
              </p>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-10">
          <div className="flex flex-wrap gap-4">
            <ButtonLink href="/fleet" size="lg">
              {ctaPrimary}
            </ButtonLink>
            <ButtonLink href={contactHref} size="lg" variant="outline">
              {ctaSecondary}
            </ButtonLink>
          </div>
        </Reveal>
      </Container>

      {/* Numbered sequence — only the airport page has one. */}
      {content.steps && (
        <section className="border-line bg-surface-1 border-y">
          <Container className="py-16 md:py-24">
            <Reveal>
              <h2 className="font-heading max-w-3xl text-3xl font-bold md:text-4xl">
                {content.steps.heading}
              </h2>
            </Reveal>
            <ol className="border-line bg-line mt-12 grid gap-px border md:grid-cols-2 lg:grid-cols-5">
              {content.steps.items.map((step, i) => (
                <Reveal
                  key={step.title}
                  as="li"
                  delay={Math.min(i, 4) * 0.05}
                  className="bg-surface-1 flex h-full flex-col gap-4 p-6"
                >
                  <span className="font-heading text-red text-3xl leading-none font-bold">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-heading text-ink text-base leading-snug font-bold">
                    {step.title}
                  </span>
                  <span className="text-ink-muted text-sm leading-relaxed">
                    {step.desc}
                  </span>
                </Reveal>
              ))}
            </ol>
          </Container>
        </section>
      )}

      {/* The body copy. `h2` per section keeps one heading level under the h1. */}
      <Container className="py-16 md:py-24">
        <div className="max-w-3xl">
          {content.sections.map((section, i) => (
            <Reveal
              key={section.heading}
              delay={Math.min(i, 3) * 0.04}
              className="border-line mt-12 border-t pt-12 first:mt-0 first:border-0 first:pt-0"
            >
              <h2 className="font-heading text-ink text-2xl font-bold md:text-3xl">
                {section.heading}
              </h2>
              <div className="mt-5 space-y-4">
                {section.body.map((p) => (
                  <p
                    key={p}
                    className="text-silver text-sm leading-relaxed md:text-base"
                  >
                    {p}
                  </p>
                ))}
              </div>
            </Reveal>
          ))}
        </div>
      </Container>

      {fleet.length > 0 && (
        <section className="border-line border-t">
          <Container className="py-16 md:py-24">
            <Reveal>
              <h2 className="font-heading max-w-3xl text-3xl font-bold md:text-4xl">
                {fleetHeading}
              </h2>
            </Reveal>
            <div className="mt-12 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
              {fleet.map((car, i) => (
                <Reveal key={car.slug} delay={(i % 3) * 0.08}>
                  <CarCard
                    car={car}
                    state={states.get(car.id) ?? null}
                    nextFreeDay={nextFreeByModel?.get(car.id) ?? null}
                    today={today}
                  />
                </Reveal>
              ))}
            </div>
            <Reveal className="mt-12">
              <ButtonLink href="/fleet" variant="outline">
                {fleetCta}
              </ButtonLink>
            </Reveal>
          </Container>
        </section>
      )}

      <section className="border-line bg-surface-1 border-t">
        <Container className="py-16 md:py-24">
          <Reveal>
            <h2 className="font-heading max-w-3xl text-3xl font-bold md:text-4xl">
              {faqHeading}
            </h2>
          </Reveal>
          <div className="mt-12">
            <FaqList items={content.faq} />
          </div>
        </Container>
      </section>

      {/* Sibling landing pages. Same hairline-and-caps treatment as the rest of
          the site, so it reads as navigation rather than as a link farm.

          "Zobacz też" is a label, not a section heading: it carries the eyebrow
          styling (`label text-red text-xs`, the same class the `<p>` above the
          H1 uses), and what follows it is a list of links to other pages rather
          than content of this one. As an `<h2>` it sat at the same level as
          "Najczęstsze pytania" and added a heading with nothing under it. It is
          now a paragraph — byte-for-byte the same on screen — and the region
          keeps its name for screen readers through `aria-label`. */}
      {related.length > 0 && relatedHeading && (
        <section className="border-line border-t" aria-label={relatedHeading}>
          <Container className="py-12 md:py-16">
            <Reveal>
              <p className="label text-red text-xs">{relatedHeading}</p>
              {/*
                `gap-y-5` (20px), nie `gap-y-3` — razem z `.tap-area` na
                odnośniku. Te linki mają 27px wysokości: podkreślenie musi
                zostać tuż pod tekstem, więc pudełka nie da się urosnąć do
                44px bez odklejenia kreski od słowa. Rośnie zatem samo pole
                trafienia, a odstęp wierszy musi być na tyle duży, żeby pola
                sąsiadów się NIE nachodziły: 27 + 20 = 47 > 44.

                Przy `gap-y-3` odstępy były strefą martwą — dotknięcie między
                wierszami nie trafiało w nic. Teraz trafia w link, w który
                celował palec, i tylko w niego.
              */}
              <ul className="mt-6 flex flex-wrap gap-x-8 gap-y-5">
                {related.map((item) => (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className="label-tight text-silver hover:text-ink border-line-strong hover:border-ink tap-area inline-block border-b pt-1.5 pb-1 text-xs transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </Reveal>
          </Container>
        </section>
      )}

      <CtaBand
        title={content.ctaTitle}
        primaryLabel={ctaPrimary}
        secondaryLabel={ctaSecondary}
        secondaryHref={contactHref}
      />
    </>
  );
}
