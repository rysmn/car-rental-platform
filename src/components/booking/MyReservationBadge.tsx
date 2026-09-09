"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useActiveReservations } from "./useActiveReservations";

/**
 * „✓ MOJA REZERWACJA" — pasek pod nagłówkiem na telefonie.
 *
 * ## Po co
 *
 * Klient, który właśnie zarezerwował auto, nie powinien szukać swojej
 * rezerwacji w menu pod hamburgerem. Od momentu rezerwacji ma ją widzieć na
 * górze każdej strony — floty, strony głównej, karty auta — jednym dotknięciem
 * od listy.
 *
 * ## Dlaczego osobny pasek, a nie kolejna ikona w wierszu sterowań
 *
 * Ten wiersz jest pełny. Przy 320 px mierzył 324 px i ciągnął całą stronę
 * w bok; naprawa zostawiła około czterech pikseli zapasu, a mieszka tam już
 * kontakt, język, motyw i hamburger. Piąta kontrolka to ten sam błąd drugi raz.
 * Pasek pod belką ma za to całą szerokość ekranu, więc mieści pełne słowa
 * zamiast ikony, której nikt nie rozszyfruje.
 *
 * ## Co to NIE jest
 *
 * To nie jest status samochodu. „ZAREZERWOWANY" na zdjęciu mówi o AUCIE —
 * że ktoś je ma na najbliższy termin. Ten pasek mówi o KLIENCIE — że to on ma
 * rezerwację. Dwie różne rzeczy, dwa różne miejsca, żadna nie zastępuje drugiej.
 *
 * ## Które rezerwacje się liczą i skąd wiadomo
 *
 * Liczenie mieszka w `useActiveReservations` — tam też stoi opis, dlaczego
 * pasek pokazuje się natychmiast z pamięci przeglądarki, a odpowiedź serwera
 * tylko go uściśla. Ten plik odpowiada wyłącznie za wygląd i za to, dokąd
 * prowadzi dotknięcie.
 *
 * ## Dlaczego `sticky`, a nie tylko „w nagłówku"
 *
 * Nagłówek jest przyklejony do góry ekranu i pasek jedzie razem z nim. Nie ma
 * własnego `z-index` ani własnego `position` — dziedziczy je po belce. Każda
 * próba nadania mu własnej warstwy kończyła się tym, że przy otwartym panelu
 * hamburgera pasek zostawał nad przyciemnieniem albo pod nim, zależnie od
 * przeglądarki.
 */
export function MyReservationBadge() {
  const t = useTranslations("Nav");
  const { liczba, jedynyNumer } = useActiveReservations();

  /*
   * Jednorazowe zwrócenie uwagi po świeżej rezerwacji.
   *
   * Zapala się TYLKO wtedy, gdy liczba spraw w toku wzrosła w trakcie tej
   * wizyty — czyli dokładnie w chwili, w której klient właśnie coś
   * zarezerwował. Wejście na stronę z rezerwacją sprzed tygodnia nie miga
   * niczym: pasek jest wtedy od początku spokojny. Podświetlenie gaśnie po
   * dwóch sekundach i nie wraca.
   */
  const poprzednie = useRef<number | null>(null);
  const [swieza, setSwieza] = useState(false);
  useEffect(() => {
    if (liczba === null) return;
    const bylo = poprzednie.current;
    poprzednie.current = liczba;
    if (bylo !== null && liczba > bylo) {
      setSwieza(true);
      const id = setTimeout(() => setSwieza(false), 2000);
      return () => clearTimeout(id);
    }
  }, [liczba]);

  if (!liczba) return null;

  return (
    <div className="border-line bg-void/60 border-t xl:hidden">
      <Link
        // Znacznik dla testów i dla każdego, kto będzie tu szukał TEGO paska:
        // odnośnik „Moje rezerwacje" jest też w panelu hamburgera i sam adres
        // nie odróżnia jednego od drugiego.
        data-my-reservation
        data-count={liczba}
        // Jedna sprawa — prosto do niej. Więcej niż jedna — do listy, bo nie ma
        // czego wybrać za klienta.
        href={
          jedynyNumer
            ? { pathname: "/moje-rezerwacje", hash: jedynyNumer }
            : "/moje-rezerwacje"
        }
        className={`tap-block flex items-center justify-center gap-2 px-4 py-2.5 transition-colors ${
          swieza ? "bg-status-available/10" : ""
        }`}
      >
        {/*
          Kropka i „✓" niosą ten sam kolor co stan „dostępny" — jedyna zielona
          barwa, jaką ten projekt ma, i sprawdzona na kontrast w obu motywach.
          Nowego akcentu nie wprowadzam; nowy kolor to nowy token do pilnowania.
        */}
        <span
          aria-hidden
          className={`rounded-pill bg-status-available block h-1.5 w-1.5 shrink-0 ${
            swieza ? "animate-ping-once" : ""
          }`}
        />
        <span className="label-tight text-status-available text-[11px]">
          {liczba === 1 ? t("myReservationOne") : t("myReservationMany")}
        </span>
        {liczba > 1 && (
          <span className="label-tight text-status-available text-[11px] tabular-nums">
            · {liczba}
          </span>
        )}
        <span aria-hidden className="text-status-available/70 text-[11px]">
          →
        </span>
      </Link>
    </div>
  );
}
