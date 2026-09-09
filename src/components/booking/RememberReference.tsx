"use client";

import { useEffect } from "react";
import { rememberReservation } from "@/lib/booking/my-reservations";

/**
 * Zapamiętaj numer rezerwacji w TEJ przeglądarce.
 *
 * Potrzebne dokładnie w jednym miejscu: na stronie potwierdzenia z maila.
 * Klient rezerwuje na komputerze, a link z poczty otwiera na telefonie —
 * i wtedy telefon nie ma pojęcia o tej rezerwacji, więc ani pasek
 * „✓ Moja rezerwacja", ani lista „Moje rezerwacje" nic tam nie pokażą.
 * Jedna linijka przy potwierdzeniu naprawia to bez żadnego konta i bez
 * przenoszenia czegokolwiek na serwer.
 *
 * Komponent nic nie rysuje. Zapis w efekcie, a nie w trakcie renderowania:
 * `localStorage` nie istnieje po stronie serwera, a render musi być czysty.
 */
export function RememberReference({ reference }: { reference: string }) {
  useEffect(() => {
    rememberReservation(reference);
  }, [reference]);
  return null;
}
