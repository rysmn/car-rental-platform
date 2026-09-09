import { BOOKING_RULES } from "@/lib/booking/fees";
import { fromIso, inclusiveDays, isoOf, todayIso } from "@/lib/dates";
import type { Intent, Parsed } from "./nlu";
import type { ChatSlots } from "./types";

/**
 * A range chosen in the calendar, on its way in.
 *
 * Two dates picked from a grid are not a sentence, so they do not go through
 * the message parser: the widget sends them alongside the message and this
 * module puts them straight into the reading. That removes a whole class of
 * failure — a picked date can never be misread, mis-yeared or lost to a
 * language model's paraphrase — and it saves a model call on a machine-written
 * message.
 *
 * What it does NOT remove is validation. The values arrive from a browser like
 * everything else in the request, so they are checked here against the same
 * booking rules the server enforces at submit time: no past days, no backwards
 * range, no rental longer or further ahead than the reservation system allows.
 * A range that fails is dropped, and the turn proceeds as an ordinary message —
 * never as a booking the form would later refuse.
 */

export type PickedDates = { from: string; to: string };

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Is this a day that exists? `2026-02-30` matches the shape and does not. */
function realDay(iso: string): boolean {
  return ISO_RE.test(iso) && isoOf(fromIso(iso)) === iso;
}

/**
 * The picked range, or `null` if the reservation system would not take it.
 *
 * `today` is a parameter so this is testable, and so the caller decides which
 * clock counts.
 */
export function validPickedDates(
  input: { from: string; to: string },
  today: string = todayIso(),
): PickedDates | null {
  const { from, to } = input;
  if (!realDay(from) || !realDay(to)) return null;
  if (from < today) return null;
  if (to < from) return null;
  if (inclusiveDays(from, to) > BOOKING_RULES.maxDays) return null;
  if (inclusiveDays(today, from) - 1 > BOOKING_RULES.maxLeadDays) return null;
  return { from, to };
}

/**
 * Which answer a freshly picked range should produce.
 *
 * In order: the question the assistant actually asked, then the subject the
 * conversation is on (`dateIntent`, set by whichever handler offered the
 * picker), then the honest default — a car has been chosen, so check it; none
 * has, so search.
 */
export function pickedIntent(slots: ChatSlots): Intent {
  if (slots.awaiting === "dates" && slots.pendingIntent) {
    return slots.pendingIntent;
  }
  if (slots.dateIntent) return slots.dateIntent;
  return slots.carModelIds.length > 0 ? "CHECK_AVAILABILITY" : "FIND_CAR";
}

/**
 * The parser's reading with the picked dates written over it.
 *
 * Confidence becomes certain because it is: nobody guessed at these two days.
 * Everything else the sentence carried — a car name typed alongside, a pickup
 * point — is left exactly as it was read.
 */
export function withPickedDates(
  parsed: Parsed,
  slots: ChatSlots,
  picked: PickedDates,
): Parsed {
  return {
    ...parsed,
    intent: pickedIntent(slots),
    confidence: "confident",
    confidenceScore: 1,
    entities: {
      ...parsed.entities,
      dateFrom: picked.from,
      dateTo: picked.to,
      // A range beats a length: "na tydzień" typed earlier must not now
      // compete with the two days in front of us.
      days: null,
    },
  };
}
