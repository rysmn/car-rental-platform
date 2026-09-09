/**
 * The alert vocabulary, in a file with no server imports.
 *
 * Split out so a client component can render a severity badge without dragging
 * `server-only` and the database driver into the browser bundle — the same
 * split `lib/fleet/compareLimits` exists for.
 */

export const ALERT_SEVERITIES = [
  "critical",
  "error",
  "warning",
  "info",
] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

/**
 * Which part of the system reported the failure.
 *
 * `payments` is here before payments exist. The instruction was to make the
 * register ready for them without rebuilding it later, and a module name is the
 * cheapest possible form of that readiness: when the webhook handler is
 * written, it calls `recordAlert({ module: "payments", … })` and appears in the
 * panel with no migration and no new code here.
 */
export const ALERT_MODULES = [
  "public",
  "booking",
  "chat",
  "fleet",
  "media",
  "admin",
  "payments",
  "health",
  /*
   * Skrzynka zapytań klientów — od etapu 44D.
   *
   * Moduł opisuje, GDZIE coś się zepsuło, a nie czego dotyczy sprawa:
   * tu trafia wyłącznie nieudany zapis zgłoszenia i niedziałająca poczta.
   * Samo zapytanie klienta NIGDY nie jest alertem — ma własną skrzynkę
   * i własny licznik, właśnie po to, żeby nie zaśmiecać rejestru awarii.
   */
  "inbox",
  /*
   * Bezpieczeństwo — od rozdziału 13.
   *
   * Tu trafia to, co ma OBUDZIĆ człowieka: seria nieudanych logowań, nowe
   * urządzenie na koncie, zmiana 2FA, nowy administrator, zmiana roli,
   * wylogowanie wszystkich sesji, nagły ruch wyglądający na zbieranie danych.
   * NIE trafia tu pojedyncza pułapka na robota ani jeden przekroczony limit —
   * te idą do `security_events`, które są dziennikiem, a nie alarmem. Różnica
   * jest celowa: rejestr alertów, w którym codziennie stoi tysiąc wpisów,
   * przestaje być czytany po tygodniu.
   */
  "security",
] as const;
export type AlertModule = (typeof ALERT_MODULES)[number];

export const ALERT_STATES = ["active", "acknowledged", "resolved"] as const;
export type AlertState = (typeof ALERT_STATES)[number];

/**
 * What each level means, written down so the instrumentation has one place to
 * check itself against rather than four opinions in four modules.
 *
 * The line that matters is between ERROR and WARNING: ERROR is a customer who
 * did not get what they asked for, WARNING is something an operator should look
 * at before it becomes one. A missing photo is a WARNING even though it is
 * visible on the site; a reservation that threw is an ERROR even though the
 * customer can try again.
 */
export const SEVERITY_MEANING: Record<AlertSeverity, string> = {
  critical: "Cały system albo rezerwacje niedostępne — baza, aplikacja, awaria krytyczna.",
  error: "Konkretna operacja klienta się nie powiodła — rezerwacja, upload, zapis.",
  warning: "Coś wymaga kontroli, zanim stanie się awarią — brak zdjęcia, niekompletna konfiguracja.",
  info: "Zdarzenie administracyjne, które warto mieć zapisane.",
};

export const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critical: "KRYTYCZNY",
  error: "BŁĄD",
  warning: "OSTRZEŻENIE",
  info: "INFORMACJA",
};

export const MODULE_LABEL: Record<AlertModule, string> = {
  public: "Strona publiczna",
  booking: "Rezerwacje",
  chat: "Asystent",
  fleet: "Flota",
  media: "Media",
  admin: "Panel",
  inbox: "Skrzynka",
  payments: "Płatności",
  health: "Kontrola techniczna",
  security: "Bezpieczeństwo",
};

/** Worst first — the order the panel lists in, and the order `sort` needs. */
export const SEVERITY_RANK: Record<AlertSeverity, number> = {
  critical: 0,
  error: 1,
  warning: 2,
  info: 3,
};

/** Only these two demand attention now; the badge in the menu counts them. */
export const isDemanding = (s: AlertSeverity): boolean =>
  s === "critical" || s === "error";
