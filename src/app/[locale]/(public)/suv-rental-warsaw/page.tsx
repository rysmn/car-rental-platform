import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LandingRoute } from "@/components/marketing/LandingRoute";
import { landingMetadata } from "@/lib/marketing/landing";

/**
 * "wynajem SUV Warszawa" / "SUV rental Warsaw" — the most-booked class in the
 * fleet. The fleet strip is filtered to the SUVs by the registry.
 *
 * This folder name is the INTERNAL route; the public slug differs per locale
 * and lives in `routing.pathnames`. Everything else — copy, fleet filter,
 * structured data, cross-links — hangs off the registry entry for `suv`.
 */
const KEY = "suv" as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return landingMetadata(KEY, locale);
}

export default async function SuvRentalWarsawPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LandingRoute landingKey={KEY} locale={locale} />;
}
