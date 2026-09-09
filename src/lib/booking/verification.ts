import "server-only";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { getDb, schema } from "@/lib/db";
import { getFreeUnits } from "./availability";
import { recordSecurityEvent } from "@/lib/security/events";
import {
  notifyEmailConfirmed,
  notifyReservationReady,
} from "@/lib/email/notify";

/**
 * Potwierdzenie rezerwacji przez klienta — rozdział 13.4.
 *
 * ## Po co to w ogóle jest
 *
 * Formularz publiczny może wypełnić każdy, także skrypt, także złośliwie
 * cudzymi danymi. Do tej pory takie zgłoszenie lądowało od razu jako `pending`
 * i choć NIE blokowało kalendarza — to akurat było w tym systemie zrobione
 * dobrze od początku — to zajmowało czas obsługi i zaśmiecało skrzynkę.
 * Teraz zgłoszenie zaczyna o jeden stopień wcześniej: `pending_verification`,
 * i staje się `pending` dopiero wtedy, gdy ktoś kliknie w link wysłany na
 * podany adres. Skrypt, który wpisał cudzy albo zmyślony e-mail, nigdy tego
 * linku nie zobaczy.
 *
 * ## Co leży w bazie
 *
 * Wyłącznie sha-256 z tokenu. Sam token istnieje w jednym miejscu — w mailu
 * klienta. Kopia bazy, która wycieknie, nie pozwala potwierdzić ani jednej
 * rezerwacji.
 *
 * ## Dlaczego 15 minut
 *
 * Zamówienie mówi „10–15 minut" i bierzemy górną granicę. Poczta bywa wolna,
 * a klient bywa w windzie; krótszy czas oznacza więcej ludzi, którzy klikają
 * w martwy link i muszą zaczynać od nowa. Stan i tak nie blokuje kalendarza,
 * więc dłuższe okno nie kosztuje dostępności ani złotówki.
 *
 * ## Droga do SMS-a, gdyby kiedyś była potrzebna
 *
 * Ten moduł nie wie, CZYM wysłano token — zna tylko jego skrót, termin
 * ważności i rezerwację. Dodanie SMS-a to napisanie drugiego nadawcy
 * i przekazanie mu tego samego `token`; ani ten plik, ani tabela, ani ścieżka
 * potwierdzania nie wymagają wtedy zmiany.
 */

/** Ile ważny jest link. Górna granica z zamówienia. */
export const WAZNOSC_MINUT = 15;

/** Ile razy wolno poprosić o ponowne wysłanie tego samego potwierdzenia. */
const MAX_PONOWIEN = 3;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Nowy token dla rezerwacji. Zwraca token JAWNY — to jedyny moment, w którym
 * istnieje poza mailem klienta, i nie wolno go zalogować.
 */
export async function createVerification(reservationId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + WAZNOSC_MINUT * 60_000);
  await getDb()
    .insert(schema.reservationVerifications)
    .values({
      reservationId,
      tokenHash: hashToken(token),
      expiresAt,
    });
  return { token, expiresAt };
}

export type WynikPotwierdzenia =
  | {
      ok: true;
      reference: string;
      carName: string;
      startDate: string;
      endDate: string;
    }
  | { ok: false; powod: "nieznany" | "wygasl" | "uzyty" }
  | {
      ok: false;
      powod: "niedostepny";
      reference: string;
      startDate: string;
      endDate: string;
      /** Co jest wolne w tym samym terminie — propozycja zamiast samego „nie". */
      alternatywy: { brand: string; model: string; slug: string }[];
    };

/**
 * Potwierdź rezerwację tokenem z maila.
 *
 * Kolejność sprawdzeń jest częścią umowy:
 *   1. token → wiersz (albo cisza: nieznany token nie mówi, czy istniał),
 *   2. czy nie zużyty, czy nie wygasł,
 *   3. **PONOWNE sprawdzenie dostępności** — bo między wysłaniem formularza
 *      a kliknięciem w link ktoś mógł dostać to auto na te dni,
 *   4. dopiero potem zmiana statusu, w jednej transakcji z oznaczeniem tokenu
 *      jako zużytego. Bez tej transakcji dwa kliknięcia w tej samej sekundzie
 *      potwierdzałyby rezerwację dwa razy.
 */
export async function confirmVerification(
  token: string,
): Promise<WynikPotwierdzenia> {
  const db = getDb();
  const hash = hashToken(token);

  const [wiersz] = await db
    .select({
      id: schema.reservationVerifications.id,
      reservationId: schema.reservationVerifications.reservationId,
      expiresAt: schema.reservationVerifications.expiresAt,
      usedAt: schema.reservationVerifications.usedAt,
      reference: schema.reservations.reference,
      status: schema.reservations.status,
      carId: schema.reservations.carId,
      carModelId: schema.reservations.carModelId,
      startDate: schema.reservations.startDate,
      endDate: schema.reservations.endDate,
      brand: schema.carModels.brand,
      model: schema.carModels.model,
      // Do wiadomości B (punkt 4). Wybierane tym samym zapytaniem, żeby
      // potwierdzenie adresu nie kosztowało drugiego obiegu do bazy.
      pickupTime: schema.reservations.pickupTime,
      returnTime: schema.reservations.returnTime,
      totalGrosze: schema.reservations.totalGrosze,
      customerName: schema.reservations.customerName,
      customerEmail: schema.reservations.customerEmail,
      locale: schema.reservations.locale,
      customerPhone: schema.reservations.customerPhone,
    })
    .from(schema.reservationVerifications)
    .innerJoin(
      schema.reservations,
      eq(schema.reservations.id, schema.reservationVerifications.reservationId),
    )
    .innerJoin(
      schema.carModels,
      eq(schema.carModels.id, schema.reservations.carModelId),
    )
    .where(eq(schema.reservationVerifications.tokenHash, hash))
    .limit(1);

  if (!wiersz) {
    void recordSecurityEvent({
      kind: "verification_bad_token",
      endpoint: "booking.confirm",
    });
    return { ok: false, powod: "nieznany" };
  }

  const carName = `${wiersz.brand} ${wiersz.model}`;

  /*
    Rezerwacja już potwierdzona (albo pchnięta dalej przez obsługę) — dla
    klienta to jest sukces, nie błąd. Ktoś kliknął dwa razy, albo program
    pocztowy odwiedził link z podglądu. Powtórzenie odpowiedzi „gotowe" jest
    jedyną odpowiedzią, która nie wprawia człowieka w panikę.
  */
  if (wiersz.status !== "pending_verification") {
    if (wiersz.status === "cancelled" || wiersz.status === "rejected") {
      void recordSecurityEvent({
        kind: "verification_expired",
        endpoint: "booking.confirm",
        detail: { status: wiersz.status },
      });
      return { ok: false, powod: "wygasl" };
    }
    return {
      ok: true,
      reference: wiersz.reference,
      carName,
      startDate: wiersz.startDate,
      endDate: wiersz.endDate,
    };
  }

  if (wiersz.usedAt) {
    void recordSecurityEvent({
      kind: "verification_reused",
      endpoint: "booking.confirm",
    });
    return { ok: false, powod: "uzyty" };
  }

  if (wiersz.expiresAt.getTime() < Date.now()) {
    void recordSecurityEvent({
      kind: "verification_expired",
      endpoint: "booking.confirm",
    });
    return { ok: false, powod: "wygasl" };
  }

  /*
    PONOWNE sprawdzenie dostępności — punkt 7 zamówienia.

    Dziś kolizja i tak nie mogłaby powstać, bo ani `pending_verification`, ani
    `pending` nie blokują kalendarza, a przed podwójną rezerwacją stoi
    ograniczenie EXCLUDE w bazie. Ale zamówienie chce, żeby klient dowiedział
    się TERAZ, a nie od obsługi za dwa dni — i żeby dostał propozycję zamiast
    samego „nie". Sprawdzamy więc, czy przydzielony egzemplarz nadal jest wolny
    w tym terminie; jeżeli nie, szukamy innego egzemplarza TEGO SAMEGO modelu,
    a dopiero gdy i tego nie ma — mówimy o alternatywach.
  */
  const wolne = await getFreeUnits(wiersz.startDate, wiersz.endDate);
  const nadalWolny = wolne.some((u) => u.id === wiersz.carId);
  const zamiennik = nadalWolny
    ? null
    : (wolne.find((u) => u.modelId === wiersz.carModelId) ?? null);

  if (!nadalWolny && !zamiennik) {
    void recordSecurityEvent({
      kind: "verification_unavailable",
      endpoint: "booking.confirm",
      detail: { reference: wiersz.reference },
    });
    const alternatywy = await db
      .select({
        brand: schema.carModels.brand,
        model: schema.carModels.model,
        slug: schema.carModels.slug,
      })
      .from(schema.carModels)
      .where(
        sql`${schema.carModels.published} = true and ${schema.carModels.id} in ${
          wolne.length
            ? sql`(${sql.join(
                wolne.map((u) => sql`${u.modelId}::uuid`),
                sql`, `,
              )})`
            : sql`(select null::uuid where false)`
        }`,
      )
      .limit(4);
    return {
      ok: false,
      powod: "niedostepny",
      reference: wiersz.reference,
      startDate: wiersz.startDate,
      endDate: wiersz.endDate,
      alternatywy,
    };
  }

  await db.transaction(async (tx) => {
    // Znacznik zużycia PRZED zmianą statusu i z warunkiem `used_at is null`:
    // dwa kliknięcia w tej samej sekundzie i tak dadzą jedną zmianę.
    const oznaczone = await tx
      .update(schema.reservationVerifications)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(schema.reservationVerifications.id, wiersz.id),
          sql`${schema.reservationVerifications.usedAt} is null`,
        ),
      )
      .returning({ id: schema.reservationVerifications.id });
    if (oznaczone.length === 0) return;

    await tx
      .update(schema.reservations)
      .set({
        status: "pending",
        ...(zamiennik ? { carId: zamiennik.id } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.reservations.id, wiersz.reservationId));
  });

  /*
    Wiadomość B z punktu 4: „adres potwierdzony, zgłoszenie jest u nas".

    PO transakcji i bez `await` na jej wyniku w sensie sterowania: status
    w bazie jest już zmieniony, więc awaria poczty nie ma prawa cofnąć
    potwierdzenia. `notifyEmailConfirmed` sama nigdy nie rzuca — `void` jest
    tu po to, żeby było widać, że nikt na nią nie czeka.
  */
  /*
    Obsługa: „to zgłoszenie jest potwierdzone i czeka na decyzję" — punkt 7.
    Powiadomienie BIZNESOWE, nie alert: prawidłowa rezerwacja nie jest awarią.
  */
  void notifyReservationReady({
    reference: wiersz.reference,
    carName,
    startDate: wiersz.startDate,
    endDate: wiersz.endDate,
    customerName: wiersz.customerName,
    customerPhone: wiersz.customerPhone,
  });

  void notifyEmailConfirmed({
    reference: wiersz.reference,
    carName,
    startDate: wiersz.startDate,
    endDate: wiersz.endDate,
    pickupTime: wiersz.pickupTime,
    returnTime: wiersz.returnTime,
    totalGrosze: wiersz.totalGrosze,
    customerName: wiersz.customerName,
    customerEmail: wiersz.customerEmail,
    locale: wiersz.locale === "en" ? "en" : "pl",
  });

  return {
    ok: true,
    reference: wiersz.reference,
    carName,
    startDate: wiersz.startDate,
    endDate: wiersz.endDate,
  };
}

/**
 * Wygaszenie niepotwierdzonych zgłoszeń.
 *
 * Woła to zadanie cykliczne przypomnień (`/api/admin/reminders`), a nie osobny
 * mechanizm — jedno zadanie w systemie jest lepsze niż drugie, o którym nikt
 * nie pamięta. Bezpieczne do wołania kiedykolwiek: stan i tak nie blokuje
 * kalendarza, więc opóźnienie sprzątania nie kosztuje ani jednego dnia
 * dostępności. To jest porządek w danych, nie ochrona dostępności.
 *
 * Wygasłe zgłoszenie ląduje w `rejected` z powodem wpisanym wprost — a nie
 * w `cancelled`, bo klient niczego nie anulował; on po prostu nie potwierdził.
 */
export async function expireStaleVerifications(): Promise<number> {
  const db = getDb();
  const wygasle = await db
    .select({ id: schema.reservationVerifications.reservationId })
    .from(schema.reservationVerifications)
    .innerJoin(
      schema.reservations,
      eq(schema.reservations.id, schema.reservationVerifications.reservationId),
    )
    .where(
      and(
        eq(schema.reservations.status, "pending_verification"),
        sql`${schema.reservationVerifications.usedAt} is null`,
        lt(schema.reservationVerifications.expiresAt, new Date()),
      ),
    )
    .limit(500);

  if (wygasle.length === 0) return 0;

  const ids = wygasle.map((w) => w.id);
  await db
    .update(schema.reservations)
    .set({
      status: "rejected",
      rejectionReason:
        "Nie potwierdzono adresu e-mail w wyznaczonym czasie (15 minut).",
      updatedAt: new Date(),
    })
    .where(
      sql`${schema.reservations.id} in (${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}) and ${schema.reservations.status} = 'pending_verification'`,
    );

  return ids.length;
}

/** Czy wolno wysłać ten sam link ponownie — chroni przed użyciem formularza
 *  jako darmowej wysyłki maili na cudzy adres. */
export async function canResend(reservationId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ ile: sql<number>`count(*)::int` })
    .from(schema.reservationVerifications)
    .where(eq(schema.reservationVerifications.reservationId, reservationId));
  return (row?.ile ?? 0) < MAX_PONOWIEN;
}

/**
 * Stan potwierdzenia adresu e-mail — dla karty rezerwacji w panelu (punkt 8).
 *
 * DLACZEGO STATUS REZERWACJI TO ZA MAŁO
 *
 * `pending_verification` mówi „jeszcze nie potwierdził", ale w chwili
 * potwierdzenia status idzie na `pending` i informacja o TYM, że adres został
 * zweryfikowany, przestaje być gdziekolwiek widoczna. Obsługa patrząca na
 * kartę tydzień później nie ma jak odróżnić rezerwacji z potwierdzonym adresem
 * od takiej, którą wpisano ręcznie przez telefon — a to jest dokładnie ta
 * różnica, która decyduje, czy na podany adres w ogóle warto pisać.
 *
 * Zwraca `null`, gdy weryfikacji nigdy nie było: rezerwacje wpisane w panelu
 * i te sprzed rozdziału 13.4 nie mają wiersza i nie mają go mieć.
 */
export type StanWeryfikacji = {
  stan: "potwierdzony" | "oczekuje" | "wygasl";
  /** Kiedy klient kliknął — tylko dla `potwierdzony`. */
  potwierdzonyO: Date | null;
  /** Do kiedy link jest (był) ważny. */
  wazneDo: Date;
};

export async function stanWeryfikacji(
  reservationId: string,
): Promise<StanWeryfikacji | null> {
  const db = getDb();
  const [w] = await db
    .select({
      usedAt: schema.reservationVerifications.usedAt,
      expiresAt: schema.reservationVerifications.expiresAt,
    })
    .from(schema.reservationVerifications)
    .where(eq(schema.reservationVerifications.reservationId, reservationId))
    // Najnowszy: ponowna wysyłka linku tworzy kolejny wiersz, a pytanie
    // brzmi „jak jest teraz", nie „jak było za pierwszym razem".
    .orderBy(desc(schema.reservationVerifications.createdAt))
    .limit(1);
  if (!w) return null;
  if (w.usedAt) {
    return {
      stan: "potwierdzony",
      potwierdzonyO: w.usedAt,
      wazneDo: w.expiresAt,
    };
  }
  return {
    stan: w.expiresAt.getTime() < Date.now() ? "wygasl" : "oczekuje",
    potwierdzonyO: null,
    wazneDo: w.expiresAt,
  };
}
