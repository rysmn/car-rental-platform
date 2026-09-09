import "server-only";
import { OTWARTE } from "./manage-types";
import type {
  BladZmiany,
  PropozycjaZmiany,
  SzczegolyRezerwacji,
  WynikAnulowania,
  WynikDostepu,
  WynikPropozycji,
} from "./manage-types";

export { OTWARTE };
export type {
  BladZmiany,
  PropozycjaZmiany,
  SzczegolyRezerwacji,
  WynikAnulowania,
  WynikDostepu,
  WynikPropozycji,
};

/**
 * Rdzeń zarządzania rezerwacją — reguły, klucz dostępu i wycena zmiany.
 *
 * ## Dlaczego to NIE jest plik `"use server"`
 *
 * W module z dyrektywą `"use server"` KAŻDA wyeksportowana funkcja staje się
 * publicznym punktem końcowym, osiągalnym z przeglądarki po samej nazwie.
 * `wydajKluczDostepu` w takim pliku byłaby zaproszeniem: podaj identyfikator
 * cudzej rezerwacji, odbierz klucz do zarządzania nią. Ten sam podział ma już
 * uwierzytelnianie panelu (`auth/password.ts` obok `auth/password-core.ts`)
 * i z tego samego powodu.
 *
 * Publiczne są wyłącznie cztery akcje w `booking/manage.ts`. Wszystko, co tu
 * leży, jest osiągalne tylko z serwera — pilnuje tego `server-only`, który
 * zamienia przypadkowy import w kliencie w błąd kompilacji, a nie w lukę.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { recordSecurityEvent } from "@/lib/security/events";
import { getFeeCatalog } from "./repo";
import { computeQuote, rentalDays } from "./pricing";
import { HANDOVER, handoverSlots } from "./fees";
import { okresPytania, zajetoscBloku, zajetoscRezerwacji } from "./bufor";
import { getSetting } from "@/lib/admin/settings";
import {
  chwilaWarszawska,
  MIN_WYPRZEDZENIE_H,
  sprawdzWyprzedzenie,
} from "./lead-time";

/**
 * Samodzielne zarządzanie rezerwacją przez klienta — zmiana terminu i anulowanie.
 *
 * ## Dlaczego to nie stoi na numerze rezerwacji
 *
 * `booking/lookup.ts` odpowiada na pytanie „co jest zarezerwowane" każdemu, kto
 * zna numer, i celowo NIE ujawnia, kto rezerwował. Do podglądu to wystarcza.
 * Zmiana terminu i anulowanie są czym innym: to operacje, które robią cudzej
 * sprawie krzywdę nieodwracalną. `AA-` plus osiem znaków szesnastkowych to
 * trzydzieści dwa bity — numer jedzie mailem, bywa zrzutem ekranu, leży
 * w `localStorage`. Wystarcza jako wskazanie, nie jako upoważnienie.
 *
 * Dlatego każda operacja tego modułu wymaga KLUCZA (`reservation_access`):
 * 32 bajty z generatora kryptograficznego, w bazie wyłącznie jako skrót
 * sha-256. Klucz nie trafia do logu, do audytu ani do żadnej odpowiedzi poza
 * jedną — tą, która go wydaje przy tworzeniu rezerwacji.
 *
 * ## Reguła 24 godzin — po stronie SERWERA
 *
 * Klient zmienia i anuluje sam tylko wtedy, gdy do odbioru zostało WIĘCEJ niż
 * 24 godziny. Przeglądarka o tym wie i chowa przyciski, ale to jest uprzejmość:
 * ta akcja jest osiągalna wprost, więc próg liczy tu serwer, z zegara serwera,
 * w strefie Europe/Warsaw — tej samej, w której liczy minimum trzech godzin
 * (`lead-time.ts`). Granica jest OSTRA: dokładnie 24 h to już za późno.
 * „Więcej niż 24 h" znaczy więcej, a nie „mniej więcej tyle".
 *
 * ## Czego ten moduł nie robi
 *
 * Nie zmienia auta, nie zmienia danych osobowych i nie zmienia dodatków —
 * zmiana terminu ma być zmianą terminu. Nie kasuje też ani jednego wiersza:
 * anulowanie to zmiana statusu, historia zostaje.
 */

/** Ile godzin przed odbiorem klient przestaje decydować sam. */
export const PROG_SAMOOBSLUGI_H = 24;

function hashKlucza(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Wydaj klucz zarządzania. Zwraca postać JAWNĄ — jedyny raz, kiedy istnieje.
 *
 * Wołane w jednej transakcji z tworzeniem rezerwacji: rezerwacja bez klucza
 * byłaby sprawą, której klient nie może ani zmienić, ani anulować, a o tym
 * dowiedziałby się dopiero wtedy, gdy próbuje.
 */
export async function wydajKluczDostepu(
  reservationId: string,
  tx?: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const db = tx ?? getDb();
  await db.insert(schema.reservationAccess).values({
    reservationId,
    tokenHash: hashKlucza(token),
  });
  return token;
}

export type Wiersz = {
  id: string;
  reference: string;
  status: string;
  startDate: string;
  endDate: string;
  pickupTime: string | null;
  returnTime: string | null;
  days: number;
  carId: string;
  carModelId: string;
  pickupLocationId: string;
  totalGrosze: number;
  depositGrosze: number;
  extraDriver: boolean;
  childSeat: boolean;
  protectionPackage: boolean;
  depositVariant: "with_deposit" | "no_deposit";
  /* Do wiadomości D i E z punktu 4 — bez nich nie da się napisać do klienta
     ani po zmianie terminu, ani po anulowaniu. */
  customerName: string;
  customerEmail: string;
  locale: string;
};

/**
 * Znajdź rezerwację po numerze I kluczu.
 *
 * Kolejność jest istotna: najpierw szukamy po SKRÓCIE KLUCZA, dopiero potem
 * sprawdzamy, czy trafiony wiersz ma ten numer. Odwrotnie — najpierw numer,
 * potem klucz — odpowiedź czasem trwałaby dłużej dla numeru istniejącego,
 * a to jest wyciek: dałoby się zgadywać numery samym pomiarem czasu.
 *
 * Każde niepowodzenie zwraca ten sam powód `brak_dostepu`. Rozróżnienie
 * „numer nie istnieje" od „klucz nie pasuje" nie pomaga nikomu poza tym, kto
 * zgaduje.
 */
export async function znajdz(
  reference: unknown,
  token: unknown,
): Promise<{ wiersz: Wiersz; dostepId: string } | null> {
  if (typeof reference !== "string" || typeof token !== "string") return null;
  if (!/^AA-[0-9A-F]{8}$/.test(reference)) return null;
  // 32 bajty w base64url to 43 znaki. Krótsze nie ma prawa być kluczem.
  if (token.length < 43 || token.length > 128) return null;

  const db = getDb();
  const [dostep] = await db
    .select({
      id: schema.reservationAccess.id,
      reservationId: schema.reservationAccess.reservationId,
      tokenHash: schema.reservationAccess.tokenHash,
    })
    .from(schema.reservationAccess)
    .where(
      and(
        eq(schema.reservationAccess.tokenHash, hashKlucza(token)),
        isNull(schema.reservationAccess.revokedAt),
      ),
    )
    .limit(1);
  if (!dostep) {
    void recordSecurityEvent({
      kind: "manage_bad_key",
      endpoint: "booking.manage",
      subject: typeof reference === "string" ? reference : null,
    });
    return null;
  }

  /*
    Porównanie stałoczasowe mimo że wyszukanie poszło już po równości w bazie.
    Kosztuje mikrosekundy i zamyka pytanie, czy indeks nie zdradza czegoś
    kształtem — a kod, który raz to robi, nie musi być czytany dwa razy.
  */
  const a = Buffer.from(dostep.tokenHash, "utf8");
  const b = Buffer.from(hashKlucza(token), "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const [r] = await db
    .select({
      id: schema.reservations.id,
      reference: schema.reservations.reference,
      status: schema.reservations.status,
      startDate: schema.reservations.startDate,
      endDate: schema.reservations.endDate,
      pickupTime: schema.reservations.pickupTime,
      returnTime: schema.reservations.returnTime,
      days: schema.reservations.days,
      carId: schema.reservations.carId,
      carModelId: schema.reservations.carModelId,
      pickupLocationId: schema.reservations.pickupLocationId,
      totalGrosze: schema.reservations.totalGrosze,
      depositGrosze: schema.reservations.depositGrosze,
      extraDriver: schema.reservations.extraDriver,
      childSeat: schema.reservations.childSeat,
      protectionPackage: schema.reservations.protectionPackage,
      customerName: schema.reservations.customerName,
      customerEmail: schema.reservations.customerEmail,
      locale: schema.reservations.locale,
      depositVariant: schema.reservations.depositVariant,
    })
    .from(schema.reservations)
    .where(eq(schema.reservations.id, dostep.reservationId))
    .limit(1);
  if (!r) return null;

  /*
    KLUCZOWE dla ochrony przed podmianą numeru w adresie: klucz otwiera
    DOKŁADNIE swoją rezerwację. Klucz prawdziwy plus cudzy numer to odmowa,
    a nie dostęp do sprawy, do której klucz naprawdę należy.
  */
  if (r.reference !== reference) {
    void recordSecurityEvent({
      kind: "manage_ref_mismatch",
      endpoint: "booking.manage",
      subject: reference,
    });
    return null;
  }

  return {
    wiersz: {
      ...r,
      startDate: String(r.startDate),
      endDate: String(r.endDate),
      depositVariant: r.depositVariant as "with_deposit" | "no_deposit",
    },
    dostepId: dostep.id,
  };
}

/** Godzina odbioru użyta do liczenia progów. Rezerwacje sprzed godzin
 *  przekazania mają `null` — bierzemy wtedy godzinę domyślną formularza,
 *  bo to ta, o której obie strony i tak myślą. */
export function godzinaOdbioru(w: Wiersz): string {
  return (w.pickupTime ?? HANDOVER.defaultPickup).slice(0, 5);
}

export function godzinyDoOdbioru(w: Wiersz, teraz: number): number {
  const chwila = chwilaWarszawska(w.startDate, godzinaOdbioru(w));
  if (Number.isNaN(chwila)) return Number.POSITIVE_INFINITY;
  return (chwila - teraz) / 3_600_000;
}

/**
 * Czy wolno jeszcze decydować samodzielnie.
 *
 * OSTRO większe niż 24. Dokładnie 24:00:00 to już nie jest „więcej niż" —
 * i tak samo czyta to test, który sprawdza 25 h, równe 24 h i 23:59.
 */
export function wolnoZarzadzac(w: Wiersz, teraz: number): boolean {
  if (!OTWARTE.includes(w.status as (typeof OTWARTE)[number])) return false;
  return godzinyDoOdbioru(w, teraz) > PROG_SAMOOBSLUGI_H;
}

type Zadanie = {
  startDate: string;
  endDate: string;
  pickupTime: string;
  returnTime: string;
};

export function poprawneZadanie(z: unknown): z is Zadanie {
  if (!z || typeof z !== "object") return false;
  const o = z as Record<string, unknown>;
  const data = (v: unknown) =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const czas = (v: unknown) => typeof v === "string" && /^\d{2}:\d{2}$/.test(v);
  return (
    data(o.startDate) &&
    data(o.endDate) &&
    czas(o.pickupTime) &&
    czas(o.returnTime)
  );
}

/**
 * Wspólne sprawdzenie dla propozycji i dla zatwierdzenia.
 *
 * Świadomie JEDNA funkcja: dwa osobne komplety reguł rozjeżdżają się przy
 * pierwszej zmianie i wtedy ekran pokazuje cenę, której zapis nie przyjmuje.
 * Zatwierdzenie woła to jeszcze raz — bo między pokazaniem a kliknięciem
 * termin mógł zniknąć, a zegar przesunąć się przez próg 24 h.
 */
export async function policzZmiane(
  wiersz: Wiersz,
  zadanie: Zadanie,
  teraz: number,
): Promise<WynikPropozycji> {
  if (!OTWARTE.includes(wiersz.status as (typeof OTWARTE)[number])) {
    return { ok: false, powod: "zamknieta" };
  }
  if (!wolnoZarzadzac(wiersz, teraz)) {
    return { ok: false, powod: "za_pozno" };
  }

  const start = new Date(`${zadanie.startDate}T00:00:00Z`);
  const koniec = new Date(`${zadanie.endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(koniec.getTime())) {
    return { ok: false, powod: "zly_termin" };
  }
  if (koniec < start) return { ok: false, powod: "zly_termin" };
  if (!handoverSlots().includes(zadanie.pickupTime)) {
    return { ok: false, powod: "zly_termin" };
  }
  if (!handoverSlots().includes(zadanie.returnTime)) {
    return { ok: false, powod: "zly_termin" };
  }

  const bezZmian =
    zadanie.startDate === wiersz.startDate &&
    zadanie.endDate === wiersz.endDate &&
    zadanie.pickupTime === godzinaOdbioru(wiersz) &&
    zadanie.returnTime ===
      (wiersz.returnTime ?? HANDOVER.defaultReturn).slice(0, 5);
  if (bezZmian) return { ok: false, powod: "bez_zmian" };

  /*
    Minimum trzech godzin obowiązuje NOWY termin tak samo jak nowy formularz.
    Ta sama funkcja, ta sama strefa — nie kopia progu.
  */
  const wyprzedzenie = sprawdzWyprzedzenie(
    zadanie.startDate,
    zadanie.pickupTime,
    teraz,
  );
  if (!wyprzedzenie.ok) {
    return { ok: false, powod: "lead_time", szczegol: MIN_WYPRZEDZENIE_H };
  }

  const db = getDb();

  /*
    Czy TEN egzemplarz jest wolny w nowym zakresie.

    `r.id <> wiersz.id` jest tu konieczne: rezerwacja nie może kolidować sama
    ze sobą przy przesunięciu o dzień. Blokady floty liczą się tak samo jak
    przy pierwszym zapisie — auto w serwisie nie staje się wolne dlatego,
    że termin zmienia ktoś, kto już je ma.
  */
  const kolizje = await db.execute(sql`
    SELECT 1 FROM reservations r
    WHERE r.car_id = ${wiersz.carId}
      AND r.id <> ${wiersz.id}
      AND r.status IN ('confirmed', 'completed')
      AND ${zajetoscRezerwacji("r")}
          && ${okresPytania(zadanie.startDate, zadanie.endDate, zadanie.pickupTime, zadanie.returnTime)}
    UNION ALL
    SELECT 1 FROM availability_blocks ab
    WHERE ab.car_id = ${wiersz.carId}
      AND ${zajetoscBloku("ab")}
          && ${okresPytania(zadanie.startDate, zadanie.endDate, zadanie.pickupTime, zadanie.returnTime)}
    LIMIT 1
  `);
  const lista = kolizje as unknown as unknown[] | { rows?: unknown[] };
  const zajetych = Array.isArray(lista)
    ? lista.length
    : (lista.rows?.length ?? 0);
  if (zajetych > 0) return { ok: false, powod: "zajete" };

  const [model] = await db
    .select({
      dailyPriceGrosze: schema.carModels.dailyPriceGrosze,
      dailyPrice3to6Grosze: schema.carModels.dailyPrice3to6Grosze,
      dailyPrice7to13Grosze: schema.carModels.dailyPrice7to13Grosze,
      dailyPrice14to29Grosze: schema.carModels.dailyPrice14to29Grosze,
      monthlyPriceGrosze: schema.carModels.monthlyPriceGrosze,
      depositGrosze: schema.carModels.depositGrosze,
      kmPerDayLimit: schema.carModels.kmPerDayLimit,
      extraMileageFeeGrosze: schema.carModels.extraMileageFeeGrosze,
    })
    .from(schema.carModels)
    .where(eq(schema.carModels.id, wiersz.carModelId))
    .limit(1);
  const [loc] = await db
    .select({ feeGrosze: schema.pickupLocations.feeGrosze })
    .from(schema.pickupLocations)
    .where(eq(schema.pickupLocations.id, wiersz.pickupLocationId))
    .limit(1);
  if (!model || !loc) return { ok: false, powod: "blad" };

  const dni = rentalDays(start, koniec);
  const fees = await getFeeCatalog();
  const wycena = computeQuote({
    dailyPriceGrosze: model.dailyPriceGrosze,
    dailyPrice3to6Grosze: model.dailyPrice3to6Grosze ?? null,
    dailyPrice7to13Grosze: model.dailyPrice7to13Grosze ?? null,
    dailyPrice14to29Grosze: model.dailyPrice14to29Grosze ?? null,
    monthlyPriceGrosze: model.monthlyPriceGrosze,
    depositGrosze: model.depositGrosze,
    kmPerDayLimit: model.kmPerDayLimit,
    extraMileageFeeGrosze: model.extraMileageFeeGrosze,
    cancellationPolicy: await getSetting("cancellation"),
    days: dni,
    locationFeeGrosze: loc.feeGrosze,
    extras: {
      extraDriver: wiersz.extraDriver,
      childSeat: wiersz.childSeat,
      protectionPackage: wiersz.protectionPackage,
    },
    depositVariant: wiersz.depositVariant,
    fees,
  });

  /* Okres wyceniany ręcznie nie przechodzi tą drogą — tak samo jak przy
     pierwszej rezerwacji. Inaczej wynajem miesięczny zmieniłby się w kwotę
     samej opłaty za miejsce odbioru. */
  if (wycena.onRequest) return { ok: false, powod: "cena_na_zapytanie" };

  return {
    ok: true,
    dane: {
      stare: {
        startDate: wiersz.startDate,
        endDate: wiersz.endDate,
        pickupTime: godzinaOdbioru(wiersz),
        returnTime: (wiersz.returnTime ?? HANDOVER.defaultReturn).slice(0, 5),
        days: wiersz.days,
        totalGrosze: wiersz.totalGrosze,
        depositGrosze: wiersz.depositGrosze,
      },
      nowe: {
        startDate: zadanie.startDate,
        endDate: zadanie.endDate,
        pickupTime: zadanie.pickupTime,
        returnTime: zadanie.returnTime,
        days: dni,
        totalGrosze: wycena.totalGrosze,
        depositGrosze: wycena.depositGrosze,
      },
      roznicaGrosze: wycena.totalGrosze - wiersz.totalGrosze,
      cenaSieZmienia: wycena.totalGrosze !== wiersz.totalGrosze,
    },
  };
}

/**
 * Policz, jak wyglądałaby zmiana. NIC NIE ZAPISUJE.
 *
 * To jest cały sens rozdzielenia: klient widzi stary i nowy termin oraz starą
 * i nową cenę, zanim cokolwiek stanie się jego rezerwacji. Rezerwacja
 * zepsuta w połowie zmiany jest gorsza niż zmiana, która się nie udała.
 */

/**
 * Anuluj rezerwację. Status, nie kasowanie.
 *
 * Wiersz zostaje w bazie razem z całą historią — obsługa musi móc odpowiedzieć
 * na pytanie „co się stało z tą sprawą" także wtedy, gdy klient anulował ją
 * sam. Termin zwalnia się tym samym, czym był zajęty: statusem
 * (`BLOCKING_STATUSES` to `confirmed` i `completed`), więc żadnej osobnej
 * operacji na kalendarzu nie ma i nie powinno być.
 *
 * Klucz zarządzania unieważniamy przy okazji: sprawa jest zamknięta, a klucz,
 * który nie ma już czego otwierać, jest wyłącznie czymś, co może wyciec.
 * Podgląd zostaje — do listy „Moje rezerwacje" wystarcza sam numer.
 */
