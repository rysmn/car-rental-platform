import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";
import { sanitizeLegalHtml } from "@/lib/legal/sanitize";

/**
 * Renders an admin-authored legal document.
 *
 * The HTML is sanitised again at render time — it was already sanitised on
 * save, but re-running the allowlist here means a row written by any other code
 * path (or before the allowlist existed) still cannot inject script.
 */
export function LegalHtmlArticle({
  title,
  updatedLabel,
  html,
}: {
  title: string;
  updatedLabel?: string;
  html: string;
}) {
  const safe = sanitizeLegalHtml(html);

  return (
    <Container className="py-16 md:py-24">
      <div className="max-w-3xl">
        <Reveal>
          {updatedLabel ? (
            <p className="label-tight text-ink-faint text-[11px]">
              {updatedLabel}
            </p>
          ) : null}
          <h1 className="font-heading mt-4 text-4xl font-bold md:text-5xl">
            {title}
          </h1>
        </Reveal>

        <Reveal delay={0.06}>
          <div
            className="prose-legal mt-12"
            dangerouslySetInnerHTML={{ __html: safe }}
          />
        </Reveal>
      </div>
    </Container>
  );
}
