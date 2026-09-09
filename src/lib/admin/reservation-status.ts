// Pure reservation-status logic — safe to import from client components (no DB).

/**
 * Statusy rezerwacji — komplet, ten sam co enum w bazie.
 *
 * `pending_verification` doszedł z rozdziałem 13.4 (migracja 0041) i przez
 * pewien czas GO TU NIE BYŁO. Skutek zobaczył właściciel 27.08.2026: karta
 * własnej, prawdziwej rezerwacji przestała się otwierać z błędem
 * „Cannot read properties of undefined (reading 'length')", bo mapy poniżej
 * są typu `Record<ReservationStatus, …>` i po prostu nie miały tego klucza.
 * Strona czytała status z bazy przez rzutowanie (`as ReservationStatus`),
 * więc kompilator nie miał jak tego zauważyć.
 *
 * Dopisanie wartości do tego typu jest właściwą naprawą, a nie łatką: od tej
 * chwili każda mapa poniżej MUSI mieć komplet kluczy, inaczej `tsc` nie
 * przepuści zmiany. Rzutowania też zostały zdjęte tam, gdzie ukrywały prawdę.
 */
export type ReservationStatus =
  | "pending_verification"
  | "pending"
  | "confirmed"
  | "cancelled"
  /** Klient nie zjawił się po auto — patrz `reservationStatus` w schemacie. */
  | "no_show"
  | "completed"
  | "rejected";

/** Server-enforced status state machine. Any transition not listed is rejected. */
export const STATUS_TRANSITIONS: Record<
  ReservationStatus,
  ReservationStatus[]
> = {
  /*
    PUSTA LISTA — celowo, i nie jest to przeoczenie.

    `pending_verification` znaczy „klient wysłał formularz i jeszcze nie
    kliknął w link z maila". Serwer już dziś odrzuca każdą zmianę statusu
    z tego stanu (`canTransition` czyta tę samą mapę i zwraca `false`), więc
    pusta lista OPISUJE zachowanie, które i tak obowiązuje — nie wprowadza
    nowego. Panel przestaje przez to pokazywać przyciski, które i tak
    kończyłyby się komunikatem „niedozwolona zmiana statusu".

    Zgłoszenie w tym stanie nie wymaga niczyjej decyzji: albo klient potwierdzi
    adres i przejdzie do `pending`, albo wygaśnie po 15 minutach do `rejected`.
    Gdyby obsługa miała móc potwierdzać takie zgłoszenia ręcznie (klient dzwoni
    zamiast klikać), to jest DECYZJA WŁAŚCICIELA — wymaga dopisania przejścia
    tutaj ORAZ rozszerzenia listy dozwolonych celów w `reservations/actions.ts`.
    Nie robimy tego samo z siebie: to zmiana reguły, a nie naprawa błędu.
  */
  pending_verification: [],
  pending: ["confirmed", "rejected", "cancelled"],
  /*
    `no_show` osiąga się WYŁĄCZNIE z `confirmed` i tylko po godzinie odbioru.
    Ze zgłoszenia oczekującego nie da się nie zjawić po auto, którego nikt
    jeszcze nie obiecał — a samo przejście dodatkowo pilnuje tolerancji
    z polityki anulowania (patrz `oznaczNieodebranie`).
  */
  confirmed: ["completed", "cancelled", "no_show"],
  rejected: [],
  cancelled: [],
  /* Stan końcowy, jak `cancelled`: należność już naliczona, auto wolne. */
  no_show: [],
  completed: [],
};

export function canTransition(from: ReservationStatus, to: ReservationStatus) {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Polish labels (admin UI is Polish). */
export const STATUS_LABEL: Record<ReservationStatus, string> = {
  pending_verification: "Niepotwierdzona e-mailem",
  pending: "Oczekująca",
  confirmed: "Potwierdzona",
  cancelled: "Anulowana",
  no_show: "Nieodebrana",
  completed: "Zakończona",
  rejected: "Odrzucona",
};

export const ACTION_LABEL: Record<ReservationStatus, string> = {
  // Nie jest celem żadnego przejścia — wpis istnieje, żeby mapa była kompletna
  // i żeby kompilator pilnował tego przy każdej kolejnej zmianie statusów.
  pending_verification: "Niepotwierdzona e-mailem",
  confirmed: "Potwierdź",
  rejected: "Odrzuć",
  cancelled: "Anuluj",
  no_show: "Oznacz jako nieodebraną",
  completed: "Zakończ",
  pending: "Oczekująca",
};
