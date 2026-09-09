/**
 * The visitor's own reservation references, remembered in this browser.
 *
 * There are no customer accounts, so this is how the site knows which
 * reservations are "yours": each successful booking drops its reference here,
 * and /moje-rezerwacje reads the list back. It follows the device, not the
 * person — clearing site data or booking from another browser loses the list,
 * which is why the confirmation still shows the reference for the customer to
 * keep. Nothing here is authoritative; the server re-reads every reference.
 *
 * Only references are stored, never personal data. See `lookupReservations`
 * for why that matters: a leaked reference must not expose who booked.
 */

const KEY = "aa-my-reservations";

/** Refuse to grow without bound — a browser this busy is not a real customer. */
const MAX = 30;

const listeners = new Set<() => void>();

/** Cached so getSnapshot returns a stable reference between store writes —
 *  useSyncExternalStore compares with Object.is and would loop on a fresh
 *  array every call. */
let cache: string[] | null = null;

function parse(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter((v): v is string => typeof v === "string")
      .slice(0, MAX);
  } catch {
    // Corrupt or hand-edited — treat as empty rather than throwing on render.
    return [];
  }
}

function read(): string[] {
  try {
    return parse(localStorage.getItem(KEY));
  } catch {
    // Private mode / storage disabled — the feature degrades to "no history".
    return [];
  }
}

export function subscribeMyReservations(onChange: () => void) {
  listeners.add(onChange);
  // Another tab booking a car should show up here too.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) {
      cache = null;
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function getMyReservationRefs(): string[] {
  if (cache === null) cache = read();
  return cache;
}

/**
 * Wyrzuć podręczną kopię i odczytaj magazyn od nowa.
 *
 * Po co, skoro jest zdarzenie `storage`: Safari na iPhonie przywraca stronę
 * z bfcache po geście „wstecz". Zdarzenia, które poszły do zamrożonej karty,
 * przepadają — więc karta wraca z listą sprzed zamrożenia, choć w międzyczasie
 * inna karta (albo ta sama, przed cofnięciem) dopisała tam rezerwację.
 * Powiadamiamy tylko wtedy, gdy zawartość naprawdę się różni: `useSyncExternal
 * Store` porównuje przez `Object.is`, a świeża tablica przy każdym powrocie do
 * karty to darmowy renderowany przebieg.
 */
export function rereadMyReservations() {
  const poprzednie = cache;
  const swieze = read();
  if (
    poprzednie !== null &&
    poprzednie.length === swieze.length &&
    poprzednie.every((r, i) => r === swieze[i])
  ) {
    return;
  }
  cache = swieze;
  listeners.forEach((notify) => notify());
}

/**
 * Sentinel for "we don't know yet" — server render and the hydration pass,
 * where this browser's storage is unreadable. Compared by identity, so the UI
 * can tell it apart from a genuinely empty list: without that distinction a
 * customer who HAS bookings sees the empty state flash before hydration.
 * `read()` always builds a fresh array, so it can never collide with this one.
 */
export const UNKNOWN_REFS: string[] = [];

export const getMyReservationRefsOnServer = (): string[] => UNKNOWN_REFS;

/** Record a reference after a successful booking. Newest first, no duplicates. */
export function rememberReservation(reference: string) {
  const next = [reference, ...read().filter((r) => r !== reference)].slice(
    0,
    MAX,
  );
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode — the reference just won't be remembered on this device */
  }
  cache = next;
  listeners.forEach((notify) => notify());
}

/**
 * Klucze zarządzania — osobny worek, celowo NIE w tej samej liście co numery.
 *
 * Numer rezerwacji i klucz odpowiadają na dwa różne pytania („co mam" i „czym
 * to otwieram") i mają różny czas życia: klucz przestaje działać po
 * anulowaniu, numer zostaje na liście, bo sprawa nadal się wydarzyła.
 * Trzymanie ich razem zmusiłoby do przepisania kształtu danych, które w tej
 * przeglądarce już leżą — a wtedy każdy, kto rezerwował przed tą zmianą,
 * straciłby swoją listę w dniu wdrożenia.
 *
 * Klucza nie wysyłamy nigdzie poza akcje `booking/manage.ts` i nie logujemy.
 */
const KEY_KLUCZE = "aa-my-reservation-keys";

function czytajKlucze(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY_KLUCZE);
    if (!raw) return {};
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string") out[k] = val;
    }
    return out;
  } catch {
    return {};
  }
}

/** Klucz do zarządzania tą rezerwacją albo `null`, gdy ta przeglądarka go nie ma
 *  (rezerwacja sprzed tej funkcji albo zrobiona na innym urządzeniu). */
export function getManageKey(reference: string): string | null {
  return czytajKlucze()[reference] ?? null;
}

export function rememberManageKey(reference: string, key: string) {
  try {
    const wszystkie = czytajKlucze();
    wszystkie[reference] = key;
    // Ten sam limit co dla numerów — worek nie ma prawa rosnąć bez końca.
    const przyciete = Object.fromEntries(
      Object.entries(wszystkie).slice(-MAX),
    );
    localStorage.setItem(KEY_KLUCZE, JSON.stringify(przyciete));
  } catch {
    /* tryb prywatny — zarządzanie po prostu nie będzie na tym urządzeniu dostępne */
  }
}

function zapomnijKlucz(reference: string) {
  try {
    const wszystkie = czytajKlucze();
    delete wszystkie[reference];
    localStorage.setItem(KEY_KLUCZE, JSON.stringify(wszystkie));
  } catch {
    /* nic do zrobienia */
  }
}

/** Drop one reference from this device. Does NOT cancel anything server-side. */
export function forgetReservation(reference: string) {
  // Klucz znika razem z numerem: zostawiony bez sprawy jest wyłącznie czymś,
  // co może wyciec.
  zapomnijKlucz(reference);
  const next = read().filter((r) => r !== reference);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* nothing to do — it was never persisted */
  }
  cache = next;
  listeners.forEach((notify) => notify());
}
