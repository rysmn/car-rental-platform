/**
 * Ikony interfejsu publicznego — jeden plik, jeden rysunek na pojęcie.
 *
 * DLACZEGO OSOBNY PLIK. Panel administracyjny bierze ikony z `lucide-react`,
 * ale strona publiczna nie: to 300 kB zależności doładowywanej po to, żeby
 * narysować pinezkę i gwiazdkę. Strona publiczna rysowała je więc dotąd
 * wprost w komponentach — i tak powstały dwie kopie tej samej pinezki
 * (stopka, blok GOOGLE) oraz dwie gwiazdki (pasek opinii, przycisk „Dodaj
 * opinię"), które mogły się rozjechać przy pierwszej poprawce.
 *
 * Ta sama lekcja, co przy `buttonBase` w `Button.tsx`: kopia może się
 * rozjechać, import nie.
 *
 * KONWENCJA. `viewBox="0 0 24 24"`, kontur `strokeWidth={1.8}` z zaokrąglonymi
 * końcami, wypełnienie tylko tam, gdzie kształt tego wymaga (gwiazdka).
 * Kolor zawsze z `currentColor`, więc ikona bierze barwę tekstu obok siebie
 * i nie zna motywu. `aria-hidden`, bo każda z nich stoi przy napisie, który
 * mówi to samo słowami.
 */

type IconProps = {
  /** Bok kwadratu w pikselach. Domyślnie 14 — rozmiar przy tekście. */
  size?: number;
  className?: string;
};

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
  };
}

/**
 * Gwiazdka — pasek opinii i przycisk „Dodaj opinię".
 *
 * Wypełniona, nie konturowa: kontur w tym rozmiarze zlewa się w plamę, a
 * gwiazdka ma być czytelna przy 14 px, bo to na niej opiera się cały pasek.
 */
export function StarIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} fill="currentColor" className={cls(className)}>
      <path d="M12 2.6l2.9 5.88 6.5.95-4.7 4.58 1.11 6.47L12 17.43l-5.81 3.05 1.1-6.47-4.7-4.58 6.5-.95L12 2.6Z" />
    </svg>
  );
}

/** Pinezka — „Zobacz na mapie". Ten sam kształt, co w stopce. */
export function PinIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} fill="none" className={cls(className)}>
      <path
        d="M12 22s7-5.6 7-12a7 7 0 1 0-14 0c0 6.4 7 12 7 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

/**
 * Wyjście poza serwis — „Zobacz nas w Google".
 *
 * Świadomie NIE jest to logo Google. Zamówienie zakazuje cudzych logo, a poza
 * tym znak firmowy Google w przycisku sugeruje, że to Google ten przycisk
 * postawiło. Strzałka wychodząca z ramki mówi dokładnie tyle, ile trzeba:
 * „to otworzy się poza tą stroną".
 */
export function ExternalIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} fill="none" className={cls(className)}>
      <path
        d="M14 4h6v6M20 4l-8.5 8.5M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Słuchawka — „Zadzwoń". */
export function PhoneIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} fill="none" className={cls(className)}>
      <path
        d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Strzałka w prawo — odnośnik „dalej", np. „Przeczytaj wszystkie opinie". */
export function ArrowRightIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...base(size)} fill="none" className={cls(className)}>
      <path
        d="M5 12h14m0 0-5-5m5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * `shrink-0` zawsze: każda z tych ikon stoi w rzędzie flex obok napisu, który
 * bywa dłuższy niż kolumna. Bez tego przeglądarka ściska ikonę zamiast zawinąć
 * tekst i pinezka robi się owalna.
 */
function cls(className?: string) {
  return className ? `shrink-0 ${className}` : "shrink-0";
}
