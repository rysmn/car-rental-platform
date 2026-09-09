import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDb, schema } from "@/lib/db";
import { recordSecurityEvent } from "@/lib/security/events";

/**
 * Limity NA ROZMOWĘ i rozpoznawanie automatu — rozdział 13.2.
 *
 * ## Czego brakowało
 *
 * Limit po adresie sieciowym istniał i działa dalej (12/min, 120/h w
 * `api/chat`). Limit „na sesję" istniał tylko z nazwy: licznik `slots.turns`
 * przychodził OD PRZEGLĄDARKI razem z resztą stanu, więc wystarczyło wysłać
 * `turns: 0` przy każdej wiadomości, żeby przestał istnieć. To jest dokładnie
 * ten wzorzec, przed którym ostrzega samo zamówienie — „nie polegać na
 * JavaScripcie w przeglądarce" — i dlatego liczy teraz serwer, po
 * `conversationId`, który i tak leży w bazie.
 *
 * ## Trzy różne rzeczy, trzy różne progi
 *
 * 1. **Długość rozmowy.** Sześćdziesiąt wiadomości. Najdłuższa prawdziwa
 *    rozmowa w tym systemie miała ich kilkanaście; sześćdziesiąt to granica,
 *    za którą po drugiej stronie nie ma już klienta pytającego o auto.
 * 2. **Tempo.** Sześć wiadomości w dziesięć sekund. Człowiek poprawiający się
 *    trzy razy pod rząd mieści się w tym z zapasem — a zamówienie wymaga
 *    wprost, żeby go nie blokować.
 * 3. **Powtarzalność.** Ta sama treść czwarty raz w jednej rozmowie. Trzy
 *    powtórzenia zdarzają się ludziom (odświeżenie, „nie zrozumiałeś mnie");
 *    czwarte to pętla.
 *
 * ## Pamięć procesu plus baza
 *
 * Liczniki żyją w pamięci — tak jak wszystkie pozostałe w tym projekcie, żeby
 * restart nigdy nie zostawił nikogo zablokowanego na stałe. Po restarcie
 * długość rozmowy odtwarzamy JEDNYM zapytaniem do bazy, bo akurat ta liczba
 * tam jest; tempo i powtórzenia zaczynają się wtedy od zera i to jest w pełni
 * akceptowalne — obie te miary opisują ostatnie kilkanaście sekund, a nie
 * historię.
 */

const MAX_NA_ROZMOWE = 60;
const OKNO_TEMPA_MS = 10_000;
const MAX_W_OKNIE = 6;
const MAX_POWTORZEN = 3;

type Stan = {
  ile: number;
  czasy: number[];
  /** Skróty treści → ile razy. Skróty, żeby nie trzymać w pamięci rozmów. */
  powtorzenia: Map<string, number>;
  ostatnieDotkniecie: number;
};

const stany = new Map<string, Stan>();

/** Rozmowy nietknięte od godziny znikają z pamięci przy najbliższej okazji. */
const ZYWOTNOSC_MS = 60 * 60_000;

function posprzataj(teraz: number) {
  if (stany.size < 5_000) return;
  for (const [id, s] of stany) {
    if (teraz - s.ostatnieDotkniecie > ZYWOTNOSC_MS) stany.delete(id);
  }
  if (stany.size > 20_000) stany.clear();
}

const skrotTresci = (tekst: string) =>
  createHash("sha256")
    .update(tekst.trim().toLowerCase().replace(/\s+/g, " "))
    .digest("hex")
    .slice(0, 16);

export type WynikSesji =
  | { ok: true }
  | { ok: false; powod: "limit_sesji" | "tempo" | "powtorzenia" };

/**
 * Sprawdź i policz jedną wiadomość w rozmowie.
 *
 * @param conversationId rozmowa z bazy — `null` przy pierwszej wiadomości,
 *                       kiedy rozmowy jeszcze nie ma i nie ma czego liczyć
 * @param tresc          treść wiadomości; do pamięci trafia wyłącznie jej skrót
 */
export async function sprawdzSesjeCzatu(
  conversationId: string | null,
  tresc: string,
): Promise<WynikSesji> {
  if (!conversationId) return { ok: true };

  const teraz = Date.now();
  let stan = stany.get(conversationId);

  if (!stan) {
    /*
      Pierwsza wiadomość tej rozmowy W TYM PROCESIE. Może być naprawdę
      pierwsza, a może to być rozmowa sprzed restartu — długość odtwarzamy
      z bazy, bo inaczej restart kontenera zerowałby limit i wystarczyłoby
      poczekać na wdrożenie, żeby zacząć od nowa.
    */
    stan = {
      ile: await policzWBazie(conversationId),
      czasy: [],
      powtorzenia: new Map(),
      ostatnieDotkniecie: teraz,
    };
    stany.set(conversationId, stan);
  }

  stan.ostatnieDotkniecie = teraz;
  stan.ile += 1;
  stan.czasy = stan.czasy.filter((t) => teraz - t < OKNO_TEMPA_MS);
  stan.czasy.push(teraz);

  const skrot = skrotTresci(tresc);
  const ile = (stan.powtorzenia.get(skrot) ?? 0) + 1;
  stan.powtorzenia.set(skrot, ile);
  // Rozmowa o stu różnych zdaniach nie ma prawa urosnąć w pamięci ponad to.
  if (stan.powtorzenia.size > 100) stan.powtorzenia.clear();

  posprzataj(teraz);

  const zglos = (powod: "limit_sesji" | "tempo" | "powtorzenia") => {
    void recordSecurityEvent({
      kind:
        powod === "limit_sesji"
          ? "chat_session_limit"
          : powod === "tempo"
            ? "chat_flood"
            : "chat_repeat",
      endpoint: "/api/chat",
      subject: conversationId,
      detail: { wiadomosci: stan.ile },
    });
    return { ok: false as const, powod };
  };

  if (stan.ile > MAX_NA_ROZMOWE) return zglos("limit_sesji");
  if (stan.czasy.length > MAX_W_OKNIE) return zglos("tempo");
  if (ile > MAX_POWTORZEN) return zglos("powtorzenia");

  return { ok: true };
}

async function policzWBazie(conversationId: string): Promise<number> {
  try {
    const [row] = await getDb()
      .select({ ile: sql<number>`count(*)::int` })
      .from(schema.chatMessages)
      .where(
        and(
          eq(schema.chatMessages.conversationId, conversationId),
          eq(schema.chatMessages.role, "user"),
        ),
      );
    return row?.ile ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Co powiedzieć klientowi.
 *
 * Nigdy błędu technicznego i nigdy słowa „bot" — po drugiej stronie bywa
 * człowiek, który po prostu pisze szybko, i on ma dostać zdanie, po którym
 * wie, co zrobić. Zamówienie mówi o tym wprost.
 */
export function komunikatSesji(
  powod: "limit_sesji" | "tempo" | "powtorzenia",
  locale: "pl" | "en",
): string {
  const pl = {
    limit_sesji:
      "Ta rozmowa zrobiła się bardzo długa. Zacznij nową albo zadzwoń do nas — szybciej dojdziemy do konkretów.",
    tempo:
      "Chwileczkę — nie nadążam. Napisz jeszcze raz za moment, wszystko przeczytam.",
    powtorzenia:
      "Widzę tę samą wiadomość kolejny raz. Jeśli nie odpowiadam na to, o co pytasz, zostaw numer telefonu — oddzwonimy.",
  };
  const en = {
    limit_sesji:
      "This conversation has grown very long. Start a new one or give us a call — it will be quicker.",
    tempo: "One moment — I can't keep up. Send it again shortly and I'll read it.",
    powtorzenia:
      "I'm seeing the same message again. If I'm not answering what you asked, leave a phone number and we'll call you back.",
  };
  return (locale === "en" ? en : pl)[powod];
}
