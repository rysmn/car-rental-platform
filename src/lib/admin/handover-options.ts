/**
 * Handover checklists — labels, the catalogue and the comparison. NO database,
 * NO `server-only`: the forms are client components and need all of it.
 *
 * What this module is for: a rental has exactly two moments where somebody
 * stands beside the car and writes down what they see. Everything charged
 * afterwards — fuel, mileage, a wash, a missing triangle — is the difference
 * between those two moments. If they are not recorded the same way, the
 * difference is an argument instead of a number.
 */

import { type Bilingual, pick } from "@/lib/i18n-pick";

export type HandoverKind = "pickup" | "return";

export const HANDOVER_KIND_LABEL: Record<HandoverKind, Bilingual> = {
  pickup: { pl: "Wydanie", en: "Handover" },
  return: { pl: "Zwrot", en: "Return" },
};

/**
 * Dopełniacz, bo „protokół czego" — a doklejanie końcówki do mianownika daje
 * „protokół wydaniea". Polska odmiana nie jest sufiksem i nie da się jej
 * zrobić w szablonie.
 */
export const HANDOVER_KIND_GENITIVE: Record<HandoverKind, Bilingual> = {
  pickup: { pl: "wydania", en: "handover" },
  return: { pl: "zwrotu", en: "return" },
};

/* ── Fuel ─────────────────────────────────────────────────────────────────── */

/**
 * Eighths, because that is what the gauge shows.
 *
 * A percentage field invites "47%", which nobody can read off a needle and
 * nobody can dispute later. Eight marks is the finest scale two people can
 * agree on standing beside the car.
 */
export const FUEL_STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

export const FUEL_LABEL: Record<number, Bilingual> = {
  0: { pl: "Pusty", en: "Empty" },
  1: { pl: "1/8", en: "1/8" },
  2: { pl: "1/4", en: "1/4" },
  3: { pl: "3/8", en: "3/8" },
  4: { pl: "1/2", en: "1/2" },
  5: { pl: "5/8", en: "5/8" },
  6: { pl: "3/4", en: "3/4" },
  7: { pl: "7/8", en: "7/8" },
  8: { pl: "Do pełna", en: "Full" },
};

export function isFuelEighths(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 8;
}

/* ── Cleanliness ──────────────────────────────────────────────────────────── */

export const CLEANLINESS_STATES = ["clean", "acceptable", "dirty"] as const;
export type Cleanliness = (typeof CLEANLINESS_STATES)[number];

export const CLEANLINESS_LABEL: Record<Cleanliness, Bilingual> = {
  clean: { pl: "Czysty", en: "Clean" },
  acceptable: { pl: "Do przyjęcia", en: "Acceptable" },
  dirty: { pl: "Brudny", en: "Dirty" },
};

/* ── The tick-list ────────────────────────────────────────────────────────── */

export type ChecklistGroup = "equipment" | "documents";

export type ChecklistItem = {
  code: string;
  label: Bilingual;
  group: ChecklistGroup;
  /** Ticked by default on a handover — the things every car leaves with. */
  standard: boolean;
};

/**
 * The catalogue lives here, in code, and the rows in the database name the
 * codes. That way renaming a label never rewrites history: a protocol from
 * March still says what was in the car in March.
 */
export const CHECKLIST: ChecklistItem[] = [
  { code: "spare_wheel", label: { pl: "Koło zapasowe / dojazdowe", en: "Spare wheel / temporary wheel" }, group: "equipment", standard: true },
  { code: "jack", label: { pl: "Podnośnik i klucz", en: "Jack and wheel wrench" }, group: "equipment", standard: true },
  { code: "triangle", label: { pl: "Trójkąt ostrzegawczy", en: "Warning triangle" }, group: "equipment", standard: true },
  { code: "first_aid", label: { pl: "Apteczka", en: "First-aid kit" }, group: "equipment", standard: true },
  { code: "vest", label: { pl: "Kamizelka odblaskowa", en: "High-visibility vest" }, group: "equipment", standard: true },
  { code: "floor_mats", label: { pl: "Dywaniki", en: "Floor mats" }, group: "equipment", standard: true },
  { code: "charging_cable", label: { pl: "Kabel do ładowania", en: "Charging cable" }, group: "equipment", standard: false },
  { code: "child_seat", label: { pl: "Fotelik dziecięcy", en: "Child seat" }, group: "equipment", standard: false },
  { code: "registration", label: { pl: "Dowód rejestracyjny", en: "Registration certificate" }, group: "documents", standard: true },
  { code: "insurance", label: { pl: "Polisa OC", en: "Liability insurance (OC)" }, group: "documents", standard: true },
  { code: "agreement", label: { pl: "Umowa najmu", en: "Rental agreement" }, group: "documents", standard: true },
];

export const CHECKLIST_LABEL: Record<string, Bilingual> = Object.fromEntries(
  CHECKLIST.map((i) => [i.code, i.label]),
);

export const GROUP_LABEL: Record<ChecklistGroup, Bilingual> = {
  equipment: { pl: "Wyposażenie", en: "Equipment" },
  documents: { pl: "Dokumenty", en: "Documents" },
};

/* ── One protocol ─────────────────────────────────────────────────────────── */

export type HandoverRecord = {
  id: string;
  kind: HandoverKind;
  odometerKm: number;
  fuelEighths: number;
  cleanliness: Cleanliness;
  keysCount: number;
  damageNote: string | null;
  note: string | null;
  signatureUrl: string | null;
  signedByName: string | null;
  signedAt: string | null;
  by: string | null;
  createdAt: string;
  items: { code: string; present: boolean; note: string | null }[];
};

/* ── The comparison ───────────────────────────────────────────────────────── */

export type DifferenceTone = "neutral" | "charge" | "problem";

export type Difference = {
  label: string;
  /** What it was at the handover, and what it is now. */
  from: string;
  to: string;
  tone: DifferenceTone;
  /** What the operator is supposed to do about it, when anything. */
  action: string | null;
};

/**
 * What changed between the two moments — the whole point of a checklist.
 *
 * Tone is not decoration: `charge` means money is owed and somebody has to add
 * it to the bill, `problem` means the car cannot simply go back on the shelf.
 * A difference nobody has to act on stays `neutral` — mileage is the obvious
 * one, because kilometres are what the customer paid for.
 */
export function compareHandovers(
  pickup: HandoverRecord,
  ret: HandoverRecord,
  locale: string,
): Difference[] {
  const out: Difference[] = [];

  const km = ret.odometerKm - pickup.odometerKm;
  out.push({
    label: pick({ pl: "Przebieg", en: "Mileage" }, locale),
    from: `${pickup.odometerKm} km`,
    to: `${ret.odometerKm} km`,
    tone: km < 0 ? "problem" : "neutral",
    action:
      km < 0
        ? pick(
            {
              pl: "Licznik cofnięty albo pomyłka w odczycie — sprawdź przed rozliczeniem",
              en: "Odometer went back or a reading was wrong — check before settling up",
            },
            locale,
          )
        : null,
  });

  if (ret.fuelEighths !== pickup.fuelEighths) {
    const down = ret.fuelEighths < pickup.fuelEighths;
    out.push({
      label: pick({ pl: "Paliwo", en: "Fuel" }, locale),
      from: pick(FUEL_LABEL[pickup.fuelEighths], locale),
      to: pick(FUEL_LABEL[ret.fuelEighths], locale),
      tone: down ? "charge" : "neutral",
      action: down
        ? pick(
            {
              pl: "Dolej albo doliczy do rozliczenia",
              en: "Refuel, or add it to the bill",
            },
            locale,
          )
        : null,
    });
  }

  if (ret.cleanliness !== pickup.cleanliness) {
    const order = CLEANLINESS_STATES.indexOf(ret.cleanliness);
    const was = CLEANLINESS_STATES.indexOf(pickup.cleanliness);
    out.push({
      label: pick({ pl: "Czystość", en: "Cleanliness" }, locale),
      from: pick(CLEANLINESS_LABEL[pickup.cleanliness], locale),
      to: pick(CLEANLINESS_LABEL[ret.cleanliness], locale),
      tone: order > was ? "charge" : "neutral",
      action:
        order > was
          ? pick({ pl: "Mycie — rozważ opłatę", en: "Cleaning — consider a fee" }, locale)
          : null,
    });
  }

  if (ret.keysCount !== pickup.keysCount) {
    out.push({
      label: pick({ pl: "Kluczyki", en: "Keys" }, locale),
      from: String(pickup.keysCount),
      to: String(ret.keysCount),
      tone: ret.keysCount < pickup.keysCount ? "problem" : "neutral",
      action:
        ret.keysCount < pickup.keysCount
          ? pick(
              {
                pl: "Brakuje kompletu — auto nie wraca na flotę bez kluczyka",
                en: "A key is missing — the car does not go back on the fleet without it",
              },
              locale,
            )
          : null,
    });
  }

  // Missing items, in the order of the catalogue rather than of the rows, so
  // two protocols always read the same way round.
  const was = new Map(pickup.items.map((i) => [i.code, i.present]));
  const now = new Map(ret.items.map((i) => [i.code, i.present]));
  for (const item of CHECKLIST) {
    if (was.get(item.code) === true && now.get(item.code) === false) {
      out.push({
        label: pick(item.label, locale),
        from: pick({ pl: "było", en: "present" }, locale),
        to: pick({ pl: "brak", en: "missing" }, locale),
        tone: "problem",
        action: pick(
          { pl: "Uzupełnij albo policz z kaucji", en: "Supply it or deduct from the deposit" },
          locale,
        ),
      });
    }
  }

  const newDamage = (ret.damageNote ?? "").trim();
  if (newDamage && newDamage !== (pickup.damageNote ?? "").trim()) {
    out.push({
      label: pick({ pl: "Uszkodzenia", en: "Damage" }, locale),
      from:
        (pickup.damageNote ?? "").trim() ||
        pick({ pl: "brak zapisu", en: "no record" }, locale),
      to: newDamage,
      tone: "problem",
      action: pick(
        { pl: "Zrób zdjęcia i załóż szkodę", en: "Take photos and open a damage case" },
        locale,
      ),
    });
  }

  return out;
}

/** Nothing to argue about: every difference is one nobody has to act on. */
export function isCleanReturn(differences: Difference[]): boolean {
  return differences.every((d) => d.action === null);
}
