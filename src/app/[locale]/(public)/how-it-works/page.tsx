import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import { requirePageEnabled } from "@/lib/admin/page-visibility";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "HowItWorks" });
  return pageMetadata({
    locale,
    path: "/how-it-works",
    title: t("eyebrow"),
    description: t("metaDescription"),
  });
}

export default async function HowItWorksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePageEnabled("howItWorks");
  const t = await getTranslations("HowItWorks");

  /*
    OSIEM KROKÓW, NIE SZEŚĆ — decyzja właściciela 31.08.2026.

    Sześć opisywało proces do momentu wydania auta i milczało o dwóch rzeczach,
    które klient faktycznie przechodzi: o dokumentach, które dostaje mailem po
    potwierdzeniu (`documents.auto_send`), i o zwrocie z protokołem (§14
    regulaminu). Strona kończyła się w połowie historii.

    Ta sama ósemka stoi na stronie głównej (`getProcess`) — obie listy opisują
    jeden proces i rozjechanie ich to błąd, który ten etap właśnie naprawiał.
  */
  const steps = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
    n,
    title: t(`steps.s${n}Title`),
    desc: t(`steps.s${n}Desc`),
  }));

  return (
    <Container className="py-16 md:py-24">
      <div className="max-w-3xl">
        <Reveal>
          <p className="label text-red text-xs">{t("eyebrow")}</p>
          <h1 className="font-heading mt-4 text-4xl font-bold md:text-6xl">
            {t("title")}
          </h1>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="text-ink-muted mt-6 text-base leading-relaxed md:text-lg">
            {t("subtitle")}
          </p>
        </Reveal>
      </div>

      {/*
        UKŁAD: jedna kolumna na telefonie, dwie od `lg`.

        Osiem kroków w jednej kolumnie to na monitorze ekran i pół przewijania,
        czyli dokładnie ta ściana tekstu, której ten etap miał uniknąć. Dwie
        kolumny czyta się wierszami — 1-2, 3-4, 5-6, 7-8 — a numer przy każdym
        kroku jest na tyle duży, że kolejność nie zależy od domysłu. Siatka
        `gap-px` na tle linii rysuje ramkę bez ośmiu osobnych obramowań; ten
        sam zabieg trzyma proces na stronie głównej.

        `items-start` (nie `stretch`) — inaczej krótki krok rozciąga się do
        wysokości sąsiada i między tytułem a opisem robi się dziura.
      */}
      <ol className="border-line bg-line mt-14 grid gap-px border lg:grid-cols-2">
        {steps.map((s, i) => (
          <Reveal
            key={s.n}
            as="li"
            delay={Math.min(i, 4) * 0.05}
            className="bg-void flex h-full gap-5 p-7 md:gap-8 md:p-9"
          >
            <span
              className="font-heading text-red shrink-0 text-3xl leading-none font-bold md:text-4xl"
              aria-hidden="true"
            >
              {String(s.n).padStart(2, "0")}
            </span>
            <div>
              <h2 className="font-heading text-ink text-lg leading-snug font-bold md:text-xl">
                {s.title}
              </h2>
              <p className="text-ink-muted mt-2 text-sm md:text-base">
                {s.desc}
              </p>
            </div>
          </Reveal>
        ))}
      </ol>

      <Reveal className="mt-16 text-center md:text-left">
        <ButtonLink href="/fleet" size="lg">
          {t("cta")}
        </ButtonLink>
      </Reveal>
    </Container>
  );
}
