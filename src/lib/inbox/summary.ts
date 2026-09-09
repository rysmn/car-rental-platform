import type { LeadReason, LeadStatus, RequestSource } from "@/lib/db/schema";
import { REASON_LABEL, SOURCE_LABEL } from "./labels";

/**
 * PODSUMOWANIE SPRAWY — to, co operator czyta ZANIM zadzwoni.
 *
 * Powód istnienia: lead z czatu, który jest wyłącznie transkryptem, zmusza
 * obsługę do przeczytania czternastu wiadomości, żeby dowiedzieć się, że
 * klient chce RAV4 na pierwszy tydzień września z Chopina. Klient wyjaśnił to
 * raz — i to jest ta jedna rzecz, której nie powinien tłumaczyć drugi raz przez
 * telefon.
 *
 * JEDNA DEFINICJA, DWA WIDOKI. Te same linie idą do karty w panelu i do
 * powiadomienia e-mail. Gdyby każdy z nich układał je sobie sam, mail i panel
 * mówiłyby o tej samej sprawie dwie różne rzeczy w tydzień po pierwszej
 * zmianie — a operator, który przeczytał maila, otwierałby panel po to, żeby
 * zobaczyć coś innego.
 *
 * Czysta funkcja bez bazy i bez `server-only`: renderują ją komponent
 * kliencki i wysyłka poczty po stronie serwera.
 */

export type LeadFacts = {
  name: string | null;
  phone: string | null;
  email: string | null;
  car: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  location: string | null;
  seats: number | null;
  /** Górna granica budżetu w groszach — na dobę, chyba że `budgetKind` mówi inaczej. */
  budgetGrosze: number | null;
  /** Dolna granica, gdy klient podał widełki. */
  budgetMinGrosze: number | null;
  /** `day` | `total` — czego dotyczą kwoty. Puste znaczy „na dobę". */
  budgetKind: string | null;
  /** `pln` | `eur` — waluta, w której klient to powiedział. */
  budgetCurrency: string | null;
  /** Kurs użyty przy przeliczeniu z euro, w złotych za euro. */
  budgetPlnPerEur: string | null;
  locale: string | null;
  subject: string | null;
  question: string | null;
  reason: LeadReason | null;
  company: string | null;
  /** `vehicle` | `fleet` | `strategic` | `unsure` — patrz `PARTNER_MODEL_LABEL`. */
  partnerModel: string | null;
  investRange: string | null;
  source: RequestSource;
  status: LeadStatus;
  reservationRef: string | null;
};

export type SummaryLine = { label: string; value: string };

/**
 * Modele współpracy po ludzku. Klucz spoza listy daje `undefined`, więc
 * wartość, której nie znamy, po prostu nie dostaje linii — zamiast wyświetlić
 * operatorowi surowe `strategic` albo pustą etykietę.
 */
export const PARTNER_MODEL_LABEL: Record<string, string> = {
  vehicle: "Partner pojazdowy — wnosi konkretny samochód",
  fleet: "Inwestor flotowy — udział w rozwoju floty",
  strategic: "Partner strategiczny — szersza współpraca",
  unsure: "Do ustalenia — prosi o rozmowę",
};

const dmy = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}.${m}.${y}` : iso;
};

/**
 * Budżet klienta jednym wierszem — dokładnie tak, jak go powiedział.
 *
 * Trzy rzeczy muszą się tu zgadzać, bo każda z nich zmienia kwotę, którą
 * operator wymieni w rozmowie:
 *
 *  · **jedna granica czy widełki** — „do 400" i „od 200 do 400" to nie to samo
 *    zapytanie i nie ta sama półka;
 *  · **doba czy cały wynajem** — „1500 zł" na tydzień to 214 zł za dobę.
 *    Wypisanie tego jako „do 1500 zł/doba" kazałoby oddzwonić z ceną pięć razy
 *    wyższą, niż klient miał na myśli;
 *  · **waluta, w której padło** — filtrujemy w złotych i to złote są w wierszu,
 *    ale klient pamięta swoją liczbę w euro. Kurs w nawiasie sprawia, że
 *    tydzień później ta sama kwota nadal daje się wytłumaczyć.
 *
 * Puste `budget_kind` znaczy „na dobę" — tak wyglądały wszystkie wiersze
 * sprzed migracji 0039 i tak też były wtedy czytane.
 */
export function formatBudgetPl(lead: {
  budgetGrosze: number | null;
  budgetMinGrosze: number | null;
  budgetKind: string | null;
  budgetCurrency: string | null;
  budgetPlnPerEur: string | null;
}): string | null {
  const { budgetGrosze: max, budgetMinGrosze: min } = lead;
  if (max === null && min === null) return null;

  const zl = (grosze: number) => `${Math.round(grosze / 100)} zł`;
  const unit = lead.budgetKind === "total" ? "za całość" : "za dobę";

  const amount =
    min !== null && max !== null
      ? `${zl(min)}–${zl(max)}`
      : max !== null
        ? `do ${zl(max)}`
        : `od ${zl(min as number)}`;

  // Klient podał w euro: pokazujemy przelicznik, żeby liczba w złotych dała
  // się z jego liczbą pogodzić. Kurs tylko wtedy, gdy go zapisaliśmy.
  const euro =
    lead.budgetCurrency === "eur"
      ? lead.budgetPlnPerEur
        ? ` · podane w EUR, kurs ${lead.budgetPlnPerEur}`
        : " · podane w EUR"
      : "";

  return `${amount} ${unit}${euro}`;
}

/**
 * Ułóż podsumowanie z tego, co WIADOMO. Pole bez wartości nie dostaje linii.
 *
 * Świadomie nie ma tu wierszy „Samochód: —" ani „Termin: nie podano".
 * Podsumowanie ma się czytać w trzy sekundy, a puste etykiety to trzy czwarte
 * wysokości karty poświęcone na powiedzenie, że nic nie wiemy.
 */
export function summarise(lead: LeadFacts): SummaryLine[] {
  const lines: SummaryLine[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value) lines.push({ label, value });
  };

  add("Klient", lead.name);
  add("Firma", lead.company);
  add("Sprawa", lead.reason ? REASON_LABEL[lead.reason] : null);
  /*
   * Model współpracy i zakres stoją TUŻ POD sprawą, a nie na końcu listy:
   * przy zgłoszeniu partnerskim to są dwie pierwsze rzeczy, które operator
   * musi wiedzieć, zanim oddzwoni. Puste nie zajmują miejsca — jak wszystko
   * inne w tym podsumowaniu.
   */
  add("Model współpracy", PARTNER_MODEL_LABEL[lead.partnerModel ?? ""] ?? null);
  add("Zakres", lead.investRange);
  add("Temat", lead.subject);
  add("Samochód", lead.car);

  if (lead.dateFrom) {
    add(
      "Termin",
      lead.dateTo
        ? `${dmy(lead.dateFrom)} → ${dmy(lead.dateTo)}`
        : `od ${dmy(lead.dateFrom)}`,
    );
  }

  /*
   * ODBIÓR I ZWROT to w tym systemie JEDEN punkt i tak jest napisane wprost.
   *
   * Ani rezerwacja, ani rozmowa nie mają osobnego miejsca zwrotu — cała firma
   * wynajmuje z odbiorem i zwrotem w tym samym punkcie i taka jest kolumna
   * `reservations.pickup_location_id`, jedyna, jaka istnieje. Wypisanie
   * „Zwrot: —" sugerowałoby, że gdzieś tę informację zgubiliśmy; wypisanie
   * osobnego miejsca zwrotu byłoby wymyśleniem faktu. Zdanie niżej mówi to,
   * co jest prawdą, i nie udaje pola formularza.
   */
  if (lead.location) {
    lines.push({ label: "Odbiór i zwrot", value: lead.location });
  }

  if (lead.seats !== null) add("Osoby", String(lead.seats));
  add("Budżet", formatBudgetPl(lead));

  const contact = [lead.phone, lead.email].filter(Boolean).join(" · ");
  add("Kontakt", contact || null);
  /* Język oddzwonienia. Polski jest domyślny, więc wypisujemy tylko wyjątek. */
  if (lead.locale && lead.locale !== "pl") {
    add("Język", lead.locale.toUpperCase());
  }
  add("Rezerwacja", lead.reservationRef);
  add("Kanał", SOURCE_LABEL[lead.source] ?? lead.source);

  return lines;
}

/** To samo podsumowanie jako tekst — do treści powiadomienia e-mail. */
export function summariseAsText(lead: LeadFacts): string {
  const body = summarise(lead)
    .map((l) => `${l.label}: ${l.value}`)
    .join("\n");
  return lead.question ? `${body}\n\nPytanie klienta:\n${lead.question}` : body;
}

/**
 * Jednozdaniowy tytuł sprawy, gdy klient nie nadał jej własnego.
 *
 * Zgłoszenie z czatu nie ma pola „temat" — nikt go o to nie pytał i nie ma
 * powodu pytać, skoro rozmowa już to mówi. Układamy go z tego, co wiadomo:
 * czego sprawa dotyczy plus samochód, jeśli jakiś padł.
 */
export function subjectFor(lead: {
  reason: LeadReason | null;
  car: string | null;
  subject: string | null;
}): string {
  if (lead.subject) return lead.subject;
  const what = lead.reason ? REASON_LABEL[lead.reason] : "Zapytanie";
  return lead.car ? `${what} — ${lead.car}` : what;
}
