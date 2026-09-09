import {
  formatOpeningHours,
  uniformRange,
  type OpeningHours,
  type PhoneHours,
} from "./hours";

/**
 * When A&A works — the four facts, worded once.
 *
 * They are four different things, and the site used to blur them into one
 * ("Kontakt 8:00–24:00", "odbiór 24/7", "całodobowo"):
 *
 *   1. the office and the reservations desk — 08:00–23:00
 *   2. the telephone — 07:00–24:00
 *   3. after midnight — e-mail, or a handover agreed earlier
 *   4. collection and return of a car — any hour, by prior arrangement
 *
 * Everything that states an hour to a customer comes through here: the contact
 * page, the home page, the FAQ, the assistant's contact card and the assistant's
 * answers about hours. The numbers themselves come from the admin settings, so
 * the site and the assistant cannot drift apart, and neither can drift from what
 * Google is told — `openingHoursSpecification` is built from the same
 * `openingHours` field this reads.
 *
 * Fact 4 has no field, on purpose. "Whenever, if you arrange it" is not a
 * schedule and there is nothing to configure: making it a time range would
 * invite somebody to publish a narrower promise than the business actually
 * keeps.
 */

type Locale = string;

/** The parts of `company` this needs. Structural, so no server-only import. */
export type ServiceHoursInput = {
  openingHours: OpeningHours;
  phoneHours: PhoneHours;
  email: string;
  /** Free-text override an admin wrote for the contact page. */
  hours?: string;
};

export type ServiceHoursCopy = {
  /** "08:00–23:00", or the full weekly schedule if days differ. */
  office: string;
  /** "07:00–24:00". */
  phone: string;
  /** The four labelled lines, in the order a customer needs them. */
  lines: { label: string; value: string }[];
  /** What happens after the phone window closes. */
  note: string;
  /** One line, for places with no room for four — the assistant's contact card. */
  short: string;
};

const t = (locale: Locale, pl: string, en: string) =>
  locale === "en" ? en : pl;

export function serviceHours(
  company: ServiceHoursInput,
  locale: Locale,
): ServiceHoursCopy {
  const range = uniformRange(company.openingHours);
  const office =
    (range ? `${range.opens}–${range.closes}` : "") ||
    formatOpeningHours(company.openingHours, locale) ||
    t(locale, "do ustalenia", "by arrangement");
  const phone = `${company.phoneHours.opens}–${company.phoneHours.closes}`;
  const handover = t(
    locale,
    "24/7 po wcześniejszym uzgodnieniu",
    "24/7 by prior arrangement",
  );

  const note = company.email
    ? t(
        locale,
        `Po ${company.phoneHours.closes} możesz wysłać nam wiadomość e-mail na ${company.email}. Wcześniej uzgodnione odbiory i zwroty realizujemy również w godzinach nocnych.`,
        `After ${company.phoneHours.closes} you can e-mail us at ${company.email}. Collections and returns arranged in advance also happen at night.`,
      )
    : t(
        locale,
        `Po ${company.phoneHours.closes} możesz wysłać nam wiadomość e-mail. Wcześniej uzgodnione odbiory i zwroty realizujemy również w godzinach nocnych.`,
        `After ${company.phoneHours.closes} you can e-mail us. Collections and returns arranged in advance also happen at night.`,
      );

  return {
    office,
    phone,
    lines: [
      {
        label: t(
          locale,
          "Biuro i obsługa rezerwacji",
          "Office and reservations",
        ),
        value: office,
      },
      {
        label: t(locale, "Kontakt telefoniczny", "Phone"),
        value: phone,
      },
      {
        label: t(
          locale,
          "Odbiór i zwrot samochodu",
          "Car collection and return",
        ),
        value: handover,
      },
    ],
    note,
    short: t(
      locale,
      `Biuro i rezerwacje ${office} · telefon ${phone} · odbiór i zwrot ${handover}`,
      `Office and reservations ${office} · phone ${phone} · collection and return ${handover}`,
    ),
  };
}
