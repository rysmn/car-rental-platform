import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";
import { CarCard } from "@/components/fleet/CarCard";
import { FleetDateFilter } from "@/components/fleet/FleetDateFilter";
import { FleetSegmentFilter } from "@/components/fleet/FleetSegmentFilter";
import { FleetBudgetFilter } from "@/components/fleet/FleetBudgetFilter";
import { getFleet } from "@/lib/fleet/repo";
import { filterFleet, type FleetFilterParams } from "@/lib/fleet/filters";
import { getEurRate } from "@/lib/currency/rate";
import { getVisiblePublicModelStates } from "@/lib/fleet/status-repo";
import { getNextFreeDayByModel, isoDay } from "@/lib/booking/availability";
import { sortForSales } from "@/lib/fleet/sales-order";
import { breadcrumbJsonLd, jsonLdHtml, pageMetadata } from "@/lib/seo";
import { ogImageUrl } from "@/lib/og/url";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Fleet" });
  // Went through `pageMetadata` so this page stops being the one public route
  // with no Open Graph tags at all — it had a canonical and a title, and shared
  // as a bare link everywhere.
  return pageMetadata({
    locale,
    path: "/fleet",
    title: t("title"),
    description: t("metaDescription"),
    image: ogImageUrl("page", "fleet", locale),
  });
}

export default async function FleetPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<FleetFilterParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Fleet");
  const tNav = await getTranslations("Nav");
  const tLanding = await getTranslations("Landing");

  const fleet = await getFleet();
  const q = await searchParams;
  // Already fetched for the page shell; this call is the cache, not a second
  // trip to the ECB — see `lib/currency/rate`.
  const rate = await getEurRate();
  const { range, activeSegment, available, counts, shown, budget, overBudget } =
    await filterFleet(fleet, q, rate?.plnPerEur);

  /*
   * What each filter must not destroy when the visitor uses another one.
   *
   * Three controls write to one URL, so each has to carry the other two. Read
   * off the query rather than rebuilt from the parsed result: a budget the
   * server decided to ignore — "total" with no dates yet — is still what the
   * visitor typed, and clicking a class chip must not silently delete it.
   */
  const keepForDates: Record<string, string> = {};
  if (activeSegment) keepForDates.segment = activeSegment;
  for (const k of ["budget", "min", "max", "cur"] as const) {
    if (q[k]) keepForDates[k] = String(q[k]);
  }
  const keepForBudget: Record<string, string> = {};
  if (range) {
    keepForBudget.from = range.from;
    keepForBudget.to = range.to;
  }
  if (activeSegment) keepForBudget.segment = activeSegment;
  const keepForSegment: Record<string, string> = {};
  for (const k of ["budget", "min", "max", "cur"] as const) {
    if (q[k]) keepForSegment[k] = String(q[k]);
  }
  // One query for the whole grid, and an empty map when the operator has hidden
  // statuses — the cards then render exactly as they did before this existed.
  const states = await getVisiblePublicModelStates();
  /*
    Ta sama para co na stronie głównej i z tego samego powodu: pierwszy wolny
    dzień zamienia techniczne „Zablokowany" na sprzedażowe „Dostępny od…",
    a kolejność siatki idzie za tym samym zdaniem. Sortowanie stoi ZA filtrami
    — dostaje `shown`, czyli to, co filtry już przepuściły, i nie ma jak
    zmienić składu wyniku.
  */
  const today = isoDay(new Date());
  const nextFreeByModel = await getNextFreeDayByModel(today);
  const uszeregowane = sortForSales(
    shown,
    states,
    nextFreeByModel,
    today,
    locale,
  );

  /*
    Okruszki. Flota jest jedynym publicznym adresem, do którego prowadzi
    KAŻDA karta auta i połowa landingów, a w wynikach wyszukiwania pokazywała
    się bez ścieżki — Google rysuje wtedy sam adres domeny.

    Dwa poziomy, bo tyle ich naprawdę jest: strona główna → flota. Filtry
    (daty, segment, budżet) żyją w parametrach zapytania i NIE tworzą trzeciego
    poziomu — okruszek prowadzący do „SUV-y do 500 zł" byłby ścieżką, której
    w nawigacji nie ma i której nikt nie kliknie z powrotem.
  */
  const breadcrumbs = breadcrumbJsonLd(locale, tLanding("breadcrumbHome"), [
    { name: t("title"), href: "/fleet" },
  ]);

  return (
    <Container className="py-16 md:py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(breadcrumbs) }}
      />
      <Reveal>
        <p className="label text-red text-xs">{t("eyebrow")}</p>
        <h1 className="font-heading mt-4 text-4xl font-bold md:text-6xl">
          {t("title")}
        </h1>
        <p className="text-ink-muted mt-5 max-w-xl text-sm md:text-base">
          {t("subtitle")}
        </p>
      </Reveal>

      <Reveal delay={0.05}>
        <FleetDateFilter
          from={range?.from}
          to={range?.to}
          keep={keepForDates}
        />

        <FleetBudgetFilter
          kind={budget?.kind ?? (q.budget === "total" ? "total" : "day")}
          min={q.min ?? ""}
          max={q.max ?? ""}
          currency={q.cur === "eur" ? "eur" : "pln"}
          currencyLabel={tNav("currency")}
          currencyNote={tNav("currencyNote")}
          keep={keepForBudget}
          hasDates={Boolean(range)}
        />
        {/* Counts what the dates left, not what the class filter then narrowed —
            the chips carry their own numbers, so one line per question. */}
        {range && (
          <p className="text-ink-muted mt-4 text-sm">
            {t("filterResult", {
              count: available.length,
              total: fleet.length,
            })}
          </p>
        )}
        {/* Said out loud rather than left as a shorter grid: a visitor who
            cannot see what a filter removed cannot tell it apart from a fleet
            that has nothing to offer. */}
        {overBudget > 0 && (
          <p className="text-ink-muted mt-2 text-sm">
            {t("budgetHidden", { count: overBudget })}
          </p>
        )}
        <FleetSegmentFilter
          active={activeSegment}
          counts={counts}
          range={range}
          keep={keepForSegment}
        />
      </Reveal>

      {shown.length === 0 && (range || activeSegment || budget) ? (
        <p className="border-line text-ink-muted mt-10 border p-8 text-center text-sm">
          {/* Name the filter that actually emptied the grid, in the order the
              visitor applied them: no dates left anything → the dates; the
              budget removed the rest → the budget; otherwise the class. */}
          {range && available.length === 0
            ? t("filterEmpty")
            : budget && overBudget > 0
              ? t("budgetEmpty")
              : t("segmentEmpty")}
        </p>
      ) : (
        <div className="mt-14 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {uszeregowane.map((car, i) => (
            <Reveal key={car.slug} delay={(i % 3) * 0.08}>
              {/* H2, not H3: on this page the cards sit directly under the
                  page's H1 with no section heading between them. */}
              {/* With dates chosen, `filterFleet` has already dropped every
                  model the Availability Engine says is taken — so a card that
                  survived to here IS free for those dates, and saying so is the
                  answer the visitor asked for. Without dates the field stays
                  null and the card claims nothing about the future. */}
              <CarCard
                car={car}
                headingLevel="h2"
                state={states.get(car.id) ?? null}
                freeForDates={range ? true : null}
                nextFreeDay={nextFreeByModel.get(car.id) ?? null}
                today={today}
              />
            </Reveal>
          ))}
        </div>
      )}
    </Container>
  );
}
