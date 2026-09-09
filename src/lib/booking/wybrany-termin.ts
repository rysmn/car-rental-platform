/**
 * Termin wybrany przez klienta — jedno miejsce, z którego czytają oba widoki.
 *
 * ## Po co to istnieje
 *
 * Na stronie auta stoją DWA komponenty, które mówią o tych samych datach:
 * kalendarz dostępności i formularz rezerwacji. Są rodzeństwem w drzewie —
 * żaden nie zawiera drugiego — więc nie mają jak przekazać sobie stanu przez
 * właściwości. Rodzicem jest komponent serwerowy, który stanu klienta trzymać
 * nie może.
 *
 * Bez tego mostu dało się doprowadzić do sytuacji, przed którą zamówienie
 * ostrzega wprost: kalendarz pokazuje 10–15, a formularz ma 12–18.
 *
 * ## Dlaczego nie kontekst Reacta
 *
 * Kontekst wymagałby opakowania obu komponentów wspólnym dostawcą, czyli
 * przerobienia strony serwerowej na klienta albo dołożenia trzeciego
 * komponentu tylko po to, żeby coś obejmował. Projekt ma już ten sam problem
 * rozwiązany dla „moich rezerwacji" (`lib/booking/my-reservations.ts`)
 * i rozwiązuje go tak samo: mały magazyn zewnętrzny czytany przez
 * `useSyncExternalStore`.
 *
 * ## Czego tu nie ma
 *
 * Ani jednej reguły. To jest pudełko na dwie daty — nie wie nic o dostępności,
 * cenach ani o minimum trzech godzin. Wszystkie te rzeczy rozstrzygają dalej te
 * same funkcje co dotąd, a serwer i tak sprawdza wszystko po swojemu.
 */

export type WybranyTermin = {
  from: string | null;
  to: string | null;
};

/*
  Jedna zamrożona wartość dla stanu pustego.

  `useSyncExternalStore` porównuje przez `Object.is`; świeży obiekt przy każdym
  odczycie dawałby nową tożsamość i pętlę renderowania. Ten sam powód, dla
  którego `my-reservations` trzyma `UNKNOWN_REFS`.
*/
const PUSTY: WybranyTermin = Object.freeze({ from: null, to: null });

let stan: WybranyTermin = PUSTY;
const listeners = new Set<() => void>();

export function subscribeWybranyTermin(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function getWybranyTermin(): WybranyTermin {
  return stan;
}

/** Na serwerze nie ma wyboru — i nie wolno go udawać, bo hydratacja się rozjedzie. */
export function getWybranyTerminNaSerwerze(): WybranyTermin {
  return PUSTY;
}

/**
 * Zapisz termin i powiadom oba widoki.
 *
 * Zapis identycznej pary NIE powiadamia nikogo. Bez tego kalendarz i formularz
 * budziłyby się nawzajem w kółko: jeden zapisuje, drugi się odświeża, zapisuje
 * to samo, i tak dalej.
 */
export function ustawWybranyTermin(from: string | null, to: string | null) {
  if (stan.from === from && stan.to === to) return;
  stan = from === null && to === null ? PUSTY : { from, to };
  listeners.forEach((notify) => notify());
}

/** Zapomnij wybór — przy odmontowaniu strony auta. */
export function wyczyscWybranyTermin() {
  ustawWybranyTermin(null, null);
}
