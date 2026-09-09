import { StarIcon } from "@/components/ui/Icons";

/**
 * Opinie Google w belce — jedna gwiazdka w ramce, na końcu wiersza.
 *
 * ## Skąd bierze się adres
 *
 * Z ustawień, nigdy z kodu. `googleView` w `lib/company/google.ts` odpowiada na
 * pytanie „czy wolno to pokazać" jednym miejscem dla całego serwisu i zwraca
 * `reviews.allHref` — dokładnie ten sam adres, który od 02.09.2026 nosi pasek
 * opinii na stronie głównej i na kontakcie („Przeczytaj wszystkie opinie").
 * Belka niczego tu nie wylicza i nie zna żadnego Place ID.
 *
 * Wynika z tego trzeci stan, który trzeba widzieć: **ikony może nie być.**
 * Gdy przełącznik „Pasek opinii" jest wyłączony albo w ustawieniach nie ma ani
 * Place ID, ani wizytówki, `allHref` jest `null` i wtedy w belce nie ma nic —
 * nie ma ikony wyszarzonej, nie ma ikony z `href=""`, nie ma ikony prowadzącej
 * do wyszukiwarki. Ta zasada jest starsza niż ta ikona i obowiązuje w całym
 * module Google; łamanie jej tutaj dałoby jedyny w serwisie przycisk, który
 * prowadzi donikąd.
 *
 * ## Dlaczego sama ikona, bez napisu
 *
 * Bo to nie jest pozycja nawigacji, tylko odnośnik na zewnątrz — do Google,
 * w nowej karcie. Napis „OPINIE" postawiony obok „ZAREZERWUJ TERAZ" czytałby
 * się jak dziewiąta pozycja menu i konkurował z jedynym CTA, które ma w tej
 * belce wygrywać. Znaczenie niesie `aria-label` (i podpowiedź `title`), a nie
 * szerokość napisu.
 *
 * ## Ramka
 *
 * Kwadrat 36 × 36 z włoskowatą kreską — ten sam rysunek, co reszta serwisu
 * (`border-line`, zero zaokrągleń). Gwiazdka jest złota (`text-gold`), czyli
 * w tej samej barwie, co gwiazdki w pasku opinii; to jedyne miejsce w belce,
 * gdzie złoto występuje, i dlatego ikona czyta się jako osobna rzecz, a nie
 * jako czwarta ikona społecznościowa.
 *
 * `.tap-area` domyka pole dotyku do 44 × 44 bez powiększania ramki — reguła
 * z `globals.css`, ta sama co przy przełącznikach w belce.
 */
export function ReviewsLink({
  href,
  label,
  className,
}: {
  href: string;
  /** „Przeczytaj opinie Google" / „Read Google reviews". */
  label: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className={`border-line text-gold hover:border-gold/70 tap-area hover:bg-gold/10 inline-flex h-9 w-9 shrink-0 items-center justify-center border transition-colors ${className ?? ""}`}
    >
      <StarIcon size={15} />
    </a>
  );
}
