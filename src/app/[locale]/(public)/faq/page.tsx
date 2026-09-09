import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FaqList } from "@/components/marketing/FaqList";
import { getMergedFaq } from "@/lib/marketing/faq-live";
import { getSetting } from "@/lib/admin/settings";
import { requirePageEnabled } from "@/lib/admin/page-visibility";
import { pageMetadata, jsonLdHtml } from "@/lib/seo";
import { serviceHours } from "@/lib/company/service-hours";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Faq" });
  // The lead sentence quotes the phone window, so it takes it from the
  // settings — see `lib/company/service-hours`. Nothing on this site states an
  // hour it typed itself.
  const hours = serviceHours(await getSetting("company"), locale);
  return pageMetadata({
    locale,
    path: "/faq",
    title: t("title"),
    description: t("subtitle", { phone: hours.phone }),
  });
}

export default async function FaqPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePageEnabled("faq");
  const t = await getTranslations("Faq");
  // Repository entries plus anything an administrator published from the
  // assistant's unanswered list — one source, so the page and the chat can
  // never drift into two different sets of rental terms.
  const faq = await getMergedFaq(locale);
  const hours = serviceHours(await getSetting("company"), locale);
  // Contact may be switched off in the admin panel — don't link to a 404.
  const pages = await getSetting("pages");

  // FAQPage structured data — lets Google surface these as rich results.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <Container className="py-16 md:py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }}
      />

      <SectionHeading
        as="h1"
        eyebrow={t("eyebrow")}
        title={t("title")}
        lead={t("subtitle", { phone: hours.phone })}
      />

      <div className="mt-14">
        {/* H2: the questions are this page's sections — there is no heading
            above them other than the H1. */}
        <FaqList items={faq} headingLevel="h2" />
      </div>

      <Reveal className="border-line bg-surface-1 mt-16 flex flex-col gap-6 border p-8 md:flex-row md:items-center md:justify-between md:p-10">
        <p className="font-heading text-ink text-xl font-bold md:text-2xl">
          {t("stillTitle")}
        </p>
        <div className="flex flex-wrap gap-4">
          {pages.contact && (
            <ButtonLink href="/contact">{t("contact")}</ButtonLink>
          )}
          <ButtonLink href="/fleet" variant="outline">
            {t("book")}
          </ButtonLink>
        </div>
      </Reveal>
    </Container>
  );
}
