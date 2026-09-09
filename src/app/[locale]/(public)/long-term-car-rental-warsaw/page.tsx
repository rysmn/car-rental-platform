import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LandingRoute } from "@/components/marketing/LandingRoute";
import { landingMetadata } from "@/lib/marketing/landing";

/**
 * "wynajem długoterminowy aut Warszawa" / "long-term car rental Warsaw" — the
 * highest customer value on the site; the copy's real subject is the leasing
 * comparison.
 *
 * This folder name is the INTERNAL route; the public slug differs per locale
 * and lives in `routing.pathnames`. Everything else — copy, fleet filter,
 * structured data, cross-links — hangs off the registry entry for `longterm`.
 */
const KEY = "longterm" as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return landingMetadata(KEY, locale);
}

export default async function LongTermCarRentalWarsawPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LandingRoute landingKey={KEY} locale={locale} />;
}
