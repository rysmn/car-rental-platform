import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { LandingRoute } from "@/components/marketing/LandingRoute";
import { landingMetadata, landingRoute } from "@/lib/marketing/landing";

/**
 * „wynajem aut Gdańsk" / „car rental Gdańsk" — RYNEK PRZYSZŁY, dziś wyłączony.
 *
 * Decyzja właściciela z 05.09.2026: teraz Warszawa, Gdańsk później. Wpis
 * `gdansk` w rejestrze ma więc `aktywny: false`, a ta trasa odpowiada 404 —
 * tak samo, jak strona wyłączona przez administratora w ustawieniach.
 *
 * Dlaczego 404, a nie `noindex` albo dopisek „wkrótce": strona sprzedawała
 * najem z odbiorem na lotnisku GDN, a punkt odbioru `airport-gdansk` stoi
 * w bazie z `active = false`. Klient z Trójmiasta przechodził więc landing
 * do końca i dopiero w formularzu odkrywał, że nie ma swojego miasta. Strona
 * ukryta przed wyszukiwarką nadal go tam prowadzi z każdego innego źródła;
 * strona nieistniejąca — nie.
 *
 * NIC nie zostało usunięte. Treść, slugi w `routing.pathnames`, dane
 * strukturalne i wpisy `related` czekają nietknięte. Otwarcie Gdańska to
 * `aktywny: true` w rejestrze plus uaktywnienie punktu odbioru w panelu.
 */
const KEY = "gdansk" as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Trasa wyłączona nie ogłasza się w metadanych — 404 nie ma canonicala.
  if (landingRoute(KEY).aktywny === false) return {};
  return landingMetadata(KEY, locale);
}

export default async function CarRentalGdanskPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (landingRoute(KEY).aktywny === false) notFound();
  setRequestLocale(locale);
  return <LandingRoute landingKey={KEY} locale={locale} />;
}
