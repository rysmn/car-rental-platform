import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { CarPhotos } from "./CarPhotos";
import { FavoriteButton } from "./FavoriteButton";
import { VehicleStatus } from "./VehicleStatus";
import { Money, MoneyRange } from "@/components/currency/Money";
import { priceOnRequestLabel } from "@/lib/format";
import { dailyRateRangeGrosze } from "@/lib/booking/pricing";
import type { FleetState } from "@/lib/fleet/status";
import type { FleetCar } from "@/lib/fleet/types";

function Spec({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  /** Druga linia pod wartością — dziś wyłącznie stawka nadprzebiegu. */
  note?: React.ReactNode;
}) {
  return (
    <div className="px-2 py-3 text-center">
      <p className="label-tight text-ink-faint text-[9px]">{label}</p>
      <p className="text-ink mt-1 text-xs">{value}</p>
      {note ? (
        <p className="text-ink-faint mt-0.5 text-[10px] whitespace-nowrap">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Fleet listing card: photo, model, "from" price, key specs, who the car suits,
 * and a direct booking CTA.
 *
 * The card is deliberately NOT one big <Link> — it holds two distinct
 * destinations (details and booking), and nesting an anchor inside an anchor is
 * invalid HTML. The photo and the heading are the links; hover state is driven
 * from the wrapper via `group`.
 *
 * `headingLevel`: the same card is a list item at two different depths. Under a
 * section heading — the home page's "Nasze modele", a landing page's "Auta
 * dostępne w naszej flocie" — the model name is an H3. On `/fleet` the cards
 * are the page's own top level, directly under its H1, and an H3 there skipped
 * a heading level. Same classes either way, so nothing moves on screen.
 */
export function CarCard({
  car,
  headingLevel = "h3",
  state = null,
  freeForDates = null,
  nextFreeDay = null,
  today,
}: {
  car: FleetCar;
  headingLevel?: "h2" | "h3";
  /**
   * Today's state, from `lib/fleet/status-repo`. `null` when the operator has
   * switched public statuses off, or when the caller has no states to hand —
   * either way the card simply has no status line.
   */
  state?: FleetState | null;
  /** The Availability Engine's verdict for chosen dates; null when none chosen. */
  freeForDates?: boolean | null;
  /** Pierwszy wolny dzień modelu z `getNextFreeDayByModel` — patrz `VehicleStatus`. */
  nextFreeDay?: string | null;
  /** Dzisiejsza data `YYYY-MM-DD`, podana przez stronę. */
  today?: string;
}) {
  const Heading = headingLevel;
  const t = useTranslations("Fleet");
  const locale = useLocale();
  /*
    JEDEN STATUS NA KARCIE (audyt 02.09.2026, P9).

    Do tego dnia karta potrafiła pokazać naraz dwie pigułki: „ZABLOKOWANY"
    z silnika stanów i „CHWILOWO NIEDOSTĘPNY" z `availableCount`. Dla klienta
    to jedna i ta sama wiadomość powiedziana dwa razy, dwoma różnymi zdaniami,
    z dwóch różnych pól — a przy pierwszej rozbieżności między nimi karta
    zaczyna sama sobie przeczyć.

    Źródłem prawdy zostaje `resolveFleetState`. Napis o wyczerpaniu egzemplarzy
    pojawia się WYŁĄCZNIE tam, gdzie mówi coś, czego stan nie mówi: gdy stan
    brzmi „dostępny", a wynająć nie ma czego. Wtedy zastępuje ten stan, zamiast
    stanąć obok niego — zielone „Dostępny" nad „Chwilowo niedostępny" było
    najgorszym z możliwych połączeń.

    Przy wyłączonych statusach (`state === null`) napis zostaje: przełącznik
    chowa marketingową etykietę stanu, a to jest powód, dla którego rezerwacja
    się nie uda.
  */
  const brakEgzemplarzy = car.availableCount === 0;
  const soldOut = brakEgzemplarzy && (state === null || state === "available");
  const description = locale === "en" ? car.descriptionEn : car.descriptionPl;
  /*
    The advertised price, from the Pricing Engine and nowhere else.

    This card used to print `dailyPriceGrosze` under the word "od". That field
    is the 1–2 day rate — the DEAREST one on the ladder — so "od 890 zł" was the
    most a BMW ever costs, while the same car's own page said 690 zł and the
    assistant quoted 597 zł. Three numbers, one car, and the cheapest of them was
    the honest answer to "from".

    `dailyRateRangeGrosze` reads the same five fields the calculator does and
    skips the ones an administrator has left at zero, which mean "ask me" rather
    than "free". `spans` is false for a car on a flat rate, and then ONE number
    is printed — never an invented "€90–€90" (§11).
  */
  const rates = dailyRateRangeGrosze(car);

  return (
    <article className="group flex flex-col">
      {/* The photo and the heart share one positioning context. The heart has
          to be a SIBLING of the link — a <button> inside an <a> is invalid
          markup, and the tap would navigate as well as toggle. */}
      <div className="relative">
        <div className="bg-surface-2 relative block aspect-[16/10] overflow-hidden">
          {/*
            Zdjęcie NIE jest już odnośnikiem do strony auta.

            Było nim — jako `aria-hidden`, czyli kopia odnośnika z nagłówka,
            niewidoczna dla czytnika ekranu. Dotknięcie zdjęcia otwiera teraz
            pełną galerię tego auta, a na stronę auta prowadzą nazwa modelu
            i dwa przyciski pod spodem. Jedno miejsce, jedno zachowanie — na
            telefonie i na monitorze tak samo.
          */}
          <CarPhotos
            car={car}
            sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
          />
          {/*
            JEDEN rząd na górze zdjęcia, nie dwa niezależne `absolute`.

            Klasa auta stoi po lewej, stan po prawej — i nie mogą na siebie
            wejść, bo nie są już pozycjonowane osobno: układa je ten sam
            `justify-between`. Przy 360 px „Bus 9-osobowy" obok „Niedostępny
            w wybranym terminie" to więcej znaków, niż mieści szerokość kafla,
            i dwa `absolute` nachodziłyby na siebie dokładnie tam, gdzie
            najbardziej boli. Prawa kolumna zawija się zamiast rosnąć w bok.

            `pointer-events-none` na rzędzie: pod spodem jest odnośnik do auta
            i pigułka nie ma prawa zjadać dotknięcia.
          */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-4">
            <span className="label-tight rounded-pill border-line-strong bg-void/60 text-ink shrink-0 border px-3 py-1 text-[10px] backdrop-blur-sm">
              {t(`category.${car.category}`)}
            </span>
            <div className="flex max-w-[62%] flex-col items-end gap-1.5">
              {/*
                Stan pojazdu — prawy górny róg zdjęcia (decyzja właściciela
                z 26.08.2026, zastępuje §28). Serce siedzi w prawym DOLNYM
                rogu, więc te dwa elementy nie konkurują o to samo miejsce.
              */}
              {/*
                Stan pojazdu — prawy górny róg zdjęcia. Ustępuje miejsca
                napisowi o braku egzemplarzy tylko wtedy, gdy sam powiedziałby
                „dostępny" o aucie, którego nie ma czym wydać.
              */}
              {!soldOut && (
                <VehicleStatus
                  state={state}
                  freeForDates={freeForDates}
                  nextFreeDay={nextFreeDay}
                  today={today}
                  variant="onMedia"
                  className="text-right"
                />
              )}
              {soldOut && (
                <span className="label-tight status-scrim rounded-pill text-red px-2.5 py-1 text-[10px]">
                  {t("unavailable")}
                </span>
              )}
            </div>
          </div>
        </div>
        <FavoriteButton carId={car.id} carName={`${car.brand} ${car.model}`} />
      </div>

      <div className="border-line flex flex-1 flex-col border-t pt-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Heading className="font-heading text-ink text-lg font-bold">
              <Link
                href={{ pathname: "/fleet/[slug]", params: { slug: car.slug } }}
                // 21px of line box was 3px under the 24px minimum; the padding
                // is cancelled by the negative margin, so the card is unchanged.
                className="hover:text-silver tap-area -my-1 inline-block py-1 transition-colors"
              >
                {car.brand} {car.model}
              </Link>
            </Heading>
            <p className="label-tight text-ink-faint mt-1 text-[11px]">
              {car.year}
            </p>
          </div>
          {/* An unpriced car says so instead of claiming to cost nothing, and
              the "od …/doba" scaffolding goes with it: "OD / Skontaktuj się z
              managerem / doba" is three fragments pretending to be a price.
              The sentence stands on its own, and is sized down to sit on one
              line beside the model name. */}
          <div className="shrink-0 text-right">
            {rates.minGrosze > 0 ? (
              <>
                {/* A range says "od" only when it has one end. With both ends
                    shown the word is redundant and, worse, wrong — 345–430 zł
                    does not start at 345 and go up for ever. */}
                {!rates.spans && (
                  <p className="label-tight text-ink-faint text-[10px]">
                    {t("from")}
                  </p>
                )}
                {/* `text-lg` for a range, `text-xl` for a single figure: two
                    prices and a dash need the extra glyphs to fit beside the
                    model name at 360px without the column wrapping. */}
                <p
                  className={`font-heading text-ink font-bold ${
                    rates.spans ? "text-lg" : "text-xl"
                  }`}
                >
                  {rates.spans ? (
                    <MoneyRange
                      minGrosze={rates.minGrosze}
                      maxGrosze={rates.maxGrosze}
                    />
                  ) : (
                    <Money grosze={rates.minGrosze} />
                  )}
                </p>
                <p className="label-tight text-ink-faint text-[10px]">
                  / {t("perDay")}
                </p>
                {/* Why the price has two ends, in five words. Without it a range
                    reads as uncertainty about what the car costs, rather than as
                    the fact that a fortnight is cheaper per day than a weekend. */}
                {rates.spans && (
                  <p className="text-ink-faint mt-1 max-w-28 text-[10px] leading-tight">
                    {t("rateDependsOnDuration")}
                  </p>
                )}
              </>
            ) : (
              <p className="font-heading text-ink max-w-32 text-sm font-bold">
                {priceOnRequestLabel(locale)}
              </p>
            )}
          </div>
        </div>

        {description ? (
          <p className="text-ink-muted mt-4 text-sm leading-relaxed">
            {description}
          </p>
        ) : null}

        <div className="divide-line border-line mt-5 grid grid-cols-4 divide-x border-y">
          <Spec label={t("seats")} value={String(car.seats)} />
          <Spec label={t("gearboxLabel")} value={t(`gearbox.${car.gearbox}`)} />
          <Spec label={t("fuelLabel")} value={t(`fuel.${car.fuel}`)} />
          {/*
            Stawka nadprzebiegu jako DRUGA LINIA w komórce limitu, nie jako
            piąta kolumna. Pasek ma cztery kolumny i na 360 px każda dostaje
            około osiemdziesięciu pikseli — piąta zmiażdżyłaby wszystkie.
            Druga linia rośnie w dół, gdzie miejsce jest.

            `+` z przodu, bo to dopłata do ceny obok, a nie kolejna cena.
          */}
          <Spec
            label={t("kmLimit")}
            value={
              car.kmPerDayLimit === 0
                ? t("kmUnlimited")
                : String(car.kmPerDayLimit)
            }
            note={
              car.kmPerDayLimit > 0 && car.extraMileageFeeGrosze != null ? (
                <>
                  +
                  <Money
                    grosze={car.extraMileageFeeGrosze}
                    approx={false}
                    dokladnie
                  />
                  /km
                </>
              ) : undefined
            }
          />
        </div>

        <div className="text-ink-muted mt-4 flex items-center justify-between gap-4 text-xs">
          {/* The monthly rate is the one most often left unset — a long lease
              is negotiated, not listed. Drop the "Miesięcznie" label with it,
              so the line reads as a sentence rather than a broken field. */}
          <span>
            {car.monthlyPriceGrosze > 0 ? (
              <>
                {t("perMonth")} <Money grosze={car.monthlyPriceGrosze} />
              </>
            ) : (
              priceOnRequestLabel(locale)
            )}
          </span>
          <span>
            {/* The deposit converts too. It is the largest number on the card
                and the one a foreign visitor most needs in their own currency —
                it is also, of course, taken in złoty like everything else. */}
            {t("deposit")} <Money grosze={car.depositGrosze} />
          </span>
        </div>

        {/*
          DWA PRZYCISKI, DWA RÓŻNE MIEJSCA.

          Do 04.09.2026 oba prowadziły dokładnie tam samo — na górę strony auta.
          „Zarezerwuj" obiecywał więc ostatni krok, a dawał ten sam pierwszy, co
          „Zobacz szczegóły" obok; na telefonie formularz rezerwacji leżał
          jeszcze dwa i pół ekranu niżej.

          Teraz „Zarezerwuj" idzie prosto do `#rezerwacja`, a „Zobacz
          szczegóły" — na górę strony, do zdjęć i danych. Kotwica jest ta sama
          w PL i EN, bo jest identyfikatorem elementu, nie tłumaczoną częścią
          adresu, i działa też jako odnośnik wklejony z zewnątrz.
        */}
        <div className="mt-auto flex items-center gap-4 pt-5">
          <ButtonLink
            href={{ pathname: "/fleet/[slug]", params: { slug: car.slug } }}
            hash="rezerwacja"
            size="sm"
          >
            {t("book")}
          </ButtonLink>
          <Link
            href={{ pathname: "/fleet/[slug]", params: { slug: car.slug } }}
            // py-2 lifts an 18px line of text to a 34px target, level with the
            // button beside it. The row is items-center, so nothing moves.
            className="label-tight text-silver hover:text-ink tap py-2 text-[11px] transition-colors"
          >
            {t("viewCar")} →
          </Link>
        </div>

        {/*
          Stanu NIE MA już na dole karty — przeniósł się na zdjęcie, w prawy
          górny róg. Zostawienie go w obu miejscach dawałoby dwa napisy o tym
          samym na jednym kaflu, a to jest dokładnie ten rozjazd, przed którym
          `VehicleStatus` ma chronić.
        */}
      </div>
    </article>
  );
}
