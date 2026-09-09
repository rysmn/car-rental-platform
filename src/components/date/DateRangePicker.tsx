"use client";

import { useMemo, useState } from "react";
import { BOOKING_RULES } from "@/lib/booking/fees";
import {
  addDaysIso,
  formatDay,
  fromIso,
  inclusiveDays,
  isoOf,
  mondayIndex,
  todayIso,
  weekdayInitials,
} from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * The date picker — one component, used everywhere a range has to be chosen.
 *
 * ## Why this exists rather than a reused one
 *
 * The booking form does not have a calendar to borrow: its two fields are
 * native `<input type="date">`, which cannot be opened from a chat message, and
 * the car page's `AvailabilityCalendar` is a read-only grid that paints free
 * and taken days — it has no notion of a selection. So this is the first real
 * range picker in the project, and it is deliberately the ONLY one: the
 * assistant opens this component from every path that needs a date, and any
 * future surface that needs one opens the same component.
 *
 * ## What it will not do
 *
 * It invents no rules. Past days, how far ahead a rental may start and how long
 * it may run all come from `BOOKING_RULES` — the same constants the server
 * enforces in `lib/booking/schema` — so the picker cannot offer a range the
 * booking form would then reject, and cannot quietly widen one either. It knows
 * nothing about availability, prices or fees; a chosen range is checked by the
 * existing availability engine afterwards, exactly as a typed one is.
 *
 * ## Interaction
 *
 * First tap sets the pickup day, second sets the return day. A second tap
 * before the first restarts the selection instead of producing a backwards
 * range — a return date earlier than the pickup date is not a state this
 * component can be put into.
 */

type Locale = "pl" | "en";

const t = (locale: Locale, pl: string, en: string) =>
  locale === "en" ? en : pl;

/** Cells are `aspect-square` inside a 7-column grid, so a phone never scrolls
    sideways; this floor keeps them thumb-sized on the narrowest screens. */
// 40px floor keeps a day thumb-sized; the ceiling stops six rows of squares
// from overflowing the 544px desktop panel just because it is 336px wide.
const CELL = "min-h-[2.5rem] max-h-[2.75rem]";

export function DateRangePicker({
  locale,
  initialFrom,
  initialTo,
  onConfirm,
  onCancel,
  maxDays = BOOKING_RULES.maxDays,
  maxLeadDays = BOOKING_RULES.maxLeadDays,
}: {
  locale: Locale;
  /** Dates already agreed — the picker opens showing them, not empty. */
  initialFrom?: string | null;
  initialTo?: string | null;
  onConfirm: (from: string, to: string) => void;
  onCancel: () => void;
  /** Longest rental the booking rules allow, in billed days. */
  maxDays?: number;
  /** How far ahead a rental may start. */
  maxLeadDays?: number;
}) {
  // Read once per mount: a fresh `new Date()` on every render would be a new
  // identity for every memo below, and midnight passing mid-conversation must
  // not move the squares under the customer's finger.
  const [today] = useState(todayIso);
  const maxIso = useMemo(
    () => addDaysIso(today, maxLeadDays),
    [today, maxLeadDays],
  );

  const [from, setFrom] = useState<string | null>(
    initialFrom && initialFrom >= today ? initialFrom : null,
  );
  const [to, setTo] = useState<string | null>(
    initialFrom && initialTo && initialTo >= initialFrom ? initialTo : null,
  );
  const [hover, setHover] = useState<string | null>(null);

  // The month on screen, as plain numbers — see `AvailabilityCalendar` for why
  // this is not held as a Date.
  const start = fromIso(from ?? today);
  const [cursor, setCursor] = useState({
    year: start.getFullYear(),
    month: start.getMonth(),
  });

  const monthName = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pl-PL", {
        month: "long",
        year: "numeric",
      }).format(new Date(cursor.year, cursor.month, 1)),
    [locale, cursor],
  );

  // Skróty dni z jednej tablicy w `lib/dates` — nie z ucinania nazwy z `Intl`
  // do dwóch znaków, które dawało po polsku „po … ni". Patrz `weekdayInitials`.
  const weekdays = weekdayInitials(locale);

  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const leading = mondayIndex(new Date(cursor.year, cursor.month, 1));

  // Arrows stop at the edges of the window a booking may start in, so there is
  // no way to wander into months where every square is dead.
  const firstOfMonth = isoOf(new Date(cursor.year, cursor.month, 1));
  const lastOfMonth = isoOf(new Date(cursor.year, cursor.month, daysInMonth));
  const canGoBack = firstOfMonth > today;
  const canGoForward = lastOfMonth < maxIso;

  const step = (n: number) =>
    setCursor((c) => {
      const d = new Date(c.year, c.month + n, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  /** Choosing the end: how far the range may still reach. */
  const endCeiling = from ? addDaysIso(from, maxDays - 1) : maxIso;

  function disabledFor(day: string): boolean {
    if (day < today || day > maxIso) return true;
    // While a start is set and an end is not, days past the longest permitted
    // rental are out — but earlier days stay live, because tapping one of those
    // means "actually, start here" rather than a mistake.
    if (from && !to && day > from && day > endCeiling) return true;
    return false;
  }

  function pick(day: string) {
    if (disabledFor(day)) return;
    if (!from || to || day < from) {
      setFrom(day);
      setTo(null);
      setHover(null);
      return;
    }
    setTo(day);
  }

  // What the range looks like right now, including the day under the cursor
  // while the second click has not happened yet.
  const previewEnd = to ?? (from && hover && hover > from ? hover : null);
  const inRange = (day: string) =>
    Boolean(from && previewEnd && day > from && day < previewEnd);

  const ready = Boolean(from && to);
  const days = from && to ? inclusiveDays(from, to) : 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* OD / DO — the two answers the picker is collecting, always visible so
          a half-finished selection is never a mystery. */}
      <div className="border-line grid shrink-0 grid-cols-2 gap-2 border-b p-3">
        {(
          [
            [t(locale, "ODBIÓR", "PICK-UP"), from, !from || Boolean(to)],
            [t(locale, "ZWROT", "RETURN"), to, Boolean(from) && !to],
          ] as [string, string | null, boolean][]
        ).map(([label, value, active]) => (
          <div
            key={label}
            className={cn("border p-2", active ? "border-red" : "border-line")}
          >
            <p className="label-tight text-silver text-[10px]">{label}</p>
            <p className="text-ink mt-1 text-sm tabular-nums">
              {value ? formatDay(value, locale) : "—"}
            </p>
          </div>
        ))}
      </div>

      {/* Month navigation sits OUTSIDE the scrolling area on purpose. Inside it,
          clicking a day scrolled the focused square into view and carried the
          month name and the arrows off the top with it — measured on a
          768×1024 tablet, where the panel is 544px tall and six rows of days do
          not fit. Which month you are looking at may not scroll away. */}
      <div className="shrink-0 px-3 pt-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={!canGoBack}
            aria-label={t(locale, "Poprzedni miesiąc", "Previous month")}
            className="border-line hover:border-line-strong text-ink-muted hover:text-ink flex h-10 w-10 shrink-0 items-center justify-center border text-sm transition-colors disabled:opacity-30"
          >
            ←
          </button>
          <p
            aria-live="polite"
            className="font-heading text-ink min-w-0 truncate text-sm font-bold first-letter:uppercase"
          >
            {monthName}
          </p>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={!canGoForward}
            aria-label={t(locale, "Następny miesiąc", "Next month")}
            className="border-line hover:border-line-strong text-ink-muted hover:text-ink flex h-10 w-10 shrink-0 items-center justify-center border text-sm transition-colors disabled:opacity-30"
          >
            →
          </button>
        </div>

        {/* Same seven columns, same gap, same padding as the grid below, so the
            initials line up with their days. Outside the scroller for the same
            reason the arrows are: a column header that scrolls away is not a
            header. */}
        <div className="mt-3 grid grid-cols-7 gap-1" aria-hidden="true">
          {weekdays.map((w, i) => (
            <span
              key={i}
              className="label-tight text-ink-faint text-center text-[9px]"
            >
              {w}
            </span>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        {/* A group of buttons, not a `role="grid"`: the days ARE buttons and
            announce themselves as such, and claiming a grid without rows and
            cell semantics reads worse to a screen reader than the plain truth. */}
        <div
          className="mt-1 grid grid-cols-7 gap-1"
          role="group"
          aria-label={monthName}
        >
          {Array.from({ length: leading }, (_, i) => (
            <span key={`pad-${i}`} />
          ))}

          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = isoOf(new Date(cursor.year, cursor.month, i + 1));
            const off = disabledFor(day);
            const edge = day === from || day === to;
            const between = inRange(day);

            return (
              <button
                key={day}
                type="button"
                disabled={off}
                aria-pressed={edge || between}
                aria-label={formatDay(day, locale)}
                onClick={() => pick(day)}
                onMouseEnter={() => setHover(day)}
                onMouseLeave={() => setHover((h) => (h === day ? null : h))}
                className={cn(
                  CELL,
                  "flex aspect-square items-center justify-center border text-xs tabular-nums transition-colors",
                  off
                    ? "border-line/40 text-ink-faint/40 cursor-not-allowed"
                    : edge
                      ? "border-red bg-red font-semibold text-white"
                      : between
                        ? "border-red/40 bg-red/15 text-ink"
                        : day === today
                          ? "border-line-strong text-ink"
                          : "border-line text-ink-muted hover:border-ink hover:text-ink",
                )}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        <p className="text-ink-faint mt-3 text-[10px] leading-relaxed">
          {from && !to
            ? t(locale, "Wybierz datę zwrotu.", "Now choose the return date.")
            : t(
                locale,
                "Pierwsze kliknięcie to odbiór, drugie to zwrot.",
                "First tap is pick-up, second is return.",
              )}
        </p>
      </div>

      <div className="border-line shrink-0 border-t p-3">
        <p className="text-ink text-sm tabular-nums">
          {ready
            ? `${formatDay(from!, locale)} → ${formatDay(to!, locale)} · ${days} ${t(locale, days === 1 ? "dzień" : "dni", days === 1 ? "day" : "days")}`
            : t(locale, "Termin: —", "Dates: —")}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => ready && onConfirm(from!, to!)}
            disabled={!ready}
            className="label bg-red hover:bg-red-hover inline-flex h-11 flex-1 items-center justify-center px-4 text-[11px] text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t(locale, "Zatwierdź termin", "Confirm dates")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="label-tight border-line hover:border-line-strong text-ink-muted hover:text-ink inline-flex h-11 shrink-0 items-center border px-4 text-[11px] transition-colors"
          >
            {t(locale, "Anuluj", "Cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
