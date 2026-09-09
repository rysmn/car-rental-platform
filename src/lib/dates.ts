/**
 * Calendar arithmetic, in one place.
 *
 * Everything here is pure, local-time and string-first: a rental day is a
 * calendar day in Poland, not an instant, so `YYYY-MM-DD` is the type the whole
 * app already passes around — the booking form's inputs, the availability map's
 * keys, the assistant's slots and the reservation row all speak it.
 *
 * The file exists because four components had each grown their own `todayIso()`
 * and their own zero-padding, and the assistant's date picker would have made a
 * fifth. None of them was wrong; having five of them is how they eventually
 * stop agreeing.
 *
 * No `server-only` and no imports: the date picker, the fleet filter and the
 * booking panel are client components, and the parser that reads "w weekend"
 * runs on the server. Both sides have to be able to load this.
 */

/** `YYYY-MM-DD` for a Date, in local time — the calendar day the visitor is in. */
export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Today as `YYYY-MM-DD`. */
export function todayIso(): string {
  return isoOf(new Date());
}

/**
 * `YYYY-MM-DD` → a Date at local midnight.
 *
 * Built from the parts rather than `new Date(iso)`, which parses a bare ISO
 * date as UTC midnight — an hour or two BEFORE local midnight in Poland, so the
 * day would come back as the previous one for anyone west of Greenwich and the
 * calendar would highlight the wrong square.
 */
export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

/** Shift an ISO day by whole days. Month, year and leap years come from `Date`. */
export function addDaysIso(iso: string, n: number): string {
  return isoOf(addDays(fromIso(iso), n));
}

/**
 * Days a rental of this range is billed for — both ends included.
 *
 * The same count as `rentalDays()` in the pricing module, kept as a separate
 * ISO-string helper because the picker has strings and no business asking the
 * pricing module anything. It does NOT price; it is only how the picker knows
 * a 91-day range is over the limit the booking rules already set.
 */
export function inclusiveDays(from: string, to: string): number {
  const a = fromIso(from);
  const b = fromIso(to);
  return (
    Math.round(
      (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
        Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) /
        86_400_000,
    ) + 1
  );
}

/** Monday-first weekday index (Mon = 0 … Sun = 6) — Poland's week. */
export function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/**
 * The coming weekend, Friday to Sunday.
 *
 * Lifted verbatim out of the message parser so the "Ten weekend" button and the
 * sentence "w weekend" can never mean two different things. Its rule: the NEXT
 * Friday — asked on a Friday it means the one in a week, because somebody
 * typing "w weekend" on Friday afternoon about a car is not usually talking
 * about the next few hours.
 */
export function weekendRange(
  today: Date,
  next = false,
): { from: string; to: string } {
  const dow = today.getDay(); // 0 = Sunday
  const toFriday = (5 - dow + 7) % 7;
  const fri = addDays(today, (toFriday === 0 ? 7 : toFriday) + (next ? 7 : 0));
  return { from: isoOf(fri), to: isoOf(addDays(fri, 2)) };
}

/** "22.08.2026" in Polish, "22/08/2026" in English. */
export function formatDay(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(fromIso(iso));
}

/** "22.08.2026 → 25.08.2026". */
export function formatRange(from: string, to: string, locale: string): string {
  return `${formatDay(from, locale)} → ${formatDay(to, locale)}`;
}

/**
 * Dwuliterowe nagłówki kolumn kalendarza, od poniedziałku.
 *
 * TABLICA, NIE `Intl.…format().slice(0, 2)` — i to jest cała poprawka
 * z 05.09.2026. Oba kalendarze (`DateRangePicker` i `AvailabilityCalendar`)
 * brały krótką nazwę dnia z `Intl` i ucinały ją do dwóch znaków. Dla
 * angielskiego wychodziło z tego „Mo Tu We Th Fr Sa Su" i nikt niczego nie
 * zauważył. Dla polskiego `Intl` oddaje „pon., wt., śr., czw., pt., sob.,
 * niedz.", więc po ucięciu na produkcji stało:
 *
 *     po  wt  śr  cz  pt  so  ni
 *
 * Zmierzone 05.09.2026 na żywej stronie przy 360, 375, 390 i 430 px — na
 * każdej z tych szerokości tak samo, bo to nie jest usterka układu, tylko
 * nazw. Polski kalendarz pisze „Pn" i „Nd"; „po" i „ni" nie są skrótami
 * żadnego polskiego dnia i czytają się jak literówka.
 *
 * Ucinanie cudzej lokalizacji do stałej liczby znaków nie ma prawa dać
 * poprawnego skrótu w żadnym języku — daje go przypadkiem tam, gdzie skrót
 * i tak zaczyna się tak samo. Stąd jawna tablica: siedem pozycji na język,
 * widać je w całości i nie zmienią się przy podmianie ICU w obrazie.
 *
 * PEŁNA nazwa dnia zostaje przy `Intl` i jedzie dalej do `aria-label` —
 * czytnik ekranu ma mówić „poniedziałek", nie „Pn".
 */
const SKROTY_DNI: Record<"pl" | "en", readonly string[]> = {
  // Poniedziałek → niedziela, skróty zatwierdzone przez właściciela 05.09.2026.
  pl: ["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"],
  /*
    Angielski trzyliterowy, nie dwuliterowy — też decyzja właściciela.
    Zmierzone przed zmianą, bo trzy znaki w siedmiu kolumnach to pytanie
    o miejsce, a nie o gust: przy 360 px kolumna ma 43,4 px, a najszersza
    etykieta („Wed") 22,6 px. Zapas jest niemal dwukrotny, więc nic się nie
    zawija ani nie wychodzi poza siatkę.
  */
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

export function weekdayInitials(locale: string): readonly string[] {
  return locale === "en" ? SKROTY_DNI.en : SKROTY_DNI.pl;
}
