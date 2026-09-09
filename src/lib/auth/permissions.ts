/**
 * Uprawnienia panelu — „czy wolno TĘ operację", a nie „czy to superadmin".
 *
 * ## Dlaczego to jest osobny plik, a nie trzecia wartość w enumie
 *
 * Do 27.08.2026 rozdział przebiegał w jednym miejscu: `admin.role !==
 * "superadmin"`. Dwie role, jedno pytanie, wszystko poza kontami dostępne dla
 * każdego zalogowanego. Dopisanie trzeciej roli do enumu nie zmieniłoby w tym
 * ani jednej rzeczy — PRACOWNIK zobaczyłby dokładnie to co ADMIN, bo nikt nigdy
 * nie pytał o nic poza superadminem. Rola bez mapy uprawnień jest etykietą.
 *
 * ## Zasada
 *
 * Jedna operacja = jedno uprawnienie. Kod woła `requirePermission("ceny.zmien")`
 * i nie musi wiedzieć, które role je mają; zmiana zakresu roli to zmiana W TYM
 * PLIKU i nigdzie indziej. Nazwy są po polsku, bo panel jest po polsku i bo
 * mieszanka `pricing.edit` z „Cennik" w interfejsie kosztowałaby tłumaczenie
 * przy każdym czytaniu.
 *
 * ## Ten plik nie ma importów serwerowych — celowo
 *
 * Interfejs ukrywa przyciski, do których i tak nie ma dostępu, więc mapa musi
 * dać się przeczytać w przeglądarce. To jest WYŁĄCZNIE uprzejmość: prawdziwa
 * kontrola stoi po stronie serwera, w `requirePermission` (`guard.ts`), i każdy
 * endpoint woła ją sam. Ukrycie przycisku nie jest zabezpieczeniem — tak samo
 * jak ukrycie `/admin` nie jest zabezpieczeniem.
 */

export const ADMIN_ROLES = ["operator", "admin", "superadmin"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** Nazwy ról w panelu. */
export const ROLE_LABEL: Record<AdminRole, string> = {
  operator: "Pracownik",
  admin: "Administrator",
  superadmin: "Właściciel",
};

/**
 * Pełna lista uprawnień. Kolejność jest tematyczna, nie hierarchiczna —
 * hierarchia mieszka w `ROLE_PERMISSIONS` niżej.
 */
export const PERMISSIONS = [
  // — obsługa bieżąca: to, po co pracownik siada do panelu
  "rezerwacje.podglad",
  "rezerwacje.status", // potwierdź / odrzuć / zakończ
  "rezerwacje.usun",
  "wydania.prowadz", // protokoły wydania i zwrotu, szkody, podpisy
  "skrzynka.podglad",
  "skrzynka.obsluz",
  "flota.podglad",
  "flota.status", // ręczna zmiana stanu egzemplarza
  "czat.podglad",

  // — zarządzanie treścią i pieniędzmi
  "flota.edytuj",
  "flota.usun",
  "ceny.zmien",
  "finanse.podglad",
  "finanse.edytuj",
  "kaucje.prowadz",
  "czat.ustawienia",
  "zasady.zmien",
  "analityka.podglad",
  /*
    Umowy i dokumenty (punkt 15). Osobne uprawnienie, nie doklejone do
    `zasady.zmien`: „Zasady wynajmu" to treść na stronie, a to są pliki, które
    klient dostaje przed podpisaniem. Kto może poprawić opis na stronie, nie
    musi mieć prawa podmienić umowy najmu.

    Podgląd ma PRACOWNIK — bez niego nie pokaże klientowi regulaminu przy
    wydaniu auta. Zmiana zostaje wyżej.
  */
  "dokumenty.podglad",
  "dokumenty.zarzadzaj",

  // — dane klientów
  "klienci.podglad",
  "klienci.eksport",

  // — sam panel
  "ustawienia.zmien",
  "alerty.podglad",
  "audyt.podglad",
  "bezpieczenstwo.podglad",
  "bezpieczenstwo.zmien",
  "konta.zarzadzaj",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Co wolno której roli.
 *
 * PRACOWNIK dostaje dokładnie tyle, ile trzeba, żeby przyjąć klienta i wydać
 * auto. Bez cen, bez kont, bez ustawień, bez bezpieczeństwa, bez eksportu
 * danych klientów. Podgląd karty klienta ma — bez niego nie wyda samochodu —
 * ale wyniesienie tej listy z systemu to już `klienci.eksport`, którego nie ma.
 *
 * ADMINISTRATOR prowadzi firmę w panelu: flota, ceny, finanse, treści,
 * ustawienia operacyjne. Nie dotyka kont administracyjnych ani ustawień
 * bezpieczeństwa — to są dwie rzeczy, którymi da się odebrać dostęp
 * właścicielowi, więc zostają u właściciela.
 *
 * WŁAŚCICIEL ma wszystko. Wprost przez `PERMISSIONS`, a nie przez „brak
 * sprawdzenia": dzięki temu dopisanie nowego uprawnienia nie daje mu go
 * milcząco — daje mu je ta linia, którą widać.
 */
const OPERATOR: Permission[] = [
  "rezerwacje.podglad",
  "rezerwacje.status",
  "wydania.prowadz",
  "skrzynka.podglad",
  "skrzynka.obsluz",
  "flota.podglad",
  "flota.status",
  "czat.podglad",
  "klienci.podglad",
  "kaucje.prowadz",
  // Pracownik pokazuje klientowi regulamin przy wydaniu auta — podgląd tak,
  // podmiana umowy nie.
  "dokumenty.podglad",
];

const ADMIN: Permission[] = [
  ...OPERATOR,
  "rezerwacje.usun",
  "flota.edytuj",
  "flota.usun",
  "ceny.zmien",
  "finanse.podglad",
  "finanse.edytuj",
  "czat.ustawienia",
  "zasady.zmien",
  "analityka.podglad",
  "klienci.eksport",
  "ustawienia.zmien",
  "alerty.podglad",
  "audyt.podglad",
  "dokumenty.zarzadzaj",
];

export const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  operator: OPERATOR,
  admin: ADMIN,
  superadmin: PERMISSIONS,
};

export function can(role: AdminRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Operacje, które wymagają POTWIERDZENIA TOŻSAMOŚCI tuż przed wykonaniem —
 * hasłem albo kodem 2FA, nie samym „na pewno?" w przeglądarce.
 *
 * Kryterium jest jedno: czy skutek da się cofnąć bez pomocy z zewnątrz.
 * Skasowana rezerwacja, usunięte auto, zmieniona rola, wyeksportowana lista
 * klientów i zmiana ustawień bezpieczeństwa — nie da się. Zmiana ceny na
 * przyszłość — da się, wystarczy wpisać poprzednią, a audyt pamięta jaką.
 * (Cennik jest tu mimo to, bo zamówienie wymienia go wprost.)
 */
export const CRITICAL_PERMISSIONS: readonly Permission[] = [
  "rezerwacje.usun",
  "flota.usun",
  "flota.status",
  "ceny.zmien",
  "klienci.eksport",
  "bezpieczenstwo.zmien",
  "konta.zarzadzaj",
];

export function isCritical(permission: Permission): boolean {
  return CRITICAL_PERMISSIONS.includes(permission);
}
