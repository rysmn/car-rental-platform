"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getDb, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/auth/audit";
import { verifyPassword } from "@/lib/auth/password";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/auth/totp";
import { ileKodowZostalo, wydajKodyZapasowe } from "@/lib/auth/two-factor";
import { alertBezpieczenstwa } from "@/lib/security/alerts";
import { recordSecurityEvent } from "@/lib/security/events";

/**
 * Włączanie, wyłączanie i odnawianie 2FA — rozdział 13.6 punkt 1.
 *
 * ## Gdzie mieszka sekret PRZED potwierdzeniem
 *
 * W ciasteczku `HttpOnly`, ważnym dziesięć minut, a NIE w bazie. To jest
 * decyzja, nie skrót: gdyby sekret lądował w bazie od razu przy generowaniu,
 * konto miałoby przez chwilę 2FA z sekretem, którego właściciel nigdy nie
 * wpisał do aplikacji — i gdyby zamknął kartę w połowie, zostałby zamknięty
 * przed panelem przez własną kolumnę. Do bazy sekret trafia dopiero razem
 * z DOWODEM, że aplikacja go zna: poprawnym kodem.
 *
 * ## Dlaczego każda zmiana wymaga hasła
 *
 * Włączenie, wyłączenie i odnowienie kodów to operacje, które ROZSTRZYGAJĄ
 * O DOSTĘPIE. Porzucona, zalogowana sesja na cudzym komputerze nie może
 * wystarczyć do wyłączenia drugiego składnika — to zamieniłoby 2FA w ozdobę.
 *
 * ## Czego tu nigdy nie ma
 *
 * Sekret TOTP nie trafia do audytu, do alertu ani do dziennika. W audycie stoi
 * fakt („2FA włączone"), nigdy wartość.
 */

const CIASTECZKO = "aa-2fa-setup";
const WAZNOSC_S = 600;

export type Wynik2FA =
  | { ok: true; message?: string }
  | { ok: false; error: string };

export type StartWynik =
  | { ok: true; secret: string; uri: string }
  | { ok: false; error: string };

/** Krok 1: wygeneruj sekret i pokaż go do zeskanowania. Nic nie zapisuje. */
export async function start2FA(): Promise<StartWynik> {
  const admin = await requireAdmin();
  const t = await getTranslations("Admin.settings.twoFactorActions");
  const [row] = await getDb()
    .select({ totpConfirmedAt: schema.admins.totpConfirmedAt })
    .from(schema.admins)
    .where(eq(schema.admins.id, admin.id))
    .limit(1);
  if (row?.totpConfirmedAt) {
    return { ok: false, error: t("start.alreadyOn") };
  }

  const secret = generateTotpSecret();
  const jar = await cookies();
  jar.set(CIASTECZKO, secret, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WAZNOSC_S,
  });
  return { ok: true, secret, uri: totpUri(secret, admin.email) };
}

/**
 * Krok 2: potwierdź kodem i zapisz.
 *
 * Zwraca kody zapasowe — JEDYNY moment, w którym istnieją w postaci czytelnej.
 * Interfejs musi zmusić właściciela do ich zapisania, bo drugiego razu nie
 * będzie: w bazie leżą wyłącznie skróty argon2.
 */
export async function potwierdz2FA(
  kod: string,
  haslo: string,
): Promise<Wynik2FA & { kody?: string[] }> {
  const admin = await requireAdmin();
  const t = await getTranslations("Admin.settings.twoFactorActions");
  const db = getDb();

  const [row] = await db
    .select({
      passwordHash: schema.admins.passwordHash,
      totpConfirmedAt: schema.admins.totpConfirmedAt,
    })
    .from(schema.admins)
    .where(eq(schema.admins.id, admin.id))
    .limit(1);
  if (!row) return { ok: false, error: t("confirm.notFound") };
  if (row.totpConfirmedAt) {
    return { ok: false, error: t("confirm.alreadyOn") };
  }
  if (!(await verifyPassword(row.passwordHash, haslo))) {
    return { ok: false, error: t("wrongPassword") };
  }

  const jar = await cookies();
  const secret = jar.get(CIASTECZKO)?.value;
  if (!secret) {
    return { ok: false, error: t("confirm.expired") };
  }
  if (!verifyTotp(secret, kod)) {
    return { ok: false, error: t("confirm.wrongCode") };
  }

  await db
    .update(schema.admins)
    .set({ totpSecret: secret, totpConfirmedAt: new Date() })
    .where(eq(schema.admins.id, admin.id));
  jar.delete(CIASTECZKO);

  const kody = await wydajKodyZapasowe(admin.id);

  await recordAudit({
    adminId: admin.id,
    action: "admin.2fa_enabled",
    entity: "admin",
    entityId: admin.id,
    // Fakt, nigdy wartość: sekret nie ma prawa istnieć w dzienniku.
    after: { twoFactor: true, kodyZapasowe: kody.length },
  });
  alertBezpieczenstwa({
    kind: "twofa_enabled",
    adminId: admin.id,
    tytul: "Włączono logowanie dwuskładnikowe",
    szczegoly: `Konto ${admin.email} ma od teraz 2FA i ${kody.length} kodów zapasowych.`,
  });

  revalidatePath("/admin/settings/konto");
  return { ok: true, kody, message: t("confirm.enabled") };
}

/**
 * Wyłączenie 2FA. Wymaga hasła ORAZ aktualnego kodu.
 *
 * Dwa składniki do wyłączenia dwóch składników: kto przejął zalogowaną sesję,
 * nie może jednym kliknięciem zdjąć zabezpieczenia, przed którym stanął.
 */
export async function wylacz2FA(
  haslo: string,
  kod: string,
): Promise<Wynik2FA> {
  const admin = await requireAdmin();
  const t = await getTranslations("Admin.settings.twoFactorActions");
  const db = getDb();
  const [row] = await db
    .select({
      passwordHash: schema.admins.passwordHash,
      totpSecret: schema.admins.totpSecret,
      totpConfirmedAt: schema.admins.totpConfirmedAt,
    })
    .from(schema.admins)
    .where(eq(schema.admins.id, admin.id))
    .limit(1);
  if (!row?.totpConfirmedAt || !row.totpSecret) {
    return { ok: false, error: t("disable.notEnabled") };
  }
  if (!(await verifyPassword(row.passwordHash, haslo))) {
    return { ok: false, error: t("wrongPassword") };
  }
  if (!verifyTotp(row.totpSecret, kod)) {
    void recordSecurityEvent({
      kind: "totp_failed",
      endpoint: "admin.2fa_disable",
      adminId: admin.id,
    });
    return { ok: false, error: t("disable.wrongCode") };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schema.admins)
      .set({ totpSecret: null, totpConfirmedAt: null })
      .where(eq(schema.admins.id, admin.id));
    await tx
      .delete(schema.adminRecoveryCodes)
      .where(eq(schema.adminRecoveryCodes.adminId, admin.id));
  });

  await recordAudit({
    adminId: admin.id,
    action: "admin.2fa_disabled",
    entity: "admin",
    entityId: admin.id,
    before: { twoFactor: true },
    after: { twoFactor: false },
  });
  alertBezpieczenstwa({
    kind: "twofa_disabled",
    adminId: admin.id,
    tytul: "WYŁĄCZONO logowanie dwuskładnikowe",
    szczegoly:
      `Konto ${admin.email} nie ma już drugiego składnika. Jeżeli to nie Ty — ` +
      "ktoś zna Twoje hasło ORAZ kod, a to znaczy, że ma dostęp do telefonu albo do kodów zapasowych.",
  });

  revalidatePath("/admin/settings/konto");
  return { ok: true, message: t("disable.disabled") };
}

/** Nowy komplet kodów zapasowych. Unieważnia poprzedni. */
export async function odnowKodyZapasowe(
  haslo: string,
): Promise<Wynik2FA & { kody?: string[] }> {
  const admin = await requireAdmin();
  const t = await getTranslations("Admin.settings.twoFactorActions");
  const [row] = await getDb()
    .select({
      passwordHash: schema.admins.passwordHash,
      totpConfirmedAt: schema.admins.totpConfirmedAt,
    })
    .from(schema.admins)
    .where(eq(schema.admins.id, admin.id))
    .limit(1);
  if (!row?.totpConfirmedAt) {
    return { ok: false, error: t("reissue.enableFirst") };
  }
  if (!(await verifyPassword(row.passwordHash, haslo))) {
    return { ok: false, error: t("wrongPassword") };
  }

  const kody = await wydajKodyZapasowe(admin.id);
  await recordAudit({
    adminId: admin.id,
    action: "admin.recovery_codes_reissued",
    entity: "admin",
    entityId: admin.id,
    after: { kodyZapasowe: kody.length },
  });
  revalidatePath("/admin/settings/konto");
  return { ok: true, kody, message: t("reissue.reissued") };
}

/**
 * „Wyloguj ze wszystkich urządzeń" — rozdział 13.6 punkt 3.
 *
 * Sesje są w JWT, więc nie ma czego skasować po stronie serwera. Zamiast
 * przepisywać całe logowanie na sesje w bazie, konto dostaje granicę
 * ważności: `sessions_valid_from`. Każdy token wydany wcześniej przestaje
 * działać przy najbliższym wejściu, bo `currentAdmin()` i tak czyta ten
 * wiersz — patrz `auth/guard.ts`.
 *
 * Działa NATYCHMIAST i dotyczy także sesji, z której naciśnięto przycisk:
 * tak jest uczciwiej niż wyjątek dla „tej jednej", bo człowiek naciska to
 * właśnie wtedy, gdy nie jest pewien, kto jeszcze jest w środku.
 */
export async function wylogujWszedzie(haslo: string): Promise<Wynik2FA> {
  const admin = await requireAdmin();
  const t = await getTranslations("Admin.settings.twoFactorActions");
  const [row] = await getDb()
    .select({ passwordHash: schema.admins.passwordHash })
    .from(schema.admins)
    .where(eq(schema.admins.id, admin.id))
    .limit(1);
  if (!row) return { ok: false, error: t("confirm.notFound") };
  if (!(await verifyPassword(row.passwordHash, haslo))) {
    return { ok: false, error: t("wrongPassword") };
  }

  await getDb()
    .update(schema.admins)
    .set({ sessionsValidFrom: new Date() })
    .where(eq(schema.admins.id, admin.id));

  await recordAudit({
    adminId: admin.id,
    action: "admin.sessions_revoked",
    entity: "admin",
    entityId: admin.id,
  });
  void recordSecurityEvent({
    kind: "sessions_revoked",
    endpoint: "admin.account",
    adminId: admin.id,
  });
  alertBezpieczenstwa({
    kind: "sessions_revoked",
    adminId: admin.id,
    tytul: "Unieważniono wszystkie sesje",
    szczegoly: `Konto ${admin.email} wylogowało się ze wszystkich urządzeń.`,
  });

  return { ok: true, message: t("sessions.revoked") };
}

/** Ile kodów zapasowych zostało — do pokazania w panelu. */
export async function stanKodow(): Promise<number> {
  const admin = await requireAdmin();
  return ileKodowZostalo(admin.id);
}
