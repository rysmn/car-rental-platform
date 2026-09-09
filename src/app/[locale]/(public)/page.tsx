import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal } from "@/components/motion/Reveal";
import { Parallax } from "@/components/motion/Parallax";
import { CarCard } from "@/components/fleet/CarCard";
import { FleetDateFilter } from "@/components/fleet/FleetDateFilter";
import { FleetSegmentFilter } from "@/components/fleet/FleetSegmentFilter";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { CtaBand } from "@/components/marketing/CtaBand";
import { GoogleHomeBlock } from "@/components/marketing/GoogleHomeBlock";
import { FaqList } from "@/components/marketing/FaqList";
import { PricingTable } from "@/components/marketing/PricingTable";
import { MobileFold } from "@/components/marketing/MobileFold";
import { Link } from "@/i18n/navigation";
import { getFleet } from "@/lib/fleet/repo";
import { filterFleet, type FleetFilterParams } from "@/lib/fleet/filters";
import { getEurRate } from "@/lib/currency/rate";
import { getVisiblePublicModelStates } from "@/lib/fleet/status-repo";
import { getNextFreeDayByModel, isoDay } from "@/lib/booking/availability";
import { sortForSales } from "@/lib/fleet/sales-order";
import { publicExtras } from "@/lib/booking/fees";
import { getFeeCatalog, getAllLocations } from "@/lib/booking/repo";
import { Money } from "@/components/currency/Money";
import {
  getSetting,
  activeHeroImage,
  HERO_FALLBACK_IMAGE,
} from "@/lib/admin/settings";
import { serviceHours } from "@/lib/company/service-hours";
import { organizationJsonLd, jsonLdHtml } from "@/lib/seo";
import { googleView } from "@/lib/company/google";
import { siteConfig } from "@/lib/config/site";
import { landingLabel } from "@/lib/marketing/landing";
import {
  getAirport,
  getB2b,
  getFaq,
  getKmLimits,
  getProcess,
  getPromise,
  getWhyChoose,
  getWhyUs,
  tierRatesGrosze,
} from "@/lib/marketing/content";

/** How many FAQ entries to preview on the home page before linking to /faq. */
const FAQ_PREVIEW = 8;

export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<FleetFilterParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Hero");
  const th = await getTranslations("Home");
  const tf = await getTranslations("Fleet");
  const fleet = await getFleet();
  // The fleet section carries the same two filters as /fleet and answers them
  // itself, so a visitor can check dates and pick a class without leaving the
  // page. Only the grid below reads the result — the price table further down
  // is a published tariff and always lists the whole fleet.
  // The budget filter lives on /fleet, but a link carrying one can land here —
  // the rate goes along so "do 90 EUR" means the same thing on both pages.
  const rate = await getEurRate();
  const { range, activeSegment, available, counts, shown } = await filterFleet(
    fleet,
    await searchParams,
    rate?.plnPerEur,
  );
  // Same source as /fleet, same switch, one query for the section.
  const states = await getVisiblePublicModelStates();
  /*
    Pierwszy wolny dzień każdego modelu — jedno zapytanie na całą sekcję.

    To ono zamienia „Zablokowany" na „Dostępny od 12.09". Data pochodzi
    wyłącznie z silnika dostępności; gdy jej nie ma, karta mówi „sprawdź
    dostępność" i niczego nie obiecuje. Patrz `getNextFreeDayByModel`.

    Kolejność siatki liczy się z TEGO SAMEGO zdania, które klient przeczyta na
    pigułce — dostępne najpierw, serwis na końcu. `sortForSales` nie dodaje ani
    nie usuwa aut, więc stoi ZA filtrami, nie przed nimi.
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
  // Hero background is admin-editable, up to three photos per theme with one
  // of them selected. The dark theme
  // falls back to the bundled photograph; the light theme has NO fallback —
  // with none uploaded the hero renders photo-less rather than showing a
  // black-page photograph on a white page. The visitor's theme is only known
  // client-side, so both layers are rendered and CSS shows the right one.
  const hero = await getSetting("hero");
  // Each theme keeps up to three photos and a pointer at the one to show; the
  // administrator moves that pointer in the panel. Nothing here rotates or
  // chooses — it reads the choice that was made.
  const heroImage = activeHeroImage(hero, "dark") ?? HERO_FALLBACK_IMAGE;
  const heroImageLight = activeHeroImage(hero, "light");

  // The home page links out to pages an admin can switch off. Rather than
  // pointing visitors at a 404, contact CTAs fall back to the fleet page and
  // the "all questions" link disappears with the FAQ page itself.
  const pages = await getSetting("pages");
  const contactHref = pages.contact ? "/contact" : "/fleet";

  // Organization markup — only verified facts, no invented ratings.
  const social = await getSetting("social");
  const company = await getSetting("company");
  /*
    Jedno rozstrzygnięcie ustawień GOOGLE na całą stronę główną.

    Ta sama funkcja i te same dane, z których korzysta `/contact` — a od
    02.09.2026 czyta z niej także kompaktowy blok na dole tej strony. Wcześniej
    `googleView` stało tu w wywołaniu wewnątrz `organizationJsonLd` i było
    policzone wyłącznie na potrzeby współrzędnych; drugie wywołanie dla bloku
    dałoby dwa miejsca, w których ta sama odpowiedź jest liczona osobno.
  */
  const gview = googleView({
    google: await getSetting("google"),
    profileUrl: social.googleBusiness,
    mapsUrl: company.mapsUrl,
    locale,
  });

  const orgJsonLd = organizationJsonLd(
    [
      social.instagram,
      social.facebook,
      social.tiktok,
      // The Business Profile link is the one `sameAs` entry that ties this
      // domain to the map pin, so it goes in even though it has no header icon.
      social.googleBusiness,
    ],
    company,
    // Coordinates now come from the Google/Maps settings, with the values
    // shipped in `siteConfig` as the fallback — so this markup keeps the pin it
    // has always had until somebody deliberately moves it.
    gview,
  );

  /*
    Napisy paska opinii biorą się ze słownika `Contact`, a nie z kopii w `Home`.

    Pasek jest jeden i ma mówić na obu stronach dokładnie to samo. Drugi
    komplet kluczy oznaczałby, że poprawka literówki w „Przeczytaj wszystkie
    opinie" działa na jednej stronie, a na drugiej nie — i nikt by tego nie
    zauważył, bo obie wyglądają dobrze osobno.
  */
  const tc = await getTranslations("Contact");
  const score = gview.reviews?.score ?? null;
  const ratingText = score
    ? new Intl.NumberFormat(locale === "en" ? "en-GB" : "pl-PL", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(score.rating)
    : null;
  const googleReviewLabels = {
    rating: ratingText,
    count: score ? tc("reviewsCount", { count: score.count }) : null,
    title: tc("reviewsTitle"),
    readAll: tc("readAllReviews"),
    aria: score
      ? tc("reviewsAria", { rating: ratingText ?? "", count: score.count })
      : "",
  };

  /*
    „Zadzwoń" bierze pierwszą linię obsługi z ustawień firmy — ten sam numer,
    który jest w stopce i na stronie kontaktowej. Zamówienie mówi o tym wprost:
    żadnego drugiego numeru telefonu w module GOOGLE.
  */
  const firstPhone = company.phones.find((line) => line.number)?.number ?? "";
  const telHref = firstPhone
    ? `tel:${firstPhone.replace(/[^\d+]/g, "")}`
    : null;

  // Hero copy is admin-editable per locale; an empty field means "no
  // override" and falls back to the Hero.* translation, same contract as the
  // legal-document overrides.
  // `locale` is a route segment, so a request can carry one the settings
  // object has no entry for. Falling back to the Polish set keeps the page a
  // page — indexing it straight into the object rendered a 500 instead.
  const heroText = await getSetting("heroText");
  const heroOverride = heroText[locale as "pl" | "en"] ?? heroText.pl;
  const heroT = (key: keyof typeof heroOverride) => heroOverride[key] || t(key);

  const why = getWhyUs(locale);
  const process = getProcess(locale);
  const airport = getAirport(locale);
  // The hours the home page states come from the same settings the contact
  // page and the assistant read — see `lib/company/service-hours`.
  const hours = serviceHours(company, locale);
  const choose = getWhyChoose(locale, hours);
  const promise = getPromise(locale, hours);
  const kmLimits = getKmLimits(locale);
  // Cennik dodatków z TEGO SAMEGO miejsca, z którego liczy formularz
  // rezerwacji: tabele `fees` i `pickup_locations`. Wcześniej stała tu druga,
  // ręcznie wpisana lista — i to ona była powodem, dla którego strona mówiła
  // „dostawa 99 zł", a rezerwacja liczyła 150 zł.
  const [feeCatalog, allLocations] = await Promise.all([
    getFeeCatalog(),
    getAllLocations(),
  ]);
  const extras = publicExtras(feeCatalog, allLocations, locale);
  const b2b = getB2b(locale);
  const faq = getFaq(locale).slice(0, FAQ_PREVIEW);

  // The published price table is derived from the same fleet records the
  // booking calculator prices against, so the two can never drift apart.
  // A model with no tiers configured shows its base rate in every column.
  const priceRows = fleet.map((car) => {
    const rates = tierRatesGrosze(car);
    return {
      slug: car.slug,
      name: `${car.brand} ${car.model}`,
      daily: rates.slice(0, 4),
      monthly: rates[4],
      deposit: car.depositGrosze,
    };
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(orgJsonLd) }}
      />
      {/*
        HERO — full-bleed vehicle photography under cinematic scrims.
        Theme-aware: the copy uses the palette tokens, and the scrims below
        flip from black to white with the theme, so the section reads as light
        in light mode instead of staying a black island.
      */}
      {/*
        NO background colour on this element: the photo layer below sits at
        -z-10, and since a `relative` section creates no stacking context, a
        background here would paint on top of the photo and hide it entirely.
        The inner wrapper carries bg-void as the base layer instead.
      */}
      <section className="text-ink relative flex min-h-[88vh] items-center overflow-hidden">
        <div aria-hidden className="bg-void absolute inset-0 -z-10">
          {/* Photo drifts gently with scroll; oversized so parallax never reveals edges.
              One layer per theme — CSS hides the one that doesn't apply. */}
          <Parallax className="hero-photo--dark absolute inset-0" distance={70}>
            <div className="absolute inset-x-0 -top-[8%] h-[116%] translate-x-0 md:translate-x-[9%]">
              <Image
                src={heroImage}
                alt=""
                fill
                priority
                quality={80}
                sizes="100vw"
                className="object-cover object-[48%_center] md:object-[10%_center]"
              />
            </div>
          </Parallax>
          {heroImageLight && (
            <Parallax
              className="hero-photo--light absolute inset-0"
              distance={70}
            >
              <div className="absolute inset-x-0 -top-[8%] h-[116%] translate-x-0 md:translate-x-[9%]">
                {/*
                  PRZEZ OPTYMALIZATOR, TAK SAMO JAK WARSTWA CIEMNA (06.09.2026).

                  Tu stał surowy `<img>` z komentarzem, że „/api/media omija
                  optymalizator". To nieprawda i warstwa ciemna nad tym kodem
                  jest tego dowodem: `heroImage` pochodzi z tego samego
                  `/api/media`, idzie przez `<Image>` i wychodzi z serwera jako
                  33 kB WebP-a. Surowy `<img>` oddawał ORYGINAŁ — 1488 kB PNG.

                  To był cały LCP strony na telefonie. Zmierzone na produkcji
                  (412 px, 1,6 Mb/s, CPU ×4): zdjęcie kończyło się na 11 553 ms
                  i dokładnie tam stawał LCP — 11,6 s. Reszta stron ważyła
                  razem mniej niż to jedno zdjęcie.

                  `priority` na OBU warstwach, bo o motywie decyduje dopiero
                  przeglądarka: serwer nie wie, którą z nich zobaczy ten
                  człowiek, a wstępne pobranie dwóch WebP-ów po ~35 kB jest
                  tańsze niż jedno spóźnione zdjęcie w motywie, który akurat
                  wygrał.
                */}
                <Image
                  src={heroImageLight}
                  alt=""
                  fill
                  priority
                  quality={80}
                  sizes="100vw"
                  className="object-cover object-[48%_center] md:object-[10%_center]"
                />
              </div>
            </Parallax>
          )}
          {/* Desktop: solid panel on the left holds the text clear of the car;
              the photo emerges on the right. */}
          <div className="hero-scrim-x absolute inset-0 hidden md:block" />
          {/* Mobile: text stacks over the photo, so shade vertically for legibility
              while letting the centered car (and its bright headlights) show through. */}
          <div className="hero-scrim-y absolute inset-0 md:hidden" />
          {/* Slight top shading for the nav + melt the bottom into the next section */}
          <div className="hero-scrim-edges absolute inset-0" />
          {/* faint signal-red horizon glow, low and restrained */}
          <div className="hero-glow absolute inset-0" />
          <div className="bg-line absolute inset-x-0 bottom-0 h-px" />
        </div>

        <Container className="py-28">
          <Reveal>
            <p className="label text-red text-xs">{heroT("eyebrow")}</p>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="mt-6 max-w-4xl text-[2.75rem] leading-[1.02] md:text-7xl">
              {heroT("title")}
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="text-ink-muted mt-8 max-w-xl text-base md:text-lg">
              {heroT("subtitle")}
            </p>
          </Reveal>
          {/* What we actually offer, in four words each — a scannable line
              under the promise. Rendered as separate items rather than one
              bullet-punctuated string so it wraps by item on a phone instead
              of breaking mid-phrase, and so the separators can be red. */}
          <Reveal delay={0.2}>
            <ul className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
              {(
                [
                  "featureLuxury",
                  "featureSuv",
                  "featureAirport",
                  "featureSupport",
                ] as const
              ).map((key, i) => (
                <li key={key} className="flex items-center gap-3">
                  {i > 0 && (
                    <span aria-hidden className="bg-red rounded-pill h-1 w-1" />
                  )}
                  <span className="label-tight text-silver text-[11px]">
                    {heroT(key)}
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.24}>
            <div className="mt-12 flex flex-wrap items-center gap-4">
              <ButtonLink href="/fleet" size="lg">
                {heroT("cta")}
              </ButtonLink>
              <ButtonLink href={contactHref} size="lg" variant="outline">
                {heroT("ctaSecondary")}
              </ButtonLink>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* FLEET — spec-compliant vehicle cards, filterable in place.
          Sits directly under the hero: the cars are what a visitor came for,
          and the hero already draws its own bottom hairline, so this section
          carries no border-t of its own. */}
      <section id="fleet" className="scroll-mt-24">
        <Container className="py-20 md:py-28">
          <SectionHeading
            eyebrow={tf("eyebrow")}
            title={tf("ourModels")}
            lead={tf("subtitle")}
          />

          <Reveal delay={0.05}>
            <FleetDateFilter from={range?.from} to={range?.to} target="/" />
            {/* Counts what the dates left, not what the class filter then
                narrowed — the chips carry their own numbers. */}
            {range && (
              <p className="text-ink-muted mt-4 text-sm">
                {tf("filterResult", {
                  count: available.length,
                  total: fleet.length,
                })}
              </p>
            )}
            <FleetSegmentFilter
              active={activeSegment}
              counts={counts}
              range={range}
              target="/"
            />
          </Reveal>

          {shown.length === 0 && (range || activeSegment) ? (
            <p className="border-line text-ink-muted mt-10 border p-8 text-center text-sm">
              {range && available.length === 0
                ? tf("filterEmpty")
                : tf("segmentEmpty")}
            </p>
          ) : (
            /*
              FLOTA — 9,23 ekranu przy 390 px, czyli 46 % całej strony głównej.
            
              To był NAJWIĘKSZY blok, nie tekst pod nim. Checkpoint etapu 44
              zakładał „~16 ekranów tekstu po flocie"; pomiar po zwinięciu sekcji
              tekstowych pokazał, że tekstu jest ~9,7, a sama flota ~9,2.
            
              170 rem to CZTERY całe karty (593–684 px każda + 55 px odstępu),
              policzone z żywej strony, a nie przyjęte z sufitu. Zanik od 90 %,
              a nie domyślnych 65 %: miękka krawędź przez pół zdjęcia auta
              wygląda na usterkę renderowania, nie na zaproszenie.
            
              Wszystkie auta zostają w HTML — po filtrze dat lub segmentu
              siatka bywa krótsza niż podgląd i wtedy przycisku nie ma wcale.
            */
            <MobileFold
              label={th("foldMore")}
              labelOpen={th("foldLess")}
              previewRem={170}
              fadeFrom={90}
            >
              <div className="mt-14 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
                {uszeregowane.map((car, i) => (
                  <Reveal key={car.slug} delay={(i % 3) * 0.08}>
                    <CarCard
                      car={car}
                      state={states.get(car.id) ?? null}
                      freeForDates={range ? true : null}
                      nextFreeDay={nextFreeByModel.get(car.id) ?? null}
                      today={today}
                    />
                  </Reveal>
                ))}
              </div>
            </MobileFold>
          )}

          <Reveal className="mt-14">
            <Link
              href="/fleet"
              className="label-tight text-silver hover:text-ink tap inline-block py-2 text-[11px] transition-colors"
            >
              {tf("viewAll")} →
            </Link>
          </Reveal>
        </Container>
      </section>

      {/* WHY A&A — the ten differentiators as a hairline-ruled grid.
          Follows the fleet, so it opens with the rule the fleet no longer has. */}
      <section className="border-line border-t">
        <Container className="py-20 md:py-28">
          <SectionHeading
            eyebrow={th("whyEyebrow")}
            title={th("whyTitle")}
            lead={th("whyLead")}
          />

          {/* Dziesiec powodow — na telefonie widac dwa lub trzy */}
          <MobileFold
            label={th("foldMore")}
            labelOpen={th("foldLess")}
            previewRem={20}
          >
            <ul className="border-line bg-line mt-14 grid gap-px border sm:grid-cols-2 lg:grid-cols-5">
              {why.map((item, i) => (
                <Reveal
                  key={item}
                  as="li"
                  delay={Math.min(i, 5) * 0.05}
                  className="bg-void flex h-full flex-col gap-4 p-6"
                >
                  <span className="font-heading text-red text-3xl leading-none font-bold">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-heading text-ink text-sm leading-snug font-bold">
                    {item}
                  </span>
                </Reveal>
              ))}
            </ul>
          </MobileFold>
        </Container>
      </section>

      <CtaBand
        title={th("ctaFleetTitle")}
        primaryLabel={th("ctaFleet")}
        secondaryLabel={th("ctaContact")}
        secondaryHref={contactHref}
      />

      {/* PROCESS — eight steps, so the 2- and 4-column grids both fill evenly */}
      <section>
        <Container className="py-20 md:py-28">
          <SectionHeading
            eyebrow={th("processEyebrow")}
            title={th("processTitle")}
            lead={th("processLead")}
          />

          {/* Osiem krokow procesu */}
          <MobileFold
            label={th("foldMore")}
            labelOpen={th("foldLess")}
            previewRem={20}
          >
            <ol className="border-line bg-line mt-14 grid gap-px border md:grid-cols-2 lg:grid-cols-4">
              {process.map((step, i) => (
                <Reveal
                  key={step.n}
                  as="li"
                  delay={Math.min(i, 4) * 0.05}
                  className="bg-void flex h-full flex-col gap-5 p-7"
                >
                  <span className="font-heading text-red text-3xl leading-none font-bold">
                    {String(step.n).padStart(2, "0")}
                  </span>
                  <span className="font-heading text-ink text-base leading-snug font-bold">
                    {step.title}
                  </span>
                </Reveal>
              ))}
            </ol>
          </MobileFold>
        </Container>
      </section>

      {/* AIRPORT DELIVERY */}
      <section className="border-line bg-surface-1 border-y">
        <Container className="py-20 md:py-28">
          <div className="grid gap-14 lg:grid-cols-2 lg:items-center">
            <div>
              <SectionHeading
                eyebrow={th("airportEyebrow")}
                title={th("airportTitle")}
                lead={th("airportLead")}
              />
              <Reveal delay={0.1} className="mt-10 flex flex-wrap gap-4">
                <ButtonLink href="/car-rental-warsaw-chopin-airport">
                  {landingLabel("airport", locale)}
                </ButtonLink>
                <ButtonLink href={contactHref} variant="outline">
                  {th("ctaContact")}
                </ButtonLink>
              </Reveal>
            </div>

            {/* Punkty obslugi lotniskowej */}
            <MobileFold
              label={th("foldMore")}
              labelOpen={th("foldLess")}
              previewRem={18}
            >
              <ul className="divide-line border-line divide-y border-y">
                {airport.points.map((point, i) => (
                  <Reveal
                    key={point}
                    as="li"
                    delay={Math.min(i, 4) * 0.06}
                    className="flex items-start gap-5 py-6"
                  >
                    <span className="label-tight text-red mt-1 text-[10px]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-silver text-sm md:text-base">
                      {point}
                    </span>
                  </Reveal>
                ))}
              </ul>
            </MobileFold>
          </div>
        </Container>
      </section>

      {/* WHY CUSTOMERS CHOOSE US */}
      <section>
        <Container className="py-20 md:py-28">
          <SectionHeading
            eyebrow={th("chooseEyebrow")}
            title={th("chooseTitle")}
          />

          {/* Dlaczego klienci wybieraja nas */}
          <MobileFold
            label={th("foldMore")}
            labelOpen={th("foldLess")}
            previewRem={20}
          >
            <div className="divide-line border-line mt-14 grid divide-y border-y md:grid-cols-4 md:divide-x md:divide-y-0">
              {choose.map((item, i) => (
                <Reveal
                  key={item.title}
                  delay={i * 0.08}
                  className="px-0 py-8 md:px-8 md:first:pl-0"
                >
                  <span className="font-heading text-red block text-3xl leading-none font-bold">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="font-heading text-ink mt-6 text-xl font-bold">
                    {item.title}
                  </h3>
                  <p className="text-ink-muted mt-3 text-sm">{item.desc}</p>
                </Reveal>
              ))}
            </div>
          </MobileFold>
        </Container>
      </section>

      {/* OUR PROMISE */}
      <section className="border-line bg-surface-1 border-t">
        <Container className="py-20 md:py-28">
          <SectionHeading
            eyebrow={th("promiseEyebrow")}
            title={th("promiseTitle")}
          />

          {/* Nasza obietnica */}
          <MobileFold
            label={th("foldMore")}
            labelOpen={th("foldLess")}
            previewRem={20}
          >
            <ul className="border-line bg-line mt-14 grid gap-px border sm:grid-cols-2 lg:grid-cols-4">
              {promise.map((item, i) => (
                <Reveal
                  key={item}
                  as="li"
                  delay={Math.min(i, 4) * 0.05}
                  className="bg-surface-1 flex h-full items-center gap-4 p-6"
                >
                  {/* Check mark — decorative, the text carries the meaning */}
                  <svg
                    aria-hidden
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="text-red shrink-0"
                  >
                    <path
                      d="M4 12.5l5 5L20 6.5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="font-heading text-ink text-sm font-bold">
                    {item}
                  </span>
                </Reveal>
              ))}
            </ul>
          </MobileFold>
        </Container>
      </section>

      {/* PRICING — tier table, deposits, mileage, extras */}
      <section id="pricing" className="border-line border-t">
        <Container className="py-20 md:py-28">
          <SectionHeading
            eyebrow={th("pricingEyebrow")}
            title={th("pricingTitle")}
            lead={th("pricingLead")}
          />

          <div className="mt-14">
            <PricingTable
              locale={locale}
              modelLabel={th("modelLabel")}
              note={th("pricingNote")}
              rows={priceRows}
            />
          </div>

          {/* Kaucje, limity km i uslugi dodatkowe. SAMA TABELA CEN ZOSTAJE ODKRYTA — chowanie cen przed klientem, ktory przyszedl po ceny, byloby oszczednoscia na niewlasciwej rzeczy */}
          <MobileFold
            label={th("foldMore")}
            labelOpen={th("foldLess")}
            previewRem={18}
          >
            <div className="mt-16 grid gap-12 lg:grid-cols-3">
              {/* Deposits */}
              <Reveal>
                <h3 className="font-heading text-ink text-lg font-bold">
                  {th("depositsTitle")}
                </h3>
                <p className="text-ink-muted mt-2 text-sm">
                  {th("depositsLead")}
                </p>
                <ul className="divide-line border-line mt-6 divide-y border-y">
                  {priceRows.map((row) => (
                    <li
                      key={row.slug}
                      className="flex items-center justify-between gap-4 py-4"
                    >
                      <span className="text-silver text-sm">{row.name}</span>
                      {/*
                        Kaucja też jest ceną i też się przełącza. Stała
                        w złotych obok karty auta pokazującej „≈ €88" była
                        drugą walutą na jednym ekranie.
                      */}
                      <span className="font-heading text-ink text-sm font-bold">
                        <Money grosze={row.deposit} />
                      </span>
                    </li>
                  ))}
                </ul>
              </Reveal>

              {/* Mileage limits */}
              <Reveal delay={0.08}>
                <h3 className="font-heading text-ink text-lg font-bold">
                  {th("kmTitle")}
                </h3>
                <ul className="divide-line border-line mt-8 divide-y border-y">
                  {kmLimits.map((limit) => (
                    <li key={limit} className="text-silver py-4 text-sm">
                      {limit}
                    </li>
                  ))}
                </ul>
              </Reveal>

              {/* Add-on services */}
              <Reveal delay={0.16}>
                <h3 className="font-heading text-ink text-lg font-bold">
                  {th("extrasTitle")}
                </h3>
                <ul className="divide-line border-line mt-8 divide-y border-y">
                  {extras.map((extra) => (
                    <li
                      key={extra.key}
                      className="flex items-start justify-between gap-4 py-4"
                    >
                      <span className="text-silver text-sm">
                        {extra.label}
                        {/* Punkt zapowiedziany mówi to wprost, zamiast udawać
                            ofertę, której nie da się dziś kupić. */}
                        {extra.comingSoon && (
                          <span className="text-ink-faint block text-xs">
                            {th("extrasComingSoon")}
                          </span>
                        )}
                      </span>
                      <span className="font-heading text-ink shrink-0 text-right text-sm font-bold">
                        <span className="whitespace-nowrap">
                          {/* `<Money>` — ta sama kwota w obu walutach, jedna
                              widoczna, przełączana tym samym przełącznikiem co
                              reszta cen. Bez tego dodatki zostawały w złotych
                              po przejściu na euro. */}
                          <Money grosze={extra.amountGrosze} />
                          {extra.unit === "per_day" ? (
                            <span className="text-ink-faint">
                              {th("extrasPerDay")}
                            </span>
                          ) : null}
                        </span>
                        {/* Górna granica naliczenia — bez niej „50 zł / doba"
                            przy dziesięciodniowym wynajmie czyta się jako
                            500 zł, a naliczymy 400 zł. */}
                        {extra.capGrosze ? (
                          <span className="text-ink-faint block text-xs font-normal whitespace-nowrap">
                            {th("extrasCap")} <Money grosze={extra.capGrosze} />
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
          </MobileFold>
        </Container>
      </section>

      <CtaBand
        title={th("ctaBookTitle")}
        primaryLabel={th("ctaBook")}
        secondaryLabel={th("ctaContact")}
        secondaryHref={contactHref}
      />

      {/* B2B — the hero's "Corporate offer" button lands here */}
      <section id="b2b" className="scroll-mt-24">
        <Container className="py-20 md:py-28">
          <SectionHeading
            eyebrow={th("b2bEyebrow")}
            title={th("b2bTitle")}
            lead={th("b2bLead")}
          />

          {/* B2B: trzy poziomy — palcem widac pierwszy, reszta na zyczenie */}
          <MobileFold
            label={th("foldMore")}
            labelOpen={th("foldLess")}
            previewRem={22}
          >
            <div className="border-line bg-line mt-14 grid gap-px border md:grid-cols-3">
              {b2b.map((tier, i) => (
                <Reveal key={tier.name} delay={i * 0.08} className="bg-void">
                  <div className="flex h-full flex-col gap-4 p-8">
                    <span className="label-tight text-red text-[10px]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="font-heading text-ink text-xl font-bold">
                      {tier.name}
                    </h3>
                    <p className="text-ink-muted text-sm leading-relaxed">
                      {tier.desc}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </MobileFold>

          <Reveal className="mt-12">
            <ButtonLink href={contactHref} size="lg">
              {th("b2bCta")}
            </ButtonLink>
          </Reveal>
        </Container>
      </section>

      {/*
        WSPÓŁPRACA — mała sekcja, świadomie NIEDOMINUJĄCA.
        --------------------------------------------------
        Bez formularza, bez trzech kafli, bez zdjęcia: nagłówek, jedno zdanie
        i odnośnik. Strona główna sprzedaje WYNAJEM i to ona ma zajmować
        ekran; zaproszenie do współpracy jest tu po to, żeby ten, kto go
        szuka, je znalazł — a nie po to, żeby przekonywać wszystkich innych.
        Cała treść, modele i formularz stoją pod `/partnerstwo`.
      */}
      <section id="partnership" className="border-line scroll-mt-24 border-t">
        <Container className="py-16 md:py-20">
          <Reveal>
            <p className="label-tight text-red text-[10px]">
              {th("partnerEyebrow")}
            </p>
            <h2 className="font-heading text-ink mt-4 text-2xl font-bold md:text-3xl">
              {th("partnerTitle")}
            </h2>
            <p className="text-ink-muted mt-4 max-w-2xl text-sm leading-relaxed">
              {th("partnerLead")}
            </p>
          </Reveal>
          <Reveal className="mt-8">
            <ButtonLink href="/partnership" variant="outline">
              {th("partnerCta")}
            </ButtonLink>
          </Reveal>
        </Container>
      </section>

      {/* FAQ preview */}
      <section className="border-line bg-surface-1 border-t">
        <Container className="py-20 md:py-28">
          <SectionHeading eyebrow={th("faqEyebrow")} title={th("faqTitle")} />

          <div className="mt-14">
            <FaqList items={faq} />
          </div>

          {pages.faq && (
            <Reveal className="mt-10">
              <ButtonLink href="/faq" variant="outline">
                {th("faqAll")}
              </ButtonLink>
            </Reveal>
          )}
        </Container>
      </section>

      {/*
        GOOGLE — kompaktowe zamknięcie strony głównej.

        Stoi POD pytaniami i NAD ostatnim wezwaniem do rezerwacji, bo to
        naturalna kolejność czytania: „co oferujecie" → „co jeszcze warto
        wiedzieć" → „kim jesteście i gdzie was znaleźć" → „rezerwuję".
        Postawiony niżej, za czerwonym pasem, byłby przypisem pod stopką.

        Bez mapy: pełna ramka Google zostaje na `/contact`. Tutaj adres,
        opinie i cztery skróty — i ani jednego dodatkowego żądania do obcego
        serwera.
      */}
      <GoogleHomeBlock
        view={gview}
        company={{ name: siteConfig.name, address: company.address }}
        telHref={telHref}
        labels={{
          eyebrow: th("googleEyebrow"),
          map: th("googleMap"),
          profile: th("googleProfile"),
          review: th("googleReview"),
          call: th("googleCall"),
          reviews: googleReviewLabels,
        }}
      />

      <CtaBand
        title={th("ctaBookTitle")}
        primaryLabel={th("ctaBook")}
        secondaryLabel={th("ctaContact")}
        secondaryHref={contactHref}
      />
    </>
  );
}
