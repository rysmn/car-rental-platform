import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";
import type { LegalDoc } from "@/lib/legal/content";

export function LegalArticle({ doc }: { doc: LegalDoc }) {
  return (
    <Container className="py-16 md:py-24">
      <div className="max-w-3xl">
        <Reveal>
          <p className="label-tight text-ink-faint text-[11px]">
            {doc.updatedLabel}
          </p>
          <h1 className="font-heading mt-4 text-4xl font-bold md:text-5xl">
            {doc.title}
          </h1>
          <p className="text-ink-muted mt-6 text-base leading-relaxed">
            {doc.intro}
          </p>
          {doc.note ? (
            <p className="border-line-strong text-ink-faint mt-6 border-l-2 pl-4 text-xs italic">
              {doc.note}
            </p>
          ) : null}
        </Reveal>

        <div className="mt-14 space-y-12">
          {doc.sections.map((s, i) => (
            <Reveal key={s.h} delay={Math.min(i, 4) * 0.04}>
              <section>
                <h2 className="font-heading text-ink text-lg font-bold">
                  {s.h}
                </h2>
                <div className="mt-3 space-y-3">
                  {s.p.map((para, j) => (
                    <p
                      key={j}
                      className="text-ink-muted text-sm leading-relaxed"
                    >
                      {para}
                    </p>
                  ))}
                </div>
              </section>
            </Reveal>
          ))}
        </div>
      </div>
    </Container>
  );
}
