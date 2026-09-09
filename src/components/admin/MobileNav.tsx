"use client";

import { useState } from "react";
import Image from "next/image";
import { CalendarCheck, Mail, TriangleAlert } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { isActiveHref, navColor, type NavItem } from "./AdminNavLinks";

/*
 * `NavItem` mieszka w `AdminNavLinks` — jeden typ i jedna reguła „co jest
 * aktywne” dla paska bocznego i dla szuflady, żeby telefon i desktop nie
 * podświetlały dwóch różnych pozycji tego samego menu.
 */

export function MobileNav({
  nav,
  admin,
  onSignOut,
  alerts,
  alertColor,
  inbox,
  inboxColor,
  reservations,
  reservationColor,
  themeToggle,
}: {
  nav: readonly NavItem[];
  admin: { name: string; email: string };
  onSignOut: () => void;
  /** How many things need attention right now — 0 hides the badge. */
  alerts: number;
  /**
   * Ile zapytań klientów czeka na odpowiedź — 0 chowa odznakę.
   *
   * OSOBNA LICZBA, nie doliczona do alertów. „3 awarie" i „3 osoby czekające
   * na odpowiedź" to dwie różne rzeczy i zsumowane przestają znaczyć
   * cokolwiek — a to skrzynka jest tą, którą da się opróżnić.
   */
  inbox: number;
  /** Kolor ikony skrzynki — ten sam, którego używa kafel w pasku bocznym. */
  inboxColor?: string;
  /**
   * Ile REZERWACJI czeka na potwierdzenie — 0 chowa odznakę.
   *
   * Trzecia osobna liczba, z tego samego powodu co druga: zamówienie nie jest
   * zapytaniem i żadne z nich nie jest awarią. Zsumowane w jedną odznakę nie
   * odpowiadają na żadne z trzech pytań, które operator faktycznie zadaje.
   */
  reservations: number;
  /** Kolor ikony rezerwacji — ten sam, którego używa kafel w pasku bocznym. */
  reservationColor?: string;
  /** Kolor ikony alertów — ten sam, którego używa kafel w pasku bocznym. */
  alertColor?: string;
  /** Rendered on the server and passed in, so this file stays framework-thin. */
  themeToggle: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [renderedPathname, setRenderedPathname] = useState(pathname);

  // Closes the menu after navigating — otherwise it stays open over the
  // next page since it isn't tied to route state. Adjusting state during
  // render (rather than in an effect) avoids an extra render pass.
  if (pathname !== renderedPathname) {
    setRenderedPathname(pathname);
    setOpen(false);
  }

  return (
    <div className="border-line border-b md:hidden">
      <div className="flex items-center justify-between p-4">
        <Image
          src="/brand/aa-logo-dark.png"
          alt="A&A Corporation"
          width={160}
          height={88}
          className="hero-photo--dark h-7 w-auto"
        />
        <Image
          src="/brand/aa-logo-mono-black.png"
          alt="A&A Corporation"
          width={160}
          height={88}
          className="hero-photo--light h-7 w-auto"
        />

        {/* Alerts and the theme sit in the bar itself, not behind the burger:
            both are things somebody reaches for BEFORE reading the page — one
            because it is urgent, the other because the screen is unreadable in
            the sun. */}
        <span className="ml-auto flex items-center gap-1">
          {/* Rezerwacje → Skrzynka → Alerty, ta sama kolejność co w pasku
              bocznym, żeby operator nie szukał ich raz z lewej, raz z prawej.
              Trzy ikony zamiast dwóch, bo trzy są trzy różne pytania: kto
              zamówił, kto pyta, co jest zepsute. */}
          <Link
            href="/admin/reservations"
            aria-label={`Rezerwacje do potwierdzenia: ${reservations}`}
            className="text-ink relative flex h-11 w-11 items-center justify-center"
          >
            <CalendarCheck
              size={20}
              strokeWidth={1.5}
              aria-hidden
              style={{ color: reservationColor }}
              className="admin-nav-icon"
            />
            {reservations > 0 && (
              <span className="bg-red rounded-pill absolute top-1 right-0 min-w-4 px-1 text-center text-[10px] leading-4 text-white">
                {reservations > 99 ? "99+" : reservations}
              </span>
            )}
          </Link>
          <Link
            href="/admin/inbox"
            aria-label={`Skrzynka: ${inbox}`}
            className="text-ink relative flex h-11 w-11 items-center justify-center"
          >
            <Mail
              size={20}
              strokeWidth={1.5}
              aria-hidden
              style={{ color: inboxColor }}
              className="admin-nav-icon"
            />
            {inbox > 0 && (
              <span className="bg-red rounded-pill absolute top-1 right-0 min-w-4 px-1 text-center text-[10px] leading-4 text-white">
                {inbox > 99 ? "99+" : inbox}
              </span>
            )}
          </Link>
          <Link
            href="/admin/alerty"
            aria-label={`Alerty: ${alerts}`}
            className="text-ink relative flex h-11 w-11 items-center justify-center"
          >
            <TriangleAlert
              size={20}
              strokeWidth={1.5}
              aria-hidden
              style={{ color: alertColor }}
              className="admin-nav-icon"
            />
            {alerts > 0 && (
              <span className="bg-red rounded-pill absolute top-1 right-0 min-w-4 px-1 text-center text-[10px] leading-4 text-white">
                {alerts > 99 ? "99+" : alerts}
              </span>
            )}
          </Link>
          {themeToggle}
        </span>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Zamknij menu" : "Otwórz menu"}
          className="text-ink flex h-10 w-10 items-center justify-center"
        >
          {open ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
              <path
                d="M5 5l14 14M19 5L5 19"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
              <path
                d="M4 6h16M4 12h16M4 18h16"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>

      {open && (
        <nav className="border-line divide-line divide-y border-t">
          {nav.map((n) => {
            const active = isActiveHref(pathname, n.href as string);
            return (
              <Link
                key={n.label}
                href={n.href}
                aria-current={active ? "page" : undefined}
                style={
                  { "--nav": navColor(pathname, n) } as React.CSSProperties
                }
                className={`admin-nav-item label-tight active:text-ink flex items-center gap-3 px-4 py-4 text-sm ${
                  active ? "is-active text-ink" : "text-silver"
                }`}
              >
                <span className="admin-nav-icon shrink-0">{n.icon}</span>
                {n.label}
              </Link>
            );
          })}
          <div className="p-4">
            <p className="text-ink truncate text-xs">{admin.name}</p>
            <p className="text-ink-faint truncate text-[10px]">{admin.email}</p>
            <form action={onSignOut}>
              <button className="label-tight text-red mt-3 text-[10px]">
                Wyloguj
              </button>
            </form>
          </div>
        </nav>
      )}
    </div>
  );
}
