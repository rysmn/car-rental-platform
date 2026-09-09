import { Reveal } from "@/components/motion/Reveal";
import type { FaqItem } from "@/lib/marketing/content";

/**
 * Accordion built on native <details>/<summary>: keyboard- and screen-reader
 * accessible, expands with JS disabled, and ships no client bundle.
 *
 * `headingLevel` exists because the same list sits at two different depths. On
 * the home page and on a landing page the questions live under a section
 * heading ("Najczęstsze pytania"), so they are H3. On `/faq` there is no such
 * section — the questions ARE the page, directly under its H1 — and an H3 there
 * skipped a level for no reason. The classes are identical either way, so the
 * page looks the same whichever tag is used.
 */
export function FaqList({
  items,
  headingLevel = "h3",
}: {
  items: FaqItem[];
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  return (
    <div className="border-line border-t">
      {items.map((item, i) => (
        <Reveal key={item.q} delay={Math.min(i, 5) * 0.04}>
          <details className="group border-line border-b">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-6 [&::-webkit-details-marker]:hidden">
              <Heading className="font-heading text-ink group-hover:text-silver text-base font-bold transition-colors md:text-lg">
                {item.q}
              </Heading>
              {/* Plus that becomes a minus when open — CSS only. */}
              <span
                aria-hidden
                className="text-red relative mt-1 h-4 w-4 shrink-0"
              >
                <span className="absolute top-1/2 left-0 h-px w-4 -translate-y-1/2 bg-current" />
                <span className="absolute top-0 left-1/2 h-4 w-px -translate-x-1/2 bg-current transition-transform duration-300 group-open:rotate-90 group-open:opacity-0" />
              </span>
            </summary>
            <p className="text-ink-muted max-w-2xl pb-6 text-sm leading-relaxed md:text-base">
              {item.a}
            </p>
          </details>
        </Reveal>
      ))}
    </div>
  );
}
