"use client";

import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { writeChoice } from "@/lib/locale/preference";
import { cn } from "@/lib/utils";

/**
 * PL / EN toggle that preserves the current path.
 *
 * `usePathname` returns the *internal* route template (`/fleet/[slug]`), not
 * the URL the visitor sees, because Polish and English slugs differ — see
 * `routing.pathnames`. The dynamic segments therefore have to be handed back in
 * separately for next-intl to rebuild the other locale's URL, which is what
 * `useParams` supplies.
 */
export function LocaleSwitcher({ className }: { className?: string } = {}) {
  const t = useTranslations("Nav");
  const active = useLocale();
  const pathname = usePathname();
  const params = useParams();

  return (
    /*
      Grupa z nazwą — inaczej czytnik ekranu podaje dwa samotne odnośniki „PL"
      i „EN" i nie mówi, czego dotyczą. `aria-current` na aktywnym zostaje:
      grupa mówi CO to jest, `aria-current` — który wybrany.
    */
    <div
      role="group"
      aria-label={t("changeLanguage")}
      className={cn("label-tight flex items-center text-[11px]", className)}
    >
      {routing.locales.map((locale, i) => (
        <span key={locale} className="flex items-center">
          {i > 0 && <span className="text-ink-faint">/</span>}
          <Link
            // @ts-expect-error -- `pathname` is a union of every route, so TS
            // cannot prove these params match the one being rendered. next-intl
            // documents this cast for exactly this case.
            href={{ pathname, params }}
            locale={locale}
            // Kliknięcie tutaj jest JEDYNYM świadomym wyborem języka w całym
            // serwisie, więc tylko ono go zapamiętuje. Adres `/en/...` mówi,
            // w jakim języku jest ta strona — nie w jakim chce czytać ten
            // człowiek; bez zapisu klient wracający za tydzień na domenę znowu
            // szuka przełącznika, który już raz znalazł.
            onClick={() => writeChoice(locale as Locale)}
            aria-current={locale === active ? "true" : undefined}
            className={cn(
              // PL and EN sat 2px apart at 15×18 each, which on a phone is a
              // coin toss rather than a choice. The label is unchanged; the
              // box around it is now something a thumb can land on.
              //
              // `.tap-area` domyka ostatnie brakujące piksele: samo pudełko to
              // 32×40, a próg wynosi 44×44. Powiększanie pudełka rozepchnęłoby
              // nagłówek, więc rośnie wyłącznie pole trafienia. Przełącznik
              // języka jest pierwszą rzeczą, której dotyka obcojęzyczny klient.
              "tap-area flex h-10 min-w-8 items-center justify-center transition-colors",
              locale === active
                ? "text-ink"
                : "text-ink-faint hover:text-silver",
            )}
          >
            {locale.toUpperCase()}
          </Link>
        </span>
      ))}
    </div>
  );
}
