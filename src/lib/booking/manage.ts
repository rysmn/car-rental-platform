"use server";

/**
 * Cztery akcje, którymi klient zarządza WŁASNĄ rezerwacją.
 *
 * Tylko te cztery. Każdy eksport z tego pliku jest publicznym punktem
 * końcowym, więc lista jest zamknięta świadomie, a reguły, klucz i wycena
 * siedzą w `manage-core.ts`, którego z przeglądarki dosięgnąć się nie da.
 *
 * Każda z nich zaczyna od `znajdz(reference, token)` i bez pasującego klucza
 * kończy się `brak_dostepu` — tym samym powodem dla nieistniejącego numeru,
 * złego klucza i klucza unieważnionego. Kto zgaduje, nie dowiaduje się,
 * czego zgadł prawie.
 */

import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { recordAudit } from "@/lib/auth/audit";

/** Wpis do dziennika, który nie ma prawa przewrócić operacji, którą opisuje. */
async function zapiszAudyt(wpis: Parameters<typeof recordAudit>[0]) {
  try {
    await recordAudit(wpis);
  } catch (err) {
    console.error("audyt zarządzania rezerwacją:", err);
  }
}
import { handoverSlots, HANDOVER } from "./fees";
import { okresPytania, zajetoscRezerwacji } from "./bufor";
import {
  notifyReservationCancelled,
  notifyReservationRescheduled,
} from "@/lib/email/notify";
import type { DaneRezerwacji } from "@/lib/email/templates";
import { dokumentyRezerwacji } from "@/lib/documents/repo";
import { DOCUMENT_URL_PREFIX } from "@/lib/documents/adres";
import type { Wiersz } from "./manage-core";
import { recordAlert } from "@/lib/alerts/record";
import { formatPln } from "@/lib/format";
import {
  wycenAnulowanie,
  zapiszNaleznosc,
} from "./cancellation-repo";
import {
  godzinaOdbioru,
  godzinyDoOdbioru,
  OTWARTE,
  poprawneZadanie,
  policzZmiane,
  wolnoZarzadzac,
  znajdz,
} from "./manage-core";
import type {
  PropozycjaZmiany,
  SzczegolyRezerwacji,
  WynikAnulowania,
  WynikPodgladu,
  WynikDostepu,
  WynikPropozycji,
} from "./manage-types";

/**
 * Dane do listu o rezerwacji — jedno miejsce, dwa powiadomienia.
 *
 * Nazwa auta wymaga sięgnięcia do `car_models`, a jest potrzebna i przy zmianie
 * terminu, i przy anulowaniu. Dwa razy ten sam `select` to dwa miejsca, w
 * których klient może kiedyś dostać mail bez nazwy samochodu.
 *
 * Nigdy nie rzuca: to jest materiał na wiadomość, a nie warunek operacji, którą
 * ta wiadomość opisuje. Brak nazwy modelu daje myślnik, nie wyjątek.
 */
async function daneDoListu(
  wiersz: Wiersz,
  nadpisz?: Partial<DaneRezerwacji>,
): Promise<DaneRezerwacji> {
  let carName = "—";
  try {
    const db = getDb();
    const [m] = await db
      .select({ brand: schema.carModels.brand, model: schema.carModels.model })
      .from(schema.carModels)
      .where(eq(schema.carModels.id, wiersz.carModelId))
      .limit(1);
    if (m) carName = `${m.brand} ${m.model}`.trim() || "—";
  } catch (err) {
    console.error("daneDoListu — nazwa auta:", err);
  }
  return {
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
    ...nadpisz,
  };
}

export async function pobierzSzczegoly(
  reference: unknown,
  token: unknown,
): Promise<WynikDostepu<SzczegolyRezerwacji>> {
  try {
    const znaleziona = await znajdz(reference, token);
    if (!znaleziona) return { ok: false, powod: "brak_dostepu" };
    const { wiersz, dostepId } = znaleziona;

    const db = getDb();
    await db
      .update(schema.reservationAccess)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.reservationAccess.id, dostepId));

    const [dane] = await db
      .select({
        brand: schema.carModels.brand,
        model: schema.carModels.model,
        slug: schema.carModels.slug,
      })
      .from(schema.carModels)
      .where(eq(schema.carModels.id, wiersz.carModelId))
      .limit(1);
    const [loc] = await db
      .select({ name: schema.pickupLocations.name })
      .from(schema.pickupLocations)
      .where(eq(schema.pickupLocations.id, wiersz.pickupLocationId))
      .limit(1);

    // Nigdy nie przewraca podglądu rezerwacji: brak dokumentów to pusta lista,
    // a nie błąd. Świeży system nie ma ani jednego i to jest normalny stan.
    const dokumenty = await dokumentyRezerwacji(wiersz.id).catch(() => []);

    const teraz = Date.now();
    return {
      ok: true,
      dane: {
        reference: wiersz.reference,
        carName: `${dane?.brand ?? ""} ${dane?.model ?? ""}`.trim(),
        carSlug: dane?.slug ?? "",
        startDate: wiersz.startDate,
        endDate: wiersz.endDate,
        pickupTime: godzinaOdbioru(wiersz),
        returnTime: (wiersz.returnTime ?? HANDOVER.defaultReturn).slice(0, 5),
        days: wiersz.days,
        locationName: loc?.name ?? "",
        totalGrosze: wiersz.totalGrosze,
        depositGrosze: wiersz.depositGrosze,
        status: wiersz.status as SzczegolyRezerwacji["status"],
        /*
          Dokumenty tej rezerwacji — punkt 16. Adres niesie numer i klucz,
          bo czytnik `/api/dokumenty` sprawdza jedno i drugie, a klient nie
          ma konta, którym mógłby się wylegitymować inaczej.

          Klucz jest już w rękach przeglądarki (przyszedł nim ten request),
          więc nie ujawniamy tu niczego, czego by nie miała.
        */
        dokumenty: dokumenty.map((d) => ({
          id: d.id,
          title: d.title,
          version: d.version,
          url: `${DOCUMENT_URL_PREFIX}/${d.fileName}?r=${encodeURIComponent(wiersz.reference)}&k=${encodeURIComponent(String(token))}`,
        })),
        moznaZarzadzac: wolnoZarzadzac(wiersz, teraz),
        doOdbioruH: Math.floor(godzinyDoOdbioru(wiersz, teraz)),
        dostepneGodziny: handoverSlots(),
      },
    };
  } catch (err) {
    console.error("pobierzSzczegoly:", err);
    return { ok: false, powod: "blad" };
  }
}

export async function zaproponujZmiane(
  reference: unknown,
  token: unknown,
  zadanie: unknown,
): Promise<WynikPropozycji> {
  try {
    if (!poprawneZadanie(zadanie)) return { ok: false, powod: "zly_termin" };
    const znaleziona = await znajdz(reference, token);
    if (!znaleziona) return { ok: false, powod: "brak_dostepu" };
    return await policzZmiane(znaleziona.wiersz, zadanie, Date.now());
  } catch (err) {
    console.error("zaproponujZmiane:", err);
    return { ok: false, powod: "blad" };
  }
}

/**
 * Zatwierdź zmianę terminu. Transakcyjnie i z ponownym sprawdzeniem WSZYSTKIEGO.
 *
 * Między pokazaniem propozycji a kliknięciem „potwierdzam" mija czas, w którym
 * ktoś inny mógł zająć ten termin, a zegar mógł przejść przez próg 24 h.
 * Dlatego reguły liczone są tu jeszcze raz, a warunek `status IN (...)`
 * i ponowne sprawdzenie kolizji siedzą W TEJ SAMEJ transakcji co zapis:
 * dwie równoczesne próby na ten sam termin kończą się jednym zapisem
 * i jedną odmową, a nie dwiema rezerwacjami.
 */
export async function potwierdzZmiane(
  reference: unknown,
  token: unknown,
  zadanie: unknown,
): Promise<WynikPropozycji> {
  try {
    if (!poprawneZadanie(zadanie)) return { ok: false, powod: "zly_termin" };
    const znaleziona = await znajdz(reference, token);
    if (!znaleziona) return { ok: false, powod: "brak_dostepu" };
    const { wiersz } = znaleziona;

    const teraz = Date.now();
    const policzone = await policzZmiane(wiersz, zadanie, teraz);
    if (!policzone.ok) return policzone;

    const db = getDb();
    const zapisane = await db.transaction(async (tx) => {
      /* Blokada wiersza na czas transakcji — druga równoczesna próba czeka
         tutaj i po zwolnieniu zobaczy już zmieniony termin. */
      const zablokowany = await tx.execute(sql`
        SELECT id FROM reservations
        WHERE id = ${wiersz.id} AND status IN ('pending_verification', 'pending', 'confirmed')
        FOR UPDATE
      `);
      const l = zablokowany as unknown as unknown[] | { rows?: unknown[] };
      const ile = Array.isArray(l) ? l.length : (l.rows?.length ?? 0);
      if (ile === 0) return "zamknieta" as const;

      const kolizje = await tx.execute(sql`
        SELECT 1 FROM reservations r
        WHERE r.car_id = ${wiersz.carId}
          AND r.id <> ${wiersz.id}
          AND r.status IN ('confirmed', 'completed')
          AND ${zajetoscRezerwacji("r")}
              && ${okresPytania(policzone.dane.nowe.startDate, policzone.dane.nowe.endDate, policzone.dane.nowe.pickupTime, policzone.dane.nowe.returnTime)}
        LIMIT 1
      `);
      const k = kolizje as unknown as unknown[] | { rows?: unknown[] };
      const zajete = Array.isArray(k) ? k.length : (k.rows?.length ?? 0);
      if (zajete > 0) return "zajete" as const;

      await tx
        .update(schema.reservations)
        .set({
          startDate: policzone.dane.nowe.startDate,
          endDate: policzone.dane.nowe.endDate,
          pickupTime: policzone.dane.nowe.pickupTime,
          returnTime: policzone.dane.nowe.returnTime,
          days: policzone.dane.nowe.days,
          totalGrosze: policzone.dane.nowe.totalGrosze,
          depositGrosze: policzone.dane.nowe.depositGrosze,
          updatedAt: new Date(),
        })
        .where(eq(schema.reservations.id, wiersz.id));
      return "ok" as const;
    });

    if (zapisane === "zamknieta") return { ok: false, powod: "zamknieta" };
    if (zapisane === "zajete") return { ok: false, powod: "zajete" };

    /*
      Audyt bez `admin_id` — sprawcą jest klient, nie konto panelu. Wpis niesie
      stan przed i po, żeby obsługa widziała, co się stało, bez pytania klienta.
      Klucza dostępu nie ma tu ani w żadnej innej formie.
    */
    /*
      Audyt PO zapisie i osobno: rezerwacja jest już zmieniona i zatwierdzona.
      Gdyby ten wpis wywrócił akcję, klient zobaczyłby błąd przy zmianie, która
      się udała — i spróbowałby jeszcze raz. Nieudany zapis dziennika ma zostać
      w logu serwera, a nie w twarzy klienta.
    */
    await zapiszAudyt({
      adminId: null,
      action: "reservation.self_reschedule",
      entity: "reservation",
      entityId: wiersz.id,
      before: {
        startDate: policzone.dane.stare.startDate,
        endDate: policzone.dane.stare.endDate,
        pickupTime: policzone.dane.stare.pickupTime,
        returnTime: policzone.dane.stare.returnTime,
        totalGrosze: policzone.dane.stare.totalGrosze,
      },
      after: {
        startDate: policzone.dane.nowe.startDate,
        endDate: policzone.dane.nowe.endDate,
        pickupTime: policzone.dane.nowe.pickupTime,
        returnTime: policzone.dane.nowe.returnTime,
        totalGrosze: policzone.dane.nowe.totalGrosze,
      },
    });

    /*
      Wiadomość D z punktu 4 — potwierdzenie zmiany terminu, ze STARYM terminem
      w treści. Klient, który przesunął rezerwację z telefonu, dostawał dotąd
      wyłącznie ekran „gotowe" i żadnego śladu na piśmie.

      Po zapisie i po audycie: rezerwacja jest już zmieniona, więc awaria poczty
      nie ma prawa jej cofnąć.
    */
    void notifyReservationRescheduled(
      await daneDoListu(wiersz, {
        startDate: policzone.dane.nowe.startDate,
        endDate: policzone.dane.nowe.endDate,
        pickupTime: policzone.dane.nowe.pickupTime,
        returnTime: policzone.dane.nowe.returnTime,
        totalGrosze: policzone.dane.nowe.totalGrosze,
      }),
      {
        startDate: policzone.dane.stare.startDate,
        endDate: policzone.dane.stare.endDate,
      },
    );

    return policzone;
  } catch (err) {
    console.error("potwierdzZmiane:", err);
    return { ok: false, powod: "blad" };
  }
}

/**
 * Ile kosztowałoby anulowanie w tej chwili — SERWER, nie przeglądarka.
 *
 * Ekran anulowania wywołuje to przed pokazaniem przycisku „Potwierdzam", a samo
 * anulowanie liczy dokładnie tę samą funkcję jeszcze raz. Klient nie może więc
 * zobaczyć jednej kwoty i zostać obciążonym inną — ani wysłać własnej liczby,
 * bo żadna kwota nie przychodzi z formularza.
 */
export async function podgladAnulowania(
  reference: unknown,
  token: unknown,
): Promise<WynikPodgladu> {
  try {
    const znaleziona = await znajdz(reference, token);
    if (!znaleziona) return { ok: false, powod: "brak_dostepu" };
    const { wiersz } = znaleziona;

    if (!OTWARTE.includes(wiersz.status as (typeof OTWARTE)[number])) {
      return { ok: false, powod: "zamknieta" };
    }

    const doOdbioruH = godzinyDoOdbioru(wiersz, Date.now());
    const { charge, policy } = wycenAnulowanie({
      quote: await wycenaRezerwacji(wiersz.id),
      totalGrosze: wiersz.totalGrosze,
      hoursToPickup: doOdbioruH,
    });

    return {
      ok: true,
      dane: {
        tier: charge.tier === "no_show" ? "tier2" : charge.tier,
        kwotaGrosze: charge.amountGrosze,
        cennikGrosze: charge.policyGrosze,
        ograniczonaWartosciaRezerwacji: charge.cappedByTotal,
        doOdbioruH,
        progi: policy
          ? { bezplatneH: policy.freeHours, drugiProgH: policy.lateHours }
          : null,
        wartoscRezerwacjiGrosze: wiersz.totalGrosze,
      },
    };
  } catch (err) {
    console.error("podgladAnulowania:", err);
    return { ok: false, powod: "blad" };
  }
}

/** Migawka wyceny tej rezerwacji — potrzebna, żeby poznać zapamiętane zasady. */
async function wycenaRezerwacji(id: string): Promise<string> {
  const db = getDb();
  const [r] = await db
    .select({ quote: schema.reservations.quote })
    .from(schema.reservations)
    .where(eq(schema.reservations.id, id))
    .limit(1);
  return r?.quote ?? "{}";
}

/**
 * Anulowanie przez klienta — o dowolnej porze, z należnością według zasad
 * zapamiętanych przy TEJ rezerwacji.
 *
 * ## Co się zmieniło 01.09.2026
 *
 * Wcześniej anulowanie było możliwe TYLKO ponad 24 h przed odbiorem i zawsze
 * bezpłatne; bliżej terminu klient dostawał „za późno" i musiał dzwonić. Nowa
 * polityka mówi coś odwrotnego: anulować wolno zawsze, tylko bliżej odbioru
 * kosztuje. Odmowa `za_pozno` zniknęła więc z tej ścieżki — nie dlatego, że
 * przestała obowiązywać, tylko dlatego, że przestała opisywać zasadę.
 *
 * ## Dlaczego kwota nie przychodzi z formularza
 *
 * Bo wtedy klient mógłby ją zmienić. Liczy ją ta sama funkcja, co podgląd,
 * z zapamiętanej polityki i z zegara serwera. Formularz przysyła wyłącznie
 * numer rezerwacji i klucz.
 *
 * ## Podwójne kliknięcie
 *
 * Warunkowy `UPDATE ... WHERE status IN ('pending_verification','pending',
 * 'confirmed')` przy drugim żądaniu nie zmienia ani jednego wiersza i cała
 * transakcja kończy się odmową „zamknięta". Należność dodatkowo chroni
 * `UNIQUE` na `reservation_id`.
 */
export async function anulujRezerwacje(
  reference: unknown,
  token: unknown,
): Promise<WynikAnulowania> {
  try {
    const znaleziona = await znajdz(reference, token);
    if (!znaleziona) return { ok: false, powod: "brak_dostepu" };
    const { wiersz, dostepId } = znaleziona;

    if (!OTWARTE.includes(wiersz.status as (typeof OTWARTE)[number])) {
      return { ok: false, powod: "zamknieta" };
    }

    const doOdbioruH = godzinyDoOdbioru(wiersz, Date.now());
    const { charge, policy } = wycenAnulowanie({
      quote: await wycenaRezerwacji(wiersz.id),
      totalGrosze: wiersz.totalGrosze,
      hoursToPickup: doOdbioruH,
    });

    const db = getDb();
    const wynik = await db.transaction(async (tx) => {
      const zmienione = await tx
        .update(schema.reservations)
        .set({
          status: "cancelled",
          updatedAt: new Date(),
        })
        .where(
          sql`${schema.reservations.id} = ${wiersz.id} AND ${schema.reservations.status} IN ('pending_verification', 'pending', 'confirmed')`,
        )
        .returning({ id: schema.reservations.id });
      if (zmienione.length === 0) return "zamknieta" as const;

      /*
        Należność powstaje w TEJ SAMEJ transakcji, co zmiana statusu. Osobny
        zapis po commicie zostawiłby przy awarii rezerwację anulowaną i nikogo
        nieobciążonego — albo, przy odwrotnej kolejności, obciążenie bez
        anulowania. Zero jest zapisywane tak samo jak każda inna kwota: „opłata
        wyniosła 0 zł" to fakt, który potem tłumaczy klientowi, dlaczego nic nie
        zapłacił, a brak wiersza nie tłumaczy niczego.
      */
      await zapiszNaleznosc(tx, {
        reservationId: wiersz.id,
        charge,
        policy,
        reservationTotalGrosze: wiersz.totalGrosze,
        chargedBy: null,
      });

      await tx
        .update(schema.reservationAccess)
        .set({ revokedAt: new Date() })
        .where(eq(schema.reservationAccess.id, dostepId));
      return "ok" as const;
    });

    if (wynik === "zamknieta") return { ok: false, powod: "zamknieta" };

    await zapiszAudyt({
      adminId: null,
      action: "reservation.self_cancel",
      entity: "reservation",
      entityId: wiersz.id,
      before: { status: wiersz.status },
      after: {
        status: "cancelled",
        powod: "anulowane przez klienta",
        oplataGrosze: charge.amountGrosze,
        prog: charge.tier,
        doOdbioruH: Number(doOdbioruH.toFixed(2)),
      },
    });

    /*
      Wpis do centrum powiadomień panelu — istniejącego rejestru, nie nowego.
      `warning`, bo anulowanie nie jest awarią, tylko sprawą, którą ktoś ma
      zobaczyć: auto właśnie zwolniło się w terminie, a jeżeli naliczyła się
      opłata, to ktoś musi ją rozliczyć.
    */
    void recordAlert({
      module: "booking",
      severity: "warning",
      key: `reservation.cancelled:${wiersz.reference}`,
      title: `Rezerwacja ${wiersz.reference} — anulowana przez klienta`,
      detail:
        charge.amountGrosze > 0
          ? `Opłata: ${formatPln(charge.amountGrosze, "pl")}. Status: DO ZAPŁATY.`
          : "Anulowanie bezpłatne — nie ma czego rozliczać.",
      context: {
        reference: wiersz.reference,
        kwotaGrosze: charge.amountGrosze,
        prog: charge.tier,
      },
    });

    // Wiadomość E z punktu 4 — potwierdzenie anulowania. Bez niej jedynym
    // dowodem, że rezerwacja naprawdę zniknęła, był ekran w przeglądarce.
    void notifyReservationCancelled({
      ...(await daneDoListu(wiersz)),
      anulowanie: {
        kwotaGrosze: charge.amountGrosze,
        ograniczonaWartoscia: charge.cappedByTotal,
        cennikGrosze: charge.policyGrosze,
      },
    });

    return { ok: true, kwotaGrosze: charge.amountGrosze };
  } catch (err) {
    console.error("anulujRezerwacje:", err);
    return { ok: false, powod: "blad" };
  }
}
