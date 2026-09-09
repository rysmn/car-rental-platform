import type { Metadata } from "next";
import { turnstileSiteKey } from "@/lib/security/turnstile";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { PartnerForm } from "@/components/marketing/PartnerForm";
import { pageMetadata } from "@/lib/seo";

/**
 * INVEST WITH A&A — strona dla partnerów i inwestorów.
 *
 * CO TA STRONA JEST, A CZYM NIE JEST, i to rozróżnienie rządzi każdym zdaniem
 * poniżej. Jest **opisem trzech form współpracy i zaproszeniem do rozmowy**.
 * Nie jest ofertą inwestycyjną: nie ma tu ani jednej liczby opisującej zysk,
 * ani stopy zwrotu, ani okresu zwrotu, ani słowa „gwarantujemy". Publiczna
 * obietnica zysku jest zobowiązaniem — i w wielu układach także czynnością
 * regulowaną — więc do czasu analizy prawnej strona zbiera wyłącznie
 * ZAINTERESOWANIE, a warunki ustala człowiek w rozmowie.
 *
 * Ton jest ten sam co reszta marki: spokojne zaproszenie do współpracy, nie
 * zbiórka. „Szukamy pieniędzy" i „potrzebujemy inwestorów" nie padają, bo
 * firma, która tak o sobie mówi, sama sobie obniża cenę.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Partnership" });
  return pageMetadata({
    locale,
    path: "/partnership",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

export default async function PartnershipPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Partnership");

  const models = ["vehicle", "fleet", "strategic"] as const;

  return (
    <Container className="py-20 md:py-28">
      <Reveal>
        {/*
          `as="h1"` — bez tego `SectionHeading` domyślnie daje `h2`, a strona
          zostawała BEZ ŻADNEGO nagłówka pierwszego poziomu. Zmierzone na
          produkcji 01.09.2026: `/partnerstwo` i `/en/partnership` były jedynymi
          dwoma publicznymi adresami z zerem `<h1>`. Dla wyszukiwarki znika
          wtedy najmocniejszy sygnał o temacie strony, a dla czytnika ekranu
          skok po nagłówkach zaczyna się od poziomu drugiego, czyli od środka
          nieistniejącej struktury.
        */}
        <SectionHeading
          as="h1"
          eyebrow={t("eyebrow")}
          title={t("title")}
          lead={t("lead")}
        />
      </Reveal>

      {/* TRZY MODELE — informacyjnie. Każdy opisuje ROLĘ, nie wynik. */}
      <div className="border-line bg-line mt-14 grid gap-px border md:grid-cols-3">
        {models.map((m, i) => (
          <Reveal key={m} delay={i * 0.08} className="bg-void">
            <div className="flex h-full flex-col gap-4 p-8">
              <span className="label-tight text-red text-[10px]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h2 className="font-heading text-ink text-xl font-bold">
                {t(`${m}Title`)}
              </h2>
              <p className="text-ink-muted text-sm leading-relaxed">
                {t(`${m}Desc`)}
              </p>
            </div>
          </Reveal>
        ))}
      </div>

      {/*
        ZASTRZEŻENIE STOI NAD FORMULARZEM, nie pod nim drobnym drukiem.
        Człowiek, który zaraz zostawi swoje dane, ma wiedzieć PRZED tym
        krokiem, że nie zapisuje się na ofertę z określonym zyskiem, tylko
        na rozmowę.
      */}
      <Reveal className="mt-14">
        <p className="border-line text-ink-muted max-w-3xl border-l-2 pl-5 text-sm leading-relaxed">
          {t("disclaimer")}
        </p>
      </Reveal>

      <div className="mt-16" id="form">
        <Reveal>
          <h2 className="label text-ink-faint text-xs">{t("formTitle")}</h2>
          <p className="text-silver mt-3 max-w-xl text-sm">{t("formLead")}</p>
        </Reveal>
        <Reveal className="mt-8">
          <PartnerForm
            locale={locale === "en" ? "en" : "pl"}
            privacyHref={
              locale === "en"
                ? "/en/polityka-prywatnosci"
                : "/polityka-prywatnosci"
            }
            labels={{
              subjectBase: t("subjectBase"),
              name: t("formName"),
              company: t("formCompany"),
              phone: t("formPhone"),
              email: t("formEmail"),
              contactHint: t("formContactHint"),
              model: t("formModel"),
              model_vehicle: t("modelVehicle"),
              model_fleet: t("modelFleet"),
              model_strategic: t("modelStrategic"),
              model_unsure: t("modelUnsure"),
              range: t("formRange"),
              rangePlaceholder: t("formRangePlaceholder"),
              rangeHint: t("formRangeHint"),
              message: t("formMessage"),
              consent: t("formConsent"),
              privacy: t("formPrivacy"),
              send: t("formSend"),
              sending: t("formSending"),
              done: t("formDone"),
              errContact: t("formErrContact"),
              errMessage: t("formErrMessage"),
              errConsent: t("formErrConsent"),
              errRate: t("formErrRate"),
              errServer: t("formErrServer"),
              errTurnstile: t("formErrTurnstile"),
            }}
            turnstileSiteKey={turnstileSiteKey()}
          />
        </Reveal>
      </div>
    </Container>
  );
}
