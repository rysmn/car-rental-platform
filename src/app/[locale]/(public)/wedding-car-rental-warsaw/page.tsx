import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LandingRoute } from "@/components/marketing/LandingRoute";
import { landingMetadata } from "@/lib/marketing/landing";

/**
 * "wynajem auta na wesele Warszawa" / "wedding car rental Warsaw" — booked
 * further ahead than anything else on the site, and self-drive, which the copy
 * states in its first paragraph rather than burying in the FAQ.
 *
 * This folder name is the INTERNAL route; the public slug differs per locale
 * and lives in `routing.pathnames`. Everything else — copy, fleet filter,
 * structured data, cross-links — hangs off the registry entry for `wedding`.
 */
const KEY = "wedding" as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return landingMetadata(KEY, locale);
}

export default async function WeddingCarRentalWarsawPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LandingRoute landingKey={KEY} locale={locale} />;
}
