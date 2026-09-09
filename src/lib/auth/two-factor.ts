import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDb, schema } from "@/lib/db";
import { hashPassword, verifyPassword } from "./password";
import {
  generateRecoveryCodes,
  normalizeRecoveryCode,
  verifyTotp,
} from "./totp";
import { recordSecurityEvent } from "@/lib/security/events";

/**
 * Drugi składnik logowania — sprawdzanie kodu i kody zapasowe.
 *
 * ## Zasada, od której zależy tu wszystko
 *
 * **Właściciel nie może stracić dostępu do własnej firmy.** Panel zapisał to
 * sobie sam, zanim ktokolwiek zaczął pisać ten kod: „źle wdrożone obowiązkowe
 * 2FA zamyka właściciela przed panelem". Dlatego są TRZY drogi do środka,
 * a nie jedna:
 *
 *   1. kod z aplikacji (zwykły dzień),
 *   2. **kod zapasowy** — dziesięć sztuk, każdy jednorazowy, wydane raz przy
 *      włączaniu 2FA i nie do odtworzenia z bazy,
 *   3. **konsola serwera** — `scripts/wylacz-2fa.ts`, do uruchomienia przez
 *      kogoś, kto ma dostęp do maszyny. To jest droga na wypadek zgubienia
 *      telefonu RAZEM z kartką kodów.
 *
 * Trzecia droga nie jest luką: kto ma powłokę na serwerze, ma i tak bazę,
 * i tak sekrety, i tak wszystko. Udawanie, że 2FA broni przed kimś, kto już
 * jest w środku, byłoby zabezpieczeniem na papierze.
 *
 * ## Czego tu nie ma
 *
 * Sekret TOTP nie trafia do dziennika, do alertu ani do audytu — nigdzie poza
 * kolumnę `admins.totp_secret` i ekran rejestracji. Kod zapasowy leży wyłącznie
 * jako skrót argon2, tak samo jak hasło.
 */

export type WynikDrugiegoSkladnika =
  | { ok: true; sposob: "totp" | "kod_zapasowy" }
  | { ok: false; powod: "brak_kodu" | "zly_kod" };

/**
 * Sprawdź drugi składnik dla konta, które ma włączone 2FA.
 *
 * Przyjmuje JEDNO pole, w które człowiek wpisuje albo sześć cyfr z aplikacji,
 * albo kod zapasowy — bo w chwili, w której ktoś szuka kartki z kodami, dwa
 * osobne pola i pytanie „którego użyć" to ostatnia rzecz, jakiej potrzebuje.
 * Rozróżnienie robi kształt: sześć cyfr to TOTP, wszystko inne sprawdzamy
 * względem kodów zapasowych.
 */
export async function sprawdzDrugiSkladnik(
  admin: { id: string; totpSecret: string | null },
  podane: string | null | undefined,
): Promise<WynikDrugiegoSkladnika> {
  const kod = (podane ?? "").trim();
  if (!kod) return { ok: false, powod: "brak_kodu" };
  if (!admin.totpSecret) return { ok: false, powod: "zly_kod" };

  if (/^\d{6}$/.test(kod.replace(/\s/g, ""))) {
    if (verifyTotp(admin.totpSecret, kod)) return { ok: true, sposob: "totp" };
    await odnotujZlyKod(admin.id);
    return { ok: false, powod: "zly_kod" };
  }

  const zuzyty = await zuzyjKodZapasowy(admin.id, kod);
  if (zuzyty) return { ok: true, sposob: "kod_zapasowy" };

  await odnotujZlyKod(admin.id);
  return { ok: false, powod: "zly_kod" };
}

async function odnotujZlyKod(adminId: string) {
  void recordSecurityEvent({
    kind: "totp_failed",
    endpoint: "admin.login",
    adminId,
  });
}

/**
 * Zużyj kod zapasowy, jeżeli pasuje do któregoś z nieużytych.
 *
 * Porównanie idzie po KAŻDYM nieużytym skrócie — inaczej się nie da, bo argon2
 * soli każdy skrót osobno i nie ma czego wyszukać po wartości. Dziesięć
 * porównań argon2 to około sekundy i to jest w porządku: ta ścieżka biegnie
 * raz na kilka lat, a jej powolność jest dodatkową barierą dla zgadywania.
 */
async function zuzyjKodZapasowy(
  adminId: string,
  kod: string,
): Promise<boolean> {
  const znormalizowany = normalizeRecoveryCode(kod);
  if (znormalizowany.length < 8) return false;

  const db = getDb();
  const kody = await db
    .select({
      id: schema.adminRecoveryCodes.id,
      hash: schema.adminRecoveryCodes.codeHash,
    })
    .from(schema.adminRecoveryCodes)
    .where(
      and(
        eq(schema.adminRecoveryCodes.adminId, adminId),
        isNull(schema.adminRecoveryCodes.usedAt),
      ),
    );

  for (const k of kody) {
    if (!(await verifyPassword(k.hash, znormalizowany))) continue;
    /*
      Stemplujemy warunkowo (`used_at is null`), więc dwa równoległe logowania
      tym samym kodem zużyją go raz. Kod jednorazowy, który da się użyć dwa
      razy, nie jest jednorazowy.
    */
    const [oznaczony] = await db
      .update(schema.adminRecoveryCodes)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(schema.adminRecoveryCodes.id, k.id),
          isNull(schema.adminRecoveryCodes.usedAt),
        ),
      )
      .returning({ id: schema.adminRecoveryCodes.id });
    if (!oznaczony) return false;

    void recordSecurityEvent({
      kind: "recovery_used",
      endpoint: "admin.login",
      adminId,
      detail: { zostalo: kody.length - 1 },
    });
    return true;
  }
  return false;
}

/**
 * Nowy komplet kodów zapasowych. Zwraca kody JAWNE — jedyny moment, w którym
 * istnieją. Poprzedni komplet unieważniamy w tej samej transakcji: dwa ważne
 * komplety naraz to dwa razy więcej kartek do zgubienia.
 */
export async function wydajKodyZapasowe(adminId: string): Promise<string[]> {
  const kody = generateRecoveryCodes(10);
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.adminRecoveryCodes)
      .where(eq(schema.adminRecoveryCodes.adminId, adminId));
    for (const kod of kody) {
      await tx.insert(schema.adminRecoveryCodes).values({
        adminId,
        codeHash: await hashPassword(normalizeRecoveryCode(kod)),
      });
    }
  });
  return kody;
}

/** Ile nieużytych kodów zostało — panel pokazuje to, żeby nikt nie odkrył
 *  zera dopiero w chwili, w której zgubi telefon. */
export async function ileKodowZostalo(adminId: string): Promise<number> {
  const [row] = await getDb()
    .select({ ile: sql<number>`count(*)::int` })
    .from(schema.adminRecoveryCodes)
    .where(
      and(
        eq(schema.adminRecoveryCodes.adminId, adminId),
        isNull(schema.adminRecoveryCodes.usedAt),
      ),
    );
  return row?.ile ?? 0;
}

/**
 * Odcisk urządzenia — do rozpoznania „to logowanie jest z nowego miejsca".
 *
 * Skrót z nagłówka przeglądarki, języka i adresu obciętego do sieci (trzy
 * pierwsze oktety w IPv4). Sieć zamiast pełnego adresu, bo operator komórkowy
 * zmienia klientowi adres co kilka minut i pełny adres oznaczałby alert
 * „nowe urządzenie" przy każdym logowaniu z telefonu.
 *
 * To NIE jest identyfikacja i nie udaje nią być — służy do jednego pytania:
 * „czy to wygląda tak samo jak ostatnio". Odpowiedź „nie" jest powiadomieniem,
 * nigdy blokadą.
 */
export function odciskUrzadzenia(
  userAgent: string | null,
  language: string | null,
  ip: string | null,
): string {
  const siec = (ip ?? "").split(".").slice(0, 3).join(".");
  return createHash("sha256")
    .update(`${userAgent ?? ""}|${language ?? ""}|${siec}`)
    .digest("hex")
    .slice(0, 32);
}
