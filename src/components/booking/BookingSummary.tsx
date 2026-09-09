/**
 * „Co rezerwujesz" — fakty wybrane przez klienta, powtórzone tam, gdzie
 * przestał je widzieć.
 *
 *     Termin        25.09, 08:00  →  29.09, 08:00 · 4 doby
 *     Miejsce odbioru   Odbiór w biurze (Warszawa)
 *
 * ## Po co, skoro wszystko to jest wyżej w formularzu
 *
 * Bo NIE jest — nie w chwili, w której klient podejmuje zobowiązanie.
 * Zmierzone 04.09.2026 na produkcji, telefon 390 px: formularz rezerwacji ma
 * 1893 px i czternaście pól. Gdy kursor stoi w „Imię i nazwisko", na ekranie
 * widać sumę i kaucję (blok cen leży tuż nad danymi osobowymi), ale pola dat
 * są **2900 px wyżej** i nie widać ich już ani przez chwilę. Klient wypełnia
 * dziewięć pól — z numerem prawa jazdy i adresem włącznie — nie widząc
 * terminu, na który to wszystko podpisuje.
 *
 * Ekran po wysłaniu miał ten sam brak w wersji ostrzejszej: numer rezerwacji
 * i zdanie „skontaktujemy się", bez auta, bez terminu, bez kwoty. Klient
 * dostawał potwierdzenie czegoś, czego treści już nigdzie nie widział.
 *
 * ## Zasada
 *
 * **Ten komponent nic nie liczy i nic nie formatuje.** Dostaje gotowe napisy
 * i gotowe węzły — datę składa `Intl` po stronie panelu, kwotę rysuje `Money`,
 * nazwę miejsca bierze ta sama lista `locations`, z której klient wybierał.
 * Własne formatowanie oznaczałoby drugie miejsce, w którym ta sama data może
 * kiedyś wyjść inaczej niż w polu obok.
 *
 * Wiersz bez wartości nie powstaje. Gdy nie ma ani jednego — komponent zwraca
 * `null` i nie zostawia po sobie pustej ramki.
 */
export function BookingSummary({
  rows,
  className = "",
}: {
  /** Etykieta i wartość; `null`/`""` w wartości usuwa cały wiersz. */
  rows: { label: string; value: React.ReactNode }[];
  className?: string;
}) {
  const widoczne = rows.filter(
    (r) => r.value !== null && r.value !== undefined && r.value !== "",
  );
  if (widoczne.length === 0) return null;

  return (
    <dl
      data-podsumowanie-rezerwacji=""
      className={`border-line space-y-2 border-t pt-4 text-sm ${className}`}
    >
      {widoczne.map((r) => (
        <div key={r.label} className="flex justify-between gap-4 text-left">
          <dt className="text-ink-muted shrink-0">{r.label}</dt>
          <dd className="text-ink min-w-0 text-right">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
