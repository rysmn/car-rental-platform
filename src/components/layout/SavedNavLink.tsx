"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useSaved } from "@/lib/favorites/store";

/**
 * "Wybrane samochody ♥ 2" in the navigation.
 *
 * The count comes from the browser, so it is zero on the server and correct a
 * moment later. The badge is hidden at zero rather than showing "0": an empty
 * counter beside every other plain link would be the only decorated item in the
 * bar, drawing the eye to the one thing that has nothing in it.
 *
 * `className` is supplied by the caller because the desktop bar and the mobile
 * sheet style their links differently, and this component has no opinion about
 * which one it is in.
 */
export function SavedNavLink({
  className,
  licznikNadNapisem,
}: {
  className: string;
  /**
   * Licznik nad prawym rogiem napisu zamiast obok niego.
   *
   * W belce desktopowej liczba stojąca w wierszu kosztuje 26 px — sześć na
   * odstęp i dwadzieścia na samą pigułkę — i pojawia się dokładnie w chwili,
   * gdy klient zapisze pierwsze auto. Przy 1280 px przerwa między grupami
   * wynosi 34 px, więc wiersz z jednym ulubionym autem wyglądałby zupełnie
   * inaczej niż bez niego. `absolute` wyjmuje pigułkę z układu: widać ją tak
   * samo, a szerokość nawigacji przestaje zależeć od zawartości ulubionych.
   * Ta sama sztuczka i ten sam powód co przy znaczniku „✓ N" w
   * `MyReservationsNavLink`.
   *
   * W panelu pod hamburgerem zostaje układ w wierszu (domyślny): tam wiersz
   * ma 44 px wysokości i pełną szerokość ekranu, więc nie ma czego oszczędzać,
   * a pigułka uniesiona nad napis wchodziłaby na obramowanie wiersza wyżej.
   */
  licznikNadNapisem?: boolean;
}) {
  const t = useTranslations("Nav");
  const { count } = useSaved();

  return (
    <Link href="/saved" className={className}>
      <span
        className={
          licznikNadNapisem
            ? "relative inline-flex items-center gap-1.5"
            : "inline-flex items-center gap-1.5"
        }
      >
        {t("saved")}
        <span aria-hidden className={count > 0 ? "text-red" : "text-ink-faint"}>
          {/* The glyph stays put whether or not there is a number beside it, so
              the label does not shift as cars are added. */}
          ♥
        </span>
        {count > 0 && (
          <span
            className={
              licznikNadNapisem
                ? "label-tight bg-red rounded-pill absolute -top-2.5 -right-3 px-1 py-px text-[9px] text-white tabular-nums"
                : "label-tight bg-red rounded-pill px-1.5 py-0.5 text-[10px] text-white"
            }
          >
            {count}
          </span>
        )}
      </span>
    </Link>
  );
}
