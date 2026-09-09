"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useActiveReservations } from "./useActiveReservations";

/**
 * „Moje rezerwacje ✓ 2" w pasku nawigacji.
 *
 * Zlecenie wymaga, żeby sprawa w toku była widoczna na głównych stronach
 * klienta i nie chowała się pod hamburgerem. Na telefonie robi to pasek pod
 * belką (`MyReservationBadge`). Na komputerze paska nie ma — bo tam jest już
 * pełna nawigacja — więc odnośnik, który i tak stoi w pasku, dostaje ten sam
 * znacznik: „✓" i liczbę, kiedy jest co liczyć.
 *
 * Wzór jest ten sam co przy „Wybrane samochody ♥ 2" (`SavedNavLink`), łącznie
 * z tym, że przy zerze nie pokazuje się nic. Zero w liczniku obok każdego
 * innego zwykłego odnośnika przyciągałoby wzrok do jedynej rzeczy, w której
 * nic nie ma.
 *
 * `className` podaje wołający, bo pasek desktopowy i panel hamburgera stylują
 * odnośniki inaczej, a ten komponent nie ma zdania, w którym z nich stoi.
 */
export function MyReservationsNavLink({
  className,
  onClick,
}: {
  className: string;
  onClick?: () => void;
}) {
  const t = useTranslations("Nav");
  const { liczba, jedynyNumer } = useActiveReservations();
  const ile = liczba ?? 0;

  return (
    <Link
      data-my-reservations-nav
      data-count={ile}
      href={
        ile === 1 && jedynyNumer
          ? { pathname: "/moje-rezerwacje", hash: jedynyNumer }
          : "/moje-rezerwacje"
      }
      onClick={onClick}
      className={className}
    >
      <span className="relative inline-flex items-center">
        {t("myReservations")}
        {ile > 0 && (
          /*
            Znacznik jest wyjęty z układu (`absolute`) i to nie jest ozdoba
            techniczna, tylko warunek „nie zepsuj desktopu". Pasek nawigacji
            przy 1280 px mieści się dziś z zapasem 26 px (patrz rachunek
            w `SiteHeader`), a wersja licznika stojąca w wierszu zjadłaby
            z tego 27 px — czyli cały zapas i jeszcze piksel. W tej postaci
            kosztuje zero pikseli szerokości, a widać ją tak samo.

            `-right-4`, nie `-right-2`: znacznik siedzi nad prawym rogiem
            napisu, w odstępie do sąsiada (`gap-4`, czyli 16 px), więc nie
            wchodzi na żadną sąsiednią etykietę.
          */
          <span
            aria-hidden
            className="label-tight bg-status-available/15 text-status-available rounded-pill absolute -top-2.5 -right-4 px-1 py-px text-[9px] tabular-nums"
          >
            ✓{ile}
          </span>
        )}
      </span>
    </Link>
  );
}
