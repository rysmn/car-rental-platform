import type { GoogleReviews } from "@/lib/company/google";
import { ArrowRightIcon, StarIcon } from "@/components/ui/Icons";

/**
 * Pasek opinii Google — jedna linijka na desktopie, dwie na telefonie.
 *
 *     ★★★★★  5,0 · 12 opinii Google        PRZECZYTAJ WSZYSTKIE OPINIE →
 *
 * PASEK, NIE SEKCJA. Zamówienie mówi o tym wprost i ma rację: karuzela cudzych
 * cytatów przy dziesięciu opiniach wygląda na próbę zajęcia miejsca, a nie na
 * dowód. Jedna linijka niesie wszystko, co klient sprawdza — ile gwiazdek, ilu
 * ludzi, gdzie to przeczytać — i nie odbiera pierwszeństwa mapie ani
 * „ZAREZERWUJ TERAZ".
 *
 * CZEGO TU NIE MA: żadnego skryptu, żadnej ramki z cudzego serwisu, żadnego
 * logo obcej firmy. Pasek to własny HTML na własnych tokenach motywu, więc nie
 * dokłada ani jednego żądania do obcego hosta i nie ma jak przeciec do niego
 * ani jeden bajt o odwiedzającym.
 *
 * DWA RÓŻNE DZIAŁANIA, DWA RÓŻNE MIEJSCA. „Przeczytaj wszystkie opinie"
 * pokazuje cudze opinie i stoi tutaj. „Dodaj opinię" otwiera formularz nowej
 * i stoi niżej, przy przyciskach. Jeden przycisk robiący obie rzeczy naraz to
 * przycisk, po którym nie wiadomo, co się stanie.
 */
export function GoogleReviewBar({
  reviews,
  labels,
}: {
  reviews: GoogleReviews;
  labels: {
    /** Ocena sformatowana w języku strony: „5,0" / „5.0". Null = nie znamy jej. */
    rating: string | null;
    /** „12 opinii Google" / „12 Google reviews". Null = nie znamy liczby. */
    count: string | null;
    /** Podpis, gdy nie ma jeszcze żadnych liczb: „Opinie Google". */
    title: string;
    /** „Przeczytaj wszystkie opinie" / „Read all reviews". */
    readAll: string;
    /** Zdanie dla czytnika ekranu — gwiazdki są dla niego niewidoczne. */
    aria: string;
  };
}) {
  const score = reviews.score;

  return (
    <div className="border-line mt-6 flex flex-col gap-3 border px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {score ? (
          <>
            <Stars value={score.rating} />
            {/*
              Ocena i liczba czytane na głos jednym zdaniem. Same gwiazdki są
              `aria-hidden`, bo pięć powtórzeń słowa „gwiazdka" nie jest
              informacją, a „4,9 na 5 na podstawie 12 opinii" jest.
            */}
            <span className="sr-only">{labels.aria}</span>
            <span
              aria-hidden="true"
              className="font-heading text-ink text-base font-bold"
            >
              {labels.rating}
            </span>
            {labels.count && (
              <>
                <span aria-hidden="true" className="text-ink-faint text-xs">
                  ·
                </span>
                <span aria-hidden="true" className="text-silver text-xs">
                  {labels.count}
                </span>
              </>
            )}
          </>
        ) : (
          /*
            Wizytówka bez ani jednej opinii — stan A&A w dniu wdrożenia.
            Jedna gwiazdka jako znak rubryki i nazwa rubryki. Ani jednej
            liczby: „0,0" albo pusty rząd pięciu gwiazdek czyta się jak ocena
            najgorsza z możliwych, a nie jak jej brak.
          */
          <>
            <StarIcon className="text-gold" />
            <span className="text-silver text-xs">{labels.title}</span>
          </>
        )}
      </div>

      {reviews.allHref && (
        <a
          href={reviews.allHref}
          target="_blank"
          rel="noopener noreferrer"
          className="label-tight text-ink hover:text-red tap inline-flex w-fit items-center gap-2 text-[11px] transition-colors"
        >
          {labels.readAll}
          <ArrowRightIcon />
        </a>
      )}
    </div>
  );
}

/**
 * Pięć gwiazdek, wypełnionych do ułamka.
 *
 * Rysowane dwoma rzędami jeden na drugim: pod spodem pełny rząd w kolorze
 * kreski, na wierzchu ten sam rząd w złocie, przycięty do `rating/5`. Dzięki
 * temu 4,3 wygląda na 4,3, a nie na 4 albo 4,5 — zaokrąglanie oceny w GÓRĘ
 * na potrzeby ładniejszej grafiki to ta sama nieprawda co wpisanie jej ręcznie.
 *
 * Całość jest `aria-hidden`: obok stoi zdanie dla czytnika ekranu.
 */
function Stars({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  const row = [0, 1, 2, 3, 4];
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex shrink-0 align-middle"
    >
      <span className="text-line-strong flex gap-0.5">
        {row.map((i) => (
          <StarIcon key={i} />
        ))}
      </span>
      <span
        className="text-gold absolute top-0 bottom-0 left-0 flex gap-0.5 overflow-hidden"
        style={{ width: `${pct}%` }}
      >
        {row.map((i) => (
          <StarIcon key={i} />
        ))}
      </span>
    </span>
  );
}
