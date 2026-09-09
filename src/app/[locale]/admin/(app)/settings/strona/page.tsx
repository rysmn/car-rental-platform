import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getSetting, HERO_FALLBACK_IMAGE } from "@/lib/admin/settings";
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

  const [social, hero, pages, company, heroText] = await Promise.all([
    getSetting("social"),
    getSetting("hero"),
    getSetting("pages"),
    getSetting("company"),
    getSetting("heroText"),
  ]);

  return (
    <div className="max-w-4xl">
      <Link
        href="/admin/settings"
        className="label-tight text-ink-faint hover:text-ink -my-2 inline-flex min-h-11 items-center text-[10px]"
      >
        ← Ustawienia
      </Link>
      <header className="mt-4 mb-8">
        <h1 className="font-heading text-ink text-2xl font-bold">
          Strona publiczna
        </h1>
        <p className="text-silver mt-1 text-sm">
          Treści i elementy strony publicznej. Zmiany są widoczne od razu po
          zapisaniu.
        </p>
      </header>

      <Section
        title="Dane firmy i kontakt"
        subtitle="Telefony, e-mail, adres, NIP/REGON/KRS i godziny pracy — widoczne w stopce, na stronie kontaktowej i w danych strukturalnych (SEO)"
      >
        <CompanyInfoForm initial={company} />
      </Section>

      <Section
        title="Treść sekcji hero (strona główna)"
        subtitle="Nagłówek, podtytuł, przyciski i cechy pod nagłówkiem — osobno dla polskiej i angielskiej wersji"
      >
        <HeroTextForm initial={heroText} />
      </Section>

      <Section
        title="Zdjęcia tła (hero) — motyw ciemny"
        subtitle="Do trzech zdjęć na stronie startowej dla ciemnego motywu. Na stronie widać jedno — to oznaczone jako aktywne."
      >
        <HeroImageForm
          variant="dark"
          set={hero.dark}
          fallbackImage={HERO_FALLBACK_IMAGE}
        />
      </Section>

      <Section
        title="Zdjęcia tła (hero) — motyw jasny"
        subtitle="Osobne zdjęcia dla jasnego motywu. Bez zdjęcia sekcja startowa ma jednolite jasne tło."
      >
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
      <Section
        title="GOOGLE"
        subtitle="Wizytówka, opinie, mapa i współrzędne — mają teraz własny ekran"
      >
        <p className="text-silver text-sm">
          Link do wizytówki, link do opinii, link do Map, Place ID i współrzędne
          wraz z przełącznikami tego, co widać na stronie kontaktowej.
        </p>
        <Link
          href="/admin/settings/google"
          className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap mt-5 inline-flex h-10 items-center border px-5 text-xs transition-colors"
        >
          Otwórz GOOGLE →
        </Link>
      </Section>

      <Section
        title="Media społecznościowe"
        subtitle="Ikony w górnym pasku strony"
      >
        <SocialLinksForm initial={social} />
      </Section>

      <Section
        title="Widoczność stron"
        subtitle="Wyłącz strony, których nie chcesz publikować"
      >
        <PageVisibilityForm initial={pages} />
      </Section>

      <Section
        title="Dokumenty prawne"
        subtitle="Regulamin i polityka prywatności"
      >
        <p className="text-silver text-sm">
          Edycja treści regulaminu i polityki prywatności w obu językach.
        </p>
        <Link
          href="/admin/settings/legal"
          className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap mt-5 inline-flex h-10 items-center border px-5 text-xs transition-colors"
        >
          Edytuj dokumenty →
        </Link>
      </Section>
    </div>
  );
}
