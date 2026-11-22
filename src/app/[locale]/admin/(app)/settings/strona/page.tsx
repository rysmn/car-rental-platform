import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getSetting, HERO_FALLBACK_IMAGE } from "@/lib/admin/settings";
import { PublicStatusToggle } from "./PublicStatusToggle";
import {
  SocialLinksForm,
  PageVisibilityForm,
  HeroImageForm,
  CompanyInfoForm,
  HeroTextForm,
} from "../SettingsForms";

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-line mb-12 border-t pt-8">
      <h2 className="font-heading text-ink text-lg font-bold">{title}</h2>
      {subtitle && <p className="text-silver mt-1 text-sm">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Admin.settings.site");
  const tc = await getTranslations("Admin.settings.common");
  const tp = await getTranslations("Admin.publicStatus");

  const [social, hero, pages, company, heroText, publicStatus] = await Promise.all([
    getSetting("social"),
    getSetting("hero"),
    getSetting("pages"),
    getSetting("company"),
    getSetting("heroText"),
    getSetting("publicStatus"),
  ]);

  return (
    <div className="max-w-4xl">
      <Link
        href="/admin/settings"
        className="label-tight text-ink-faint hover:text-ink -my-2 inline-flex min-h-11 items-center text-[10px]"
      >
        {tc("back")}
      </Link>
      <header className="mt-4 mb-8">
        <h1 className="font-heading text-ink text-2xl font-bold">
          {t("title")}
        </h1>
        <p className="text-silver mt-1 text-sm">{t("subtitle")}</p>
      </header>

      <Section title={tp("title")} subtitle={tp("note")}>
        <PublicStatusToggle enabled={publicStatus.enabled} />
      </Section>

      <Section title={t("company.title")} subtitle={t("company.subtitle")}>
        <CompanyInfoForm initial={company} />
      </Section>

      <Section title={t("heroText.title")} subtitle={t("heroText.subtitle")}>
        <HeroTextForm initial={heroText} />
      </Section>

      <Section title={t("heroDark.title")} subtitle={t("heroDark.subtitle")}>
        <HeroImageForm
          variant="dark"
          set={hero.dark}
          fallbackImage={HERO_FALLBACK_IMAGE}
        />
      </Section>

      <Section title={t("heroLight.title")} subtitle={t("heroLight.subtitle")}>
        <HeroImageForm variant="light" set={hero.light} fallbackImage={null} />
      </Section>

      {/*
        Sekcja przeniesiona do własnego ekranu (kafel „GOOGLE"
        w Ustawieniach). Zostaje wskazówka, a nie drugi formularz: te same pola
        edytowalne w dwóch miejscach to dwa ekrany, na których da się wpisać
        dwie różne wartości i wyjść w przekonaniu, że obie zostały zapisane.
        Odnośnik zostaje, bo przez jakiś czas właściciel będzie ich szukał tam,
        gdzie były.
      */}
      <Section title={t("google.title")} subtitle={t("google.subtitle")}>
        <p className="text-silver text-sm">{t("google.body")}</p>
        <Link
          href="/admin/settings/google"
          className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap mt-5 inline-flex h-10 items-center border px-5 text-xs transition-colors"
        >
          {t("google.open")}
        </Link>
      </Section>

      <Section title={t("social.title")} subtitle={t("social.subtitle")}>
        <SocialLinksForm initial={social} />
      </Section>

      <Section title={t("pages.title")} subtitle={t("pages.subtitle")}>
        <PageVisibilityForm initial={pages} />
      </Section>

      <Section title={t("legal.title")} subtitle={t("legal.subtitle")}>
        <p className="text-silver text-sm">{t("legal.body")}</p>
        <Link
          href="/admin/settings/legal"
          className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap mt-5 inline-flex h-10 items-center border px-5 text-xs transition-colors"
        >
          {t("legal.edit")}
        </Link>
      </Section>
    </div>
  );
}
