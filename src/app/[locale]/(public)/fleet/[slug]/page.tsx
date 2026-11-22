import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/ui/Container";
import { HashScroll } from "@/components/ui/HashScroll";
import { buttonBase, buttonVariants } from "@/components/ui/Button";
import { MobileBookingBar } from "@/components/booking/MobileBookingBar";
import { TrustStrip } from "@/components/booking/TrustStrip";
import { googleView } from "@/lib/company/google";
import { serviceHours } from "@/lib/company/service-hours";
import { Reveal } from "@/components/motion/Reveal";
import { CarGallery } from "@/components/fleet/CarGallery";
import { CarRates } from "@/components/fleet/CarRates";
import { Link, getPathname } from "@/i18n/navigation";
import { getCarModelBySlug } from "@/lib/fleet/repo";
import { getFeeCatalog, getLocations } from "@/lib/booking/repo";
import { getModelDayAvailability, isoDay } from "@/lib/booking/availability";
import { AvailabilityCalendar } from "@/components/fleet/AvailabilityCalendar";
import { BOOKING_RULES } from "@/lib/booking/fees";
import { BookingPanel } from "@/components/booking/BookingPanel";
import { turnstileSiteKey } from "@/lib/security/turnstile";
import { RequestForm } from "@/components/marketing/RequestForm";
import {
  absoluteUrl,
  breadcrumbJsonLd,
  jsonLdHtml,
  pageMetadata,
  SITE_ORIGIN,
} from "@/lib/seo";
import { ogImageUrl } from "@/lib/og/url";
import {
  dailyRateRangeGrosze,
  effectiveDailyRateGrosze,
  lowestDailyRateGrosze,
  rentalChargeGrosze,
  rentalDays,
} from "@/lib/booking/pricing";
import { getFreeUnitsByModel } from "@/lib/booking/availability";
import { getVisiblePublicModelStates } from "@/lib/fleet/status-repo";
import { Money, MoneyRange } from "@/components/currency/Money";
import { priceOnRequestLabel } from "@/lib/format";
import { siteConfig } from "@/lib/config/site";
import { getSetting } from "@/lib/admin/settings";

/**
 * Rendered per request, deliberately.
 *
 * This page used to be prerendered, which was right when it only showed specs
 * and a price. It now shows an availability calendar, and a prerendered
 * calendar is a promise made at build time about days in the future — the
 * image is built without database access, so every square would render green
 * and the first visitor after a deploy would be told a booked car is free.
 *
 * The cost is four queries per view on a site with four cars and a database on
 * the same host. The alternative — caching, then racing every confirmation to
 * invalidate it — buys milliseconds and risks telling a customer they can have
 * a car somebody else already has.
 */
export const dynamic = "force-dynamic";

/**
 * The internal route for one car. Built as an object rather than a string
 * because `routing.pathnames` localizes slugs per locale — interpolation would
 * silently produce a Polish URL for an English canonical.
 */
const FLEET_HREF = (slug: string) =>
  ({ pathname: "/fleet/[slug]", params: { slug } }) as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const car = await getCarModelBySlug(slug);
  if (!car) return {};
  const desc = locale === "en" ? car.descriptionEn : car.descriptionPl;
  const name = `${car.brand} ${car.model}`;
  // Nobody searches for a model name attached to a company name. They search
  // for renting that model in a city, so the title says exactly that — the
  // brand suffix is the layout's job, not this one's.
  const title =
    locale === "en" ? `${name} rental — Warsaw` : `Wynajem ${name} — Warszawa`;
  return {
    ...pageMetadata({
      locale,
      path: FLEET_HREF(slug),
      title,
      // A model description is written to be read on the page, so it runs
      // well past what a search result shows; `pageMetadata` cuts it on a
      // word boundary. Without a description the fallback is the car's name
      // and the site's own words, which is still better than an empty tag.
      description: desc ?? `${name} — ${siteConfig.name}`,
      // The generated card, not the raw photograph. The photograph is whatever
      // aspect ratio the admin uploaded, published with no declared width or
      // height — so every platform cropped it differently and several fell back
      // to no image at all. The card is always 1200×630 and puts the model name
      // and the lowest daily rate on top of that same photograph.
      image: ogImageUrl("car", slug, locale),
    }),
  };
}

/** `YYYY-MM-DD`, and not in the past — anything else is ignored, not corrected. */
function validDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return undefined;
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return value >= iso ? value : undefined;
}

export default async function CarDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  /**
   * `?od=&do=&odbior=` — what the assistant puts in its booking links so the
   * customer does not retype what they already told it.
   *
   * Every value is validated here and then merely seeds a form field. The
   * server recomputes the price and re-checks availability at submit time
   * regardless, so this is convenience, not trust.
   */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, slug } = await params;
  const q = await searchParams;
  const one = (k: string) => {
    const v = q[k];
    return typeof v === "string" ? v : undefined;
  };
  const prefill = {
    startDate: validDate(one("od")),
    endDate: validDate(one("do")),
    locationSlug: /^[a-z0-9-]{1,40}$/.test(one("odbior") ?? "")
      ? one("odbior")
      : undefined,
    /**
     * Where the visit came from, for the reservation row.
     *
     * Read from the URL and narrowed to the one value we let a browser claim.
     * It reaches the database as `reservations.source` and nothing else — it
     * cannot change a price, a date or an availability answer, so an inflated
     * chatbot count is the worst a crafted link can achieve.
     */
    source: one("zrodlo") === "chatbot" ? ("chatbot" as const) : undefined,
    /**
     * Which assistant conversation sent them here.
     *
     * Shape-checked and nothing more — it is handed back to the server action,
     * which uses it to mark one conversation row as having ended in a booking.
     * An id belonging to somebody else's conversation would mis-attribute that
     * row and can do nothing else: no price, no date and no reservation depends
     * on it.
     */
    conversationId:
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        one("rozmowa") ?? "",
      )
        ? one("rozmowa")
        : undefined,
  };
  setRequestLocale(locale);

  const car = await getCarModelBySlug(slug);
  if (!car) notFound();

  const t = await getTranslations("Fleet");
  // Etykiety formularza zapytania mieszkają w „Contact" — jeden formularz,
  // jeden komplet napisów, niezależnie od strony, na której stoi.
  const tc = await getTranslations("Contact");
  // Jedno zdanie o walucie, wspólne z nagłówkiem i panelem rezerwacji.
  const tn = await getTranslations("Nav");
  const tLanding = await getTranslations("Landing");
  // Napisy panelu rezerwacji — pasek zaufania cytuje DOKŁADNIE te zdania,
  // które klient przeczyta w samym formularzu, a nie ich drugą wersję.
  const tb = await getTranslations("Booking");
  const description = locale === "en" ? car.descriptionEn : car.descriptionPl;
  // The calendar and the booking form read one availability map, fetched once.
  // Two sources would eventually disagree, and the disagreement would show up
  // as a green square that the form then rejects.
  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + BOOKING_RULES.maxLeadDays);

  /**
   * The dates the visitor arrived with, as a pair or not at all.
   *
   * `validDate` has already refused anything malformed or in the past; what is
   * left to check is that the two make a range. Half a range prices nothing,
   * and a backwards one is a typo rather than a request.
   */
  const chosenRange =
    prefill.startDate && prefill.endDate && prefill.endDate >= prefill.startDate
      ? { from: prefill.startDate, to: prefill.endDate }
      : null;

  const [
    locations,
    fees,
    availability,
    publicStates,
    freeUnits,
    cancellationPolicy,
    company,
    social,
    googleSettings,
  ] = await Promise.all([
    getLocations(),
    getFeeCatalog(),
    car.id
      ? getModelDayAvailability(car.id, isoDay(today), isoDay(horizon))
      : // Typ wypisany wprost: bez niego pusty literał zawęża `freeByDay` do
        // `{}`, a wtedy odczyt po dacie przestaje się kompilować — mapa dni
        // jest tu czytana, nie tylko przekazywana dalej.
        Promise.resolve({
          freeByDay: {} as Record<string, number>,
          unitCount: car.availableCount,
        }),
    getVisiblePublicModelStates(),
    // The Availability Engine's own answer for the chosen range — the same
    // function `filterFleet` asks on the grid, so the card the visitor
    // clicked and the page they landed on cannot disagree. Not asked at all
    // when no dates were given.
    chosenRange
      ? getFreeUnitsByModel(chosenRange.from, chosenRange.to)
      : Promise.resolve(null),
    // Zasady anulowania — jedno źródło, te same, które rozliczy anulowanie.
    getSetting("cancellation"),
    /*
      Trzy ustawienia dla paska zaufania przy rezerwacji (etap sprzedażowy 2).
      Jadą w tym samym `Promise.all`, co reszta — trzy osobne `await` niżej
      dołożyłyby trzy podróże do bazy jedna po drugiej, do strony, która i tak
      czeka już na sześć.
    */
    getSetting("company"),
    getSetting("social"),
    getSetting("google"),
  ]);

  // Today's state, from the one central source, and only when the operator has
  // left public statuses switched on — `getVisiblePublicModelStates` returns an
  // empty map when they have not, so this needs no second check.
  const publicState = car.id ? (publicStates.get(car.id) ?? null) : null;
  // Availability outranks today's state on this page exactly as it does on a
  // card: `null` when no dates were given, and never inferred from `state`.
  const freeForDates =
    chosenRange && freeUnits && car.id
      ? (freeUnits.get(car.id) ?? 0) > 0
      : null;

  /*
    Pierwszy wolny dzień TEGO auta — bez dodatkowego zapytania.

    Siatka floty pyta o to `getNextFreeDayByModel`, bo ma jedenaście modeli
    naraz. Tutaj model jest jeden, a jego kalendarz i tak został właśnie
    pobrany (`availability.freeByDay` — ta sama mapa, którą rysuje kalendarz
    niżej i którą czyta formularz). Druga podróż do bazy po tę samą liczbę
    dałaby dwa źródła jednej odpowiedzi i pierwszą okazję, żeby się rozminęły.

    Dni przeszłe odpadają: mapa zaczyna się od dzisiaj, ale porównanie i tak
    stoi, bo `freeByDay` bywa nadpisywana z pamięci podręcznej przeglądarki.
  */
  const todayIso = isoDay(today);
  const nextFreeDay =
    Object.keys(availability.freeByDay)
      .filter((d) => d >= todayIso && (availability.freeByDay[d] ?? 0) > 0)
      .sort()[0] ?? null;

  /*
    What this car costs, from the Pricing Engine and nowhere else.

    Two shapes, and which one is shown depends on what the visitor has told us:

     · no dates → the honest "from", widening into a range when the length of
       the stay really does change the rate. `spans` is false for a flat rate
       and then ONE figure is printed — never an invented "890–890 zł" (§1).
     · dates → the REAL charge for those days, `rentalChargeGrosze`, the same
       function the booking panel and the reservation record use. A general
       range is a worse answer than a specific price to somebody who has
       already said when they want the car.
  */
  const rates = dailyRateRangeGrosze(car);
  const periodDays = chosenRange
    ? rentalDays(new Date(chosenRange.from), new Date(chosenRange.to))
    : null;
  const periodGrosze = periodDays ? rentalChargeGrosze(car, periodDays) : 0;
  const periodDailyGrosze = periodDays
    ? effectiveDailyRateGrosze(car, periodDays)
    : 0;
  // A period whose own tier is unpriced ("ask me") falls back to the range,
  // rather than printing the zero that the tier deliberately holds.
  const showPeriod = periodDays !== null && periodGrosze > 0;

  // Vehicle offer markup: lets Google show the car with its lowest real rate.
  // The price is the cheapest rate actually charged (the long-stay tier), so the
  // figure in search matches something a customer can genuinely book at.
  // Skipped where zero — see `isPriceOnRequest`.
  const fromDailyGrosze = lowestDailyRateGrosze(car);

  const carJsonLd = {
    "@context": "https://schema.org",
    "@type": "Car",
    name: `${car.brand} ${car.model}`,
    // Adres samego pojazdu, obok adresu w ofercie. Bez niego węzeł `Car` jest
    // opisem modelu, który równie dobrze mógłby stać na cudzej stronie —
    // `url` mówi, że TA karta jest jego miejscem w sieci.
    url: absoluteUrl(locale, FLEET_HREF(slug)),
    brand: { "@type": "Brand", name: car.brand },
    model: car.model,
    vehicleModelDate: String(car.year),
    seatingCapacity: car.seats,
    fuelType: car.fuel,
    vehicleTransmission: car.gearbox,
    image: car.images.map((src) => `${siteConfig.url}${src}`),
    description: description ?? undefined,
    /**
     * A car priced by hand carries an offer with no price, not an offer of
     * zero. `price: "0.00"` would put "0 zł" in Google's rich result — the
     * site advertising a free Porsche — and it is the search engine's copy of
     * that claim, which outlives any fix on the page itself.
     */
    offers: {
      "@type": "Offer",
      priceCurrency: "PLN",
      /*
        Kto wynajmuje. Wskazanie przez `@id` na węzeł `AutoRental` ze strony
        głównej — nazwa i adres jadą obok, bo ten węzeł nie stoi na TEJ
        stronie, a odwołanie do identyfikatora, którego walidator nie widzi,
        opisuje oferenta bez jednej właściwości. Żadnej drugiej tożsamości
        firmy tu nie powstaje: to ten sam `@id`, co w landingach.
      */
      offeredBy: {
        "@id": `${SITE_ORIGIN}/#organization`,
        "@type": "AutoRental",
        name: siteConfig.name,
        url: `${SITE_ORIGIN}/`,
      },
      /**
       * TO AUTO JEST DO WYNAJĘCIA, NIE NA SPRZEDAŻ — i bez tej jednej
       * właściwości markup twierdził coś przeciwnego.
       *
       * `schema.org/businessFunction` ma wartość DOMYŚLNĄ i jest nią
       * `gr:Sell`. Oferta bez tej właściwości nie jest więc „ofertą bez
       * określonej funkcji", tylko wprost OFERTĄ SPRZEDAŻY. `Car` dziedziczy
       * po `Product`, a `Product` + `Offer` + `price` + `InStock` to dokładnie
       * ten kształt danych, którym sklep ogłasza towar na sprzedaż. Audyt
       * z 05.09.2026 czytał to na produkcji jako „A&A sprzedaje Teslę Model S
       * za 870 zł".
       *
       * `LeaseOut` to w słowniku GoodRelations „wynajem albo dzierżawa" —
       * czasowe prawo do używania rzeczy zamiast przeniesienia własności.
       * Dokumentacja GoodRelations podaje przy tej wartości wprost przykład
       * wypożyczalni pojazdów.
       *
       * Nie jest to zabieg pod rich results: Google wycofał wyniki
       * rozszerzone dla ogłoszeń pojazdowych 09.09.2025. To wyłącznie
       * poprawienie zdania, które markup i tak wypowiada — a wypowiadał
       * nieprawdziwe.
       */
      businessFunction: "http://purl.org/goodrelations/v1#LeaseOut",
      availability:
        car.availableCount > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      url: absoluteUrl(locale, FLEET_HREF(slug)),
      ...(fromDailyGrosze > 0
        ? {
            price: (fromDailyGrosze / 100).toFixed(2),
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              priceCurrency: "PLN",
              price: (fromDailyGrosze / 100).toFixed(2),
              unitCode: "DAY",
              /*
                Widełki, gdy stawka naprawdę zależy od długości najmu.
                Strona pisze nad przyciskiem „870–950 zł / doba", a znacznik
                podawał jedną liczbę — najniższą. Zgodność danych
                strukturalnych z tym, co widzi człowiek, jest wymogiem
                Google, a nie ozdobą; `minPrice`/`maxPrice` mówią to samo,
                co drabina cen pod spodem. Przy stawce płaskiej (`spans`
                false) widełek nie ma i nie dokładamy ich sztucznie.
              */
              ...(rates.spans && rates.maxGrosze > 0
                ? {
                    minPrice: (rates.minGrosze / 100).toFixed(2),
                    maxPrice: (rates.maxGrosze / 100).toFixed(2),
                  }
                : {}),
            },
          }
        : {}),
    },
  };

  /*
    PASEK ZAUFANIA — cztery fakty, z których żaden nie powstaje na tej stronie.

    Ocena i liczba opinii przechodzą przez `googleView`, czyli przez tę samą
    funkcję, która rozstrzyga blok GOOGLE na stronie głównej i na kontakcie:
    przełącznik w panelu MUSI być włączony, a dane MUSZĄ istnieć — inaczej
    wychodzi `null` i pasek po prostu nie pokazuje oceny. Liczba nie jest tu
    nigdzie wpisana na sztywno.

    CZEGO W PASKU NIE MA: ani słowa o ubezpieczeniu. Pierwsza polisa dociera do
    właściciela w poniedziałek i dopiero ona może cokolwiek o ochronie
    powiedzieć — patrz `TrustStrip`.
  */
  const gview = googleView({
    google: googleSettings,
    profileUrl: social.googleBusiness,
    mapsUrl: company.mapsUrl,
    locale,
  });
  const score = gview.reviews?.score ?? null;
  const ratingText = score
    ? new Intl.NumberFormat(locale === "en" ? "en-GB" : "pl-PL", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(score.rating)
    : null;
  /* Pierwsza linia obsługi — ten sam numer, co w stopce i na kontakcie. */
  const firstPhone = company.phones.find((line) => line.number)?.number ?? "";
  const trust = {
    rating: ratingText,
    reviewsCount: score ? tc("reviewsCount", { count: score.count }) : null,
    reviewsHref: gview.reviews?.allHref ?? null,
    reviewsAria: score
      ? tc("reviewsAria", { rating: ratingText ?? "", count: score.count })
      : "",
    phone: firstPhone,
    phoneHref: firstPhone ? `tel:${firstPhone.replace(/[^\d+]/g, "")}` : null,
    confirmNote: tb("note"),
    cancellationNote: tb("anulowanieBezplatneDo", {
      godziny: cancellationPolicy.freeHours,
    }),
  };

  /**
   * Kotwica formularza — pas i mini-panel dostają ją gotową.
   *
   * `getPathname`, a NIE sklejanie łańcuchów. `FLEET_HREF(slug)` jest OBIEKTEM
   * (`{ pathname, params }`), bo slug bywa inny w każdym języku — wstawiony
   * do szablonu tekstowego dawał dosłownie `[object Object]`:
   *
   *     PL:  href="[object Object]#rezerwacja"        → /fleet/[object Object]
   *     EN:  href="/en[object Object]#rezerwacja"     → 404
   *
   * Był to GŁÓWNY przycisk rezerwacji na WSZYSTKICH jedenastu kartach aut,
   * w obu językach, w dwóch miejscach każdej (blok mobilny i pasek dolny).
   * Klient klikał „Zarezerwuj" i lądował na stronie błędu — czyli droga
   * do jedynej konwersji tego serwisu była przerwana. Znalezione 05.09.2026
   * przez przejście linków, nie przez otwieranie tras z listy: przemiatanie
   * odwiedza adresy, a tego linku nikt wcześniej nie kliknął.
   *
   * `getPathname` to ta sama funkcja, z której korzysta `absoluteUrl`
   * w `lib/seo` — zna tłumaczenie slugów i sam dokłada prefiks `/en`, więc
   * znika też ręczne `locale === "en" ? "/en" : ""`.
   */
  /**
   * Dokąd prowadzi „ZAREZERWUJ" — i dlaczego nie do formularza.
   *
   * Oba CTA na tej stronie („ZAREZERWUJ" w treści i dolny pasek) są
   * `lg:hidden`, czyli WYŁĄCZNIE telefonowe. Dlatego jest tu jeden adres,
   * a nie dwa: na komputerze nie ma czego kierować, bo formularz stoi
   * przyklejony obok i jest widoczny bez przewijania.
   *
   * Zmierzone na produkcji 05.09.2026, iPhone 390 × 844, Tesla Model S:
   *
   * ```
   *   CENNIK          y = 1012
   *   DOSTĘPNOŚĆ      y = 1308   (kalendarz)
   *   #rezerwacja     y = 2833   (formularz)
   * ```
   *
   * Kliknięcie CTA przewijało na 2737 — czyli klient przeskakiwał 1721 px
   * i lądował od razu w polach „odbiór / zwrot / godziny / dodatki / kaucja",
   * nie zobaczywszy ANI ceny, ANI dostępności. Wybierał termin, nie wiedząc,
   * ile kosztuje i czy jest wolny.
   *
   * Na telefonie strona jest jedną kolumną, więc kolejność czytania JEST
   * kolejnością w DOM — a ta jest już poprawna: cennik, dostępność, formularz.
   * Nic nie trzeba przestawiać ani powielać. Trzeba tylko przestać przewijać
   * do KOŃCA tej ścieżki i zacząć od jej POCZĄTKU.
   *
   * Na komputerze problemu nie ma i nic się nie zmienia: formularz stoi
   * przyklejony w prawej kolumnie (`lg:sticky`) i jest widoczny razem
   * z cennikiem, bez przewijania.
   */
  const MOBILNY_START = "cennik";
  const mobilnyHash = `${getPathname({ href: FLEET_HREF(slug), locale })}#${MOBILNY_START}`;

  // 16px on a phone, nothing extra once the Container's own gutter takes over.
  const phoneText = "px-4 md:px-0";

  /*
    NADPRZEBIEG STOI W KOMÓRCE LIMITU, a nie w siódmej kratce obok.

    Bo to jedna informacja rozpisana na dwie liczby: ile kilometrów jest
    w cenie i ile kosztuje każdy następny. Klient czyta je razem albo nie czyta
    ich wcale — „300 km" bez ciągu dalszego nie mówi, co się stanie po 301.

    Praktycznie znaczy to też, że siatka zostaje parzysta: sześć komórek układa
    się bez sieroty i na 360 px (dwie kolumny), i od `sm` (trzy). Siódma kratka
    zostawiałaby na każdej szerokości jedną pustą — a zamówienie prosi o rzecz
    elegancką, nie o baner.

    `null` w stawce to „nie ustalono" i wtedy druga linia po prostu nie
    powstaje. Zero jest niemożliwe — odcina je CHECK w bazie i panel.
  */
  const specs = [
    { label: t("yearLabel"), value: String(car.year) },
    { label: t("category.label"), value: t(`category.${car.category}`) },
    { label: t("seats"), value: String(car.seats) },
    { label: t("gearboxLabel"), value: t(`gearbox.${car.gearbox}`) },
    { label: t("fuelLabel"), value: t(`fuel.${car.fuel}`) },
    {
      label: t("kmLimit"),
      value:
        car.kmPerDayLimit === 0 ? t("kmUnlimited") : `${car.kmPerDayLimit} km`,
      /* Bez limitu nie ma nadprzebiegu — nie ma czego przekroczyć. */
      nadprzebiegGrosze:
        car.kmPerDayLimit > 0 ? car.extraMileageFeeGrosze : null,
    },
  ];

  // Edge to edge on a phone: the photography carries this page, and a gutter on
  // both sides of a 390px screen cost it a seventh of its width. The gutter
  // comes back at `md`, where the two-column grid needs the frame.
  //
  // Running text and the rate ladder opt back in to a 16px inset (`phoneText`)
  // — a headline hard against the bezel reads as crowded in a way a photograph
  // never does. Panels that carry their own border keep the full bleed.
  return (
    <Container bleedOnPhone className="py-10 md:py-16">
      {/*
        Dowóz do `#rezerwacja` przy przejściu z floty — patrz `HashScroll`.
        Wejście z zewnątrz obsługuje przeglądarka; przejście po stronie
        klienta wypadało 357 px za nisko, bo skok następował, zanim panel
        rezerwacji w ogóle znalazł się w drzewie.
      */}
      <HashScroll />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(carJsonLd) }}
      />
      {/*
        Okruszki karty auta: strona główna → flota → ten model. Dokładnie ta
        sama droga, którą pokazuje odnośnik „← Wróć do floty" tuż niżej, więc
        struktura nie opisuje nawigacji, której na stronie nie ma. Adresy idą
        przez `absoluteUrl`, bo slug modelu jest wspólny dla obu języków, ale
        prefiks `/en` już nie.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdHtml(
            breadcrumbJsonLd(locale, tLanding("breadcrumbHome"), [
              { name: tn("fleet"), href: "/fleet" },
              {
                name: `${car.brand} ${car.model}`,
                href: FLEET_HREF(slug),
              },
            ]),
          ),
        }}
      />
      <Link
        href="/fleet"
        className={`label-tight text-ink-faint hover:text-ink tap inline-block py-2 text-[11px] transition-colors ${phoneText}`}
      >
        ← {t("backToFleet")}
      </Link>

      {/* Full-bleed media — swipeable when the car has more than one photo */}
      <Reveal className="mt-6">
        <CarGallery
          car={car}
          sizes="(min-width:1440px) 1440px, 100vw"
          badge={t(`category.${car.category}`)}
          state={publicState}
          freeForDates={freeForDates}
          nextFreeDay={nextFreeDay}
          today={todayIso}
        />
      </Reveal>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1.6fr_1fr]">
        {/* Left: identity, specs, description.
            `min-w-0` is load-bearing: a grid item defaults to `min-width:auto`,
            so the rate table's `min-w-[520px]` would widen this column past the
            viewport and take the whole page with it instead of scrolling. */}
        <div className="min-w-0">
          <Reveal className={phoneText}>
            <h1 className="font-heading text-4xl font-bold md:text-5xl">
              {car.brand} {car.model}
            </h1>
            <p className="label-tight text-ink-faint mt-2 text-xs">
              {car.year}
            </p>
          </Reveal>

          {/*
            Cena i stan — dwie rzeczy, po które przychodzi się na tę stronę,
            zanim zacznie się czytać wyposażenie.

            Stan stoi po prawej, na wysokości ceny, a nie na dole strony: na
            karcie w siatce status jest przypisem pod przyciskiem, bo obok stoi
            dwanaście innych aut. Tutaj auto jest jedno i „wynajęty" jest
            odpowiedzią na pytanie, które klient właśnie zadał — dlatego
            `size="md"` i dlatego w tym samym wierszu co kwota.
          */}
          <Reveal delay={0.03} className={`mt-6 ${phoneText}`}>
            <div className="border-line flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b pb-5">
              <div>
                {rates.minGrosze > 0 ? (
                  showPeriod ? (
                    <>
                      <p className="label-tight text-ink-faint text-[10px]">
                        {t("priceForPeriod", { days: periodDays as number })}
                      </p>
                      <p className="font-heading text-ink mt-1 text-3xl font-bold md:text-4xl">
                        <Money grosze={periodGrosze} />
                      </p>
                      {/* Stawka dobowa, która z tego wychodzi — ta sama, którą
                          policzy panel obok, bo pochodzi z tej samej funkcji. */}
                      <p className="text-ink-faint mt-2 text-xs">
                        <Money grosze={periodDailyGrosze} /> / {t("perDay")}
                      </p>
                      <p className="text-ink-faint mt-1 max-w-xs text-[10px] leading-tight">
                        {t("periodPriceNote")}
                      </p>
                    </>
                  ) : (
                    <>
                      {/* „od" ma sens tylko przy jednej liczbie. Przy zakresie
                          jest zbędne i nieprawdziwe — 345–430 zł nie zaczyna
                          się na 345 i nie rośnie w nieskończoność. */}
                      {!rates.spans && (
                        <p className="label-tight text-ink-faint text-[10px]">
                          {t("from")}
                        </p>
                      )}
                      <p className="font-heading text-ink mt-1 text-3xl font-bold md:text-4xl">
                        {rates.spans ? (
                          <MoneyRange
                            minGrosze={rates.minGrosze}
                            maxGrosze={rates.maxGrosze}
                          />
                        ) : (
                          <Money grosze={rates.minGrosze} />
                        )}
                      </p>
                      <p className="label-tight text-ink-faint mt-2 text-[10px]">
                        / {t("perDay")}
                      </p>
                      {rates.spans && (
                        <p className="text-ink-faint mt-1 max-w-xs text-[10px] leading-tight">
                          {t("rateDependsOnDuration")}
                        </p>
                      )}
                    </>
                  )
                ) : (
                  <p className="font-heading text-ink max-w-xs text-base font-bold">
                    {priceOnRequestLabel(locale)}
                  </p>
                )}
              </div>

              {/* Stan pojazdu przeniósł się na GŁÓWNE ZDJĘCIE, w prawy górny
                  róg — patrz `CarGallery` wyżej. Tutaj go już nie ma, żeby ten
                  sam fakt nie stał na stronie dwa razy. */}
            </div>

            {/* Pełne zdanie o EUR — tylko wtedy, gdy klient naprawdę czyta
                ceny w euro. W złotówkach nie ma czego zastrzegać. */}
          </Reveal>

          {/*
            MINI-PANEL REZERWACJI — telefon, wysoko na stronie (etap 2).

            Na telefonie ta strona ma ponad cztery ekrany, a formularz stoi na
            końcu: za galerią, ceną, cennikiem, kalendarzem, sześcioma kratkami
            danych, wyposażeniem i opisem. Klient widział model, stan i cenę
            w pierwszym ekranie — i nie miał tam nic, w co można kliknąć.

            To NIE jest drugi formularz. Nie ma własnych dat, własnej ceny ani
            własnego pojęcia o dostępności: prowadzi do jedynego formularza,
            jaki ta strona ma. Drugi komplet pól oznaczałby drugie miejsce, w
            którym trzeba pilnować zgodności z silnikiem dostępności — a przy
            pierwszej rozbieżności klient dostaje potwierdzenie terminu, którego
            nie da się zrealizować.

            Cena stoi w wierszu TUŻ NAD tym blokiem i dlatego nie powtarza się
            tutaj. Powtórzona byłaby tą samą liczbą dwa razy na jednym ekranie.

            `lg:hidden`, bo od tej szerokości panel rezerwacji stoi przyklejony
            w prawej kolumnie i jest widoczny bez przewijania.
          */}
          <Reveal delay={0.04} className={`mt-6 lg:hidden ${phoneText}`}>
            <div className="border-line border p-5">
              <a
                href={mobilnyHash}
                className={`${buttonBase} ${buttonVariants.primary} h-12 w-full px-6 text-xs`}
              >
                {t("book")}
              </a>
              <TrustStrip {...trust} className="mt-5" />
            </div>
          </Reveal>

          {/*
            Rates sit above the spec grid: the first thing a visitor wants
            after the name is what the car costs.

            `id="cennik"` to POCZĄTEK ŚCIEŻKI REZERWACJI NA TELEFONIE — patrz
            `MOBILNY_START` niżej. Kotwica siedzi na zwykłej sekcji, a nie na
            `Reveal`, i to jest celowe: `Reveal` startuje przesunięty o 28 px
            i dojeżdża do zera dopiero po wejściu w kadr, więc skok do niego
            lądowałby o te 28 px obok. Ten sam powód, dla którego `#rezerwacja`
            wisi na nieanimowanym `<aside>`.

            `scroll-mt-24` (96 px) — ta sama wartość, co u pozostałych kotwic
            w tym pliku. Przyklejona belka ma 81 px, więc nagłówek „CENNIK"
            staje 15 px pod nią, a nie za nią.
          */}
          <section id="cennik" className={`mt-8 scroll-mt-24 ${phoneText}`}>
            <Reveal delay={0.05}>
              <CarRates
                car={car}
                locale={locale}
                title={t("ratesTitle")}
                note={t("ratesNote")}
              />
            </Reveal>
          </section>

          <Reveal delay={0.08} className={`mt-10 ${phoneText}`}>
            <AvailabilityCalendar
              freeByDay={availability.freeByDay}
              monthsAhead={Math.floor(BOOKING_RULES.maxLeadDays / 30) - 1}
              labels={{
                title: t("availabilityTitle"),
                free: t("availabilityFree"),
                taken: t("availabilityTaken"),
                prev: t("prevMonth"),
                next: t("nextMonth"),
                selected: t("availabilitySelected"),
                hint: t("availabilityHint"),
              }}
            />
            <p className="text-ink-faint mt-3 text-xs">
              {t("availabilityNote")}
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <dl className="border-line bg-line mt-10 grid grid-cols-2 gap-px border sm:grid-cols-3">
              {specs.map((s) => (
                <div key={s.label} className="bg-void px-5 py-5">
                  <dt className="label-tight text-ink-faint text-[10px]">
                    {s.label}
                  </dt>
                  <dd className="text-ink mt-2 text-sm">{s.value}</dd>
                  {s.nadprzebiegGrosze != null && (
                    <dd
                      className="text-silver mt-1 text-xs"
                      /* Wyjaśnienie wisi na `title`, ale sama KWOTA jest
                         widoczna — zamówienie mówi wprost, że stawki nie wolno
                         schować w samym dymku. Dymek dopowiada regułę, nie
                         zastępuje liczby. */
                      title={t("extraMileageNote")}
                    >
                      {t("extraMileage")}{" "}
                      <span className="text-ink whitespace-nowrap">
                        <Money grosze={s.nadprzebiegGrosze} dokladnie />
                        /km
                      </span>
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          </Reveal>

          {car.features.length > 0 && (
            <Reveal delay={0.12} className={phoneText}>
              <h2 className="label-tight text-ink-faint mt-10 text-[10px]">
                {t("featuresTitle")}
              </h2>
              <ul className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {car.features.map((f) => (
                  <li
                    key={f}
                    className="text-ink flex items-start gap-3 text-sm"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                      className="text-red mt-1 shrink-0"
                    >
                      <path
                        d="M5 12l5 5 9-11"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
            </Reveal>
          )}

          {description && (
            <Reveal delay={0.15} className={phoneText}>
              <p className="text-ink-muted mt-10 max-w-2xl text-sm leading-relaxed md:text-base">
                {description}
              </p>
            </Reveal>
          )}
        </div>

        {/* Right: live booking calculator + reservation request */}
        <Reveal delay={0.1} className="min-w-0">
          {/* `id` is the landing point for the assistant's "Zarezerwuj" button.
              Without it that button dropped the customer at the top of the page
              and left them to find the form — a long scroll on a phone, and the
              reason the button felt like it did nothing. */}
          {/*
            `data-mobile-start` mówi `HashScroll`, gdzie zaczyna się ta sama
            ścieżka na telefonie. Dotyczy WEJŚĆ Z INNYCH STRON — karty auta na
            `/fleet`, `/saved`, porównywarki i odnośników asystenta, które
            prowadzą pod `#rezerwacja` i których adres powstaje na serwerze,
            nieświadomym szerokości ekranu. Kliknięcia na tej stronie mają
            własny adres (`mobilnyHash`) i tego przepisania nie potrzebują.
          */}
          <aside
            id="rezerwacja"
            data-mobile-start={MOBILNY_START}
            className="scroll-mt-24 lg:sticky lg:top-24"
          >
            <BookingPanel
              cancellationPolicy={cancellationPolicy}
              car={car}
              locations={locations}
              fees={fees}
              freeByDay={availability.freeByDay}
              prefill={prefill}
              /* Klucz czytany po stronie serwera przy każdym renderowaniu —
                 patrz `lib/security/turnstile`. `null` = ochrona nie jest
                 skonfigurowana i widget się nie rysuje. */
              turnstileSiteKey={turnstileSiteKey()}
              /*
                Godziny, w których firma naprawdę odbiera telefon — składane
                przez `serviceHours()` z tego samego ustawienia `company`,
                które czyta strona kontaktu i karta kontaktowa asystenta.
                Ekran po wysłaniu mówi dzięki temu, KIEDY klient nas zastanie,
                zamiast obiecywać oddzwonienie w N godzin, którego firma
                nigdzie nie zadeklarowała.
              */
              contactHours={serviceHours(company, locale).phone}
            />
            {/*
              Pasek zaufania pod formularzem — `hidden lg:block`, bo na
              telefonie stoi już wyżej, w mini-panelu. Dwa razy te same cztery
              fakty na jednej stronie to nie jest podwójny dowód, tylko dwa
              miejsca, w których trzeba je poprawiać.
            */}
            <TrustStrip {...trust} className="mt-6 hidden lg:block" />
          </aside>
        </Reveal>
      </div>

      {/*
        „Zapytaj o to auto" — obok rezerwacji, nie zamiast niej.

        Panel obok umie jedno: ZAREZERWOWAĆ. Klient, który chce najpierw
        zapytać („czy ma hak?", „czy wolno wyjechać za granicę?"), miał do
        wyboru telefon, WhatsApp albo `mailto:` — czyli trzy kanały, po
        których w systemie nie zostaje ślad, i pytanie o konkretny model
        docierało do obsługi bez informacji, o który model chodzi.

        Model dopina się tutaj automatycznie, ze slugu trasy. Klient nie
        przepisuje nazwy auta, a obsługa nie zgaduje, o które z dziesięciu
        chodziło.
      */}
      <div id="zapytanie" className="mt-24 scroll-mt-24">
        <Reveal>
          <h2 className="label text-ink-faint text-xs">{tc("formTitle")}</h2>
          <p className="text-silver mt-3 max-w-xl text-sm">{tc("formLead")}</p>
        </Reveal>
        <Reveal className="mt-8">
          <RequestForm
            locale={locale === "en" ? "en" : "pl"}
            carSlug={car.slug}
            carName={`${car.brand} ${car.model}`}
            privacyHref={
              locale === "en"
                ? "/en/polityka-prywatnosci"
                : "/polityka-prywatnosci"
            }
            labels={{
              formName: tc("formName"),
              formPhone: tc("formPhone"),
              formEmail: tc("formEmail"),
              formContactHint: tc("formContactHint"),
              formSubject: tc("formSubject"),
              formMessage: tc("formMessage"),
              formCar: tc("formCar"),
              formDates: tc("formDates"),
              formDateFrom: tc("formDateFrom"),
              formDateTo: tc("formDateTo"),
              formConsent: tc("formConsent"),
              formSend: tc("formSend"),
              formSending: tc("formSending"),
              formDone: tc("formDone"),
              formErrContact: tc("formErrContact"),
              formErrSubject: tc("formErrSubject"),
              formErrMessage: tc("formErrMessage"),
              formErrConsent: tc("formErrConsent"),
              formErrRate: tc("formErrRate"),
              formErrServer: tc("formErrServer"),
            }}
            turnstileSiteKey={turnstileSiteKey()}
          />
        </Reveal>
      </div>

      {/*
        PRZYKLEJONY PAS REZERWACJI — telefon (etap 2).

        Cena po lewej, jedno wezwanie po prawej, przez całą drogę w dół strony.
        Liczba jest DOKŁADNIE ta sama, którą klient widzi w wierszu ceny wyżej,
        bo pochodzi z tych samych zmiennych: przy wybranym terminie prawdziwa
        kwota za ten termin (`periodGrosze`, z Pricing Engine), bez terminu —
        uczciwe „od". Auto bez ceny nie dostaje pasa wcale: „od 0 zł" byłoby
        gorsze niż brak paska.

        Chowanie przed paskiem zgód, klawiaturą i samym formularzem robi
        `MobileBookingBar` — patrz komentarz w tym pliku.
      */}
      {rates.minGrosze > 0 && (
        <MobileBookingBar
          href={mobilnyHash}
          cta={t("book")}
          ariaLabel={`${car.brand} ${car.model} — ${t("book")}`}
        >
          {showPeriod ? (
            <>
              <p className="label-tight text-ink-faint text-[10px]">
                {t("priceForPeriod", { days: periodDays as number })}
              </p>
              <p className="font-heading text-ink text-lg leading-tight font-bold">
                <Money grosze={periodGrosze} />
              </p>
            </>
          ) : (
            <>
              <p className="label-tight text-ink-faint text-[10px]">
                {rates.spans ? t("rateDependsOnDuration") : t("from")}
              </p>
              <p className="font-heading text-ink text-lg leading-tight font-bold">
                {rates.spans ? (
                  <MoneyRange
                    minGrosze={rates.minGrosze}
                    maxGrosze={rates.maxGrosze}
                  />
                ) : (
                  <Money grosze={rates.minGrosze} />
                )}
                <span className="label-tight text-ink-faint ml-1 text-[10px]">
                  / {t("perDay")}
                </span>
              </p>
            </>
          )}
        </MobileBookingBar>
      )}
    </Container>
  );
}
