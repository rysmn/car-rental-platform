import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LandingRoute } from "@/components/marketing/LandingRoute";
import { landingMetadata } from "@/lib/marketing/landing";

/**
 * "wynajem aut elektrycznych Warszawa" / "electric car rental Warsaw" — three
 * real cars, and a page that deliberately quotes no range figure.
 *
 * This folder name is the INTERNAL route; the public slug differs per locale
 * and lives in `routing.pathnames`. Everything else — copy, fleet filter,
 * structured data, cross-links — hangs off the registry entry for `electric`.
 */
const KEY = "electric" as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return landingMetadata(KEY, locale);
}

export default async function ElectricCarRentalWarsawPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LandingRoute landingKey={KEY} locale={locale} />;
}
