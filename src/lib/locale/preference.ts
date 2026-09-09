"use client";

/**
 * Świadomy wybór języka odwiedzającego, zapamiętany w jego przeglądarce.
 *
 * ## Dlaczego to nie jest przekierowanie po stronie serwera
 *
 * Najprostsza implementacja „inteligentnego startu" — czytać `Accept-Language`
 * na serwerze i odsyłać na `/en` — jest jednocześnie najgorsza dla widoczności.
 * Pod jednym adresem (`/`) zaczęłyby wtedy stać dwie różne treści, zależnie od
 * nagłówka żądania. Googlebot indeksuje z nagłówkiem, na który nie mamy wpływu
 * i który bywa angielski, więc polska strona główna — najcenniejszy adres
 * w całym serwisie — mogłaby zostać zaindeksowana jako angielska. Google
 * wprost odradza automatyczne przekierowania językowe i zaleca zamiast nich
 * `hreflang` plus wybór użytkownika. `hreflang` i `canonical` już tu są
 * i są poprawne (`lib/seo.ts`), więc psucie ich byłoby wymianą czegoś, co
 * działa, na coś, co jest wygodniejsze do napisania.
 *
 * Stąd cała decyzja mieszka w PRZEGLĄDARCE:
 *
 *   1. **Zapamiętany wybór ręczny** — najwyższy priorytet. Jeśli ktoś raz
 *      kliknął „EN", to jest jego odpowiedź i nie pytamy drugi raz.
 *   2. **Język przeglądarki** — tylko jako PROPOZYCJA (pasek „Continue in
 *      English?"), nigdy jako przekierowanie. Propozycja nie zmienia ani
 *      adresu, ani treści, więc nie ma jak zaszkodzić indeksowaniu.
 *   3. **PL** — jeśli nic z powyższych.
 *
 * Robot nie ma `localStorage` z poprzedniej wizyty — jego pamięć jest zawsze
 * pusta — więc krok 1 nie dotyczy go z definicji, a krok 2 to tylko pasek.
 * Innymi słowy: dla wyszukiwarki nic się nie zmienia.
 *
 * ## Dlaczego wybór jest zapamiętany, a nie odczytywany z adresu
 *
 * Adres `/en/...` mówi, w jakim języku jest TA strona, a nie w jakim języku
 * chce czytać ten człowiek. Klient, który przełączył się na angielski, wraca
 * po tygodniu na `aacorporation.pl` i bez zapamiętanego wyboru dostaje znowu
 * polski — czyli pierwsza rzecz, jaką robi na stronie, to szukanie
 * przełącznika, który już raz znalazł.
 */

import type { Locale } from "@/i18n/routing";

/** Wybór świadomy — ustawiany wyłącznie kliknięciem w przełącznik. */
const CHOICE_KEY = "aa.locale.v1";
/** „Nie proponuj mi angielskiego" — pamiętane, żeby pasek nie wracał. */
const DISMISS_KEY = "aa.locale.suggest.dismissed.v1";

const LOCALES = ["pl", "en"] as const;

function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/**
 * Każdy dostęp w `try` — prywatne okno, wyłączone dane witryn i część
 * przeglądarek w trybie prywatnym rzucają wyjątkiem na sam odczyt. Język
 * strony nie jest rzeczą, dla której wolno wywrócić render.
 */
export function readChoice(): Locale | null {
  try {
    const v = localStorage.getItem(CHOICE_KEY);
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeChoice(locale: Locale): void {
  try {
    localStorage.setItem(CHOICE_KEY, locale);
    // Skoro człowiek wybrał sam, propozycja jest już bezprzedmiotowa.
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* pamięć niedostępna — wybór po prostu nie przeżyje wizyty */
  }
}

export function suggestionDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return true; // nie da się zapamiętać odmowy → nie nagabuj
  }
}

export function dismissSuggestion(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* jw. */
  }
}

/**
 * Język, który sugerują ustawienia przeglądarki — albo `null`, gdy nie ma
 * powodu niczego sugerować.
 *
 * Polski w `navigator.languages` NA DOWOLNEJ pozycji oznacza „nie proponuj
 * angielskiego": Polak z systemem po angielsku i polskim jako drugim językiem
 * jest dokładnie tym przypadkiem, o który prosił właściciel — nie chcemy mu
 * podsuwać angielskiej wersji. Odwrotnie: brak polskiego w całej liście to
 * mocny sygnał, że polska strona jest dla tej osoby ścianą tekstu.
 */
export function browserSuggestion(): Locale | null {
  try {
    const langs = navigator.languages?.length
      ? navigator.languages
      : [navigator.language];
    if (!langs?.length) return null;
    const wantsPolish = langs.some((l) => l.toLowerCase().startsWith("pl"));
    return wantsPolish ? "pl" : "en";
  } catch {
    return null;
  }
}
