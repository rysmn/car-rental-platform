import "server-only";
import { clientIp as adresKlienta } from "@/lib/security/client-ip";
import { headers } from "next/headers";
import { getDb, schema } from "@/lib/db";

/**
 * Best-effort client IP from proxy headers (never trusted for authz, only logging).
 *
 * Zwraca `null`, gdy nagłówków nie ma — zamiast rzucać.
 *
 * `headers()` rzuca poza zakresem żądania („`headers` was called outside a
 * request scope"), a `recordAudit` czekał na ten wynik PRZED zapisem. Skutek był
 * odwrotny do zamierzonego: nieznane IP — rzecz w tym samym komentarzu opisana
 * jako podrzędna, „only logging" — kasowało CAŁY wpis dziennika, czyli rzecz
 * z rozdziału 13.6, której cała wartość polega na tym, że jest.
 *
 * Ujawnił to `test-zarzadzanie-rezerwacja.ts`: zmiana terminu i anulowanie
 * zapisywały się poprawnie, a ślad po nich nie powstawał. Ta sama ścieżka
 * czekała na każde wywołanie spoza żądania — zadanie cykliczne, kolejka,
 * `after()`. Kolumna `ip` jest NULLABLE, więc wpis bez adresu był przewidziany
 * od początku; brakowało tylko drogi, którą mógłby powstać.
 */
export async function clientIp(): Promise<string | null> {
  try {
    /*
      Ten sam odczyt, co liczniki bezpieczeństwa — `lib/security/client-ip`.
      Do 02.09.2026 stała tu kopia biorąca PIERWSZY element `X-Forwarded-For`,
      czyli wartość podaną przez klienta: dziennik audytu dało się zatruć
      dowolnym adresem, wpisując go w nagłówek.
    */
    const ip = adresKlienta(await headers());
    return ip === "unknown" ? null : ip.slice(0, 64);
  } catch {
    return null;
  }
}

/** Append an admin action to the immutable audit trail. */
export async function recordAudit(entry: {
  adminId: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  const db = getDb();
  await db.insert(schema.auditLog).values({
    adminId: entry.adminId,
    action: entry.action,
    entity: entry.entity ?? null,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: await clientIp(),
  });
}
