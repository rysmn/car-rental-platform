import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  CANCELLATION_DEFAULT,
  cancellationSchema,
  computeCancellationCharge,
  feeStatus,
  outstandingGrosze,
  type CancellationCharge,
  type CancellationFeeStatus,
  type CancellationKind,
  type CancellationPolicy,
} from "./cancellation";
import type { QuoteBreakdown } from "./types";

/**
 * Odczyt i zapis należności za anulowanie — jedyna droga do tej tabeli.
 *
 * ## Skąd bierze się polityka dla KONKRETNEJ rezerwacji
 *
 * Z jej własnej migawki w `reservations.quote`, nie z dzisiejszych ustawień.
 * To jest sedno całego mechanizmu: właściciel może jutro podnieść opłatę,
 * a rezerwacja zawarta dziś rozliczy się według zasad, które klient widział
 * przed naciśnięciem „rezerwuję".
 *
 * ## Rezerwacje sprzed wdrożenia
 *
 * Nie mają migawki i NIE DOSTAJĄ dzisiejszej. Zamówienie mówi o tym wprost:
 * nowych opłat nie nakłada się wstecz na umowę, która ich nie zawierała.
 * `politykaRezerwacji` zwraca dla nich `null`, a `null` czyta się jako
 * „anulowanie bezpłatne" — czyli dokładnie te warunki, na jakie ci klienci się
 * umówili (do 01.09.2026 Regulamin §5 mówił, że anulowanie jest bezpłatne).
 */

/** Polityka zapamiętana przy tej rezerwacji, albo `null` dla starych umów. */
export function politykaRezerwacji(quote: string): CancellationPolicy | null {
  try {
    const q = JSON.parse(quote) as Partial<QuoteBreakdown>;
    if (!q || typeof q !== "object" || q.cancellationPolicy == null) return null;
    const parsed = cancellationSchema.safeParse(q.cancellationPolicy);
    return parsed.success ? parsed.data : null;
  } catch {
    // Zepsuty JSON jednej rezerwacji nie może zamienić się w opłatę wziętą
    // z dzisiejszego cennika. Brak migawki to brak opłaty.
    return null;
  }
}

/**
 * Ile wyniesie anulowanie tej rezerwacji, gdyby nastąpiło teraz.
 *
 * Czysta funkcja nad danymi, które wywołujący już ma — używają jej podgląd
 * dla klienta, samo anulowanie i panel, więc wszystkie trzy pokazują tę samą
 * liczbę. Brak migawki daje 0 zł i przedział `free`.
 */
export function wycenAnulowanie(input: {
  quote: string;
  totalGrosze: number;
  hoursToPickup: number;
  kind?: CancellationKind;
}): { charge: CancellationCharge; policy: CancellationPolicy | null } {
  const policy = politykaRezerwacji(input.quote);
  if (!policy) {
    return {
      policy: null,
      charge: {
        tier: input.kind === "no_show" ? "no_show" : "free",
        kind: input.kind ?? "cancellation",
        policyGrosze: 0,
        amountGrosze: 0,
        cappedByTotal: false,
        hoursToPickup: input.hoursToPickup,
      },
    };
  }
  return {
    policy,
    charge: computeCancellationCharge({
      hoursToPickup: input.hoursToPickup,
      reservationTotalGrosze: input.totalGrosze,
      policy,
      kind: input.kind,
    }),
  };
}

export type NaleznoscAnulowania = {
  id: string;
  kind: CancellationKind;
  tier: string;
  amountGrosze: number;
  policyGrosze: number;
  reservationTotalGrosze: number;
  hoursToPickup: number | null;
  chargedAt: Date;
  paidAt: Date | null;
  waivedAt: Date | null;
  waiveReason: string | null;
  status: CancellationFeeStatus;
  outstandingGrosze: number;
};

function zWiersza(r: {
  id: string;
  kind: string;
  tier: string;
  amountGrosze: number;
  policyGrosze: number;
  reservationTotalGrosze: number;
  hoursToPickup: string | null;
  chargedAt: Date;
  paidAt: Date | null;
  waivedAt: Date | null;
  waiveReason: string | null;
}): NaleznoscAnulowania {
  return {
    ...r,
    kind: r.kind === "no_show" ? "no_show" : "cancellation",
    hoursToPickup: r.hoursToPickup === null ? null : Number(r.hoursToPickup),
    status: feeStatus(r),
    outstandingGrosze: outstandingGrosze(r),
  };
}

const KOLUMNY = {
  id: schema.reservationCancellationFees.id,
  kind: schema.reservationCancellationFees.kind,
  tier: schema.reservationCancellationFees.tier,
  amountGrosze: schema.reservationCancellationFees.amountGrosze,
  policyGrosze: schema.reservationCancellationFees.policyGrosze,
  reservationTotalGrosze:
    schema.reservationCancellationFees.reservationTotalGrosze,
  hoursToPickup: schema.reservationCancellationFees.hoursToPickup,
  chargedAt: schema.reservationCancellationFees.chargedAt,
  paidAt: schema.reservationCancellationFees.paidAt,
  waivedAt: schema.reservationCancellationFees.waivedAt,
  waiveReason: schema.reservationCancellationFees.waiveReason,
} as const;

/** Należność tej rezerwacji, albo `null` gdy żadnej nie naliczono. */
export async function naleznosc(
  reservationId: string,
): Promise<NaleznoscAnulowania | null> {
  const db = getDb();
  const [r] = await db
    .select(KOLUMNY)
    .from(schema.reservationCancellationFees)
    .where(eq(schema.reservationCancellationFees.reservationId, reservationId))
    .limit(1);
  return r ? zWiersza(r) : null;
}

/** Należności wielu rezerwacji naraz — dla listy w panelu. */
export async function naleznosciDla(
  reservationIds: string[],
): Promise<Map<string, NaleznoscAnulowania>> {
  if (reservationIds.length === 0) return new Map();
  const db = getDb();
  const wiersze = await db
    .select({
      ...KOLUMNY,
      reservationId: schema.reservationCancellationFees.reservationId,
    })
    .from(schema.reservationCancellationFees)
    /*
      `inArray`, a nie `= ANY(${...})` w szablonie SQL.

      Tablica JavaScriptu wstawiona do szablonu nie wiąże się jako tablica
      PostgreSQL — zapytanie wykonuje się bez błędu i po prostu nic nie zwraca.
      Zmierzone 01.09.2026: plakietka należności nie pojawiła się na liście
      rezerwacji, choć wiersz opłaty w bazie był. `inArray` buduje właściwe
      wiązanie i jest tą samą funkcją, której używa `lookupReservations`.
    */
    .where(inArray(schema.reservationCancellationFees.reservationId, reservationIds));
  return new Map(wiersze.map((r) => [r.reservationId, zWiersza(r)]));
}

/**
 * Zapisuje należność — wewnątrz TEJ SAMEJ transakcji, co zmiana statusu.
 *
 * `onConflictDoNothing` na kluczu rezerwacji jest drugą warstwą obrony przed
 * podwójnym kliknięciem: pierwszą jest warunkowy `UPDATE ... WHERE status IN
 * (...)`, który przy drugim żądaniu nie zmienia ani jednego wiersza i przerywa
 * całość. Gdyby jednak dwa żądania przeszły równolegle przez tamten warunek,
 * ograniczenie `UNIQUE` na `reservation_id` nie pozwoli naliczyć opłaty dwa
 * razy — a wersja `DoNothing` sprawia, że przegrany wyścig kończy się ciszą,
 * a nie pięćsetką na ekranie klienta, który właśnie anulował.
 */
export async function zapiszNaleznosc(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  input: {
    reservationId: string;
    charge: CancellationCharge;
    policy: CancellationPolicy | null;
    reservationTotalGrosze: number;
    chargedBy?: string | null;
  },
): Promise<void> {
  await tx
    .insert(schema.reservationCancellationFees)
    .values({
      reservationId: input.reservationId,
      kind: input.charge.kind,
      tier: input.charge.tier,
      amountGrosze: input.charge.amountGrosze,
      policyGrosze: input.charge.policyGrosze,
      reservationTotalGrosze: input.reservationTotalGrosze,
      hoursToPickup: input.charge.hoursToPickup.toFixed(2),
      // Migawka polityki użytej do naliczenia. Dla starej rezerwacji bez
      // własnych zasad zapisujemy jawnie zera, a nie dzisiejszy cennik —
      // wiersz ma mówić, według czego naprawdę liczono.
      policy: input.policy ?? {
        ...CANCELLATION_DEFAULT,
        tier1Grosze: 0,
        tier2Grosze: 0,
        noShowGrosze: 0,
      },
      chargedBy: input.chargedBy ?? null,
    })
    .onConflictDoNothing({
      target: schema.reservationCancellationFees.reservationId,
    });
}

/**
 * Umorzenie — dopisuje, nigdy nie nadpisuje kwoty pierwotnej.
 *
 * Warunek `waived_at IS NULL` sprawia, że drugie kliknięcie nie podmienia
 * powodu ani autora pierwszego umorzenia: historia ma jednego właściciela
 * i jest nim ten, kto umorzył jako pierwszy.
 */
export async function umorz(input: {
  reservationId: string;
  adminId: string;
  reason: string;
}): Promise<NaleznoscAnulowania | null> {
  const db = getDb();
  const [r] = await db
    .update(schema.reservationCancellationFees)
    .set({
      waivedAt: new Date(),
      waivedBy: input.adminId,
      waiveReason: input.reason,
    })
    .where(
      and(
        eq(
          schema.reservationCancellationFees.reservationId,
          input.reservationId,
        ),
        isNull(schema.reservationCancellationFees.waivedAt),
      ),
    )
    .returning(KOLUMNY);
  return r ? zWiersza(r) : null;
}

/** Oznaczenie wpłaty. Umorzonej należności nie da się „zapłacić". */
export async function oznaczZaplacona(input: {
  reservationId: string;
}): Promise<NaleznoscAnulowania | null> {
  const db = getDb();
  const [r] = await db
    .update(schema.reservationCancellationFees)
    .set({ paidAt: new Date() })
    .where(
      and(
        eq(
          schema.reservationCancellationFees.reservationId,
          input.reservationId,
        ),
        isNull(schema.reservationCancellationFees.paidAt),
        isNull(schema.reservationCancellationFees.waivedAt),
      ),
    )
    .returning(KOLUMNY);
  return r ? zWiersza(r) : null;
}

/**
 * Czy tę rezerwację wolno DZIŚ uznać za nieodebraną — i jeśli nie, dlaczego.
 *
 * Funkcja, a nie wyrażenie w ciele komponentu: odczyt zegara w renderze jest
 * nieczysty i słusznie odrzuca go lint Reacta. Tutaj jest na swoim miejscu —
 * to zapytanie do serwera o stan świata, nie obliczenie w widoku.
 */
export async function stanNieodebrania(input: {
  reservationId: string;
  status: string;
  startDate: string;
  pickupTime: string | null;
}): Promise<{ mozliwy: boolean; powod: string | null }> {
  const { getSetting } = await import("@/lib/admin/settings");
  const { chwilaWarszawska } = await import("./lead-time");
  const { HANDOVER } = await import("./fees");
  const { noShowMozliwy } = await import("./cancellation");

  if (input.status !== "confirmed") return { mozliwy: false, powod: null };
  if (await naleznosc(input.reservationId)) return { mozliwy: false, powod: null };

  const polityka = await getSetting("cancellation");
  const chwila = chwilaWarszawska(
    input.startDate,
    (input.pickupTime ?? HANDOVER.defaultPickup).slice(0, 5),
  );
  const doOdbioruH = Number.isNaN(chwila)
    ? Number.POSITIVE_INFINITY
    : (chwila - Date.now()) / 3_600_000;

  return noShowMozliwy(doOdbioruH, polityka)
    ? { mozliwy: true, powod: null }
    : {
        mozliwy: false,
        powod: `Rezerwację można uznać za nieodebraną dopiero ${polityka.noShowGraceMinutes} min po godzinie odbioru.`,
      };
}
