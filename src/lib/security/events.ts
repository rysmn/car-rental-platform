import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDb, schema } from "@/lib/db";
import type { Bilingual } from "@/lib/i18n-pick";

/**
 * Dziennik odrzuconych prób — rozdział 13.1 punkt 4.
 *
 * ## Co tu wolno zapisać, a czego nie
 *
 * Zamówienie mówi wprost: „bez zapisywania zbędnych danych osobowych,
 * wystarczy informacja techniczna: czas, typ blokady, endpoint, skrócony
 * identyfikator". Ten plik traktuje to jako regułę, nie jako sugestię —
 * `subject` przechodzi przez `shortSubject`, więc do bazy trafia osiem znaków
 * skrótu, a nie adres IP ani e-mail. Do policzenia „ten sam ktoś dziesiąty raz
 * w ciągu minuty" to wystarcza w zupełności, a dziennik nie staje się drugim
 * zbiorem danych osobowych, którego trzeba pilnować i który trzeba wydać na
 * żądanie.
 *
 * ## Dlaczego to nie są alerty
 *
 * Rejestr alertów budzi człowieka. Ten dziennik nie budzi nikogo: pojedynczy
 * robot, który wpadł w pułapkę, jest normalnym dniem pracy serwisu w internecie
 * i nie ma o czym powiadamiać. Dopiero GĘSTOŚĆ tych wpisów bywa nowiną — i to
 * właśnie liczy `countRecent`, na podstawie którego alert podnosi dopiero
 * `security/alerts.ts`.
 *
 * ## Zapis nigdy nie może wywrócić żądania
 *
 * Tak samo jak w rejestrze alertów: wołane z bloków `catch` i ze ścieżek
 * odrzucenia, więc każdy własny błąd jest połykany. Dziennik, który wywraca
 * obsługę formularza, jest gorszy niż brak dziennika.
 */

export const SECURITY_EVENT_KINDS = [
  // 13.1 — formularze
  "honeypot",
  "form_rate_limited",
  "turnstile_missing",
  "turnstile_invalid",
  "form_too_fast",
  // 13.2 — czat
  "chat_session_limit",
  "chat_repeat",
  "chat_flood",
  // 13.3 — zbieranie danych
  "scrape_rate_limited",
  "suspicious_agent",
  // 13.4 — potwierdzenie rezerwacji
  "verification_bad_token",
  "verification_expired",
  "verification_reused",
  "verification_unavailable",
  // 13.5
  "lead_time_rejected",
  // Zarządzanie własną rezerwacją przez klienta
  //
  // `manage_bad_key` to klucz nieznany, unieważniony albo o złym kształcie —
  // pojedyncze zdarzenie znaczy „ktoś ma stary link", seria znaczy zgadywanie.
  // `manage_ref_mismatch` jest CIĘŻSZE: klucz prawdziwy, ale podstawiony pod
  // cudzy numer rezerwacji. To nie jest pomyłka użytkownika, to próba wejścia
  // w cudzą sprawę przez podmianę identyfikatora.
  "manage_bad_key",
  "manage_ref_mismatch",
  // 13.6 — panel
  "login_failed",
  "login_locked",
  "totp_failed",
  "recovery_used",
  "new_device",
  "sessions_revoked",
  "critical_denied",
  "permission_denied",
] as const;
export type SecurityEventKind = (typeof SECURITY_EVENT_KINDS)[number];

/**
 * Skrócony, nieodwracalny identyfikator sprawcy.
 *
 * Osiem znaków sha-256 z soloną wartością. Solą jest `AUTH_SECRET`, który i tak
 * musi być w środowisku — bez soli skrót z adresu IP jest odwracalny w kilka
 * sekund (przestrzeń IPv4 to cztery miliardy wartości, czyli nic).
 */
export function shortSubject(
  wartosc: string | null | undefined,
): string | null {
  if (!wartosc) return null;
  const sol = process.env.AUTH_SECRET ?? "aa";
  return createHash("sha256")
    .update(`${sol}:${wartosc}`)
    .digest("hex")
    .slice(0, 8);
}

export type SecurityEventInput = {
  kind: SecurityEventKind;
  /** Trasa albo nazwa akcji: `booking.create`, `/api/chat`, `admin.login`. */
  endpoint: string;
  /** Wartość SUROWA — funkcja sama ją skraca. */
  subject?: string | null;
  adminId?: string | null;
  detail?: Record<string, unknown>;
};

export async function recordSecurityEvent(
  wejscie: SecurityEventInput,
): Promise<void> {
  try {
    if (!process.env.DATABASE_URL) return;
    await getDb()
      .insert(schema.securityEvents)
      .values({
        kind: wejscie.kind,
        endpoint: wejscie.endpoint.slice(0, 200),
        subject: shortSubject(wejscie.subject),
        adminId: wejscie.adminId ?? null,
        detail: wejscie.detail ?? null,
      });
  } catch {
    /* dziennik nie może wywrócić tego, co opisuje */
  }
}

/** Ile takich zdarzeń w ostatnim oknie — podstawa progów alertowych. */
export async function countRecent(
  kind: SecurityEventKind,
  oknoMs: number,
  subject?: string | null,
): Promise<number> {
  try {
    if (!process.env.DATABASE_URL) return 0;
    const od = new Date(Date.now() - oknoMs);
    const warunki = [
      eq(schema.securityEvents.kind, kind),
      gte(schema.securityEvents.createdAt, od),
    ];
    const skrot = shortSubject(subject);
    if (skrot) warunki.push(eq(schema.securityEvents.subject, skrot));
    const [row] = await getDb()
      .select({ ile: sql<number>`count(*)::int` })
      .from(schema.securityEvents)
      .where(and(...warunki));
    return row?.ile ?? 0;
  } catch {
    return 0;
  }
}

export type PodsumowanieZdarzen = {
  kind: string;
  ile: number;
  ostatnie: Date;
};

/**
 * KTO wywołał serię odrzuceń — dwie linijki zamiast zapytania do bazy.
 *
 * ## Po co to powstało (07.09.2026)
 *
 * Alert „Wygląda na masowe pobieranie zawartości strony" mówił wyłącznie, ILE
 * żądań odrzucono, i radził rozważyć regułę po stronie Cloudflare. Właściciel
 * dostawał więc pytanie bez danych do odpowiedzi: nasze testy? Lighthouse?
 * wyszukiwarka? scraper? Ustalenie tego wymagało wejścia w bazę — a alert,
 * który zmusza do śledztwa, zostanie odłożony na później.
 *
 * Rozstrzygnięcie było w dzienniku przez cały czas. Seria z 03.09.2026 to
 * `curl/8.7.1` z jednego adresu, chodzący po `/.env`, `/.s3cfg`, `/aws.yaml`,
 * `/manager/html` i `/wp-json/wc/v3/payment_gateways` — skaner szukający
 * sekretów, nie klient i nie nasz test. Dwie takie linijki w treści alertu
 * zamykają sprawę w sekundę.
 *
 * Zapytanie idzie WYŁĄCZNIE wtedy, gdy alert i tak ma powstać (czyli po
 * przekroczeniu progu), więc normalny ruch nie płaci za nie niczym.
 */
export async function ktoWSerii(
  kind: SecurityEventKind,
  oknoMs: number,
  ileSciezek = 5,
): Promise<{ agenci: string; sciezki: string[] } | null> {
  try {
    if (!process.env.DATABASE_URL) return null;
    const od = new Date(Date.now() - oknoMs);
    const warunki = and(
      eq(schema.securityEvents.kind, kind),
      gte(schema.securityEvents.createdAt, od),
    );
    const agenci = await getDb()
      .select({
        agent: sql<string>`coalesce(${schema.securityEvents.detail}->>'agent', '(brak)')`,
        ile: sql<number>`count(*)::int`,
        adresow: sql<number>`count(distinct ${schema.securityEvents.subject})::int`,
      })
      .from(schema.securityEvents)
      .where(warunki)
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`)
      .limit(3);
    const sciezki = await getDb()
      .selectDistinct({ endpoint: schema.securityEvents.endpoint })
      .from(schema.securityEvents)
      .where(warunki)
      .limit(ileSciezek);
    return {
      agenci: agenci
        .map(
          (a) =>
            `${String(a.agent).slice(0, 60)} (${a.ile} żądań, ${a.adresow} adr.)`,
        )
        .join("; "),
      sciezki: sciezki.map((s) => String(s.endpoint).slice(0, 60)),
    };
  } catch {
    return null;
  }
}

/**
 * Co dziennik zapisał w ostatnim oknie, zgrupowane po rodzaju.
 *
 * Dla panelu, nie dla alertów. Alert mówi „stało się coś, na co masz spojrzeć";
 * ta lista odpowiada na inne pytanie — „ile tego dziś było" — i pozwala
 * zobaczyć, czy pułapka na roboty w ogóle działa, zanim ktokolwiek zdąży się
 * o to zapytać.
 */
export async function podsumujZdarzenia(
  oknoMs = 24 * 60 * 60_000,
): Promise<PodsumowanieZdarzen[]> {
  try {
    if (!process.env.DATABASE_URL) return [];
    const od = new Date(Date.now() - oknoMs);
    const rows = await getDb()
      .select({
        kind: schema.securityEvents.kind,
        ile: sql<number>`count(*)::int`,
        ostatnie: sql<Date>`max(${schema.securityEvents.createdAt})`,
      })
      .from(schema.securityEvents)
      .where(gte(schema.securityEvents.createdAt, od))
      .groupBy(schema.securityEvents.kind)
      .orderBy(sql`count(*) desc`);
    return rows.map((r) => ({
      kind: r.kind,
      ile: Number(r.ile) || 0,
      ostatnie: new Date(r.ostatnie),
    }));
  } catch {
    return [];
  }
}

/** Nazwy rodzajów — panel nie ma pokazywać identyfikatorów z kodu. */
export const NAZWA_ZDARZENIA: Record<string, Bilingual> = {
  honeypot: { pl: "Pułapka na roboty", en: "Bot trap" },
  form_rate_limited: { pl: "Limit wysyłek formularza", en: "Form submission limit" },
  turnstile_missing: { pl: "Brak tokenu antybotowego", en: "Missing anti-bot token" },
  turnstile_invalid: { pl: "Odrzucony token antybotowy", en: "Rejected anti-bot token" },
  form_too_fast: { pl: "Formularz wysłany zbyt szybko", en: "Form sent too quickly" },
  chat_session_limit: { pl: "Limit wiadomości w rozmowie", en: "Message limit in a conversation" },
  chat_repeat: { pl: "Powtarzana wiadomość w czacie", en: "Repeated message in chat" },
  chat_flood: { pl: "Zbyt szybkie wiadomości w czacie", en: "Messages in chat too fast" },
  scrape_rate_limited: { pl: "Limit ruchu publicznego", en: "Public traffic limit" },
  suspicious_agent: { pl: "Podejrzany klient HTTP", en: "Suspicious HTTP client" },
  verification_bad_token: { pl: "Zły token potwierdzenia", en: "Invalid confirmation token" },
  verification_expired: { pl: "Wygasłe potwierdzenie", en: "Expired confirmation" },
  verification_reused: { pl: "Ponownie użyty link potwierdzenia", en: "Confirmation link reused" },
  verification_unavailable: { pl: "Termin zajęty przy potwierdzaniu", en: "Date taken during confirmation" },
  lead_time_rejected: { pl: "Odbiór poniżej minimalnego wyprzedzenia", en: "Pickup below the minimum lead time" },
  login_failed: { pl: "Nieudane logowanie", en: "Failed login" },
  login_locked: { pl: "Konto zablokowane po próbach", en: "Account locked after attempts" },
  totp_failed: { pl: "Zły kod 2FA", en: "Wrong 2FA code" },
  recovery_used: { pl: "Użyty kod zapasowy", en: "Recovery code used" },
  new_device: { pl: "Logowanie z nowego urządzenia", en: "Login from a new device" },
  sessions_revoked: { pl: "Unieważnienie wszystkich sesji", en: "All sessions revoked" },
  critical_denied: { pl: "Odmowa operacji krytycznej", en: "Critical operation denied" },
  permission_denied: { pl: "Brak uprawnień do operacji", en: "No permission for the operation" },
};
