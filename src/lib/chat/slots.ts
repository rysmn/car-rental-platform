import type { Parsed } from "./nlu";
import type { ChatSlots } from "./types";

/**
 * What the assistant carries from one message to the next.
 *
 * Pure, and deliberately in its own file. It used to live inside
 * `deterministic.ts`, which imports `server-only` and therefore cannot be
 * loaded by a test runner — so the one piece of logic that decides whether a
 * conversation feels like a conversation had no test. Here it does.
 *
 * There is no storage in this module and no storage anywhere behind it. Slots
 * arrive inside the request and leave inside the reply, so two visitors cannot
 * reach each other's answers: there is no map to collide in. That is a property
 * worth protecting — see `scripts/test-context.ts`, which asserts it.
 */

/**
 * New information wins; silence never erases.
 *
 * A customer who says "a jednak od 22" keeps the car and the location they
 * already chose, which is what makes the conversation feel like a conversation
 * rather than a form.
 */
export function mergeSlots(slots: ChatSlots, p: Parsed): ChatSlots {
  const e = p.entities;
  return {
    carModelIds: e.carModelIds.length > 0 ? e.carModelIds : slots.carModelIds,
    // Two axes, two slots. Merged the same way and never into each other: a
    // customer who says "SUV" and then "coś tańszego" still wants a SUV, and
    // one who says "luksusowy" and then "SUV" wants both conditions to hold.
    bodyType: e.bodyType ?? slots.bodyType,
    segment: e.segment ?? slots.segment,
    driverClass: e.driverClass ?? slots.driverClass,
    /*
     * A budget survives the rest of the conversation, like every other stated
     * criterion: somebody who said "do 400 zł" once should not have to repeat
     * it when they then ask for a SUV.
     *
     * All four fields move as ONE. A new sentence that states a budget replaces
     * the old budget whole — "raczej do 300" after "od 200 do 400 za całość"
     * means a ceiling of 300 per day, not a floor of 200 left over from a
     * figure that was about something else. Merging them field by field is how
     * a floor outlives the range it belonged to.
     */
    ...(e.budgetGrosze !== null || e.budgetMinGrosze !== null
      ? {
          budgetGrosze: e.budgetGrosze,
          budgetMinGrosze: e.budgetMinGrosze,
          budgetKind: e.budgetKind,
          budgetCurrency: e.budgetCurrency,
        }
      : {
          budgetGrosze: slots.budgetGrosze,
          budgetMinGrosze: slots.budgetMinGrosze,
          budgetKind: slots.budgetKind,
          budgetCurrency: slots.budgetCurrency,
        }),
    seats: e.seats ?? slots.seats,
    dateFrom: e.dateFrom ?? slots.dateFrom,
    // A range given as one date resets the end, so "od 22" after "20–25" does
    // not silently keep the 25th and quote the wrong number of days.
    dateTo: e.dateFrom && !e.dateTo ? null : (e.dateTo ?? slots.dateTo),
    locationId: e.locationId ?? slots.locationId,
    awaiting: null,
    pendingIntent: slots.pendingIntent,
    dateIntent: slots.dateIntent,
    // Carried, never derived from the message: these two are the assistant's
    // memory of the conversation's shape, and a customer sentence has no
    // business resetting either of them.
    turns: slots.turns,
    nudged: slots.nudged,
    lastDemand: slots.lastDemand,
  };
}

/**
 * The stated budget, as the search axes it corresponds to.
 *
 * One place turns "what the customer said" into "what to filter by", so the
 * per-day and whole-rental readings cannot drift apart between the car search,
 * the alternatives and anything added later. A total budget goes onto the total
 * axes and NEVER onto the daily one: 1500 zł for a week is not 1500 zł a night,
 * and putting it there would answer with cars nobody needs to be shown.
 */
export function budgetAxes(slots: ChatSlots): {
  maxDailyGrosze: number | null;
  minDailyGrosze: number | null;
  maxTotalGrosze: number | null;
  minTotalGrosze: number | null;
} {
  const total = slots.budgetKind === "total";
  return {
    maxDailyGrosze: total ? null : slots.budgetGrosze,
    minDailyGrosze: total ? null : slots.budgetMinGrosze,
    maxTotalGrosze: total ? slots.budgetGrosze : null,
    minTotalGrosze: total ? slots.budgetMinGrosze : null,
  };
}

/** Did the customer state any budget at all? */
export function hasBudget(slots: ChatSlots): boolean {
  return slots.budgetGrosze !== null || slots.budgetMinGrosze !== null;
}

/**
 * The budget as one value, for the code that ranks rather than filters.
 *
 * Structurally the same shape `findAlternatives` takes, and deliberately not
 * imported from it: this module is pure and has to stay loadable by a test
 * runner, which `lib/chat/data` — `server-only` — is not.
 */
export function statedBudget(slots: ChatSlots): {
  minGrosze: number | null;
  maxGrosze: number | null;
  kind: "day" | "total";
} | null {
  if (!hasBudget(slots)) return null;
  return {
    minGrosze: slots.budgetMinGrosze,
    maxGrosze: slots.budgetGrosze,
    kind: slots.budgetKind === "total" ? "total" : "day",
  };
}
