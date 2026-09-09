import { PhoneIcon, StarIcon } from "@/components/ui/Icons";

/**
 * Cztery fakty przy decyzji o rezerwacji.
 *
 *     ★ 5,0 · 8 opinii Google   ·   +48 884 762 950
 *     Potwierdzimy dostępność i skontaktujemy się z Tobą.
 *     Bezpłatne anulowanie do 24 h przed odbiorem.
 *
 * ## Zasada, od której nie ma tu wyjątku
 *
 * **Ani jedno zdanie nie powstaje w tym pliku.** Ocena i liczba opinii idą
 * z `googleView` (czyli z ustawień, które właściciel wpisał w panelu),
 * telefon — z `company.phones`, zdanie o potwierdzeniu i o anulowaniu —
 * z tych samych kluczy tłumaczeń, których używa sam formularz rezerwacji,
 * a liczba godzin bezpłatnego anulowania z ustawienia `cancellation`, czyli
 * z tego, czym system NAPRAWDĘ rozliczy anulowanie.
 *
 * Każdy z czterech elementów znika osobno, gdy nie ma za nim danych. Pusty
 * pasek nie powstaje: gdy nie ma nic, komponent zwraca `null`.
 *
 * ## Czego tu nie ma i być nie może
 *
 * **Żadnej informacji o ubezpieczeniu.** Ani „pełne OC/AC", ani „ubezpieczenie
 * w cenie", ani udziału własnego. Właściciel dostarcza pierwszą polisę
 * w poniedziałek i dopiero jej treść może cokolwiek na ten temat powiedzieć.
 * Zdanie o ochronie wpisane wcześniej byłoby obietnicą wobec klienta złożoną
 * bez pokrycia w dokumencie — i to jest jedyny rodzaj nieprawdy na tej
 * stronie, który kosztuje pieniądze, a nie tylko zaufanie.
 *
 * Żadnych plakietek „100% bezpieczne", „najlepsza cena", „tysiące klientów"
 * ani innych liczb, których nikt nie policzył.
 */
export function TrustStrip({
  rating,
  reviewsCount,
  reviewsHref,
  reviewsAria,
  phone,
  phoneHref,
  confirmNote,
  cancellationNote,
  className = "",
}: {
  /** „5,0" — sformatowana w języku strony. Null = wizytówka bez ocen. */
  rating: string | null;
  /** „8 opinii Google". Null razem z oceną — zawsze obie albo żadna. */
  reviewsCount: string | null;
  /** Lista opinii TEJ wizytówki. Null = nie ma dokąd prowadzić. */
  reviewsHref: string | null;
  /** Zdanie dla czytnika ekranu: gwiazdka jest dla niego niewidoczna. */
  reviewsAria: string;
  /** Numer w postaci do czytania. Pusty = firma nie ma wpisanego numeru. */
  phone: string;
  /** `tel:` dla tego numeru. Null = jak wyżej. */
  phoneHref: string | null;
  /** „Rezerwacja bez płatności online. Potwierdzimy dostępność…" */
  confirmNote: string;
  /** „Bezpłatne anulowanie do 24 h przed odbiorem." */
  cancellationNote: string;
  className?: string;
}) {
  const maOceny = Boolean(rating && reviewsCount);
  if (!maOceny && !phone && !confirmNote && !cancellationNote) return null;

  /* Ocena bez adresu do opinii nadal jest faktem — po prostu nie jest linkiem. */
  const ocena = maOceny ? (
    <span className="flex items-center gap-1.5">
      <StarIcon size={13} className="text-gold" />
      <span className="sr-only">{reviewsAria}</span>
      <span aria-hidden="true" className="text-ink font-bold">
        {rating}
      </span>
      <span aria-hidden="true" className="text-ink-faint">
        ·
      </span>
      <span aria-hidden="true" className="text-silver">
        {reviewsCount}
      </span>
    </span>
  ) : null;

  return (
    <div
      data-pasek-zaufania=""
      className={`border-line border-t pt-4 ${className}`}
    >
      <div className="text-silver flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
        {ocena &&
          (reviewsHref ? (
            <a
              href={reviewsHref}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="tap hover:text-ink transition-colors"
            >
              {ocena}
            </a>
          ) : (
            ocena
          ))}
        {phone && phoneHref && (
          <a
            href={phoneHref}
            className="tap hover:text-ink flex items-center gap-1.5 transition-colors"
          >
            <PhoneIcon size={13} />
            <span dir="ltr">{phone}</span>
          </a>
        )}
      </div>
      {/*
        Dwa zdania, nie dwie plakietki. To są warunki, a nie odznaki — czyta się
        je zdaniem i tak są tu zapisane.
      */}
      <p className="text-ink-faint mt-3 text-[11px] leading-relaxed">
        {confirmNote}
      </p>
      {cancellationNote && (
        <p className="text-ink-faint mt-1 text-[11px] leading-relaxed">
          {cancellationNote}
        </p>
      )}
    </div>
  );
}
