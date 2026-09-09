"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useSaved } from "@/lib/favorites/store";
import { cn } from "@/lib/utils";

/**
 * Serce w belce — skrót do zapisanych aut.
 *
 * ## To NIE jest drugi system ulubionych
 *
 * Liczba i stan pochodzą z `useSaved()`, czyli z tego samego magazynu, co
 * przycisk serca na karcie auta, lista `/saved` i porównywarka. Magazyn stoi na
 * `useSyncExternalStore` z własnym zdarzeniem, więc licznik zmienia się
 * w tej samej klatce, w której klient dotknie serca na karcie — bez
 * przeładowania strony i bez odpytywania czegokolwiek.
 *
 * Serce prowadzi do ULUBIONYCH, nie do porównywarki. Przejście dalej —
 * „porównaj zapisane" — jest na `/saved` i tam zostaje: to dwie różne rzeczy
 * i sklejenie ich w jednej ikonie zabrałoby klientowi możliwość obejrzenia
 * listy bez wchodzenia w tabelę.
 *
 * ## Pusty stan ma znaczenie
 *
 * Kontur przy zerze, wypełnienie i czerwień przy czymkolwiek. Puste serce jest
 * zaproszeniem („można tu coś odłożyć”), więc zostaje widoczne zawsze —
 * inaczej funkcja istnieje tylko dla tych, którzy już ją znają. Licznik
 * pojawia się dopiero od jedynki: „0" obok ikony to jedyna liczba w całej
 * belce, która niczego nie liczy.
 *
 * Serwer nie wie, co leży w tej przeglądarce, więc pierwszy render ma zero —
 * i zaraz po hydratacji prawdę. Kontur zamieniający się w serce jest tu
 * poprawnym zachowaniem, a nie migotaniem: odwrotna kolejność (pełne serce,
 * które gaśnie) sugerowałaby, że coś zniknęło.
 */
export function SavedIconLink({ className }: { className?: string }) {
  const t = useTranslations("Nav");
  const { count } = useSaved();
  const ma = count > 0;

  return (
    <Link
      href="/saved"
      /*
        Etykieta niesie LICZBĘ, nie samo słowo. Czytnik ekranu mówi wtedy
        „Ulubione, 2" — a bez tego liczba widoczna na ekranie byłaby dla niego
        niewidoczna, bo sam licznik jest `aria-hidden` (to ozdoba tej samej
        informacji, nie druga informacja).
      */
      aria-label={ma ? `${t("saved")}: ${count}` : t("saved")}
      className={cn(
        /*
          `tap-narrow tap-area` zamiast `tap`.

          Reguła `min-width: 44px` na przyciskach jest słuszna dla pojedynczej
          kontrolki, ale w wierszu SZEŚCIU rozsadza belkę — dokładnie ten
          przypadek nazywa po imieniu wyjątek `.tap-narrow` w `globals.css`.
          Pudełko schodzi więc do 36/40 px, a pole trafienia zostaje pełne
          44 × 44 dzięki `::after` z `.tap-area`. Palec ma tyle samo; szerokość
          belki mniej o osiem pikseli na ikonę.
        */
        "tap-narrow tap-area relative flex h-10 w-9 items-center justify-center transition-colors min-[430px]:w-10",
        /*
          Barwa jako JEDNA klasa, nie dwie nałożone na siebie. `cn` to zwykłe
          sklejenie łańcuchów — nie rozstrzyga konfliktów Tailwinda, więc
          „text-silver" i „text-red" obok siebie rozstrzyga kolejność
          w arkuszu, nie kolejność wywołania. Zmierzone: serce z zapisanymi
          autami wychodziło CZARNE zamiast czerwonego.
        */
        ma ? "text-red hover:text-red" : "text-silver hover:text-ink",
        className,
      )}
    >
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill={ma ? "currentColor" : "none"}
        aria-hidden="true"
      >
        <path
          d="M12 20.3s-7.2-4.6-7.2-9.7a4.2 4.2 0 0 1 7.2-2.9 4.2 4.2 0 0 1 7.2 2.9c0 5.1-7.2 9.7-7.2 9.7Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
      {ma && (
        /*
          Licznik `absolute`, więc NIE KOSZTUJE ANI PIKSELA szerokości belki.
          Przy 320 px wiersz sterowań miał kilka pikseli zapasu i element, który
          rośnie razem z liczbą aut, zabrałby go przy drugim zapisanym aucie.
          Ten sam wybór, co przy znaczniku „✓ N" na Rezerwacjach.
        */
        <span
          aria-hidden
          className="label-tight bg-red rounded-pill pointer-events-none absolute top-0.5 right-0 min-w-[14px] px-1 text-center text-[9px] leading-[14px] text-white"
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
