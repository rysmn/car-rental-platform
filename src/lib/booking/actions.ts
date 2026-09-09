"use server";

import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { notifyNewReservation } from "@/lib/email/notify";
import { linkReservation } from "@/lib/chat/repo";
import { bookingRequestSchema } from "./schema";
import { checkDriverEligibility } from "./eligibility";
import { getSetting } from "@/lib/admin/settings";
import { effectiveDriverLimits } from "@/lib/admin/rental-rules";
import { toDriverClass } from "@/lib/fleet/driver-class";
import { getFeeCatalog } from "./repo";
import { computeQuote, rentalDays } from "./pricing";
import { reportAlert } from "@/lib/alerts/record";
import { sprawdzFormularz } from "@/lib/security/form-guard";
import { REGULY } from "@/lib/security/rate-limit";
import { recordSecurityEvent, shortSubject } from "@/lib/security/events";
import { MIN_WYPRZEDZENIE_H, sprawdzWyprzedzenie } from "./lead-time";
import { okresPytania, zajetoscBloku, zajetoscRezerwacji } from "./bufor";
import { createVerification, WAZNOSC_MINUT } from "./verification";
import { wydajKluczDostepu } from "./manage-core";
import { notifyVerifyReservation } from "@/lib/email/notify";
import { siteConfig } from "@/lib/config/site";

export type ReserveResult =
  | {
      ok: true;
      reference: string;
      /**
       * Zgłoszenie czeka na potwierdzenie e-mailem (rozdział 13.4).
       *
       * Zawsze `true` dla formularza publicznego — pole istnieje po to, żeby
       * ekran potwierdzenia mógł powiedzieć klientowi PRAWDĘ („sprawdź
       * skrzynkę"), a nie „przyjęliśmy, oddzwonimy", i żeby dało się to
       * kiedyś wyłączyć dla kanału, który weryfikacji nie potrzebuje.
       */
      needsVerification: boolean;
      /**
       * Klucz do samodzielnego zarządzania TĄ rezerwacją — jedyny raz,
       * kiedy istnieje w postaci jawnej.
       *
       * Przeglądarka chowa go obok numeru i używa przy zmianie terminu oraz
       * anulowaniu. W bazie leży wyłącznie skrót sha-256, więc nikt — łącznie
       * z obsługą — nie odczyta go później. Klucz nie trafia do maila, do
       * dziennika ani do audytu; wyciek zrzutu bazy nie daje władzy nad
       * rezerwacjami.
       */
      manageKey: string;
      /** Adres, na który poszedł list — pokazywany, nigdy zapisywany w logu. */
      email: string;
      /** Czy list faktycznie wyszedł. `false` = pokaż telefon do biura. */
      mailSent: boolean;
      minutes: number;
    }
  | {
      ok: false;
      error:
        | "validation"
        | "not_found"
        | "full"
        | "unavailable"
        | "server"
        /** Za dużo prób z tego samego miejsca — patrz `security/rate-limit`. */
        | "rate"
        /** Weryfikacja antybotowa odrzuciła zgłoszenie. */
        | "antybot"
        /**
         * Token Turnstile wygasł, został już zużyty albo w ogóle nie dojechał.
         *
         * Osobno od `antybot`, bo rada dla klienta jest inna i to jest cała
         * różnica: „odśwież stronę" kasuje wypełniony formularz, a tutaj
         * wystarczy kliknąć jeszcze raz — nowa weryfikacja jest już w drodze.
         */
        | "turnstile_expired"
        /** `siteverify` nie odpowiedział — awaria po stronie Cloudflare. */
        | "turnstile_offline"
        /** Odbiór bliżej niż minimalne wyprzedzenie — patrz `lead-time`. */
        | "lead_time"
        /** The rate for this length of stay is 0 — a manager quotes it. */
        | "price_on_request";
      fieldErrors?: Record<string, string>;
      /**
       * Numbers the message needs, per field — `{ dateOfBirth: { years: 25 } }`.
       *
       * Here because the driver-age messages stopped carrying their number:
       * "Wymagany minimalny wiek 21 lat" was a string in two translation files
       * and had to be edited by hand whenever the rule changed. The message is
       * now "Wymagany minimalny wiek {years} lat" and the number arrives with
       * the error, straight from Admin → Zasady wynajmu.
       */
      errorValues?: Record<string, Record<string, number>>;
    };

/**
 * Create a reservation REQUEST (status = pending; does not block the calendar
 * until an admin confirms it).
 *
 * Security-critical invariants:
 *  - Every field is Zod-validated at the boundary; NO price is accepted from the
 *    client. The total is recomputed here from DB prices and snapshotted.
 *  - A physical unit is allocated in a transaction; the DB EXCLUDE constraint is
 *    the ultimate guard against double-booking at confirmation time.
 */
export async function createReservation(raw: unknown): Promise<ReserveResult> {
  const parsed = bookingRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "validation", fieldErrors };
  }
  const input = parsed.data;

  /*
   * Brama antybotowa — rozdział 13.1.
   *
   * PO walidacji schematu, bo bez niej nie wiadomo nawet, czy pola ochronne
   * mają właściwy kształt; PRZED czymkolwiek, co dotyka bazy, bo cały sens
   * limitu polega na tym, żeby robot nie kosztował zapytań do bazy.
   *
   * Drugim wymiarem limitu — obok adresu sieciowego — jest SKRÓT ADRESU
   * E-MAIL. Zamówienie mówi „nie polegaj tylko na IP", a to jest wymiar,
   * którego zmiana kosztuje atakującego coś realnego: skrzynkę, na którą
   * i tak musi przyjść potwierdzenie.
   */
  const brama = await sprawdzFormularz({
    nazwa: "booking.create",
    pola: input,
    reguly: [REGULY.rezerwacjaSzybka, REGULY.rezerwacja],
    dodatkoweKlucze: [shortSubject(input.customerEmail.toLowerCase())],
    /*
     * FAIL-CLOSED, na wyraźne polecenie właściciela (29.08.2026).
     *
     * Formularz „Napisz do nas" przepuszcza zgłoszenie, gdy `siteverify` nie
     * odpowiada — bo zapytanie, które przepadnie, przepada bezpowrotnie.
     * REZERWACJA jest czym innym: tworzy zobowiązanie, wysyła list z linkiem
     * potwierdzającym i wydaje klucz zarządzania. Bez potwierdzonej
     * weryfikacji nie powstaje. Klient dostaje wtedy zdanie „spróbuj za
     * chwilę", jego dane zostają w formularzu, a przycisk wraca do stanu
     * aktywnego — patrz `PolitykaAwarii` w `security/form-guard`.
     */
    awariaDostawcy: "odrzuc",
  });
  if (!brama.ok) {
    /*
     * Cicho = pułapka na roboty albo formularz wysłany w dwie sekundy.
     * Odpowiadamy jak przy sukcesie i NIE ZAPISUJEMY NICZEGO. Numer jest
     * prawdziwie losowy i nie istnieje w bazie, więc niczego nie ujawnia,
     * a robot nie dowiaduje się, które pole go zdradziło.
     */
    if (brama.cicho) {
      return {
        ok: true,
        reference: `AA-${globalThis.crypto
          .randomUUID()
          .replace(/-/g, "")
          .slice(0, 8)
          .toUpperCase()}`,
        needsVerification: true,
        email: input.customerEmail,
        mailSent: false,
        minutes: WAZNOSC_MINUT,
        /*
          Klucz POZORNY — o właściwym kształcie i długości, ale nieistniejący
          w bazie. Odpowiedź musi być nieodróżnialna od sukcesu, więc nie może
          brakować w niej pola, które przy sukcesie jest. Robot, który go
          użyje, dostanie `brak_dostepu` — tak samo jak przy kluczu zmyślonym.
        */
        manageKey: randomBytes(32).toString("base64url"),
      };
    }
    if (brama.powod === "rate") return { ok: false, error: "rate" };
    /*
     * Trzy różne zdarzenia i trzy różne zdania dla klienta. Do 29.08.2026
     * wszystkie trzy wychodziły stąd jako „antybot", czyli jako „odśwież
     * stronę i spróbuj jeszcze raz" — rada, która w dwóch przypadkach na trzy
     * kazała klientowi WYRZUCIĆ wypełniony formularz.
     */
    if (brama.szczegol === "niedostepny") {
      return { ok: false, error: "turnstile_offline" };
    }
    if (brama.szczegol === "odrzucony" || brama.szczegol === "brak_tokenu") {
      return { ok: false, error: "turnstile_expired" };
    }
    return { ok: false, error: "antybot" };
  }

  /*
   * Minimum trzy godziny przed odbiorem — rozdział 13.5.
   *
   * Tutaj, a nie w schemacie Zoda, z jednego powodu: schemat sprawdza kształt
   * i porównuje daty między sobą, a ta reguła porównuje termin z ZEGAREM.
   * Reguła zależna od bieżącej chwili w schemacie oznaczałaby, że ten sam
   * obiekt jest raz poprawny, a za godzinę nie — czego po walidatorze kształtu
   * nikt się nie spodziewa.
   */
  const wyprzedzenie = sprawdzWyprzedzenie(input.startDate, input.pickupTime);
  if (!wyprzedzenie.ok) {
    void recordSecurityEvent({
      kind: "lead_time_rejected",
      endpoint: "booking.create",
      detail: {
        zostaloH: wyprzedzenie.zostaloH,
        wymagane: MIN_WYPRZEDZENIE_H,
      },
    });
    return {
      ok: false,
      error: "lead_time",
      fieldErrors: { pickupTime: "lead_time" },
      errorValues: { pickupTime: { hours: MIN_WYPRZEDZENIE_H } },
    };
  }

  if (!process.env.DATABASE_URL) {
    // The flow is complete but nothing can persist without a database.
    return { ok: false, error: "unavailable" };
  }

  const db = getDb();

  try {
    // Resolve model + location server-side (published/active only).
    const [model] = await db
      .select()
      .from(schema.carModels)
      .where(
        and(
          eq(schema.carModels.slug, input.modelSlug),
          eq(schema.carModels.published, true),
        ),
      )
      .limit(1);
    if (!model) return { ok: false, error: "not_found" };

    /**
     * Driver requirements for THIS car's class.
     *
     * This check is NOT conditional, and that is the point. An earlier version
     * ran it only when the master switch was on, which meant a settings row
     * without the switch — every row that predates it — silently turned the
     * age check off altogether and let an eighteen-year-old book a Panamera.
     * The switch now lives inside `effectiveDriverLimits`, where "off" means
     * "the floor of 21 applies" and never "nothing applies". A car with no
     * class, a missing settings row and a malformed rule all land on the same
     * floor.
     *
     * Read after the model, because the threshold depends on the car — which
     * is why this is not in the Zod schema, where only the slug is known.
     */
    const rules = await getSetting("rentalRules");
    const issues = checkDriverEligibility(
      { dateOfBirth: input.dateOfBirth, startDate: input.startDate },
      effectiveDriverLimits(rules, toDriverClass(model.driverClass)),
    );
    if (issues.length > 0) {
      const fieldErrors: Record<string, string> = {};
      const errorValues: Record<string, Record<string, number>> = {};
      for (const issue of issues) {
        fieldErrors[issue.field] = issue.code;
        errorValues[issue.field] = issue.values;
      }
      return { ok: false, error: "validation", fieldErrors, errorValues };
    }

    const [loc] = await db
      .select()
      .from(schema.pickupLocations)
      .where(
        and(
          eq(schema.pickupLocations.slug, input.locationSlug),
          eq(schema.pickupLocations.active, true),
        ),
      )
      .limit(1);
    if (!loc) return { ok: false, error: "not_found" };

    // Authoritative price — never from the client.
    const fees = await getFeeCatalog();
    const days = rentalDays(
      new Date(`${input.startDate}T00:00:00Z`),
      new Date(`${input.endDate}T00:00:00Z`),
    );
    const quote = computeQuote({
      dailyPriceGrosze: model.dailyPriceGrosze,
      dailyPrice3to6Grosze: model.dailyPrice3to6Grosze ?? null,
      dailyPrice7to13Grosze: model.dailyPrice7to13Grosze ?? null,
      dailyPrice14to29Grosze: model.dailyPrice14to29Grosze ?? null,
      monthlyPriceGrosze: model.monthlyPriceGrosze,
      depositGrosze: model.depositGrosze,
      kmPerDayLimit: model.kmPerDayLimit,
      extraMileageFeeGrosze: model.extraMileageFeeGrosze,
      cancellationPolicy: await getSetting("cancellation"),
      days,
      locationFeeGrosze: loc.feeGrosze,
      extras: {
        extraDriver: input.extraDriver,
        childSeat: input.childSeat,
        protectionPackage: input.protectionPackage,
      },
      depositVariant: input.depositVariant,
      fees,
    });

    /**
     * A period the operator prices by hand cannot be booked online.
     *
     * The client already hides the total and disables the button, but that is
     * courtesy, not enforcement: this action is reachable directly. Without
     * this check a 30-day rental of a car with no monthly rate would be written
     * to the database as a real reservation for 200 zł — the location fee, with
     * the car itself free — and an operator would find it in the panel looking
     * exactly like a genuine order.
     */
    if (quote.onRequest) {
      return { ok: false, error: "price_on_request" };
    }

    const reference = `AA-${globalThis.crypto
      .randomUUID()
      .replace(/-/g, "")
      .slice(0, 8)
      .toUpperCase()}`;

    const reservationId = await db.transaction(async (tx) => {
      /*
       * Wybór egzemplarza bez kolizji — z GODZINAMI, bo tutaj są znane.
       *
       * To jest jedyne miejsce w całej ścieżce klienta, które zna obie godziny
       * przekazania: schemat wymaga ich od formularza. Dlatego tylko tutaj
       * bufor trzech godzin (`aa_zajetosc`, migracja 0045) działa w pełni —
       * lista floty i kalendarz pytają o całe doby, bo na etapie przeglądania
       * klient godzin jeszcze nie wybrał, i odpowiadają ostrożniej.
       *
       * Kierunek tej różnicy jest jedyny dopuszczalny: widok mówi „nie" tam,
       * gdzie silnik powiedziałby „tak". Odwrotnie znaczyłoby osiem
       * wypełnionych pól i odmowę na końcu — dokładnie to, co liczy alert
       * `createReservation:no-unit-free` niżej.
       */
      const free = await tx.execute(sql`
        SELECT c.id FROM cars c
        WHERE c.model_id = ${model.id} AND c.status = 'available'
        AND NOT EXISTS (
          SELECT 1 FROM reservations r
          WHERE r.car_id = c.id AND r.status IN ('confirmed', 'completed')
          AND ${zajetoscRezerwacji("r")}
              && ${okresPytania(input.startDate, input.endDate, input.pickupTime, input.returnTime)}
        )
        AND NOT EXISTS (
          SELECT 1 FROM availability_blocks ab
          WHERE ab.car_id = c.id
          AND ${zajetoscBloku("ab")}
              && ${okresPytania(input.startDate, input.endDate, input.pickupTime, input.returnTime)}
        )
        ORDER BY c.created_at
        LIMIT 1
        FOR UPDATE OF c SKIP LOCKED
      `);
      // postgres-js returns a RowList (an array) from a raw execute — not the
      // { rows } envelope node-postgres uses. Accept either so swapping the
      // driver can't silently turn every booking into "no cars available".
      const result = free as unknown as
        { id: string }[] | { rows?: { id: string }[] };
      const rows = Array.isArray(result) ? result : (result.rows ?? []);
      const carId = rows[0]?.id;
      if (!carId) return null;

      const [created] = await tx
        .insert(schema.reservations)
        .values({
          reference,
          carModelId: model.id,
          carId,
          startDate: input.startDate,
          endDate: input.endDate,
          pickupTime: input.pickupTime,
          returnTime: input.returnTime,
          days,
          pickupLocationId: loc.id,
          extraDriver: input.extraDriver,
          childSeat: input.childSeat,
          protectionPackage: input.protectionPackage,
          depositVariant: input.depositVariant,
          totalGrosze: quote.totalGrosze,
          depositGrosze: quote.depositGrosze,
          quote: JSON.stringify(quote),
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          customerPhone: input.customerPhone,
          dateOfBirth: input.dateOfBirth,
          addressStreet: input.addressStreet,
          addressPostcode: input.addressPostcode,
          addressCity: input.addressCity,
          licenceNumber: input.licenceNumber,
          /*
           * `pending_verification`, nie `pending` — rozdział 13.4.
           *
           * Zgłoszenie z formularza publicznego zaczyna o stopień wcześniej
           * niż dotąd: jest zapisane, ma numer, NIE blokuje kalendarza (tak
           * samo jak `pending` nie blokował) i nie trafia jeszcze do obsługi.
           * Do `pending` — czyli „czeka na decyzję administratora" — przenosi
           * je dopiero kliknięcie w link z maila.
           */
          status: "pending_verification",
          // Analytics only. The value is already narrowed to the enum by the
          // request schema, so the column cannot receive anything else.
          source: input.source,
          // Język klienta — decyduje o języku KAŻDEJ późniejszej wiadomości.
          locale: input.locale,
        })
        .returning({ id: schema.reservations.id });

      /*
       * Klucz do samodzielnego zarządzania rezerwacją — W TEJ SAMEJ transakcji.
       *
       * Rezerwacja bez klucza to sprawa, której klient nie może ani przesunąć,
       * ani anulować, a dowiedziałby się o tym dopiero wtedy, gdy próbuje —
       * czyli w najgorszym możliwym momencie. Jedna transakcja znaczy: albo
       * jest rezerwacja z kluczem, albo nie ma ani jednego, ani drugiego.
       */
      const klucz = await wydajKluczDostepu(created.id, tx);
      return { id: created.id, klucz };
    });

    if (!reservationId) {
      /*
       * The car was on offer a moment ago and is gone at the moment of writing.
       *
       * Two different things end up here and the register cannot tell them
       * apart from one occurrence — but it does not need to, because the COUNT
       * separates them. Once in a while is the honest race: two people wanted
       * the last unit and the faster one got it. Fifty times in a day is the
       * expensive fault this alert exists for — what the fleet page, the card
       * and the assistant call "available" no longer agrees with the predicate
       * the booking transaction actually uses, and every one of those fifty was
       * a customer who filled in the whole form to be told no.
       *
       * ERROR, by the rule written in `alerts/types`: the customer did not get
       * what they asked for.
       */
      reportAlert({
        module: "booking",
        severity: "error",
        key: "createReservation:no-unit-free",
        title: "Auto było wolne przy wyborze, a nie było przy zapisie",
        detail:
          "Transakcja nie znalazła egzemplarza bez kolizji, mimo że model był pokazany jako dostępny. " +
          "Jednorazowo to wyścig o ostatnią sztukę; powtarzalnie — rozjazd między tym, co pokazuje flota, a predykatem rezerwacji.",
        // No customer data: one broken path is one alert with a count, not one
        // alert per person who ran into it.
        context: {
          model: input.modelSlug,
          startDate: input.startDate,
          endDate: input.endDate,
          source: input.source,
        },
      });
      return { ok: false, error: "full" };
    }

    /*
     * "The assistant found this customer a car" — written down at the one
     * moment it is provably true.
     *
     * After the response, like the staff e-mail, and inside its own try/catch:
     * the reservation is already saved and committed by this point, so nothing
     * about it can be undone by this line failing.
     */
    const { id: rezerwacjaId, klucz: kluczZarzadzania } = reservationId;

    if (input.conversationId) {
      const conversationId = input.conversationId;
      after(() => linkReservation(conversationId, rezerwacjaId));
    }

    /*
     * Powiadomienie dla personelu.
     *
     * ZOSTAJE na tym etapie, mimo że zgłoszenie nie jest jeszcze potwierdzone
     * przez klienta — i to jest świadome. Obsługa woli wiedzieć, że coś
     * przyszło, niż dowiadywać się o tym z piętnastominutowym opóźnieniem;
     * a zgłoszenie, które wygaśnie, i tak zmieni status na `rejected`
     * z wpisanym powodem, więc nikt nie będzie dzwonił do widma.
     *
     * Nadal po odpowiedzi: klient widzi swój numer od razu i nigdy nie czeka
     * na dostawcę poczty.
     */
    after(() =>
      notifyNewReservation({
        id: rezerwacjaId,
        reference,
        carName: `${model.brand} ${model.model}`,
        startDate: input.startDate,
        endDate: input.endDate,
        pickupTime: input.pickupTime,
        returnTime: input.returnTime,
        days,
        locationName: loc.name,
        totalGrosze: quote.totalGrosze,
        depositGrosze: quote.depositGrosze,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone,
      }),
    );

    /*
     * List z linkiem potwierdzającym.
     *
     * NIE w `after()`, w przeciwieństwie do powiadomienia dla personelu —
     * i to jest różnica warta jednego zdania. Powiadomienie dla obsługi może
     * pójść po odpowiedzi, bo klient ma już swój numer i nic od tego maila nie
     * zależy. Ten mail jest natomiast JEDYNĄ drogą, którą zgłoszenie rusza
     * dalej: gdyby poszedł „kiedyś potem", a poczta była niedostępna, klient
     * zobaczyłby „sprawdź skrzynkę" i czekał na list, który nigdy nie wyszedł.
     * Czekamy więc na wynik i mówimy prawdę.
     */
    const { token } = await createVerification(rezerwacjaId);
    const confirmUrl = `${siteConfig.url}/potwierdz-rezerwacje/${token}`;
    const mailSent = await notifyVerifyReservation({
      reference,
      carName: `${model.brand} ${model.model}`,
      startDate: input.startDate,
      endDate: input.endDate,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      confirmUrl,
      minutes: WAZNOSC_MINUT,
      // Język, w którym klient wypełniał formularz — punkt 4.
      locale: input.locale,
    });

    return {
      ok: true,
      reference,
      needsVerification: true,
      email: input.customerEmail,
      mailSent,
      minutes: WAZNOSC_MINUT,
      manageKey: kluczZarzadzania,
    };
  } catch (err) {
    // Generic to the caller; detail stays in server logs (fail closed + quiet).
    console.error("createReservation failed:", err);
    // …and in the alert register, which is the difference between "a customer
    // told us the form was broken last Tuesday" and knowing it broke, how many
    // times, and since when. The customer id is deliberately NOT in the
    // fingerprint: one broken reservation path is one alert with a count, not
    // one alert per person who ran into it.
    reportAlert({
      module: "booking",
      severity: "error",
      key: "createReservation:exception",
      title: "Rezerwacja nie została utworzona",
      error: err,
      context: {
        model: input.modelSlug,
        startDate: input.startDate,
        endDate: input.endDate,
        source: input.source,
      },
    });
    return { ok: false, error: "server" };
  }
}
