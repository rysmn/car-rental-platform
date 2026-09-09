import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LandingRoute } from "@/components/marketing/LandingRoute";
import { landingMetadata } from "@/lib/marketing/landing";

/**
 * "wynajem aut dla firm Warszawa" / "business car rental Warsaw" — written for
 * whoever signs the invoice, not whoever holds the keys.
 *
 * This folder name is the INTERNAL route; the public slug differs per locale
 * and lives in `routing.pathnames`. Everything else — copy, fleet filter,
 * structured data, cross-links — hangs off the registry entry for `business`.
 */
const KEY = "business" as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return landingMetadata(KEY, locale);
}

export default async function BusinessCarRentalWarsawPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LandingRoute landingKey={KEY} locale={locale} />;
}
