import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatPln, formatPlnDokladnie, formatPlnRange } from "@/lib/format";
import { Money, MoneyRange } from "@/components/currency/Money";
import { dailyRateRangeGrosze } from "@/lib/booking/pricing";
import { localeAlternates } from "@/lib/seo";
import { getVisiblePublicModelStates } from "@/lib/fleet/status-repo";
import { getNextFreeDayByModel, isoDay } from "@/lib/booking/availability";
import { compareRange, loadComparison, COMPARE_MIN } from "@/lib/fleet/compare";
import {
  CompareTable,
  type CompareColumn,
  type CompareRow,
} from "./CompareTable";
import { DateRangeForm } from "./DateRangeForm";

/**
 * The comparison view.
 *
 * ## Why the selection travels in the URL
 *
 * The hearts live in the visitor's browser, but the comparison is rendered on
 * the server — because the prices and the availability have to come from the
 * same code the booking form runs, and that code needs the database. Putting
 * the chosen ids in the query string is what lets both be true at once: the
 * browser decides which cars, the server decides what they cost. It also makes
 * a comparison something a visitor can bookmark or send to whoever is paying.
 *
 * `noindex`: an arbitrary combination of cars is not a page worth ranking, and
 * there is an unbounded number of them.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Compare" });
  // Ten sam powód co na `/saved`: bez `alternates` układ `[locale]` podstawia
  // canonical strony głównej pod adres, który stroną główną nie jest.
  return {
    title: t("title"),
    alternates: localeAlternates(locale, "/compare"),
    robots: { index: false, follow: false },
  };
}

const one = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const q = await searchParams;
  const t = await getTranslations({ locale, namespace: "Compare" });
  const tFleet = await getTranslations({ locale, namespace: "Fleet" });
  const tNav = await getTranslations({ locale, namespace: "Nav" });

  const ids = one(q.cars)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const range = compareRange(one(q.od) || undefined, one(q.do) || undefined);
  const cars = await loadComparison(ids, range);
  // Jedno zapytanie na całą tabelę, puste gdy operator wyłączył statusy.
  const states = await getVisiblePublicModelStates();
  /*
    Ta sama para, co na flocie: bez pierwszego wolnego dnia kolumna
    porównywarki mówiłaby „Zablokowany" o aucie, o którym karta obok mówi
    „Dostępny od 12.09" — jedna strona, dwa zdania o tym samym.
  */
  const today = isoDay(new Date());
  const nextFreeByModel = await getNextFreeDayByModel(today);

  if (cars.length === 0) {
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-16 md:px-10">
        <h1 className="font-heading text-ink text-3xl font-bold">
          {t("title")}
        </h1>
        <p className="text-silver mt-4 text-sm">{t("empty")}</p>
        <Link
          href="/saved"
          className="label border-line-strong text-ink hover:border-ink tap mt-6 inline-flex h-11 items-center border px-5 text-xs transition-colors"
        >
          {t("addCar")}
        </Link>
      </div>
    );
  }

  const dash = "—";
  /** A number is only "better" when every car actually has one to compare. */
  const bestBy = (
    values: (number | null)[],
    pick: (a: number, b: number) => number,
  ): number[] => {
    const real = values.filter((v): v is number => v != null);
    if (real.length < 2 || new Set(real).size === 1) return [];
    const target = real.reduce(pick);
    return values.flatMap((v, i) => (v === target ? [i] : []));
  };

  const money = (g: number | null) => (g == null ? dash : formatPln(g, locale));

  const columns: CompareColumn[] = cars.map(({ car, pricing }) => ({
    id: car.id,
    slug: car.slug,
    name: `${car.brand} ${car.model}`,
    images: car.images ?? [],
    fromLabel: money(pricing.fromDailyGrosze),
    priceLabel: pricing.dailyGrosze == null ? null : money(pricing.dailyGrosze),
    totalLabel: pricing.totalGrosze == null ? null : money(pricing.totalGrosze),
    unavailable: pricing.unavailable,
    state: states.get(car.id) ?? null,
    // Dostępność, nie marketing: przekazywana zawsze, gdy podano termin —
    // także przy statusach wyłączonych. Odmowa rezerwacji to nie jest ta sama
    // informacja co „dostępny dziś" i nie chowa jej ten sam przełącznik (§45).
    freeForDates: range ? !pricing.unavailable : null,
    nextFreeDay: nextFreeByModel.get(car.id) ?? null,
    bookHref: `${locale === "en" ? "/en" : ""}/fleet/${car.slug}${
      range ? `?od=${range.from}&do=${range.to}` : ""
    }`,
  }));

  /**
   * The advertised spread for one model, from the same function the fleet card
   * and the car page use. Not stored, not a second price list — five fields the
   * administrator already edits, read once more.
   */
  const rangeOf = (car: (typeof cars)[number]["car"]) =>
    dailyRateRangeGrosze(car);

  /**
   * The price cell, in two forms of the same fact.
   *
   * `text` is what "show differences only" compares and what a cell falls back
   * to; `node` is what is drawn, and it carries both currencies so the table
   * switches with the rest of the site. They are built together, here, so they
   * cannot come to say different things.
   *
   * With dates, the REAL quote for those dates — `computeQuote`, via
   * `loadComparison`. Without them, the advertised spread: a range when the
   * length of the stay really changes the rate, one "od" figure when it does
   * not. Never an invented "890–890 zł" (§2).
   */
  const priceCell = ({ car, pricing }: (typeof cars)[number]) => {
    if (pricing.unavailable) {
      return { text: t("unavailable"), node: null };
    }
    if (range) {
      if (pricing.onRequest || pricing.dailyGrosze == null) {
        return { text: tFleet("priceOnRequest"), node: null };
      }
      const daily = pricing.dailyGrosze;
      const total = pricing.totalGrosze ?? 0;
      return {
        text: `${money(daily)} ${t("perDay")} · ${t("total")}: ${money(total)}`,
        node: (
          <>
            <Money grosze={daily} /> {t("perDay")}
            <br />
            {t("total")}: <Money grosze={total} />
          </>
        ),
      };
    }
    const r = rangeOf(car);
    if (r.minGrosze <= 0) {
      return { text: tFleet("priceOnRequest"), node: null };
    }
    if (r.spans) {
      return {
        text: `${formatPlnRange(r.minGrosze, r.maxGrosze, locale)} ${t("perDay")}`,
        node: (
          <>
            <MoneyRange minGrosze={r.minGrosze} maxGrosze={r.maxGrosze} />{" "}
            {t("perDay")}
          </>
        ),
      };
    }
    return {
      text: `${tFleet("from")} ${money(r.minGrosze)} ${t("perDay")}`,
      node: (
        <>
          {tFleet("from")} <Money grosze={r.minGrosze} /> {t("perDay")}
        </>
      ),
    };
  };

  /*
   * Every row is built from what the fleet actually holds. Nothing is invented:
   * a field the database does not carry — doors, power, drivetrain, boot size,
   * air conditioning as a separate flag — is simply not a row here, and a field
   * that exists but is empty for one car shows "—" in that cell.
   */
  const rows: CompareRow[] = [
    {
      key: "brand",
      label: t("rows.brand"),
      values: cars.map(({ car }) => car.brand),
    },
    {
      key: "model",
      label: t("rows.model"),
      values: cars.map(({ car }) => car.model),
    },
    {
      key: "year",
      label: t("rows.year"),
      values: cars.map(({ car }) => String(car.year)),
    },
    {
      key: "category",
      label: t("rows.category"),
      values: cars.map(({ car }) => tFleet(`category.${car.category}`)),
    },
    {
      key: "segments",
      label: t("rows.segments"),
      values: cars.map(({ car }) =>
        car.segments.length
          ? car.segments.map((s) => tFleet(`segment.${s}`)).join(", ")
          : dash,
      ),
    },
    {
      key: "seats",
      label: t("rows.seats"),
      values: cars.map(({ car }) => String(car.seats)),
      best: bestBy(
        cars.map(({ car }) => car.seats),
        (a, b) => Math.max(a, b),
      ),
    },
    {
      key: "gearbox",
      label: t("rows.gearbox"),
      values: cars.map(({ car }) => tFleet(`gearbox.${car.gearbox}`)),
    },
    {
      key: "fuel",
      label: t("rows.fuel"),
      values: cars.map(({ car }) => tFleet(`fuel.${car.fuel}`)),
    },
    {
      key: "kmLimit",
      label: t("rows.kmLimit"),
      values: cars.map(({ car }) =>
        car.kmPerDayLimit > 0
          ? `${car.kmPerDayLimit} km`
          : tFleet("kmUnlimited"),
      ),
    },
    {
      /*
        Nadprzebieg jako osobny wiersz — zaraz pod limitem, bo to jego druga
        połowa. Porównywarka jest jedynym miejscem, w którym klient stawia
        auta obok siebie, a różnica 2,00 vs 5,00 zł/km przy dłuższej trasie
        waży więcej niż różnica w cenie doby.

        `best` liczone jak przy kaucji — niżej znaczy lepiej. Auta bez
        ustawionej stawki nie biorą udziału w porównaniu i mówią to wprost,
        zamiast udawać zero, które wygrałoby każde zestawienie.
      */
      key: "extraMileage",
      label: t("rows.extraMileage"),
      values: cars.map(({ car }) =>
        car.kmPerDayLimit === 0
          ? "—"
          : car.extraMileageFeeGrosze == null
            ? tFleet("extraMileageNotSet")
            : `${formatPlnDokladnie(car.extraMileageFeeGrosze, locale)}/km`,
      ),
      nodes: cars.map(({ car }) =>
        car.kmPerDayLimit > 0 && car.extraMileageFeeGrosze != null ? (
          <span key={car.id} className="whitespace-nowrap">
            <Money grosze={car.extraMileageFeeGrosze} dokladnie />
            /km
          </span>
        ) : (
          <span key={car.id}>
            {car.kmPerDayLimit === 0 ? "—" : tFleet("extraMileageNotSet")}
          </span>
        ),
      ),
      best: bestBy(
        cars.map(({ car }) =>
          car.kmPerDayLimit > 0 && car.extraMileageFeeGrosze != null
            ? car.extraMileageFeeGrosze
            : null,
        ),
        (a, b) => Math.min(a, b),
      ),
    },
    {
      key: "deposit",
      label: t("rows.deposit"),
      values: cars.map(({ car }) => money(car.depositGrosze)),
      nodes: cars.map(({ car }) => (
        <Money key={car.id} grosze={car.depositGrosze} />
      )),
      best: bestBy(
        cars.map(({ car }) => car.depositGrosze),
        (a, b) => Math.min(a, b),
      ),
    },
    {
      key: "minAge",
      label: t("rows.minAge"),
      values: cars.map(({ minAge }) => `${minAge}`),
      best: bestBy(
        cars.map(({ minAge }) => minAge),
        (a, b) => Math.min(a, b),
      ),
    },
    {
      key: "licence",
      label: t("rows.licence"),
      values: cars.map(({ minLicenceYears }) =>
        minLicenceYears == null ? dash : `${minLicenceYears}`,
      ),
    },
    {
      key: "features",
      label: t("rows.features"),
      values: cars.map(({ car }) =>
        car.features.length ? car.features.join(", ") : dash,
      ),
    },
    {
      key: "price",
      label: t("rows.price"),
      values: cars.map((c) => priceCell(c).text),
      nodes: cars.map((c) => priceCell(c).node),
      // Cheapest for the chosen stay; without dates, the lowest advertised rate.
      best: bestBy(
        cars.map(({ pricing }) =>
          pricing.unavailable
            ? null
            : range
              ? pricing.totalGrosze
              : pricing.fromDailyGrosze,
        ),
        (a, b) => Math.min(a, b),
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-16 md:px-10">
      <header className="mb-8">
        <h1 className="font-heading text-ink text-3xl font-bold md:text-4xl">
          {t("title")}
        </h1>
        {cars.length < COMPARE_MIN && (
          <p className="text-red mt-3 text-sm">{t("needTwo")}</p>
        )}
      </header>

      <DateRangeForm
        cars={cars.map(({ car }) => car.id).join(",")}
        from={range?.from ?? ""}
        to={range?.to ?? ""}
        action={`${locale === "en" ? "/en" : ""}/compare`}
      />

      <div className="mt-8">
        <CompareTable
          columns={columns}
          rows={rows}
          range={range}
          today={today}
        />

        {/* Jedno zdanie pod całą tabelą, nie pod każdą kolumną: zastrzeżenie
            powtórzone przy każdym aucie przestaje być czytane. Renderuje się
            tylko wtedy, gdy klient naprawdę patrzy na ceny w euro. */}
      </div>
    </div>
  );
}
