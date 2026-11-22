import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import localFont from "next/font/local";
import { routing } from "@/i18n/routing";
import { THEME_INIT_SCRIPT } from "@/components/layout/ThemeToggle";
import { PreferencjeHtml } from "@/components/layout/PreferencjeHtml";
import { LOCALE_HINT_INIT_SCRIPT } from "@/components/layout/LocaleSuggestion";
import { COOKIE_INIT_SCRIPT } from "@/components/consent/CookieConsent";
import { SITE_ORIGIN, pageMetadata } from "@/lib/seo";
import { siteConfig } from "@/lib/config/site";
import "../globals.css";

// latin-ext covers Polish diacritics (ł ż ó ą ę ś ć ń ź).
// Self-hosted (src/fonts, OFL licence next to the files). Variable fonts cover
// Latin and Latin Extended, so Polish diacritics render without a network call.
const raleway = localFont({
  src: "../../fonts/Raleway-Variable.ttf",
  weight: "600 800",
  variable: "--font-raleway",
  display: "swap",
});

const montserrat = localFont({
  src: "../../fonts/Montserrat-Variable.ttf",
  weight: "400 600",
  variable: "--font-montserrat",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });

  return {
    // metadataBase makes every relative image/URL below resolve absolutely,
    // which crawlers and social scrapers require.
    metadataBase: new URL(SITE_ORIGIN),
    ...pageMetadata({
      locale,
      path: "/",
      title: t("title"),
      description: t("description"),
    }),
    // Child pages override `title` with their own; this keeps the brand suffix.
    title: {
      default: t("title"),
      template: `%s — ${siteConfig.name}`,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    // Set GOOGLE_SITE_VERIFICATION once Search Console gives you the token; the
    // tag only renders when it is present.
    ...(process.env.GOOGLE_SITE_VERIFICATION
      ? {
          verification: {
            google: process.env.GOOGLE_SITE_VERIFICATION,
          },
        }
      : {}),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      data-theme="dark"
      // Złoty is the document's currency until a stored choice says otherwise —
      // it is what this company settles in, so it is also the safe default when
      // the script below cannot run at all.
      data-currency="pln"
      className={`${raleway.variable} ${montserrat.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the stored theme before first paint — prevents a flash of the
            wrong palette. Must be inline and synchronous, hence dangerouslySet. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Same contract for the currency: every price is in the page twice and
            CSS shows one of them, so this attribute has to be right BEFORE the
            first paint or the visitor watches the prices change. */}
        {/* Trzeci skrypt tej samej rodziny: rozstrzyga, czy pokazać pasek
            propozycji języka. Bez niego pasek montowałby się po hydratacji
            i spychał całą stronę o 86 px — patrz `LocaleSuggestion`. */}
        <script dangerouslySetInnerHTML={{ __html: LOCALE_HINT_INIT_SCRIPT }} />
        {/* Czwarty i ostatni: pasek zgód. Nie spycha układu (jest `fixed`),
            ale uruchamiacz asystenta mierzy jego wysokość — a pomiar spóźniony
            o klatkę to skok o 176 px. Patrz `CookieConsent`. */}
        <script dangerouslySetInnerHTML={{ __html: COOKIE_INIT_SCRIPT }} />
      </head>
      <body className="bg-void text-ink min-h-screen antialiased">
        {/*
          Skrypty w `<head>` załatwiają PIERWSZE malowanie. To załatwia każde
          następne przejście: zmiana języka nie wczytuje dokumentu od nowa,
          więc React łata `<html>` wartościami z JSX i gasi wybór klienta.
          Patrz `PreferencjeHtml`.
        */}
        <PreferencjeHtml />
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
