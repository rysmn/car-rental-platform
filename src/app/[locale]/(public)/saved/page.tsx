import { setRequestLocale, getTranslations } from "next-intl/server";
import { getFleet } from "@/lib/fleet/repo";
import { localeAlternates } from "@/lib/seo";
import { getVisiblePublicModelStates } from "@/lib/fleet/status-repo";
import { getNextFreeDayByModel, isoDay } from "@/lib/booking/availability";
import { SavedList } from "./SavedList";

/**
 * "Wybrane samochody" / "Saved cars".
 *
 * The page is a server component that fetches the published fleet and hands it
 * to the client list, which picks out the ids the visitor saved in this
 * browser. Every figure on a card therefore comes from the live fleet — a price
 * or a photo changed in the admin panel shows up here on the next load, with
 * nothing stored twice.
 *
 * `noindex`: the content is one visitor's private selection and is different
 * for everybody, so there is nothing here for a search engine to rank.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Saved" });
  /*
    `alternates` musi tu być podane WPROST, mimo `noindex`.

    Metadane dziedziczy się w Next.js po układzie, a układ `[locale]` ustawia
    canonical i hreflang dla ścieżki `"/"`. Strona, która nie nadpisze tego
    pola, ogłasza więc, że jej wersją kanoniczną jest STRONA GŁÓWNA — tak było
    tutaj i na `/compare` do 01.09.2026 (zmierzone na produkcji). Adres
    wskazujący na siebie jest jedynym zdaniem, które jest prawdziwe: `noindex`
    mówi „nie indeksuj tego", a canonical „to jest ta strona"; canonical
    prowadzący gdzie indziej to dwa sprzeczne polecenia w jednym nagłówku.
  */
  return {
    title: t("title"),
    alternates: localeAlternates(locale, "/saved"),
    robots: { index: false, follow: true },
  };
}

export default async function SavedPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Saved" });
  const fleet = await getFleet();
  /*
    The states travel with the fleet, as a plain object.

    `SavedList` is a client component, so it cannot ask the database itself —
    and it must not: the ids on this page are one visitor's private selection
    and sending them to the server to look up statuses would put that list into
    a request for no gain. A `Map` does not survive the server→client boundary,
    hence the object.
  */
  const states = Object.fromEntries(await getVisiblePublicModelStates());
  /*
    Pierwszy wolny dzień jedzie tą samą drogą i z tego samego powodu: karta na
    liście wybranych to ta sama `CarCard`, co na flocie, i nie może mówić
    „Zablokowany" tam, gdzie flota mówi „Dostępny od 12.09". Obiekt, nie mapa —
    granica serwer→przeglądarka nie przenosi `Map`.
  */
  const today = isoDay(new Date());
  const nextFree = Object.fromEntries(await getNextFreeDayByModel(today));

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-16 md:px-10">
      <header className="mb-10">
        <h1 className="font-heading text-ink text-3xl font-bold md:text-4xl">
          {t("title")}
        </h1>
      </header>
      <SavedList
        fleet={fleet}
        states={states}
        nextFree={nextFree}
        today={today}
      />
    </div>
  );
}
