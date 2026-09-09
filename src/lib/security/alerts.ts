import "server-only";
import { reportAlert } from "@/lib/alerts/record";
import { countRecent, ktoWSerii, type SecurityEventKind } from "./events";

/**
 * Alerty bezpieczeństwa — rozdział 13.6 punkt 10.
 *
 * ## Dlaczego to nie jest osobny mechanizm
 *
 * Projekt ma rejestr alertów: scala powtórzenia po odcisku, liczy wystąpienia,
 * odróżnia „widziałem" od „naprawione", pokazuje wszystko w panelu i wysyła
 * mail przy poziomie KRYTYCZNYM. Zbudowanie obok niego drugiego mechanizmu
 * powiadomień znaczyłoby dwa miejsca do sprawdzania i dwa do utrzymania.
 * Ten plik jest więc wyłącznie SŁOWNIKIEM zdarzeń bezpieczeństwa: mówi, co
 * jest warte obudzenia człowieka i na jakim poziomie.
 *
 * ## Granica między dziennikiem a alertem
 *
 * `security_events` zapisuje KAŻDE odrzucenie — tysiąc dziennie to normalny
 * dzień strony w internecie. Alert powstaje dopiero wtedy, gdy zdarzenie coś
 * ZNACZY: nowy administrator, zmiana roli, seria nieudanych logowań, kod
 * zapasowy użyty zamiast aplikacji. Rejestr alertów, w którym codziennie stoi
 * tysiąc wpisów, przestaje być czytany po tygodniu i wtedy przestaje działać
 * także wobec tego jednego wpisu, który był ważny.
 *
 * ## Progi zamiast pojedynczych zdarzeń
 *
 * Jedno nieudane logowanie to literówka. Dziesięć z jednego miejsca w kwadrans
 * to zgadywanie hasła. Dlatego zdarzenia progowe idą przez `alertGdyGesto`,
 * które pyta dziennik o gęstość, zamiast podnosić alarm przy pierwszym wpisie.
 */

type Rodzaj =
  | "new_device"
  | "recovery_used"
  | "password_changed"
  | "twofa_enabled"
  | "twofa_disabled"
  | "twofa_reset"
  | "admin_created"
  | "admin_deleted"
  | "role_changed"
  | "sessions_revoked"
  | "permission_denied"
  | "login_burst"
  | "scrape_burst";

/**
 * Poziom każdego zdarzenia.
 *
 * KRYTYCZNY wysyła mail do właściciela i jest zarezerwowany dla trzech rzeczy,
 * które ZMIENIAJĄ, KTO MA DOSTĘP: nowe konto administracyjne, zmiana roli
 * i wyłączenie albo zresetowanie 2FA. Jeżeli którakolwiek z nich zdarzy się
 * bez wiedzy właściciela, każda minuta ma znaczenie.
 *
 * Reszta to OSTRZEŻENIE: widoczne w panelu, bez maila. Zmiana hasła i nowe
 * urządzenie są zdarzeniami, które właściciel wywołuje sam kilka razy w roku;
 * mail za każdym razem nauczyłby go kasować te maile bez czytania.
 */
const POZIOM: Record<Rodzaj, "critical" | "warning"> = {
  admin_created: "critical",
  admin_deleted: "critical",
  role_changed: "critical",
  twofa_disabled: "critical",
  twofa_reset: "critical",
  recovery_used: "warning",
  new_device: "warning",
  password_changed: "warning",
  twofa_enabled: "warning",
  sessions_revoked: "warning",
  permission_denied: "warning",
  login_burst: "critical",
  scrape_burst: "warning",
};

export function alertBezpieczenstwa(wejscie: {
  kind: Rodzaj;
  tytul: string;
  szczegoly: string;
  adminId?: string | null;
  kontekst?: Record<string, unknown>;
}): void {
  reportAlert({
    module: "security",
    severity: POZIOM[wejscie.kind],
    /*
      Odcisk zawiera rodzaj i konto, ale NIE zawiera chwili ani adresu.
      Dzięki temu piąte logowanie z nowego urządzenia w ciągu tygodnia jest
      tym samym alertem z licznikiem „5", a nie piątą kartą do zamknięcia.
    */
    key: `security:${wejscie.kind}:${wejscie.adminId ?? "-"}`,
    title: wejscie.tytul,
    detail: wejscie.szczegoly,
    context: wejscie.kontekst,
  });
}

/**
 * Alert dopiero przy zagęszczeniu.
 *
 * @param prog ile zdarzeń w oknie znaczy „to już nie przypadek"
 */
export async function alertGdyGesto(opcje: {
  zdarzenie: SecurityEventKind;
  kind: Rodzaj;
  oknoMs: number;
  prog: number;
  subject?: string | null;
  tytul: string;
  szczegoly: string;
}): Promise<void> {
  const ile = await countRecent(opcje.zdarzenie, opcje.oknoMs, opcje.subject);
  if (ile < opcje.prog) return;
  /*
    KTO to był — dołączane do alertu, a nie zostawiane do wyszukania w bazie
    (07.09.2026). Zapytanie idzie dopiero po przekroczeniu progu, czyli
    kilka razy w miesiącu, więc nie kosztuje normalnego ruchu niczego.
    Powód i historia: `ktoWSerii` w `lib/security/events`.
  */
  const kto = await ktoWSerii(opcje.zdarzenie, opcje.oknoMs);
  const opis = kto
    ? `${opcje.szczegoly} Zdarzeń w oknie: ${ile}. Klient: ${kto.agenci}.` +
      (kto.sciezki.length
        ? ` Przykładowe ścieżki: ${kto.sciezki.join(", ")}.`
        : "")
    : `${opcje.szczegoly} Zdarzeń w oknie: ${ile}.`;
  alertBezpieczenstwa({
    kind: opcje.kind,
    tytul: opcje.tytul,
    szczegoly: opis,
    kontekst: {
      zdarzenie: opcje.zdarzenie,
      wOknie: ile,
      prog: opcje.prog,
      ...(kto ? { klient: kto.agenci, sciezki: kto.sciezki } : {}),
    },
  });
}

/** Progi używane w projekcie — w jednym miejscu, żeby dały się przeczytać razem. */
export const PROGI_ALERTOW = {
  /** Nieudane logowania z jednego miejsca. */
  logowanie: { oknoMs: 15 * 60_000, prog: 10 },
  /** Odrzucenia limitu publicznego — sygnał masowego kopiowania. */
  scraping: { oknoMs: 10 * 60_000, prog: 50 },
};
