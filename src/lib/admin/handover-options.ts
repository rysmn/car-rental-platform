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

export type HandoverKind = "pickup" | "return";

export const HANDOVER_KIND_LABEL: Record<HandoverKind, string> = {
  pickup: "Wydanie",
  return: "Zwrot",
};

/**
 * Dopełniacz, bo „protokół czego" — a doklejanie końcówki do mianownika daje
 * „protokół wydaniea". Polska odmiana nie jest sufiksem i nie da się jej
 * zrobić w szablonie.
 */
export const HANDOVER_KIND_GENITIVE: Record<HandoverKind, string> = {
  pickup: "wydania",
  return: "zwrotu",
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

export const FUEL_LABEL: Record<number, string> = {
  0: "Pusty",
  1: "1/8",
  2: "1/4",
  3: "3/8",
  4: "1/2",
  5: "5/8",
  6: "3/4",
  7: "7/8",
  8: "Do pełna",
};

export function isFuelEighths(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 8;
}

/* ── Cleanliness ──────────────────────────────────────────────────────────── */

export const CLEANLINESS_STATES = ["clean", "acceptable", "dirty"] as const;
export type Cleanliness = (typeof CLEANLINESS_STATES)[number];

export const CLEANLINESS_LABEL: Record<Cleanliness, string> = {
  clean: "Czysty",
  acceptable: "Do przyjęcia",
  dirty: "Brudny",
};

/* ── The tick-list ────────────────────────────────────────────────────────── */

export type ChecklistGroup = "equipment" | "documents";

export type ChecklistItem = {
  code: string;
  label: string;
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
  { code: "spare_wheel", label: "Koło zapasowe / dojazdowe", group: "equipment", standard: true },
  { code: "jack", label: "Podnośnik i klucz", group: "equipment", standard: true },
  { code: "triangle", label: "Trójkąt ostrzegawczy", group: "equipment", standard: true },
  { code: "first_aid", label: "Apteczka", group: "equipment", standard: true },
  { code: "vest", label: "Kamizelka odblaskowa", group: "equipment", standard: true },
  { code: "floor_mats", label: "Dywaniki", group: "equipment", standard: true },
  { code: "charging_cable", label: "Kabel do ładowania", group: "equipment", standard: false },
  { code: "child_seat", label: "Fotelik dziecięcy", group: "equipment", standard: false },
  { code: "registration", label: "Dowód rejestracyjny", group: "documents", standard: true },
  { code: "insurance", label: "Polisa OC", group: "documents", standard: true },
  { code: "agreement", label: "Umowa najmu", group: "documents", standard: true },
];

export const CHECKLIST_LABEL: Record<string, string> = Object.fromEntries(
  CHECKLIST.map((i) => [i.code, i.label]),
);

export const GROUP_LABEL: Record<ChecklistGroup, string> = {
  equipment: "Wyposażenie",
  documents: "Dokumenty",
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
): Difference[] {
  const out: Difference[] = [];

  const km = ret.odometerKm - pickup.odometerKm;
  out.push({
    label: "Przebieg",
    from: `${pickup.odometerKm} km`,
    to: `${ret.odometerKm} km`,
    tone: km < 0 ? "problem" : "neutral",
    action:
      km < 0
        ? "Licznik cofnięty albo pomyłka w odczycie — sprawdź przed rozliczeniem"
        : null,
  });

  if (ret.fuelEighths !== pickup.fuelEighths) {
    const down = ret.fuelEighths < pickup.fuelEighths;
    out.push({
      label: "Paliwo",
      from: FUEL_LABEL[pickup.fuelEighths],
      to: FUEL_LABEL[ret.fuelEighths],
      tone: down ? "charge" : "neutral",
      action: down ? "Dolej albo doliczy do rozliczenia" : null,
    });
  }

  if (ret.cleanliness !== pickup.cleanliness) {
    const order = CLEANLINESS_STATES.indexOf(ret.cleanliness);
    const was = CLEANLINESS_STATES.indexOf(pickup.cleanliness);
    out.push({
      label: "Czystość",
      from: CLEANLINESS_LABEL[pickup.cleanliness],
      to: CLEANLINESS_LABEL[ret.cleanliness],
      tone: order > was ? "charge" : "neutral",
      action: order > was ? "Mycie — rozważ opłatę" : null,
    });
  }

  if (ret.keysCount !== pickup.keysCount) {
    out.push({
      label: "Kluczyki",
      from: String(pickup.keysCount),
      to: String(ret.keysCount),
      tone: ret.keysCount < pickup.keysCount ? "problem" : "neutral",
      action:
        ret.keysCount < pickup.keysCount
          ? "Brakuje kompletu — auto nie wraca na flotę bez kluczyka"
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
        label: item.label,
        from: "było",
        to: "brak",
        tone: "problem",
        action: "Uzupełnij albo policz z kaucji",
      });
    }
  }

  const newDamage = (ret.damageNote ?? "").trim();
  if (newDamage && newDamage !== (pickup.damageNote ?? "").trim()) {
    out.push({
      label: "Uszkodzenia",
      from: (pickup.damageNote ?? "").trim() || "brak zapisu",
      to: newDamage,
      tone: "problem",
      action: "Zrób zdjęcia i załóż szkodę",
    });
  }

  return out;
}

/** Nothing to argue about: every difference is one nobody has to act on. */
export function isCleanReturn(differences: Difference[]): boolean {
  return differences.every((d) => d.action === null);
}
