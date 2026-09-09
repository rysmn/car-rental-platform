import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import type { AppHref } from "@/i18n/navigation";

/**
 * The closing call-to-action repeated after each major home-page section, so a
 * visitor is never more than one screen away from starting a reservation.
 */
export function CtaBand({
  title,
  primaryLabel,
  primaryHref = "/fleet",
  secondaryLabel,
  secondaryHref = "/contact",
}: {
  title: string;
  primaryLabel: string;
  primaryHref?: AppHref;
  secondaryLabel?: string;
  secondaryHref?: AppHref;
}) {
  return (
    <section className="border-line bg-surface-1 border-y">
      <Container className="py-14 md:py-16">
        <Reveal className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <p className="font-heading text-ink max-w-xl text-xl font-bold md:text-2xl">
            {title}
          </p>
          <div className="flex flex-wrap gap-4">
            <ButtonLink href={primaryHref}>{primaryLabel}</ButtonLink>
            {secondaryLabel ? (
              <ButtonLink href={secondaryHref} variant="outline">
                {secondaryLabel}
              </ButtonLink>
            ) : null}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
