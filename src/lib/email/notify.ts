import "server-only";
import {
  BOOKING_NOTIFY_TO,
  MAIL_FROM,
  REMINDER_NOTIFY_TO,
  getMailer,
} from "./client";
import { siteConfig } from "@/lib/config/site";
import { getSetting } from "@/lib/admin/settings";
import { formatDatePl, formatPln } from "@/lib/format";
import { reportAlert } from "@/lib/alerts/record";
import {
  formatData,
  listHtml,
  listTekst,
  slowa,
  wierszeRezerwacji,
  type DaneRezerwacji,
  type Koperta,
} from "./templates";

/** What the customer's rejection email needs. */
export type RejectionNotice = {
  /** Język klienta z `reservations.locale` — punkt 4. Domyślnie polski. */
  locale?: "pl" | "en";
  reference: string;
  carName: string;
  startDate: string;
  endDate: string;
  customerName: string;
  customerEmail: string;
  /** Admin-typed reason; empty/whitespace means "no reason given". */
  reason: string;
};

/**
 * Everything the alert needs to be actionable.
 *
 * Deliberately NOT included: date of birth, licence number and home address.
 * Email is an unencrypted channel that gets forwarded, archived and synced to
 * phones; staff never need those fields to triage a request, and they remain
 * one click away in the admin panel behind authentication. Keeping them out
 * keeps the RODO/GDPR surface of this notification small.
 */
export type NewReservationAlert = {
  id: string;
  reference: string;
  carName: string;
  startDate: string;
  endDate: string;
  /** `HH:MM` handover times — when staff actually has to be somewhere. */
  pickupTime: string;
  returnTime: string;
  days: number;
  locationName: string;
  totalGrosze: number;
  depositGrosze: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
};

/** Escape untrusted values before they enter the HTML body. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderRows(a: NewReservationAlert): [string, string][] {
  return [
    ["Auto", a.carName],
    [
      "Termin",
      `${formatDatePl(a.startDate)} ${a.pickupTime} — ${formatDatePl(a.endDate)} ${a.returnTime}`,
    ],
    ["Liczba dni", String(a.days)],
    ["Odbiór", a.locationName],
    ["Wartość", formatPln(a.totalGrosze, "pl")],
    ["Kaucja", formatPln(a.depositGrosze, "pl")],
    ["Klient", a.customerName],
    ["E-mail", a.customerEmail],
    ["Telefon", a.customerPhone],
  ];
}

function textBody(a: NewReservationAlert, adminUrl: string): string {
  const rows = renderRows(a)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `Nowa rezerwacja ${a.reference}\n\n${rows}\n\nPotwierdź lub odrzuć w panelu:\n${adminUrl}\n`;
}

function htmlBody(a: NewReservationAlert, adminUrl: string): string {
  const rows = renderRows(a)
    .map(
      ([k, v]) =>
        `<tr>
           <td style="padding:6px 16px 6px 0;color:#8a8a8a;font-size:13px;white-space:nowrap">${esc(k)}</td>
           <td style="padding:6px 0;color:#111;font-size:14px;font-weight:600">${esc(v)}</td>
         </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="pl"><body style="margin:0;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="background:#fff;border:1px solid #e5e5e5;padding:28px">
      <p style="margin:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#c8102e">Nowa rezerwacja</p>
      <h1 style="margin:8px 0 24px;font-size:22px;color:#111">${esc(a.reference)}</h1>
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      <a href="${esc(adminUrl)}"
         style="display:inline-block;margin-top:28px;padding:12px 22px;background:#111;color:#fff;text-decoration:none;font-size:14px;font-weight:600">
        Otwórz w panelu
      </a>
      <p style="margin:24px 0 0;font-size:12px;color:#8a8a8a;line-height:1.5">
        Rezerwacja ma status <strong>oczekująca</strong> i nie blokuje kalendarza,
        dopóki nie zostanie potwierdzona w panelu.
      </p>
    </div>
  </div>
</body></html>`;
}

/**
 * Notify staff about a new reservation request.
 *
 * NEVER throws and never reports failure to the caller: the reservation is
 * already committed by the time this runs, so a mail outage must not turn a
 * successful booking into an error for the customer. Failures go to the server
 * log, where the reference is enough to recover the booking manually.
 */
export async function notifyNewReservation(
  alert: NewReservationAlert,
): Promise<void> {
  const mailer = getMailer();
  if (!mailer) {
    console.warn(
      `RESEND_API_KEY not set — no staff alert sent for ${alert.reference}.`,
    );
    /*
     * A booking that nobody is told about.
     *
     * This branch is silent by design towards the customer — their reservation
     * is saved and they have their reference — but it is the worst kind of
     * silence for the business: the row sits in the panel and no one knows to
     * look. WARNING, not ERROR, because the contract in `alerts/types` puts
     * incomplete configuration there, and because the booking itself survived.
     *
     * The key deliberately carries no reference: one missing API key is one
     * alert with a growing count, not one alert per booking.
     */
    reportAlert({
      module: "booking",
      severity: "warning",
      key: "notifyNewReservation:no-mailer",
      title: "Rezerwacja zapisana, ale powiadomienie do personelu nie wyszło",
      detail:
        "Brak konfiguracji poczty (RESEND_API_KEY). Rezerwacje trzeba odczytywać z panelu, bo mail o nich nie przychodzi.",
      // The reference only — never the customer's name, e-mail or phone.
      context: { rezerwacja: alert.reference },
    });
    return;
  }

  const adminUrl = `${siteConfig.url}/admin/reservations/${alert.id}`;

  try {
    const { error } = await mailer.emails.send({
      from: MAIL_FROM,
      to: BOOKING_NOTIFY_TO,
      subject: `Nowa rezerwacja ${alert.reference} — ${alert.carName}`,
      text: textBody(alert, adminUrl),
      html: htmlBody(alert, adminUrl),
      // Replying to the alert reaches the customer directly.
      replyTo: alert.customerEmail,
    });
    // The SDK reports API-level rejections in `error` rather than throwing.
    if (error) {
      console.error(`Staff alert failed for ${alert.reference}:`, error);
      reportAlert({
        module: "booking",
        severity: "error",
        key: "notifyNewReservation:send-rejected",
        title: "Poczta odrzuciła powiadomienie o rezerwacji",
        // `error` here is the provider's rejection object. It goes through
        // `redactValue`, which drops secret-looking keys, so an API key echoed
        // back in a rejection cannot land in the register.
        error,
        context: { rezerwacja: alert.reference },
      });
    }
  } catch (err) {
    console.error(`Staff alert threw for ${alert.reference}:`, err);
    reportAlert({
      module: "booking",
      severity: "error",
      key: "notifyNewReservation:send-threw",
      title: "Wyjątek przy wysyłce powiadomienia o rezerwacji",
      error: err,
      context: { rezerwacja: alert.reference },
    });
  }
}

/* ── Customer: reservation rejected ──────────────────────────────────────── */

/*
  `rejectionText` i `rejectionHtml` zostały USUNIĘTE 30.08.2026.

  Były jedynym pozostałym listem z własnym HTML-em i polszczyzną wpisaną na
  stałe w zdania. Ich treść żyje teraz na wspólnym szablonie z `templates.ts`,
  dwujęzycznie — punkt 4 zamówienia. Zostawienie ich „na wszelki wypadek"
  dałoby drugą, cichą wersję tego samego listu.
*/

export async function notifyReservationRejected(
  notice: RejectionNotice,
): Promise<void> {
  const mailer = getMailer();
  if (!mailer) {
    console.warn(
      `RESEND_API_KEY not set — no rejection email sent for ${notice.reference}.`,
    );
    return;
  }

  const company = await getSetting("company");
  const jezyk = notice.locale === "en" ? "en" : "pl";
  const en = jezyk === "en";
  const powod = notice.reason.trim();

  /*
    Od 30.08.2026 na wspólnym szablonie i w języku klienta (punkt 4).
    Przedtem ten list — jedyny, który niesie złą wiadomość — szedł wyłącznie
    po polsku, także do kogoś, kto całą stronę oglądał po angielsku.
  */
  const koperta: Koperta = {
    jezyk,
    etykieta: en ? "Reservation not fulfilled" : "Rezerwacja niezrealizowana",
    tytul: notice.reference,
    wstep: en
      ? `${slowa("en").dzienDobry}${notice.customerName ? ` ${notice.customerName}` : ""}, unfortunately we are not able to fulfil this reservation.`
      : `${slowa("pl").dzienDobry}${notice.customerName ? ` ${notice.customerName}` : ""}, niestety nie możemy zrealizować tej rezerwacji.`,
    wiersze: wierszeRezerwacji({
      reference: notice.reference,
      carName: notice.carName,
      startDate: notice.startDate,
      endDate: notice.endDate,
      pickupTime: null,
      returnTime: null,
      totalGrosze: 0,
      customerName: notice.customerName,
      customerEmail: notice.customerEmail,
      locale: jezyk,
    }),
    coDalej: powod
      ? `${en ? "Reason" : "Powód"}: ${powod}`
      : en
        ? "Please contact us — we will gladly help you find another date or car."
        : "Prosimy o kontakt — chętnie pomożemy dobrać inny termin lub samochód.",
    company,
  };

  try {
    const { error } = await mailer.emails.send({
      from: MAIL_FROM,
      to: notice.customerEmail,
      subject: en
        ? `Reservation ${notice.reference} — status`
        : `Rezerwacja ${notice.reference} — status`,
      text: listTekst(koperta),
      html: listHtml(koperta),
      replyTo: company.email || undefined,
    });
    if (error) {
      console.error(`Rejection email failed for ${notice.reference}:`, error);
    }
  } catch (err) {
    console.error(`Rejection email threw for ${notice.reference}:`, err);
  }
}

/* ── Staff: documents and services falling due ───────────────────────────── */

/** One dated obligation, already resolved to the label the operator reads. */
export type ExpiringDocument = {
  plate: string;
  carName: string;
  /** "OC/AC", "Przegląd", "Serwis". */
  kindLabel: string;
  date: string;
  /** Negative once the date has passed. */
  daysLeft: number;
};

/** "za 5 dni" / "jutro" / "dziś" / "5 dni po terminie" — the urgency, in words. */
function whenPhrase(daysLeft: number): string {
  if (daysLeft < 0)
    return `${Math.abs(daysLeft)} ${pluralDays(Math.abs(daysLeft))} po terminie`;
  if (daysLeft === 0) return "dziś";
  if (daysLeft === 1) return "jutro";
  return `za ${daysLeft} ${pluralDays(daysLeft)}`;
}

function pluralDays(n: number): string {
  return n === 1 ? "dzień" : "dni";
}

function reminderRows(items: ExpiringDocument[]): [string, string][] {
  return items.map((i) => [
    `${i.kindLabel} — ${i.plate}`,
    `${formatDatePl(i.date)} (${whenPhrase(i.daysLeft)}) · ${i.carName}`,
  ]);
}

function reminderText(items: ExpiringDocument[], adminUrl: string): string {
  const rows = reminderRows(items)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `Zbliżające się terminy floty\n\n${rows}\n\nPanel:\n${adminUrl}\n`;
}

function reminderHtml(items: ExpiringDocument[], adminUrl: string): string {
  const rows = items
    .map((i) => {
      // Overdue is the one state worth colouring: it is not a reminder any
      // more, it is a car that should not be on the road.
      const overdue = i.daysLeft < 0;
      return `<tr>
          <td style="padding:8px 16px 8px 0;color:#111;font-size:14px;font-weight:600;white-space:nowrap">${esc(i.kindLabel)}</td>
          <td style="padding:8px 16px 8px 0;color:#111;font-size:14px;white-space:nowrap">${esc(i.plate)}</td>
          <td style="padding:8px 16px 8px 0;color:#8a8a8a;font-size:13px">${esc(i.carName)}</td>
          <td style="padding:8px 0;font-size:14px;white-space:nowrap;color:${overdue ? "#c8102e" : "#111"};font-weight:${overdue ? "700" : "600"}">
            ${esc(formatDatePl(i.date))} <span style="font-weight:400;color:${overdue ? "#c8102e" : "#8a8a8a"}">(${esc(whenPhrase(i.daysLeft))})</span>
          </td>
        </tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="pl"><body style="margin:0;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:32px 24px">
    <div style="background:#fff;border:1px solid #e5e5e5;padding:28px">
      <p style="margin:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#c8102e">Terminy floty</p>
      <h1 style="margin:8px 0 24px;font-size:22px;color:#111">${items.length === 1 ? "1 termin wymaga uwagi" : `${items.length} terminy wymagają uwagi`}</h1>
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      <a href="${esc(adminUrl)}"
         style="display:inline-block;margin-top:28px;padding:12px 22px;background:#111;color:#fff;text-decoration:none;font-size:14px;font-weight:600">
        Otwórz panel
      </a>
      <p style="margin:24px 0 0;font-size:12px;color:#8a8a8a;line-height:1.5">
        Ta wiadomość wychodzi raz na termin. Po odnowieniu polisy albo wpisaniu
        nowej daty serwisu przypomnienie pojawi się ponownie przed kolejnym.
      </p>
    </div>
  </div>
</body></html>`;
}

/**
 * Tell staff what falls due in the next few days.
 *
 * Unlike the booking alerts, this one REPORTS whether it sent: the caller
 * writes the "already told them" rows only on success, so a mail outage
 * postpones a reminder rather than destroying it.
 */
export async function notifyExpiringDocuments(
  items: ExpiringDocument[],
  leadDays: number,
): Promise<boolean> {
  if (items.length === 0) return false;

  const mailer = getMailer();
  if (!mailer) {
    console.warn("RESEND_API_KEY not set — no expiry reminder sent.");
    return false;
  }

  const adminUrl = `${siteConfig.url}/admin/fleet`;
  const overdue = items.filter((i) => i.daysLeft < 0).length;
  const subject = overdue
    ? `Terminy floty: ${overdue} po terminie, ${items.length} łącznie`
    : `Terminy floty: ${items.length} w ciągu ${leadDays} dni`;

  try {
    const { error } = await mailer.emails.send({
      from: MAIL_FROM,
      to: REMINDER_NOTIFY_TO,
      subject,
      text: reminderText(items, adminUrl),
      html: reminderHtml(items, adminUrl),
    });
    if (error) {
      console.error("Expiry reminder failed:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Expiry reminder threw:", err);
    return false;
  }
}

/* ── Staff: a customer question waiting in the inbox ─────────────────────── */

/** Co powiadomienie o zapytaniu musi wiedzieć. */
export type NewRequestAlert = {
  id: string;
  subject: string;
  /**
   * Gotowe podsumowanie sprawy — ułożone przez `lib/inbox/summary`, to samo,
   * które widzi operator w panelu.
   *
   * Do etapu 44D szła tu surowa treść z formularza, więc powiadomienie
   * o zgłoszeniu Z CZATU nie miało czego pokazać: rozmowa nie ma pola
   * „wiadomość". Mail mówił „nowe zapytanie" i nic poza tym, a obsługa i tak
   * musiała otworzyć panel, żeby dowiedzieć się, o co chodzi.
   */
  summary: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  locale: "pl" | "en";
  source: string;
};

/**
 * Zapytanie klienta czeka w skrzynce — powiadom obsługę.
 *
 * WOŁANE PO ZAPISIE, NIGDY ZAMIAST NIEGO. Zgłoszenie jest już w bazie, kiedy
 * ta funkcja startuje, więc każda ścieżka błędu kończy się tak samo: klient
 * nie traci nic, obsługa widzi sprawę w panelu, a o niedziałającej poczcie
 * mówi ALERT — bo to ona jest awarią, nie zapytanie.
 *
 * `replyTo` na adres klienta, jeśli go zostawił: odpowiedź na powiadomienie
 * idzie wtedy wprost do niego, zamiast do skrzynki własnej firmy.
 */
export async function notifyNewRequest(alert: NewRequestAlert): Promise<void> {
  const mailer = getMailer();
  /*
   * Odnośnik do TEJ sprawy, nie do listy. `?open=` rozwija ją i przewija do
   * niej — operator, który dostaje maila o drugiej w nocy, ma jeden ruch do
   * wykonania, a nie „znajdź to wśród dwustu".
   */
  const adminUrl = `${siteConfig.url}/admin/inbox?open=${alert.id}`;

  if (!mailer) {
    console.warn(
      `RESEND_API_KEY not set — no staff alert for request ${alert.id}.`,
    );
    /*
     * Klucz bez identyfikatora zgłoszenia: brak konfiguracji poczty to JEDEN
     * alert z rosnącym licznikiem, nie jeden alert na każde zapytanie.
     * WARNING, nie ERROR — zapytanie jest bezpieczne w panelu.
     */
    reportAlert({
      module: "inbox",
      severity: "warning",
      key: "notifyNewRequest:no-mailer",
      title: "Zapytanie zapisane, ale powiadomienie do personelu nie wyszło",
      detail:
        "Brak konfiguracji poczty (RESEND_API_KEY). Zapytania trzeba odczytywać ze skrzynki w panelu, bo mail o nich nie przychodzi.",
      context: { zrodlo: alert.source },
    });
    return;
  }

  const text = `Nowe zapytanie w skrzynce A&A

${alert.subject}

${alert.summary}

Otwórz sprawę: ${adminUrl}
`;

  try {
    const { error } = await mailer.emails.send({
      from: MAIL_FROM,
      to: BOOKING_NOTIFY_TO,
      subject: `Nowe zapytanie: ${alert.subject}`,
      text,
      // Odpowiedź trafia do klienta, nie do własnej skrzynki firmy.
      replyTo: alert.email ?? undefined,
    });
    if (error) {
      console.error(`Request alert failed for ${alert.id}:`, error);
      reportAlert({
        module: "inbox",
        severity: "error",
        key: "notifyNewRequest:send-rejected",
        title: "Poczta odrzuciła powiadomienie o zapytaniu",
        // Przez `redactValue`, więc klucz odbity w odmowie dostawcy nie
        // wyląduje w rejestrze.
        error,
        context: { zrodlo: alert.source },
      });
    }
  } catch (err) {
    console.error(`Request alert threw for ${alert.id}:`, err);
    reportAlert({
      module: "inbox",
      severity: "error",
      key: "notifyNewRequest:send-threw",
      title: "Wyjątek przy wysyłce powiadomienia o zapytaniu",
      error: err,
      context: { zrodlo: alert.source },
    });
  }
}

/* ── Potwierdzenie rezerwacji przez klienta (rozdział 13.4) ───────────────── */

export type VerifyNotice = {
  reference: string;
  carName: string;
  startDate: string;
  endDate: string;
  customerName: string;
  customerEmail: string;
  /** Pełny adres z tokenem. Nie trafia do logów ani do alertów. */
  confirmUrl: string;
  /** Ile minut ważny jest link — ta sama liczba, co w treści i w kodzie. */
  minutes: number;
  /** Język klienta z `reservations.locale`. Domyślnie polski — patrz punkt 4. */
  locale?: "pl" | "en";
};

/**
 * „Potwierdź swoją rezerwację" — jedyny mail, bez którego zgłoszenie nie ruszy
 * dalej.
 *
 * DLACZEGO TO NIE JEST `after()`. Wszystkie pozostałe powiadomienia w tym pliku
 * idą po odesłaniu odpowiedzi, bo klient ma już swój numer i nic na nie nie
 * czeka. Tutaj jest odwrotnie: bez tego maila rezerwacja wygaśnie po piętnastu
 * minutach. Wołający i tak puszcza to przez `after()` — ale świadomie, wiedząc
 * że przy braku poczty musi pokazać klientowi inną drogę (numer telefonu),
 * a nie samo „sprawdź skrzynkę".
 *
 * ADRES Z TOKENEM NIGDY NIE TRAFIA DO LOGU. W `console.warn` niżej jest sam
 * numer rezerwacji — link jest hasłem na okaziciela i log serwera nie jest
 * miejscem na hasła.
 */
export async function notifyVerifyReservation(
  notice: VerifyNotice,
): Promise<boolean> {
  const mailer = getMailer();
  if (!mailer) {
    console.warn(
      `RESEND_API_KEY not set — brak maila potwierdzającego dla ${notice.reference}.`,
    );
    reportAlert({
      module: "booking",
      severity: "critical",
      key: "notifyVerifyReservation:no-mailer",
      title:
        "Rezerwacje NIE MOGĄ zostać potwierdzone — brak konfiguracji poczty",
      detail:
        "Zgłoszenia czekają na potwierdzenie e-mailem, a poczta nie jest skonfigurowana (RESEND_API_KEY). " +
        "Każde zgłoszenie z formularza wygaśnie po 15 minutach niepotwierdzone. To zatrzymuje sprzedaż z formularza.",
      context: { rezerwacja: notice.reference },
    });
    return false;
  }

  /*
    Treść na wspólnym szablonie (`email/templates.ts`) — od 30.08.2026, punkt 4.

    Przedtem ten list miał własny HTML i polszczyznę wpisaną na stałe, więc
    klient, który przeszedł całą stronę po angielsku, dostawał „Dzień dobry".
    Teraz język bierze się z rezerwacji, a koperta jest ta sama, co w pozostałych
    pięciu wiadomościach.

    Przycisk jest tu JEDEN i nie jest to „Zarządzaj rezerwacją": ta wiadomość
    istnieje po to, żeby klient kliknął w jedno miejsce.
  */
  const jezyk = notice.locale === "en" ? "en" : "pl";
  const en = jezyk === "en";
  const company = await getSetting("company");
  const koperta: Koperta = {
    jezyk,
    etykieta: en ? "Confirm your reservation" : "Potwierdź rezerwację",
    tytul: notice.reference,
    wstep: en
      ? `${slowa("en").dzienDobry}${notice.customerName ? ` ${notice.customerName}` : ""}, we have received your booking request. Please confirm it within ${notice.minutes} minutes.`
      : `${slowa("pl").dzienDobry}${notice.customerName ? ` ${notice.customerName}` : ""}, zgłoszenie rezerwacji zostało przyjęte. Potwierdź je w ciągu ${notice.minutes} minut.`,
    wiersze: wierszeRezerwacji({
      reference: notice.reference,
      carName: notice.carName,
      startDate: notice.startDate,
      endDate: notice.endDate,
      pickupTime: null,
      returnTime: null,
      totalGrosze: 0,
      customerName: notice.customerName,
      customerEmail: notice.customerEmail,
      locale: jezyk,
    }),
    coDalej: en
      ? "If you did not fill in this form, do nothing. The request expires on its own and the car is not held for a moment because of it."
      : "Jeżeli to nie Ty wypełniałeś formularz — nie rób nic. Zgłoszenie wygaśnie samo, a samochód nie jest z tego powodu zajęty ani przez chwilę.",
    akcja: {
      url: notice.confirmUrl,
      etykieta: en ? "Confirm reservation" : "Potwierdź rezerwację",
    },
    company,
  };
  const tekst = listTekst(koperta);
  const html = listHtml(koperta);

  try {
    /*
      JEDNA ponowna próba — punkt 17 („bezpieczne retry").

      Tylko tutaj i tylko raz. Ten list jest jedyną drogą, którą zgłoszenie
      rusza dalej: bez niego rezerwacja wygasa po piętnastu minutach. Pozostałe
      pięć wiadomości opisuje coś, co już się stało, więc ich ponawianie kupuje
      niewiele, a kosztuje ryzykiem duplikatu w skrzynce klienta.

      Ponawiamy WYŁĄCZNIE gdy pierwsza próba zawiodła — jeżeli Resend przyjął
      zgłoszenie, drugiego nie wysyłamy nigdy. Sekunda przerwy, bo typowa
      przyczyna to chwilowy błąd sieci albo limit tempa po stronie dostawcy,
      a nie zły adres; zły adres nie naprawi się od powtórzenia i nie ma po co
      próbować trzeci raz.
    */
    const wyslij = () =>
      mailer.emails.send({
        from: MAIL_FROM,
        to: notice.customerEmail,
        subject: en
          ? `Confirm reservation ${notice.reference}`
          : `Potwierdź rezerwację ${notice.reference}`,
        text: tekst,
        html,
      });

    let { error } = await wyslij();
    if (error) {
      await new Promise((r) => setTimeout(r, 1000));
      const druga = await wyslij();
      error = druga.error;
      if (!error) {
        console.warn(
          `Mail potwierdzający dla ${notice.reference} wyszedł dopiero za drugim razem.`,
        );
      }
    }
    if (error) {
      console.error(`Mail potwierdzający odrzucony (${notice.reference}).`);
      reportAlert({
        module: "booking",
        severity: "error",
        key: "notifyVerifyReservation:send-rejected",
        title: "Poczta odrzuciła mail potwierdzający rezerwację",
        error,
        context: { rezerwacja: notice.reference },
      });
      return false;
    }
    return true;
  } catch (err) {
    reportAlert({
      module: "booking",
      severity: "error",
      key: "notifyVerifyReservation:threw",
      title: "Wysyłka maila potwierdzającego rzuciła wyjątkiem",
      error: err,
      context: { rezerwacja: notice.reference },
    });
    return false;
  }
}

/* ── Klient: cztery wiadomości o losach jego rezerwacji ──────────────────── */

/**
 * Powiadomienia B–E z punktu 4 zamówienia.
 *
 * Do 30.08.2026 klient dostawał dokładnie dwie wiadomości: prośbę
 * o potwierdzenie adresu (A) i ewentualne odrzucenie. Wszystko pomiędzy —
 * przyjęcie potwierdzenia, potwierdzenie rezerwacji przez obsługę, zmiana
 * terminu, anulowanie — działo się w ciszy. Klient, który przesunął termin
 * z telefonu, nie miał żadnego dowodu, że to się stało.
 *
 * Wszystkie cztery mają ten sam kontrakt co reszta tego pliku: NIGDY nie
 * rzucają. Każda z nich biegnie PO zatwierdzonej zmianie w bazie, więc awaria
 * poczty nie ma prawa cofnąć operacji, którą opisuje — trafia do logu, a numer
 * rezerwacji wystarczy, żeby obsługa odezwała się sama.
 *
 * Język bierze się z `reservations.locale`, nie z bieżącego żądania: obsługa
 * potwierdza nazajutrz, a klient przesuwa termin za tydzień.
 */
async function wyslijDoKlienta(
  r: DaneRezerwacji,
  koperta: Omit<Koperta, "company" | "jezyk" | "manageUrl" | "documentsUrl">,
  temat: string,
  klucz: string,
): Promise<void> {
  const mailer = getMailer();
  if (!mailer) {
    console.warn(
      `RESEND_API_KEY nie ustawiony — brak maila ${klucz} dla ${r.reference}.`,
    );
    return;
  }
  try {
    const company = await getSetting("company");
    const pelna: Koperta = {
      ...koperta,
      jezyk: r.locale,
      manageUrl: r.manageUrl ?? null,
      documentsUrl: r.documentsUrl ?? null,
      company,
    };
    const { error } = await mailer.emails.send({
      from: MAIL_FROM,
      to: r.customerEmail,
      subject: temat,
      text: listTekst(pelna),
      html: listHtml(pelna),
      replyTo: company.email || undefined,
    });
    if (error)
      console.error(`Mail ${klucz} nie wyszedł dla ${r.reference}:`, error);
  } catch (err) {
    console.error(`Mail ${klucz} rzucił dla ${r.reference}:`, err);
  }
}

/** B. Adres potwierdzony — zgłoszenie idzie do obsługi. */
export async function notifyEmailConfirmed(r: DaneRezerwacji): Promise<void> {
  const en = r.locale === "en";
  await wyslijDoKlienta(
    r,
    {
      etykieta: en ? "E-mail confirmed" : "Adres potwierdzony",
      tytul: r.reference,
      wstep: en
        ? `${slowa("en").dzienDobry}${r.customerName ? ` ${r.customerName}` : ""}, thank you — your e-mail address has been confirmed and your request is now with our team.`
        : `${slowa("pl").dzienDobry}${r.customerName ? ` ${r.customerName}` : ""}, dziękujemy — adres e-mail został potwierdzony, a zgłoszenie trafiło do naszego zespołu.`,
      wiersze: wierszeRezerwacji(r),
      coDalej: en
        ? "We will confirm availability and get back to you. You do not need to do anything else for now."
        : "Sprawdzimy dostępność i wrócimy z odpowiedzią. Na tym etapie nie musisz nic robić.",
    },
    en
      ? `Reservation ${r.reference} — e-mail confirmed`
      : `Rezerwacja ${r.reference} — adres potwierdzony`,
    "email-confirmed",
  );
}

/** C. Rezerwacja potwierdzona przez obsługę — auto jest zarezerwowane. */
export async function notifyReservationConfirmed(
  r: DaneRezerwacji,
): Promise<void> {
  const en = r.locale === "en";
  await wyslijDoKlienta(
    r,
    {
      etykieta: en ? "Reservation confirmed" : "Rezerwacja potwierdzona",
      tytul: r.reference,
      wstep: en
        ? `${slowa("en").dzienDobry}${r.customerName ? ` ${r.customerName}` : ""}, your reservation is confirmed. The car is booked for you.`
        : `${slowa("pl").dzienDobry}${r.customerName ? ` ${r.customerName}` : ""}, rezerwacja jest potwierdzona. Samochód czeka zarezerwowany na Ciebie.`,
      wiersze: wierszeRezerwacji(r),
      /*
        ZMIANA I ANULOWANIE TO JUŻ DWIE RÓŻNE SPRAWY — i to zdanie musiało
        za tym pójść. Do 01.09.2026 mówiło „przesunąć lub anulować do 24 godzin
        przed odbiorem", bo obie operacje miały jedno okno. Po nowej polityce
        anulować wolno ZAWSZE (bliżej odbioru za opłatą), a okno samoobsługi
        zostało tylko przy zmianie terminu. Zostawienie starego zdania byłoby
        pisemną informacją, że po dwudziestu czterech godzinach klient nie może
        już anulować sam — czyli nieprawdą wysłaną mailem.
      */
      coDalej: en
        ? "Please bring your driving licence and ID to the pick-up. If anything changes, you can move the booking yourself up to 24 hours before pick-up, and cancel it at any time — the cancellation terms are in your reservation and in the Terms."
        : "Na odbiór prosimy zabrać prawo jazdy i dowód tożsamości. Gdyby coś się zmieniło, termin możesz przesunąć samodzielnie do 24 godzin przed odbiorem, a anulować w każdej chwili — zasady anulowania znajdziesz w rezerwacji i w regulaminie.",
    },
    en
      ? `Reservation ${r.reference} confirmed`
      : `Rezerwacja ${r.reference} potwierdzona`,
    "reservation-confirmed",
  );
}

/** D. Termin zmieniony — z widocznym starym terminem, żeby dało się sprawdzić. */
export async function notifyReservationRescheduled(
  r: DaneRezerwacji,
  poprzedni: { startDate: string; endDate: string },
): Promise<void> {
  const en = r.locale === "en";
  const s = slowa(r.locale);
  const stary = `${formatData(poprzedni.startDate, r.locale)} – ${formatData(poprzedni.endDate, r.locale)}`;
  await wyslijDoKlienta(
    r,
    {
      etykieta: en ? "Dates changed" : "Termin zmieniony",
      tytul: r.reference,
      wstep: en
        ? `${s.dzienDobry}${r.customerName ? ` ${r.customerName}` : ""}, the dates of your reservation have been changed as requested.`
        : `${s.dzienDobry}${r.customerName ? ` ${r.customerName}` : ""}, termin rezerwacji został zmieniony zgodnie z Twoją prośbą.`,
      // Stary termin jako PIERWSZY wiersz: bez niego klient nie ma jak
      // sprawdzić, czy zmieniło się to, o co prosił.
      wiersze: [
        [en ? "Previous dates" : "Poprzedni termin", stary],
        ...wierszeRezerwacji(r),
      ],
      coDalej: en
        ? "If this is not what you asked for, contact us — the previous dates can still be restored."
        : "Jeżeli to nie jest to, o co prosiłeś, odezwij się do nas — poprzedni termin da się jeszcze przywrócić.",
    },
    en
      ? `Reservation ${r.reference} — new dates`
      : `Rezerwacja ${r.reference} — nowy termin`,
    "reservation-rescheduled",
  );
}

/** E. Anulowanie — potwierdzenie tego, co klient właśnie zrobił. */
/**
 * Opłata za anulowanie umorzona — osobny list, nie poprawka poprzedniego.
 *
 * Klient dostał już wiadomość z kwotą; ta mówi, że kwoty nie ma. Wysyłana
 * wyłącznie wtedy, gdy naprawdę było co umarzać — umorzenie zera nie jest
 * zdarzeniem, o którym trzeba komuś pisać.
 */
export async function notifyCancellationFeeWaived(
  r: DaneRezerwacji,
): Promise<void> {
  const en = r.locale === "en";
  const s = slowa(r.locale);
  await wyslijDoKlienta(
    { ...r, manageUrl: null },
    {
      etykieta: en ? "Cancellation fee waived" : "Opłata umorzona",
      tytul: r.reference,
      wstep: en
        ? `${s.dzienDobry}${r.customerName ? ` ${r.customerName}` : ""}, we have waived the cancellation fee for this reservation.`
        : `${s.dzienDobry}${r.customerName ? ` ${r.customerName}` : ""}, opłata za anulowanie tej rezerwacji została umorzona.`,
      wiersze: wierszeRezerwacji(r),
      coDalej: en
        ? "There is nothing left to pay. We hope to see you again."
        : "Nie ma nic do zapłaty. Mamy nadzieję, że jeszcze się zobaczymy.",
    },
    en
      ? `Cancellation fee for ${r.reference} waived`
      : `Opłata za anulowanie ${r.reference} umorzona`,
    "cancellation-fee-waived",
  );
}

export async function notifyReservationCancelled(
  r: DaneRezerwacji,
): Promise<void> {
  const en = r.locale === "en";
  const s = slowa(r.locale);
  await wyslijDoKlienta(
    // Przycisk „Zarządzaj" zdejmowany TU, a nie w szablonie: anulowanej
    // rezerwacji nie ma czym zarządzać, a przycisk prowadzący donikąd jest
    // gorszy niż jego brak.
    { ...r, manageUrl: null },
    {
      etykieta: en ? "Reservation cancelled" : "Rezerwacja anulowana",
      tytul: r.reference,
      wstep: en
        ? `${s.dzienDobry}${r.customerName ? ` ${r.customerName}` : ""}, your reservation has been cancelled. The car is free again for these dates.`
        : `${s.dzienDobry}${r.customerName ? ` ${r.customerName}` : ""}, rezerwacja została anulowana. Samochód jest w tym terminie znów wolny.`,
      wiersze: wierszeRezerwacji(r),
      /*
        Zdanie „co dalej" ZALEŻY od tego, czy coś zostało do zapłaty. Klient,
        który anulował bezpłatnie, ma usłyszeć, że sprawa jest zamknięta;
        klient z należnością ma usłyszeć, że rachunek istnieje i skąd się
        wziął — jedno zdanie dla obu byłoby albo fałszywie uspokajające, albo
        niepotrzebnie niepokojące.
      */
      coDalej:
        r.anulowanie && !r.anulowanie.umorzona && r.anulowanie.kwotaGrosze > 0
          ? en
            ? "The fee follows the cancellation terms accepted with the reservation and depends on how close to the handover the cancellation was made. We will contact you about settling it — no action is needed from you right now."
            : "Opłata wynika z zasad anulowania zaakceptowanych przy rezerwacji i zależy od tego, jak blisko odbioru nastąpiło anulowanie. Skontaktujemy się w sprawie rozliczenia — w tej chwili nic nie musisz robić."
          : en
            ? "Nothing else is required from you. You are welcome to book again whenever it suits you."
            : "Z Twojej strony nic więcej nie jest potrzebne. Zapraszamy ponownie, kiedy będzie Ci wygodnie.",
      // Anulowana rezerwacja nie dostaje przycisku „Zarządzaj" — nie ma już
      // czym zarządzać, a przycisk prowadzący donikąd jest gorszy niż jego brak.
    },
    en
      ? `Reservation ${r.reference} cancelled`
      : `Rezerwacja ${r.reference} anulowana`,
    "reservation-cancelled",
  );
}

/**
 * Obsługa: zgłoszenie POTWIERDZONE i czekające na decyzję — punkt 7.
 *
 * DLACZEGO TO JEST OSOBNE POWIADOMIENIE
 *
 * `notifyNewReservation` idzie w chwili wypełnienia formularza, czyli dla
 * zgłoszenia jeszcze NIEPOTWIERDZONEGO — świadomie, bo obsługa woli wiedzieć
 * od razu. Ale to znaczy, że moment, w którym rezerwacja naprawdę staje się
 * zadaniem do wykonania — klient kliknął w link i status poszedł na `pending` —
 * mijał bez żadnego sygnału. Odznaka w panelu owszem rosła, tyle że nikt nie
 * patrzy w panel bez przerwy, a zgłoszenia niepotwierdzone wygasają po
 * piętnastu minutach i część tamtych pierwszych maili dotyczy widm.
 *
 * To jest POWIADOMIENIE BIZNESOWE, nie alert systemowy: prawidłowa rezerwacja
 * nie jest awarią i nie ma prawa trafić do `system_alerts` ani zapalić
 * czerwonej odznaki. Zamówienie mówi o tym wprost.
 *
 * Jak reszta tego pliku: nigdy nie rzuca.
 */
export async function notifyReservationReady(a: {
  reference: string;
  carName: string;
  startDate: string;
  endDate: string;
  customerName: string;
  customerPhone?: string | null;
}): Promise<void> {
  const mailer = getMailer();
  if (!mailer) {
    console.warn(
      `RESEND_API_KEY nie ustawiony — brak alertu o ${a.reference}.`,
    );
    return;
  }
  const adminUrl = `${siteConfig.url}/admin/reservations`;
  const wiersze: [string, string][] = [
    ["Numer", a.reference],
    ["Samochód", a.carName],
    ["Termin", `${formatDatePl(a.startDate)} – ${formatDatePl(a.endDate)}`],
    ["Klient", a.customerName],
  ];
  if (a.customerPhone) wiersze.push(["Telefon", a.customerPhone]);

  const tekst = [
    `Klient potwierdził adres e-mail. Rezerwacja ${a.reference} czeka na decyzję.`,
    "",
    ...wiersze.map(([k, v]) => `${k}: ${v}`),
    "",
    adminUrl,
  ].join("\n");

  try {
    const { error } = await mailer.emails.send({
      from: MAIL_FROM,
      to: BOOKING_NOTIFY_TO,
      subject: `Do potwierdzenia: ${a.reference}`,
      text: tekst,
      html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111">
        <p><strong>Klient potwierdził adres e-mail.</strong> Rezerwacja czeka na decyzję.</p>
        <table style="border-collapse:collapse">${wiersze
          .map(
            ([k, v]) =>
              `<tr><td style="padding:4px 12px 4px 0;color:#8a8a8a">${esc(k)}</td><td style="padding:4px 0;font-weight:600">${esc(v)}</td></tr>`,
          )
          .join("")}</table>
        <p style="margin-top:20px"><a href="${esc(adminUrl)}" style="color:#c8102e">Otwórz w panelu</a></p>
      </div>`,
    });
    if (error)
      console.error(`Alert o gotowej rezerwacji ${a.reference}:`, error);
  } catch (err) {
    console.error(`Alert o gotowej rezerwacji ${a.reference} rzucił:`, err);
  }
}

/**
 * Dokumenty jako ZAŁĄCZNIKI — Admin → Umowy i dokumenty, AUTO-SEND.
 *
 * ## Dlaczego załącznik, a nie odnośnik
 *
 * Poprzednio mail potwierdzający niósł odnośnik do strony „moje rezerwacje".
 * Ta strona rozpoznaje klienta po numerze i kluczu z `localStorage` TEJ SAMEJ
 * przeglądarki — więc klient, który rezerwował na komputerze i otworzył maila
 * na telefonie, trafiał na pustą stronę. Załącznik jest w skrzynce, na każdym
 * urządzeniu, także za rok.
 *
 * Odnośnik ZOSTAJE w mailu potwierdzającym: to dwie różne drogi do tej samej
 * rzeczy i żadna nie zastępuje drugiej.
 *
 * ## Osobna wiadomość, nie doklejenie do potwierdzenia
 *
 * Potwierdzenie rezerwacji ma jedno zadanie i klient czyta je natychmiast.
 * Sześćset kilobajtów załączników potrafi opóźnić dostarczenie albo wpaść
 * w filtr — a wtedy przepada także sama informacja o potwierdzeniu. Dokumenty
 * idą więc osobnym listem, zaraz po tamtym.
 *
 * ## Kontrakt
 *
 * Zwraca wynik zamiast rzucać, bo wołający musi wiedzieć, czy zapisać `sent_at`.
 * To jedyna funkcja w tym pliku, która czegokolwiek nie połyka — i właśnie
 * dlatego, że jej wynik jest zapisywany, a nie tylko logowany.
 */
export async function wyslijDokumenty(a: {
  reference: string;
  carName: string;
  startDate: string;
  endDate: string;
  customerName: string;
  customerEmail: string;
  locale: "pl" | "en";
  zalaczniki: { filename: string; content: Buffer }[];
}): Promise<{ ok: true } | { ok: false; powod: string }> {
  const mailer = getMailer();
  if (!mailer) {
    return {
      ok: false,
      powod: "poczta nie jest skonfigurowana (RESEND_API_KEY)",
    };
  }
  if (a.zalaczniki.length === 0) {
    return { ok: false, powod: "brak dokumentów do wysłania" };
  }

  const en = a.locale === "en";
  const s = slowa(a.locale);

  try {
    const company = await getSetting("company");
    const koperta: Koperta = {
      jezyk: a.locale,
      etykieta: en ? "Your documents" : "Twoje dokumenty",
      tytul: a.reference,
      wstep: en
        ? `${s.dzienDobry}${a.customerName ? ` ${a.customerName}` : ""}, here are the documents for your reservation. Please read them before collecting the car — they are attached to this message.`
        : `${s.dzienDobry}${a.customerName ? ` ${a.customerName}` : ""}, w załączeniu dokumenty dotyczące Twojej rezerwacji. Prosimy o zapoznanie się z nimi przed odbiorem samochodu.`,
      wiersze: [
        [s.numer, a.reference],
        [s.samochod, a.carName],
        [
          s.termin,
          `${formatData(a.startDate, a.locale)} – ${formatData(a.endDate, a.locale)}`,
        ],
        [
          en ? "Attached" : "W załączeniu",
          a.zalaczniki.map((z) => z.filename).join(", "),
        ],
      ],
      coDalej: en
        ? "No action is needed now. We will go through the documents with you at handover and answer any questions."
        : "Na tym etapie nic nie trzeba robić. Dokumenty przejdziemy razem przy wydaniu auta i odpowiemy na pytania.",
      company,
    };

    const { error } = await mailer.emails.send({
      from: MAIL_FROM,
      to: a.customerEmail,
      subject: en
        ? `Documents for reservation ${a.reference}`
        : `Dokumenty do rezerwacji ${a.reference}`,
      text: listTekst(koperta),
      html: listHtml(koperta),
      replyTo: company.email || undefined,
      attachments: a.zalaczniki.map((z) => ({
        filename: z.filename,
        content: z.content,
      })),
    });
    if (error) {
      return { ok: false, powod: String(error.message ?? error).slice(0, 300) };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, powod: String(err).slice(0, 300) };
  }
}
