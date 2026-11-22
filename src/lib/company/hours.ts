import { z } from "zod";

/**
 * Opening hours — one machine-readable source for both the contact page and
 * the `openingHoursSpecification` in the home page's `AutoRental` markup.
 *
 * Google prints these next to the business in search results and in the
 * Business Profile, so they are a published claim about when a visitor can
 * actually collect a car. That is exactly why they are not a free-text field:
 * "Pon.–Pt. 9–18" is unparseable, and a schedule Google cannot parse is a
 * schedule Google does not show.
 *
 * The free-text `company.hours` setting still exists alongside this, and still
 * wins for *display* — it is where nuance goes ("po wcześniejszym umówieniu").
 * The structured value below is the only thing that ever reaches JSON-LD.
 */

/** "HH:MM" on a 24-hour clock, or "" when the day is closed. */
const timeOfDay = z
  .string()
  .trim()
  .refine((v) => v === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), {
    message: "invalid_time",
  });

const daySchema = z.object({
  closed: z.boolean().default(false),
  opens: timeOfDay.default(""),
  closes: timeOfDay.default(""),
});
export type OpeningDayHours = z.infer<typeof daySchema>;

export const openingHoursSchema = z.object({
  monday: daySchema.default({ closed: false, opens: "", closes: "" }),
  tuesday: daySchema.default({ closed: false, opens: "", closes: "" }),
  wednesday: daySchema.default({ closed: false, opens: "", closes: "" }),
  thursday: daySchema.default({ closed: false, opens: "", closes: "" }),
  friday: daySchema.default({ closed: false, opens: "", closes: "" }),
  saturday: daySchema.default({ closed: false, opens: "", closes: "" }),
  sunday: daySchema.default({ closed: false, opens: "", closes: "" }),
});
export type OpeningHours = z.infer<typeof openingHoursSchema>;

/**
 * Day order, with the schema.org name and the label each locale prints.
 *
 * Monday-first because that is the Polish week; schema.org has no opinion on
 * order, but a spec that lists `["Sunday","Monday"]` reads as an error to a
 * human reviewing the markup.
 */
export const OPENING_DAYS = [
  { key: "monday", schema: "Monday", pl: "Pon.", en: "Mon" },
  { key: "tuesday", schema: "Tuesday", pl: "Wt.", en: "Tue" },
  { key: "wednesday", schema: "Wednesday", pl: "Śr.", en: "Wed" },
  { key: "thursday", schema: "Thursday", pl: "Czw.", en: "Thu" },
  { key: "friday", schema: "Friday", pl: "Pt.", en: "Fri" },
  { key: "saturday", schema: "Saturday", pl: "Sob.", en: "Sat" },
  { key: "sunday", schema: "Sunday", pl: "Ndz.", en: "Sun" },
] as const satisfies readonly {
  key: keyof OpeningHours;
  schema: string;
  pl: string;
  en: string;
}[];

export type OpeningDayKey = (typeof OPENING_DAYS)[number]["key"];

/**
 * Round the clock, seven days a week.
 *
 * `00:00`–`23:59` is not an approximation of "always open" — it is the exact
 * form Google's structured-data documentation specifies for a 24-hour
 * business. Do not "fix" it to `00:00`–`00:00`, which some validators read as
 * a zero-length window, i.e. permanently closed.
 */
const ALL_DAY = { closed: false, opens: "00:00", closes: "23:59" };
export const OPENING_HOURS_24_7: OpeningHours = {
  monday: ALL_DAY,
  tuesday: ALL_DAY,
  wednesday: ALL_DAY,
  thursday: ALL_DAY,
  friday: ALL_DAY,
  saturday: ALL_DAY,
  sunday: ALL_DAY,
};

/**
 * The office as it actually works: 08:00–23:00, seven days a week.
 *
 * This is the reservations desk, not the business as a whole — cars change
 * hands at any hour by arrangement and the phone is answered longer. Those are
 * separate facts and they live in separate fields precisely so that this one
 * can be published to Google without over-claiming.
 */
const OFFICE_DAY = { closed: false, opens: "08:00", closes: "23:00" };
export const OFFICE_HOURS_DEFAULT: OpeningHours = {
  monday: OFFICE_DAY,
  tuesday: OFFICE_DAY,
  wednesday: OFFICE_DAY,
  thursday: OFFICE_DAY,
  friday: OFFICE_DAY,
  saturday: OFFICE_DAY,
  sunday: OFFICE_DAY,
};

/**
 * Telephone hours — a single daily window, separate from the office schedule.
 *
 * A&A answers the phone longer than the office takes reservations, and hands
 * cars over at any hour by arrangement. Three different facts; this is the
 * second of them, and it is deliberately NOT part of `openingHours`: only the
 * office schedule may reach `openingHoursSpecification`, because that is what
 * Google prints as "open now", and a business is not "open" merely because
 * somebody would answer a call.
 *
 * `24:00` is allowed as a closing time and nowhere else. It is how the operator
 * states the window ("07:00–24:00") and it never reaches JSON-LD, where the
 * same instant would have to be written `23:59`.
 */
const phoneTime = z
  .string()
  .trim()
  .refine((v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v) || v === "24:00", {
    message: "invalid_time",
  });

export const phoneHoursSchema = z.object({
  opens: phoneTime.default("07:00"),
  closes: phoneTime.default("24:00"),
});
export type PhoneHours = z.infer<typeof phoneHoursSchema>;

/** A day counts as published only once it has both ends of a range. */
const isOpen = (day: OpeningDayHours) =>
  !day.closed && day.opens !== "" && day.closes !== "";

const isAllDay = (day: OpeningDayHours) =>
  isOpen(day) && day.opens === "00:00" && day.closes === "23:59";

/**
 * Consecutive days sharing one range, collapsed into a single run.
 *
 * Both consumers need this: schema.org lets one `OpeningHoursSpecification`
 * carry an array of days, and no human wants to read seven identical lines.
 */
function runs(hours: OpeningHours) {
  const out: {
    days: (typeof OPENING_DAYS)[number][];
    opens: string;
    closes: string;
  }[] = [];

  for (const day of OPENING_DAYS) {
    const value = hours[day.key];
    if (!isOpen(value)) continue;

    const last = out.at(-1);
    // Only *adjacent* days merge. A Monday/Wednesday pair with identical hours
    // stays two entries, because "Pon.–Śr." would silently invent Tuesday.
    const adjacent =
      last !== undefined &&
      OPENING_DAYS.indexOf(last.days.at(-1)!) === OPENING_DAYS.indexOf(day) - 1;

    if (
      adjacent &&
      last.opens === value.opens &&
      last.closes === value.closes
    ) {
      last.days.push(day);
    } else {
      out.push({ days: [day], opens: value.opens, closes: value.closes });
    }
  }

  return out;
}

/**
 * The one range every open day shares, or `null` when they differ.
 *
 * "08:00–23:00" reads better than "Pon.–Ndz. 08:00–23:00" in a sentence about
 * when the office works, and every day currently carries the same window. The
 * moment one day differs this returns `null` and the caller falls back to the
 * full schedule rather than picking a day and calling it the answer.
 */
export function uniformRange(
  hours: OpeningHours,
): { opens: string; closes: string } | null {
  const days = OPENING_DAYS.map((d) => hours[d.key]);
  if (!days.every(isOpen)) return null;
  const first = days[0];
  return days.every((d) => d.opens === first.opens && d.closes === first.closes)
    ? { opens: first.opens, closes: first.closes }
    : null;
}

/**
 * schema.org `openingHoursSpecification`, or `undefined` when nothing is
 * configured.
 *
 * `undefined` rather than `[]`: an empty array is a claim that the business has
 * no opening hours at all, which is worse than saying nothing.
 */
export function openingHoursSpecification(hours: OpeningHours) {
  const grouped = runs(hours);
  if (grouped.length === 0) return undefined;

  return grouped.map((run) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: run.days.map((d) => d.schema),
    opens: run.opens,
    closes: run.closes,
  }));
}

/**
 * Human-readable summary, or "" when nothing is configured.
 *
 * The all-week/all-day case gets its own sentence because "Pon.–Ndz.
 * 00:00–23:59" is a technically correct answer that no visitor reads as
 * "whenever you need the car".
 */
export function formatOpeningHours(
  hours: OpeningHours,
  locale: string,
): string {
  const grouped = runs(hours);
  if (grouped.length === 0) return "";

  const en = locale === "en";

  if (
    grouped.length === 1 &&
    grouped[0].days.length === OPENING_DAYS.length &&
    isAllDay(hours.monday)
  ) {
    return en ? "Open 24/7" : "Całodobowo, 7 dni w tygodniu";
  }

  return grouped
    .map((run) => {
      const first = run.days[0];
      const last = run.days.at(-1)!;
      const label =
        run.days.length === 1
          ? en
            ? first.en
            : first.pl
          : `${en ? first.en : first.pl}–${en ? last.en : last.pl}`;
      const range = isAllDay({ closed: false, ...run })
        ? en
          ? "24 h"
          : "całodobowo"
        : `${run.opens}–${run.closes}`;
      return `${label} ${range}`;
    })
    .join(" · ");
}
