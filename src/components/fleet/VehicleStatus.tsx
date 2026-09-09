import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import {
  FLEET_STATE_DOT,
  FLEET_STATE_DOT_ON_MEDIA,
  FLEET_STATE_TEXT,
  FLEET_STATE_TEXT_ON_MEDIA,
  SALES_TONE_STATE,
  availableForDatesLabel,
  salesStatusView,
  unavailableForDatesLabel,
  type FleetState,
} from "@/lib/fleet/status";

/**
 * The one status line, drawn the same way everywhere it appears.
 *
 * A dot and a word, both in the state's colour — §30 asks for the whole label to
 * carry it, not only the mark, and one component is the only way five surfaces
 * stay identical after the next redesign.
 *
 * ## Dwa warianty, jeden komponent
 *
 * `onMedia` leży na fotografii, w prawym górnym rogu — decyzja właściciela
 * z 26.08.2026, która zastępuje wcześniejsze §28 („na dole karty, nie na
 * zdjęciu"). Tam, gdzie klient patrzy na auto, ma od razu widzieć, czy może je
 * dziś wziąć. Pigułka jest mała i rozmyta, a nie pełnym kolorowym plakietem:
 * barwę niesie NAPIS, tło tylko odcina go od zdjęcia.
 *
 * `inline` to poprzedni wygląd — napis bez tła, w kolumnie z ceną. Zostaje dla
 * miejsc bez fotografii; kolumna porównania bez zdjęcia jest dziś jedynym takim
 * miejscem, ale nie ostatnim, jakie ten projekt zobaczy.
 *
 * ## Dates outrank today
 *
 * `freeForDates` is the Availability Engine's answer for a range the visitor
 * actually chose, and when it is `false` it REPLACES the current state rather
 * than sitting beside it. "● Dostępny" next to "niedostępny w Twoim terminie" is
 * the exact contradiction §36 exists to prevent, and the version a customer acts
 * on is always the green one. `null` means no dates were given and no claim
 * about any future date is being made.
 *
 * ## Not a decoration
 *
 * Nothing about a booking is gated on this component. It renders what the state
 * already is; the booking form, the fleet filter and the assistant all ask
 * `lib/booking/availability` themselves. Hiding it (the admin switch) therefore
 * cannot let a booking through that would otherwise have been refused.
 */
export function VehicleStatus({
  state,
  freeForDates = null,
  nextFreeDay = null,
  today,
  className,
  size = "sm",
  variant = "inline",
}: {
  /** Today's state, or null when the operator has hidden statuses. */
  state: FleetState | null;
  /** The Availability Engine's answer for chosen dates; null when none chosen. */
  freeForDates?: boolean | null;
  /**
   * Pierwszy wolny dzień modelu (`YYYY-MM-DD`) z `getNextFreeDayByModel`.
   *
   * `null` znaczy „nie wiem" ALBO „nie ma takiego dnia w oknie" — te dwa
   * przypadki rozróżnia `salesStatusView` po stanie na dziś, a nie tutaj.
   * Nigdy nie liczony w komponencie: data, której nie potwierdził silnik
   * dostępności, jest obietnicą, a nie informacją.
   */
  nextFreeDay?: string | null;
  /**
   * Dzisiejsza data (`YYYY-MM-DD`), podana przez stronę.
   *
   * Podawana, a nie liczona z `new Date()`, bo ten komponent renderuje się i na
   * serwerze (karty floty), i w przeglądarce (porównywarka). Dwa różne zegary
   * albo dwie różne strefy dałyby o północy inny napis po hydratacji, czyli
   * dokładnie to migotanie, którego reszta tego projektu unika.
   */
  today?: string;
  className?: string;
  /** `md` on the car page, where this line is a fact and not a footnote. */
  size?: "sm" | "md";
  /**
   * `onMedia` — pigułka na zdjęciu, stałe barwy i czarna przesłona.
   * `inline` — sam napis, barwy motywowane, na tle strony.
   */
  variant?: "inline" | "onMedia";
}) {
  const locale = useLocale();

  // The dates' "no" is shown even when current statuses are switched off: the
  // switch hides marketing, and this is not marketing — it is the reason a
  // booking would be refused. §45.
  const deniedByDates = freeForDates === false;
  // With statuses switched off the only line that still appears is the refusal.
  // "Free for your dates" is reassurance, and reassurance is exactly what the
  // operator turned off; "taken for your dates" is the reason a booking would
  // fail, and hiding that would let the switch cause a bad reservation.
  if (!state && !deniedByDates) return null;

  /*
    Once dates are on the table, the line is ABOUT those dates.

    "Dostępny" alone is a statement about today, and a visitor who has just
    typed 10–15 September will not read it that way. Amber for taken, green for
    free, and in both cases the sentence names the term so it cannot be mistaken
    for a claim about right now. Amber rather than red for "taken": the car is
    not broken, it is spoken for — which is what `reserved` already means.
  */
  /*
    Bez wybranego terminu mówi zdanie SPRZEDAŻOWE, nie techniczne.

    `salesStatusView` zamienia stan operatora na to, co klient może z tym autem
    zrobić — patrz „Słownik sprzedażowy" w `lib/fleet/status`. Zwraca `null`
    tylko wtedy, gdy stanu nie ma, a ten przypadek odciął już warunek wyżej.
    Barwa idzie przez `SALES_TONE_STATE`, więc pigułka nadal używa wyłącznie
    pięciu zmierzonych kolorów.
  */
  const sales =
    deniedByDates || freeForDates === true
      ? null
      : salesStatusView(state, nextFreeDay, today ?? "", locale);

  const shown: FleetState = deniedByDates
    ? "reserved"
    : freeForDates === true
      ? "available"
      : sales
        ? SALES_TONE_STATE[sales.tone]
        : state!;
  const label = deniedByDates
    ? unavailableForDatesLabel(locale)
    : freeForDates === true
      ? availableForDatesLabel(locale)
      : (sales?.label ?? "");

  const onMedia = variant === "onMedia";

  return (
    <p
      className={cn(
        "label-tight flex items-center gap-2",
        /*
          Rozmiary. Poprzednie 10 px było czytelne na monitorze i za małe
          w ręku — właściciel poprosił o „lekko większe", więc napis na zdjęciu
          idzie na 11 px na karcie i 12 px na stronie auta, gdzie kafel jest
          szeroki na całą stronę. To jest krok, nie skok: plakiet dwa razy
          większy przestałby być informacją, a stałby się naklejką.
        */
        onMedia
          ? size === "md"
            ? "text-xs"
            : "text-[11px]"
          : size === "md"
            ? "text-[11px]"
            : "text-[10px]",
        // Pigułka: przesłona, włos, cień i rozmycie siedzą w jednej klasie CSS,
        // żeby zmierzony kontrast opisywał JEDNO miejsce.
        onMedia && "status-scrim rounded-pill w-fit px-2.5 py-1",
        onMedia ? FLEET_STATE_TEXT_ON_MEDIA[shown] : FLEET_STATE_TEXT[shown],
        className,
      )}
    >
      {/*
        `shrink-0` and a fixed box: the label wraps on a 360px screen when it
        is the long "Niedostępny w wybranym terminie", and a dot allowed to
        squash with it stops being round. `items-center` keeps it on the first
        line rather than centred against two.
      */}
      <span
        aria-hidden
        className={cn(
          "rounded-pill h-1.5 w-1.5 shrink-0 self-center",
          onMedia ? FLEET_STATE_DOT_ON_MEDIA[shown] : FLEET_STATE_DOT[shown],
        )}
      />
      {label}
    </p>
  );
}
