import Image from "next/image";
import { zdjecieNaPozycji } from "@/lib/fleet/zdjecie-motywu";

/**
 * JEDNO zdjęcie auta na JEDNEJ pozycji — i jedyne miejsce, które wie,
 * że zdjęcie startowe zależy od motywu.
 *
 * ## Po co osobny komponent na jeden obrazek
 *
 * Bo tych miejsc jest sześć: karta floty, galeria na stronie auta, miniatury
 * pod nią, strona główna, zapisane i porównanie. Każde z nich rysowało
 * `images[0]` samo. Sześć kopii tej samej decyzji to sześć okazji, żeby jedna
 * została kiedyś pominięta — a klient zobaczyłby wtedy w jasnym motywie inne
 * zdjęcie na karcie niż po wejściu w auto.
 *
 * ## Dlaczego renderuje DWA obrazy, a nie wybiera jednego
 *
 * Bo serwer nie zna motywu i nie ma jak go poznać. Wybór po stronie serwera
 * byłby zgadywaniem, a wybór po hydracji — mrugnięciem. Idą więc obie warstwy,
 * a `theme-dark-only` / `theme-light-only` odsłaniają właściwą jeszcze przed
 * pierwszym malowaniem. Druga warstwa to `display: none`, więc nic nie zajmuje
 * miejsca i nic nie przeskakuje.
 *
 * Przeglądarka pobierze oba pliki. To świadomy koszt: jedno dodatkowe zdjęcie
 * na kadr w zamian za brak mrugnięcia i brak rozjazdu z hydracją.
 *
 * ## Fallback
 *
 * Gdy na drugiej pozycji nic nie ma — auto z jednym zdjęciem — obie warstwy
 * wskazywałyby ten sam plik, więc idzie JEDEN obraz, bez klas motywu. Puste
 * miejsce ani zepsuta ikona nie mają skąd się wziąć.
 */
export function CarPhoto({
  images,
  pozycja = 0,
  alt,
  sizes,
  priority,
  className,
}: {
  images: readonly string[];
  /** Który kadr taśmy — nie który plik. Zamianę robi ten komponent. */
  pozycja?: number;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const ciemny = images[pozycja];
  // `?? ciemny` to cały fallback: brak drugiego zdjęcia = zostaje pierwsze.
  const jasny = images[zdjecieNaPozycji(pozycja, true)] ?? ciemny;

  if (!ciemny) return null;

  if (ciemny === jasny) {
    return (
      <Image
        src={ciemny}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className={className}
      />
    );
  }

  return (
    <>
      <Image
        src={ciemny}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className={`theme-dark-only ${className ?? ""}`}
      />
      <Image
        src={jasny}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className={`theme-light-only ${className ?? ""}`}
      />
    </>
  );
}
