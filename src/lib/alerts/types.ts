/**
 * The alert vocabulary, in a file with no server imports.
 *
 * Split out so a client component can render a severity badge without dragging
 * `server-only` and the database driver into the browser bundle — the same
 * split `lib/fleet/compareLimits` exists for.
 */

import type { Bilingual } from "@/lib/i18n-pick";

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
export const SEVERITY_MEANING: Record<AlertSeverity, Bilingual> = {
  critical: {
    pl: "Cały system albo rezerwacje niedostępne — baza, aplikacja, awaria krytyczna.",
    en: "The whole system or reservations unavailable — database, application, critical failure.",
  },
  error: {
    pl: "Konkretna operacja klienta się nie powiodła — rezerwacja, upload, zapis.",
    en: "A specific customer operation failed — reservation, upload, save.",
  },
  warning: {
    pl: "Coś wymaga kontroli, zanim stanie się awarią — brak zdjęcia, niekompletna konfiguracja.",
    en: "Something needs checking before it becomes a failure — missing photo, incomplete configuration.",
  },
  info: {
    pl: "Zdarzenie administracyjne, które warto mieć zapisane.",
    en: "An administrative event worth keeping on record.",
  },
};

export const SEVERITY_LABEL: Record<AlertSeverity, Bilingual> = {
  critical: { pl: "KRYTYCZNY", en: "CRITICAL" },
  error: { pl: "BŁĄD", en: "ERROR" },
  warning: { pl: "OSTRZEŻENIE", en: "WARNING" },
  info: { pl: "INFORMACJA", en: "INFO" },
};

export const MODULE_LABEL: Record<AlertModule, Bilingual> = {
  public: { pl: "Strona publiczna", en: "Public site" },
  booking: { pl: "Rezerwacje", en: "Reservations" },
  chat: { pl: "Asystent", en: "Assistant" },
  fleet: { pl: "Flota", en: "Fleet" },
  media: { pl: "Media", en: "Media" },
  admin: { pl: "Panel", en: "Panel" },
  inbox: { pl: "Skrzynka", en: "Inbox" },
  payments: { pl: "Płatności", en: "Payments" },
  health: { pl: "Kontrola techniczna", en: "Technical checks" },
  security: { pl: "Bezpieczeństwo", en: "Security" },
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
