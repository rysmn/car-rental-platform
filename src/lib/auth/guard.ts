import "server-only";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { auth } from "./config";
import { can, type AdminRole, type Permission } from "./permissions";

export type CurrentAdmin = {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  /** Czy konto ma potwierdzone 2FA — panel pokazuje na tej podstawie monit. */
  twoFactor: boolean;
};

/**
 * The session JWT lives for 8h and carries a snapshot of the account taken at
 * login. Now that accounts can be deleted, deactivated or demoted from the
 * panel, every guarded entry point re-reads the row instead of trusting that
 * snapshot — otherwise a revoked admin would keep full access until their
 * token expired.
 *
 * Od 27.08.2026 to samo odczytanie wiersza obsługuje „wyloguj ze wszystkich
 * urządzeń": jeżeli `sessions_valid_from` jest PÓŹNIEJSZE niż chwila wydania
 * tokenu, sesja jest martwa niezależnie od tego, że sam token jest poprawnie
 * podpisany i jeszcze nie wygasł. Kosztuje to jedno porównanie liczb w miejscu,
 * które i tak już czytało ten wiersz — i dlatego nie było powodu przepisywać
 * całego logowania na sesje w bazie.
 */
export async function currentAdmin(): Promise<CurrentAdmin | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  const db = getDb();
  const [row] = await db
    .select({
      id: schema.admins.id,
      email: schema.admins.email,
      name: schema.admins.name,
      role: schema.admins.role,
      active: schema.admins.active,
      sessionsValidFrom: schema.admins.sessionsValidFrom,
      totpConfirmedAt: schema.admins.totpConfirmedAt,
    })
    .from(schema.admins)
    .where(eq(schema.admins.id, id))
    .limit(1);

  if (!row || !row.active) return null;

  /*
    Sesja starsza niż granica ważności = wylogowana.
    Brak `loginAt` w tokenie traktujemy jako sesję sprzed tej zmiany, czyli
    starszą od każdej granicy — inaczej „wyloguj wszędzie" ominęłoby dokładnie
    te sesje, które w chwili wdrożenia były otwarte.
  */
  if (row.sessionsValidFrom) {
    const wydany = session?.user?.loginAt ?? 0;
    if (wydany < row.sessionsValidFrom.getTime()) return null;
  }

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    twoFactor: Boolean(row.totpConfirmedAt),
  };
}

/**
 * Authoritative admin gate for server actions and route handlers. Layouts guard
 * page RENDERS, but server actions are independent POST endpoints — each one must
 * call this itself (defense in depth). Throws if not an authenticated admin.
 */
export async function requireAdmin(): Promise<CurrentAdmin> {
  const admin = await currentAdmin();
  if (!admin) {
    throw new Error("unauthorized");
  }
  return admin;
}

/**
 * Brama na JEDNĄ operację. To jest wywołanie, które powinno stać na początku
 * każdej akcji panelu — `requireAdmin()` mówi tylko „ktoś zalogowany", a od
 * 27.08.2026 zalogowany bywa PRACOWNIK, któremu nie wolno prawie nic z tego,
 * co wolno administratorowi.
 *
 * Rzuca `forbidden`, nie zwraca `false`: akcja, która zapomni sprawdzić wynik,
 * ma się wywalić, a nie po cichu wykonać.
 */
export async function requirePermission(
  permission: Permission,
): Promise<CurrentAdmin> {
  const admin = await requireAdmin();
  if (!can(admin.role, permission)) {
    throw new Error("forbidden");
  }
  return admin;
}

/**
 * Gate for account management. Only superadmins may create, edit or delete
 * other admins — a plain admin can still change their own password.
 *
 * Zostaje jako nazwa czytelna w miejscu wywołania, ale pyta już przez mapę
 * uprawnień, żeby istniało JEDNO źródło prawdy o tym, kto zarządza kontami.
 */
export async function requireSuperadmin(): Promise<CurrentAdmin> {
  return requirePermission("konta.zarzadzaj");
}

/**
 * Straż dla RENDERU STRONY — przekierowuje zamiast rzucać.
 *
 * `requirePermission` rzuca `forbidden` i to jest właściwe zachowanie w akcji
 * serwerowej: akcja, która zapomni sprawdzić wynik, ma się wywalić. Na stronie
 * ten sam wyjątek daje jednak **HTTP 500 i ekran „A server error occurred"** —
 * sprawdzone testem 27.08.2026, gdy PRACOWNIK wpisał z ręki adres cennika.
 * Dostęp był zablokowany poprawnie, ale wyglądało to jak awaria serwisu i tak
 * właśnie zostałoby zgłoszone.
 *
 * Tutaj więc: przekierowanie na stronę, która mówi wprost, co się stało.
 * Kontrola jest ta sama; różni się tylko to, co widzi człowiek.
 */
export async function guardPage(permission: Permission): Promise<CurrentAdmin> {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  if (!can(admin.role, permission)) redirect("/admin/brak-uprawnien");
  return admin;
}
