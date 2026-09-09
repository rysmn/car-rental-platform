/**
 * Które zdjęcie auta otwiera galerię — zależnie od motywu strony.
 *
 * ## Zasada
 *
 * Motyw ciemny pokazuje zdjęcie nr 1, jasny — zdjęcie nr 2. Auto z jednym
 * zdjęciem pokazuje je w obu motywach; brak drugiego zdjęcia cofa do
 * pierwszego, nigdy do pustego miejsca.
 *
 * ## Dlaczego to jest zamiana POZYCJI, a nie przewinięcie taśmy
 *
 * Kuszące jest przewinąć galerię do drugiego kadru po wczytaniu strony. To
 * jednak znaczy: przeglądarka maluje zdjęcie nr 1 z odpowiedzi serwera, potem
 * React się budzi i podmienia kadr. Klient w jasnym motywie widzi mrugnięcie
 * — tym dłuższe, im wolniejsze łącze. Zamówienie zabrania tego wprost.
 *
 * Serwer nie ma jak poznać motywu: `data-theme` powstaje dopiero w przeglądarce,
 * ze `localStorage` albo z ustawienia systemu. Odpowiedź serwera musi więc być
 * JEDNA dla obu motywów, a różnicę robić CSS — który działa przed pierwszym
 * malowaniem, bo `data-theme` jest ustawiane skryptem w `<head>` wcześniej niż
 * cokolwiek zdąży się pojawić na ekranie.
 *
 * Ten sam chwyt nosi już logo i zdjęcie hero (`hero-photo--dark/--light`
 * w `globals.css`). To jest ten wzorzec, nie drugi obok niego.
 *
 * ## Dlaczego zamiana, a nie „w jasnym zacznij od drugiego"
 *
 * Bo taśma jest przewijana palcem i jej kadry są POZYCJAMI, nie zdjęciami.
 * Gdyby jasny motyw zaczynał od drugiego zdjęcia przez przesunięcie całej
 * listy, kadr nr 1 zostałby pusty albo lista skróciłaby się o jedno zdjęcie —
 * a wszystkie mają pozostać dostępne. Zamiana dwóch pierwszych pozycji
 * zachowuje ich liczbę, kolejność pozostałych i cały mechanizm przewijania:
 * numeracja kadrów, kropki, licznik i miniatury liczą POZYCJE i nie muszą
 * wiedzieć o motywie nic a nic.
 *
 * Kolejność zapisana przez Admina i w bazie pozostaje nietknięta. To jest
 * wyłącznie to, co widać.
 */

/** Pozycja w taśmie, od której zaczyna motyw ciemny. */
export const START_DARK = 0;
/** Pozycja w taśmie, od której zaczyna motyw jasny — gdy jest co pokazać. */
export const START_LIGHT = 1;

/**
 * Który INDEKS zdjęcia siedzi na danej POZYCJI taśmy w danym motywie.
 *
 * Zamiana dwóch pierwszych i nic poza tym. Funkcja jest swoją własną
 * odwrotnością — ta sama liczy „gdzie jest zdjęcie" i „co jest w tym miejscu",
 * więc nie ma dwóch przepisów, które mogłyby się kiedyś rozjechać.
 */
export function zdjecieNaPozycji(pozycja: number, jasny: boolean): number {
  if (!jasny) return pozycja;
  if (pozycja === START_DARK) return START_LIGHT;
  if (pozycja === START_LIGHT) return START_DARK;
  return pozycja;
}

/**
 * Ta sama lista w kolejności, w jakiej klient ją WIDZI.
 *
 * Potrzebna wyłącznie tam, gdzie coś musi się zgodzić z ekranem po kliknięciu
 * — czyli w pełnoekranowej galerii. Kliknięcie zdarza się długo po tym, jak
 * przeglądarka pozna motyw, więc tutaj wolno o niego zapytać JavaScriptem.
 */
export function kolejnoscDlaMotywu<T>(lista: readonly T[], jasny: boolean): T[] {
  if (!jasny || lista.length < 2) return [...lista];
  const wynik = [...lista];
  [wynik[START_DARK], wynik[START_LIGHT]] = [
    wynik[START_LIGHT],
    wynik[START_DARK],
  ];
  return wynik;
}
