import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import { requirePageEnabled } from "@/lib/admin/page-visibility";
import {
  clampDescription,
  infoPageJsonLd,
  jsonLdHtml,
  pageMetadata,
} from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "About" });
  return pageMetadata({
    locale,
    path: "/about",
    title: t("eyebrow"),
    description: t("intro"),
  });
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePageEnabled("about");
  const t = await getTranslations("About");

  const pillars = [
    { top: t("pillars.premiumTop"), sub: t("pillars.premiumSub") },
    { top: t("pillars.trustTop"), sub: t("pillars.trustSub") },
    { top: t("pillars.modernTop"), sub: t("pillars.modernSub") },
  ];

  const values = [
    "passion",
    "professionalism",
    "honesty",
    "safety",
    "innovation",
    "detail",
  ] as const;

  /*
    Dane strukturalne: CZYM jest ta strona, bez powtarzania firmy.

    `mainEntity` wskazuje przez `@id` na encję opisaną raz, na stronie głównej
    — patrz `infoPageJsonLd`. Audyt z 02.09.2026 znalazł tę stronę wśród
    dwunastu bez żadnego schematu.
  */
  const jsonLd = infoPageJsonLd({
    locale,
    type: "AboutPage",
    href: "/about",
    name: t("title"),
    // Ten sam tekst, co w znaczniku `description` — jedno źródło opisu strony.
    description: clampDescription(t("intro")),
  });

  return (
    <Container className="py-16 md:py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }}
      />
      {/* Intro */}
      <div className="max-w-4xl">
        <Reveal>
          <p className="label text-red text-xs">{t("eyebrow")}</p>
          <h1 className="font-heading mt-4 text-4xl font-bold md:text-6xl">
            {t("title")}
          </h1>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="text-ink-muted mt-8 text-base leading-relaxed md:text-lg">
            {t("intro")}
          </p>
        </Reveal>
      </div>

      {/* Pillars */}
      <div className="divide-line border-line mt-16 grid divide-y border-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {pillars.map((p, i) => (
          <Reveal
            key={p.top}
            delay={i * 0.08}
            className="px-0 py-8 sm:px-8 sm:first:pl-0"
          >
            <p className="font-heading text-ink text-2xl font-bold">{p.top}</p>
            <p className="label-tight text-red mt-2 text-xs">{p.sub}</p>
          </Reveal>
        ))}
      </div>

      {/* Mission + Vision */}
      <div className="mt-20 grid gap-12 md:grid-cols-2 md:gap-16">
        <Reveal>
          <h2 className="label text-ink-faint text-xs">{t("missionTitle")}</h2>
          <p className="font-heading mt-5 text-xl leading-snug font-bold md:text-2xl">
            {t("mission")}
          </p>
        </Reveal>
        <Reveal delay={0.08}>
          <h2 className="label text-ink-faint text-xs">{t("visionTitle")}</h2>
          <p className="font-heading mt-5 text-xl leading-snug font-bold md:text-2xl">
            {t("vision")}
          </p>
        </Reveal>
      </div>

      {/* Values */}
      <div className="mt-20">
        <Reveal>
          <h2 className="label text-ink-faint text-xs">{t("valuesTitle")}</h2>
        </Reveal>
        <div className="border-line mt-8 grid gap-x-8 gap-y-px border-y sm:grid-cols-2 lg:grid-cols-3">
          {values.map((v, i) => (
            <Reveal
              key={v}
              delay={(i % 3) * 0.06}
              className="border-line flex items-baseline gap-4 py-6"
            >
              <span className="label-tight text-red text-xs">{`0${i + 1}`}</span>
              <span className="text-ink text-lg">{t(`values.${v}`)}</span>
            </Reveal>
          ))}
        </div>
      </div>

      {/* CTA */}
      <Reveal className="border-line mt-24 border-t pt-16 text-center">
        <h2 className="font-heading text-3xl font-bold md:text-4xl">
          {t("ctaTitle")}
        </h2>
        <div className="mt-8">
          <ButtonLink href="/fleet" size="lg">
            {t("cta")}
          </ButtonLink>
        </div>
      </Reveal>
    </Container>
  );
}
