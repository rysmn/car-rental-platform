"use client";

import { Link, usePathname, type AppHref } from "@/i18n/navigation";

/**
 * `icon` przychodzi jako gotowy ELEMENT, nie jako komponent — funkcja nie
 * przechodzi przez granicę serwer → klient, element przechodzi, bo jest wtedy
 * danymi. Dzięki temu pasek boczny i menu mobilne dzielą jedną tablicę NAV
 * i nie mogą się rozjechać.
 */
export type NavItem = {
  href: AppHref;
  label: string;
  icon?: React.ReactNode;
  /** Własny kolor piktogramu tej sekcji. Tekst zostaje jasny. */
  color?: string;
};

/**
 * Bezpieczeństwo jest podstroną Ustawień, więc nie ma własnej pozycji w menu —
 * ale jest jedyną sekcją, w której „jestem tutaj” niesie ostrzeżenie: to stąd
 * zmienia się hasło, wygasza sesje i czyta próby logowania. Dlatego kiedy
 * oglądana jest ta podstrona, pozycja „Ustawienia” świeci na czerwono zamiast
 * na swojej spokojnej szarości. Czerwony jest tu wyjątkiem i ma nim zostać —
 * gdyby dostała go druga sekcja, przestałby cokolwiek znaczyć.
 */
const SECURITY_HREF = "/admin/settings/bezpieczenstwo";
const SECURITY_COLOR = "#EF4444";

/**
 * Kolor, którym ma świecić pozycja menu przy tej ścieżce. Jedna funkcja dla
 * paska bocznego i dla szuflady mobilnej, żeby telefon i desktop nie zapaliły
 * się dwoma różnymi kolorami na tej samej stronie.
 */
export function navColor(pathname: string, item: NavItem): string | undefined {
  if (item.href === "/admin/settings" && isActiveHref(pathname, SECURITY_HREF)) {
    return SECURITY_COLOR;
  }
  return item.color;
}

/**
 * Czy ta pozycja odpowiada oglądanej stronie.
 *
 * `/admin` musi być dopasowane DOKŁADNIE — inaczej Pulpit świeciłby się na
 * każdej podstronie panelu, bo każda zaczyna się od `/admin`. Reszta dopasowuje
 * się przedrostkiem, żeby `/admin/fleet/<id>` podświetlało Flotę.
 */
export function isActiveHref(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Pozycje menu panelu — jedyny powód, dla którego to jest komponent kliencki:
 * stan „aktywne” wymaga znajomości bieżącej ścieżki, a tej po stronie serwera
 * w tym układzie nie ma. Reszta paska bocznego zostaje serwerowa.
 *
 * `usePathname` pochodzi z `@/i18n/navigation`, więc zwraca ścieżkę BEZ
 * przedrostka języka: `/admin/fleet`, nie `/en/admin/fleet`. Porównywanie
 * z surowym `usePathname` Nexta wymagałoby obcinania locale ręcznie i psuło
 * się przy każdej zmianie konfiguracji tras.
 */
export function AdminNavLinks({ nav }: { nav: readonly NavItem[] }) {
  const pathname = usePathname();

  return (
    <>
      {nav.map((n) => {
        const active = isActiveHref(pathname, n.href as string);
        return (
          <Link
            key={n.label}
            href={n.href}
            aria-current={active ? "page" : undefined}
            style={{ "--nav": navColor(pathname, n) } as React.CSSProperties}
            className={`admin-nav-item label-tight tap-block flex items-center gap-3 px-2 py-3 text-[11px] ${
              active ? "is-active text-ink" : "text-silver hover:text-ink"
            }`}
          >
            {/* shrink-0, żeby najdłuższa etykieta („Dziennik zdarzeń”) niczego
                nie przesuwała: kolumna ikon stoi w miejscu, a tekst zawija się
                tylko wtedy, gdy zawinąłby się i bez ikony. */}
            <span className="admin-nav-icon shrink-0">{n.icon}</span>
            {n.label}
          </Link>
        );
      })}
    </>
  );
}
