import "server-only";

/**
 * Limity częstotliwości — jedno przesuwane okno, wiele nazwanych wiader.
 *
 * ## Dlaczego jeden moduł zamiast trzech kopii
 *
 * Do 27.08.2026 w projekcie były DWA liczniki napisane osobno: w `api/chat`
 * i w `inbox/actions`. Trzeci — dla formularza rezerwacji — nie istniał wcale,
 * i to jest dokładnie ta luka, którą zamawia rozdział 13.1. Czwarta kopia tego
 * samego kodu byłaby czwartym miejscem, w którym trzeba pamiętać o czyszczeniu
 * mapy.
 *
 * ## Dlaczego w pamięci procesu, a nie w bazie
 *
 * Ta decyzja jest już w tym projekcie zapisana przy limicie logowania i przy
 * czacie, i zostaje: licznik w pamięci ZAPOMINA przy restarcie, więc żaden błąd
 * w progu ani żaden atak nie potrafi zamknąć drzwi na stałe. Cena jest znana
 * i przyjęta — przy wielu procesach limit jest odpowiednio wielokrotnie
 * luźniejszy, a po wdrożeniu zaczyna liczyć od zera. Do powstrzymania skryptu,
 * który zasypuje formularz, to wystarcza; przed rozproszonym atakiem broni
 * warstwa sieci, a nie ta funkcja, i ten plik tego nie udaje.
 *
 * ## Dlaczego nie po samym adresie IP
 *
 * Zamówienie mówi wprost: „nie polegaj tylko na IP". Adres jest wspólny dla
 * całego biura, całej sieci komórkowej i całego hotelu, a jednocześnie zmienia
 * się temu, kto chce go zmienić. Dlatego `limit()` przyjmuje LISTĘ kluczy
 * i odrzuca żądanie, gdy PRZEKROCZONY JEST KTÓRYKOLWIEK z nich — adres,
 * identyfikator przeglądarki, adres e-mail. Każdy z nich osobno da się obejść,
 * ale każdy kosztuje atakującego coś innego.
 */

type Wiadro = { czasy: number[] };

const wiadra = new Map<string, Wiadro>();

/** Ile kluczy trzymamy, zanim zaczniemy sprzątać. Sprzątanie jest leniwe. */
const MAX_KLUCZY = 20_000;

function posprzataj(teraz: number, oknoMs: number) {
  if (wiadra.size <= MAX_KLUCZY) return;
  for (const [klucz, w] of wiadra) {
    if (w.czasy.every((t) => teraz - t >= oknoMs)) wiadra.delete(klucz);
  }
  // Gdy nadal jest ciasno, mapa idzie w całości. Limit ma chronić pamięć
  // procesu, a nie zamienić się w jej największego konsumenta.
  if (wiadra.size > MAX_KLUCZY) wiadra.clear();
}

export type Regula = {
  /** Nazwa wiadra — trafia do klucza, więc dwa limity się nie mieszają. */
  nazwa: string;
  /** Ile żądań wolno w oknie. */
  ile: number;
  /** Długość okna w milisekundach. */
  oknoMs: number;
};

export type WynikLimitu = {
  /** `true` = przekroczono, żądanie należy odrzucić. */
  przekroczony: boolean;
  /** Klucz, który się przelał — do dziennika, już bez wartości surowej. */
  ktory: string | null;
  /** Za ile sekund najwcześniej wolno spróbować ponownie. */
  zaSekund: number;
};

/**
 * Sprawdź i ZLICZ jedno żądanie.
 *
 * Zliczenie następuje także wtedy, gdy limit jest już przekroczony — inaczej
 * przerwa w dobijaniu się resetowałaby okno szybciej niż upływ czasu.
 */
export function limit(
  regula: Regula,
  klucze: (string | null | undefined)[],
): WynikLimitu {
  const teraz = Date.now();
  let przekroczony = false;
  let ktory: string | null = null;
  let najblizszy = 0;

  for (const surowy of klucze) {
    if (!surowy) continue;
    const klucz = `${regula.nazwa}:${surowy}`;
    const wiadro = wiadra.get(klucz) ?? { czasy: [] };
    const czasy = wiadro.czasy.filter((t) => teraz - t < regula.oknoMs);
    czasy.push(teraz);
    wiadra.set(klucz, { czasy });

    if (czasy.length > regula.ile) {
      przekroczony = true;
      if (!ktory) ktory = klucz;
      const najstarszy = czasy[0];
      najblizszy = Math.max(
        najblizszy,
        Math.ceil((regula.oknoMs - (teraz - najstarszy)) / 1000),
      );
    }
  }

  posprzataj(teraz, regula.oknoMs);
  return { przekroczony, ktory, zaSekund: najblizszy };
}

/** Wyłącznie do testów: czyści wszystkie wiadra. */
export function resetLimity() {
  wiadra.clear();
}

/**
 * Progi używane w projekcie, w jednym miejscu, żeby dały się przeczytać razem.
 *
 * Dobrane tak, żeby normalny klient nigdy ich nie zobaczył. Rezerwacja to
 * czynność, którą człowiek wykonuje raz, może dwa razy pod rząd, gdy się
 * rozmyśli; pięć na godzinę z jednego adresu to już nie jest klient.
 * Zapytanie ze skrzynki jest tańsze w wysłaniu, więc ma próg wyższy.
 */
export const REGULY = {
  rezerwacja: { nazwa: "rezerwacja", ile: 5, oknoMs: 60 * 60_000 },
  rezerwacjaSzybka: { nazwa: "rezerwacja-min", ile: 2, oknoMs: 60_000 },
  zapytanie: { nazwa: "zapytanie", ile: 10, oknoMs: 60 * 60_000 },
  zapytanieSzybkie: { nazwa: "zapytanie-min", ile: 3, oknoMs: 60_000 },
  potwierdzenie: { nazwa: "potwierdzenie", ile: 20, oknoMs: 60 * 60_000 },
  /** Publiczne API floty — patrz `security/scraping.ts`. */
  publiczne: { nazwa: "publiczne", ile: 240, oknoMs: 60_000 },
} satisfies Record<string, Regula>;
