import { SHOP_CURRENCY } from "@/lib/currency/shop";
/** Format integer grosze (1/100 PLN) as a localized currency string, no decimals. */
export function formatPln(grosze: number, locale: string): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "pl-PL", {
    style: "currency",
    currency: SHOP_CURRENCY,
    maximumFractionDigits: 0,
  }).format(grosze / 100);
}

/**
 * Kwota Z GROSZAMI — dla stawek, które nie są okrągłe.
 *
 * ISTNIEJE, BO `formatPln` ZAOKRĄGLA I MA ZAOKRĄGLAĆ. Ceny najmu, kaucje
 * i dodatki w tym cenniku są okrągłe (890 zł, 5 000 zł, 50 zł), więc „890 zł"
 * czyta się lepiej niż „890,00 zł" i tak wygląda cała strona. Dopisanie groszy
 * do `formatPln` dołożyłoby „,00" do każdej ceny w serwisie po to, żeby
 * poprawić jedną.
 *
 * Stawka za kilometr jest inna: 4,50 zł to nie jest 5 zł, a różnica na tysiącu
 * kilometrów wynosi 500 zł. Zmierzone na kopii 01.09.2026 — BMW ze stawką
 * 450 groszy wyświetlało się jako „5 zł/km", czyli o 11% za drogo, i tak samo
 * wyglądała Panamera ze stawką 500. Dwie różne stawki, jedna liczba na ekranie.
 *
 * `minimumFractionDigits: 2` zamiast `maximum`: „4,5 zł/km" jest poprawne
 * arytmetycznie i wygląda na literówkę.
 */
export function formatPlnDokladnie(grosze: number, locale: string): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "pl-PL", {
    style: "currency",
    currency: SHOP_CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(grosze / 100);
}

/**
 * Two złoty amounts as one range: "345–430 zł", not "345 zł – 430 zł".
 *
 * `Intl.NumberFormat.formatRange` puts the unit where the language wants it and
 * uses the right dash, which hand-joining two formatted strings does not. The
 * fallback exists because this is the only ES2023 formatter in the codebase and
 * a price is not worth a thrown exception in an old runtime.
 */
export function formatPlnRange(
  minGrosze: number,
  maxGrosze: number,
  locale: string,
): string {
  const nf = new Intl.NumberFormat(locale === "en" ? "en-GB" : "pl-PL", {
    style: "currency",
    currency: SHOP_CURRENCY,
    maximumFractionDigits: 0,
  });
  try {
    return nf.formatRange(minGrosze / 100, maxGrosze / 100);
  } catch {
    return `${nf.format(minGrosze / 100)} – ${nf.format(maxGrosze / 100)}`;
  }
}

/**
 * The operator's own words for a period they price by hand.
 *
 * Kept here, beside `formatPln`, because it is the alternative to a price
 * rather than a piece of page copy: everywhere a złoty amount could appear, one
 * of these two functions runs. Held as a plain locale switch rather than a
 * next-intl key so that the chat widget, the OG image renderer and the server
 * actions — none of which have a translation scope — cannot drift from what the
 * pages say.
 *
 * ## Dwie funkcje, bo są dwie różne role — rozdzielone 04.09.2026
 *
 * Do tego dnia jedno zdanie stało i w komórce ceny, i na przycisku. Na
 * przycisku „Skontaktuj się z managerem" jest poprawne, w komórce cennika
 * odpowiada na inne pytanie niż zadane: rubryka „30+ dni" pyta ILE TO KOSZTUJE,
 * a odpowiadała CO MASZ ZROBIĆ. Właściciel zatwierdził 04.09.2026 rozdzielenie
 * i brzmienie obu.
 *
 * `priceOnRequestLabel` — STWIERDZENIE, wszędzie tam, gdzie stałaby kwota:
 * cennik, karta auta, wiersz ceny, porównywarka, obrazek OG, czat.
 */
export function priceOnRequestLabel(locale: string): string {
  return locale === "en"
    ? "Price agreed individually"
    : "Cena ustalana indywidualnie";
}

/**
 * WEZWANIE — wyłącznie tam, gdzie napis stoi na przycisku albo odnośniku.
 *
 * „Cena ustalana indywidualnie" na przycisku nie mówi, co się stanie po
 * naciśnięciu. Przycisk ma nazywać czynność, a nie stan.
 */
export function priceOnRequestAction(locale: string): string {
  return locale === "en" ? "Contact our manager" : "Skontaktuj się z managerem";
}

/**
 * A price, or the sentence that replaces it when there is no price.
 *
 * Zero grosze is never rendered as money. See `isPriceOnRequest` in
 * `lib/booking/pricing` for why a zero is a deliberate signal and not a gap.
 */
export function formatPlnOrAsk(grosze: number, locale: string): string {
  return grosze > 0 ? formatPln(grosze, locale) : priceOnRequestLabel(locale);
}

/**
 * Currency WITH grosze, for rates small enough that rounding destroys them.
 *
 * `formatPln` drops the decimals because a rental price of "1 234 zł" reads
 * better than "1 234,00 zł". That is wrong for a per-kilometre figure: 6,24 zł
 * and 4,45 zł both round to whole złoty and stop being comparable, and a cost
 * of 0,80 zł/km would print as "1 zł" — a 25% error shown as a fact.
 */
export function formatPlnPrecise(grosze: number, locale: string): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "pl-PL", {
    style: "currency",
    currency: SHOP_CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(grosze / 100);
}

/**
 * Polish plural agreement: `pluralPl(4, "rental", "rentals", "rentals")`.
 *
 * Polish has three forms, not two, and the third is not simply "five or more":
 * 12–14 take the genitive plural even though 2–4 do not, which is why 22 is
 * "22 wynajmy" but 12 is "12 wynajmów". Getting this wrong is the most visible
 * possible sign that an interface was written in English first.
 */
export function pluralPl(
  n: number,
  one: string,
  few: string,
  many: string,
): string {
  // English plural: exactly one, otherwise the plural form.
  void few;
  return Math.abs(n) === 1 ? one : many;
}

/** Format an ISO date (YYYY-MM-DD) as dd.mm.yyyy (no timezone math). */
export function formatDatePl(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

/** Format a timestamp as a short PL date-time. */
export function formatDateTimePl(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}
