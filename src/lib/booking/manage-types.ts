/**
 * Typy wspólne dla zarządzania rezerwacją.
 *
 * ## Dlaczego osobny plik
 *
 * Te kształty są potrzebne w TRZECH miejscach: w rdzeniu (`manage-core.ts`,
 * `server-only`), w akcjach (`manage.ts`, `"use server"`) i w komponencie
 * klienckim. Pierwsza wersja re-eksportowała je z pliku akcji — i to był błąd,
 * który wywrócił stronę „Moje rezerwacje" pięćsetką:
 *
 *     ReferenceError: BladZmiany is not defined
 *
 * W module z dyrektywą `"use server"` każdy eksport dostaje wiązanie
 * W CZASIE WYKONANIA, bo ma być punktem końcowym. Nazwa typu, która po
 * kompilacji nie istnieje, zostaje wtedy jako odwołanie do niczego. Typy nie
 * mają czego szukać w pliku akcji; tu mają.
 *
 * Ten plik nie importuje niczego serwerowego, więc wolno go czytać także
 * komponentowi klienckiemu.
 */

/** Statusy, w których sprawa jest OTWARTA i wolno nią zarządzać. */
export const OTWARTE = [
  "pending_verification",
  "pending",
  "confirmed",
] as const;

export type SzczegolyRezerwacji = {
  reference: string;
  carName: string;
  carSlug: string;
  startDate: string;
  endDate: string;
  pickupTime: string;
  returnTime: string;
  days: number;
  locationName: string;
  totalGrosze: number;
  depositGrosze: number;
  status: (typeof OTWARTE)[number] | "cancelled" | "completed" | "rejected";
  /**
   * Dokumenty udostępnione TEJ rezerwacji — punkt 16.
   *
   * Konkretne WERSJE, nie „aktualny regulamin": klient ma widzieć to, co
   * dostał przy potwierdzeniu, także wtedy, gdy regulamin zmienił się
   * nazajutrz. Pusta lista, dopóki firma nie wgra ani jednego dokumentu.
   */
  dokumenty: {
    id: string;
    title: string;
    /** Adres czytnika, już z numerem rezerwacji i kluczem. */
    url: string;
    version: number;
  }[];
  /** Czy do odbioru zostało WIĘCEJ niż 24 h — jedyne źródło prawdy dla widoku. */
  moznaZarzadzac: boolean;
  /** Ile godzin zostało do odbioru; ujemne, gdy odbiór już minął. */
  doOdbioruH: number;
  /** Godziny, które da się wybrać przy zmianie — te same, co w formularzu. */
  dostepneGodziny: string[];
};

export type WynikDostepu<T> =
  | { ok: true; dane: T }
  | { ok: false; powod: "brak_dostepu" | "zamknieta" | "za_pozno" | "blad" };

export type PropozycjaZmiany = {
  stare: {
    startDate: string;
    endDate: string;
    pickupTime: string;
    returnTime: string;
    days: number;
    totalGrosze: number;
    depositGrosze: number;
  };
  nowe: {
    startDate: string;
    endDate: string;
    pickupTime: string;
    returnTime: string;
    days: number;
    totalGrosze: number;
    depositGrosze: number;
  };
  /** Różnica ceny w groszach: dodatnia = klient dopłaca. */
  roznicaGrosze: number;
  cenaSieZmienia: boolean;
};

export type BladZmiany =
  | "brak_dostepu"
  | "zamknieta"
  | "za_pozno"
  | "zly_termin"
  | "lead_time"
  | "zajete"
  | "cena_na_zapytanie"
  | "bez_zmian"
  | "blad";

export type WynikPropozycji =
  | { ok: true; dane: PropozycjaZmiany }
  | { ok: false; powod: BladZmiany; szczegol?: number };

/**
 * Ile kosztuje anulowanie TEJ rezerwacji, gdyby nastąpiło teraz.
 *
 * Liczone WYŁĄCZNIE na serwerze i podawane klientowi do przeczytania. Ekran
 * anulowania nie ma własnej arytmetyki i mieć jej nie może: kwota, którą klient
 * zobaczy przed potwierdzeniem, i kwota, którą serwer naliczy po potwierdzeniu,
 * pochodzą z jednego wywołania tej samej funkcji.
 */
export type PodgladAnulowania = {
  /** `free` | `tier1` | `tier2` — który próg obowiązuje w tej chwili. */
  tier: "free" | "tier1" | "tier2";
  /** Kwota do zapłaty, w groszach. Zero znaczy „bezpłatnie". */
  kwotaGrosze: number;
  /** Kwota z cennika przed sufitem — różna od `kwotaGrosze` tylko przy sufcie. */
  cennikGrosze: number;
  /** Czy sufit „nie więcej niż wartość rezerwacji" obciął kwotę. */
  ograniczonaWartosciaRezerwacji: boolean;
  /** Godziny do odbioru — żeby ekran mógł powiedzieć, DLACZEGO taka kwota. */
  doOdbioruH: number;
  /** Progi z zapamiętanej polityki, do wyjaśnienia. `null` = stara umowa. */
  progi: { bezplatneH: number; drugiProgH: number } | null;
  /** Wartość rezerwacji — podstawa sufitu. */
  wartoscRezerwacjiGrosze: number;
};

export type WynikPodgladu =
  | { ok: true; dane: PodgladAnulowania }
  | { ok: false; powod: "brak_dostepu" | "zamknieta" | "blad" };

export type WynikAnulowania =
  | { ok: true; kwotaGrosze: number }
  | { ok: false; powod: "brak_dostepu" | "zamknieta" | "blad" };
