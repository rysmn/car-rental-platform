import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requirePermission } from "./guard";
import { verifyPassword } from "./password";
import { verifyTotp } from "./totp";
import type { CurrentAdmin } from "./guard";
import type { Permission } from "./permissions";
import { isCritical } from "./permissions";
import { recordSecurityEvent } from "@/lib/security/events";

/**
 * Potwierdzona intencja — rozdział 13.6 punkt 6.
 *
 * ## Czego brakowało
 *
 * Panel miał dwustopniowe „Na pewno?" w kilku miejscach floty i finansów oraz
 * `confirm()` przeglądarki przy zdjęciach i blokadach. To jest warstwa
 * FRONTENDOWA: broni przed omsknięciem się myszy i przed niczym więcej. Akcja
 * serwerowa jest osobnym punktem POST i przyjmuje żądanie tak samo, czy okno
 * dialogowe się pojawiło, czy nie. Po stronie serwera nie istniało pojęcie
 * „ten człowiek świadomie o to poprosił".
 *
 * ## Jak to działa
 *
 * Administrator potwierdza tożsamość — hasłem, a przy włączonym 2FA także
 * kodem — i przez dziesięć minut jego konto ma OTWARTE OKNO na operacje
 * krytyczne. Operacja krytyczna sprawdza to okno; bez niego rzuca
 * `confirm_required` i nic nie robi.
 *
 * Okno jest krótkie z rozmysłem: ma pokryć jedną sesję pracy przy usuwaniu
 * i zmianie cen, a nie cały dzień. Porzucony, zalogowany panel na cudzym
 * komputerze przestaje być groźny po dziesięciu minutach od ostatniego
 * potwierdzenia.
 *
 * ## Dlaczego w pamięci procesu
 *
 * Ta sama zasada, co przy wszystkich pozostałych licznikach w tym projekcie:
 * restart kontenera KASUJE okna, a nie przedłuża. Stan bezpieczeństwa, który
 * przeżywa wdrożenie, jest stanem, o którym się zapomina. Cena — po restarcie
 * trzeba potwierdzić ponownie — jest dokładnie tym, czego chcemy.
 */

/** Jak długo trwa okno od potwierdzenia. */
export const OKNO_MS = 10 * 60_000;

const okna = new Map<string, number>();

export type WynikPotwierdzenia =
  | { ok: true; doKiedy: number }
  | { ok: false; error: string };

/**
 * Potwierdź tożsamość i otwórz okno.
 *
 * Konto z 2FA musi podać OBA składniki. Samo hasło wystarczyłoby komuś, kto
 * hasło zna — a przed nim ma bronić drugi składnik, więc pomijanie go
 * dokładnie tam, gdzie stawka jest najwyższa, byłoby bez sensu.
 */
export async function potwierdzTozsamosc(
  admin: CurrentAdmin,
  haslo: string,
  kod?: string,
): Promise<WynikPotwierdzenia> {
  const [row] = await getDb()
    .select({
      passwordHash: schema.admins.passwordHash,
      totpSecret: schema.admins.totpSecret,
      totpConfirmedAt: schema.admins.totpConfirmedAt,
    })
    .from(schema.admins)
    .where(eq(schema.admins.id, admin.id))
    .limit(1);
  if (!row) return { ok: false, error: "Nie znaleziono konta." };

  if (!(await verifyPassword(row.passwordHash, haslo))) {
    void recordSecurityEvent({
      kind: "critical_denied",
      endpoint: "admin.confirm",
      adminId: admin.id,
      detail: { powod: "hasło" },
    });
    return { ok: false, error: "Hasło nie pasuje." };
  }

  if (row.totpConfirmedAt && row.totpSecret) {
    if (!kod || !verifyTotp(row.totpSecret, kod)) {
      void recordSecurityEvent({
        kind: "totp_failed",
        endpoint: "admin.confirm",
        adminId: admin.id,
      });
      return { ok: false, error: "Podaj aktualny kod z aplikacji." };
    }
  }

  const doKiedy = Date.now() + OKNO_MS;
  okna.set(admin.id, doKiedy);
  // Mapa nie ma prawa rosnąć w nieskończoność, choć kont są jednostki.
  if (okna.size > 500) {
    const teraz = Date.now();
    for (const [id, kiedy] of okna) if (kiedy < teraz) okna.delete(id);
  }
  return { ok: true, doKiedy };
}

/** Do kiedy okno jest otwarte (ms) albo `null`. Panel pokazuje to wprost. */
export function oknoDoKiedy(adminId: string): number | null {
  const doKiedy = okna.get(adminId);
  if (!doKiedy || doKiedy < Date.now()) return null;
  return doKiedy;
}

/** Zamknij okno ręcznie — „skończyłem, zablokuj z powrotem". */
export function zamknijOkno(adminId: string) {
  okna.delete(adminId);
}

/**
 * Brama operacji krytycznej: uprawnienie ORAZ świeże potwierdzenie tożsamości.
 *
 * Rzuca `forbidden` przy braku uprawnienia i `confirm_required` przy braku
 * potwierdzenia. Dwa różne wyjątki, bo to dwie różne odpowiedzi dla człowieka:
 * pierwsza znaczy „nie tobie", druga „potwierdź, kim jesteś".
 *
 * Uprawnienie spoza listy krytycznych przechodzi tędy bez okna — dzięki temu
 * wywołanie `requireCritical` w miejscu, które krytyczne nie jest, niczego nie
 * psuje, a lista tego, co krytyczne, mieszka w JEDNYM miejscu
 * (`permissions.CRITICAL_PERMISSIONS`).
 */
export async function requireCritical(
  permission: Permission,
): Promise<CurrentAdmin> {
  const admin = await requirePermission(permission);
  if (!isCritical(permission)) return admin;

  if (!oknoDoKiedy(admin.id)) {
    void recordSecurityEvent({
      kind: "critical_denied",
      endpoint: `admin.${permission}`,
      adminId: admin.id,
      detail: { powod: "brak potwierdzenia" },
    });
    throw new Error("confirm_required");
  }
  return admin;
}

/** Komunikat, który panel pokazuje zamiast surowego wyjątku. */
export const KOMUNIKAT_POTWIERDZENIA =
  "Ta operacja wymaga potwierdzenia tożsamości. Odblokuj operacje krytyczne " +
  "w panelu bocznym (kłódka pod nazwą konta) i spróbuj ponownie.";

/**
 * Wariant `requireCritical`, który ZWRACA odmowę zamiast ją rzucać.
 *
 * Po co, skoro rzucanie jest prostsze: Next.js maskuje w produkcji komunikaty
 * wyjątków z akcji serwerowych — i słusznie, bo treść wyjątku bywa mapą
 * systemu. Skutkiem ubocznym jest to, że administrator klikający „Usuń"
 * zobaczyłby „wystąpił błąd" i nie dowiedziałby się, że wystarczy odblokować
 * kłódkę w panelu bocznym. Akcje, które i tak zwracają `{ ok, error }`,
 * używają więc tej wersji i pokazują zdanie, po którym wiadomo, co zrobić.
 *
 * Ścieżka rzucająca zostaje dla wszystkiego, co nie ma jak zwrócić błędu —
 * i to ona jest tą, na której polega bezpieczeństwo.
 */
export async function bramaKrytyczna(permission: Permission): Promise<
  | { ok: true; admin: CurrentAdmin }
  | { ok: false; error: string }
> {
  try {
    return { ok: true, admin: await requireCritical(permission) };
  } catch (err) {
    const wiadomosc = err instanceof Error ? err.message : "";
    if (wiadomosc === "confirm_required") {
      return { ok: false, error: KOMUNIKAT_POTWIERDZENIA };
    }
    if (wiadomosc === "forbidden") {
      return {
        ok: false,
        error: "Twoja rola nie pozwala na tę operację.",
      };
    }
    throw err;
  }
}
