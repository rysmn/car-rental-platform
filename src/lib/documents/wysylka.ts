import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { readDocument } from "@/lib/storage/documents";
import { wyslijDokumenty } from "@/lib/email/notify";
import { reportAlert } from "@/lib/alerts/record";

/**
 * Dostarczenie dokumentów klientowi — jako ZAŁĄCZNIKI, nie odnośnik.
 *
 * ## Co było nie tak
 *
 * Dokumenty były przypinane do rezerwacji poprawnie (`reservation_documents`),
 * a w mailu potwierdzającym szedł ODNOŚNIK do strony „moje rezerwacje". Ta
 * strona rozpoznaje klienta po numerze i kluczu zapisanym w `localStorage`
 * TEJ SAMEJ przeglądarki — więc klient, który rezerwował na komputerze
 * i otworzył maila na telefonie, trafiał na pustą stronę. Dokument istniał,
 * był przypisany i pozostawał nieosiągalny.
 *
 * Załącznik nie ma tego problemu: jest w skrzynce, na każdym urządzeniu,
 * także za rok.
 *
 * ## Co decyduje o wysłaniu
 *
 * Trzy warunki naraz, wszystkie po stronie danych, żaden w kodzie wołającego:
 *   1. dokument jest przypięty do TEJ rezerwacji,
 *   2. ma `auto_send = true` (decyzja właściciela, per dokument),
 *   3. nie został jeszcze wysłany (`sent_at IS NULL`).
 *
 * Trzeci warunek jest jednocześnie ochroną przed podwójną wysyłką. Nie ma tu
 * osobnego mechanizmu idempotencji, bo nie jest potrzebny: pytanie „czy już
 * wysłano" i zapis „wysłano" dotyczą tego samego wiersza.
 *
 * ## Czego ta funkcja nigdy nie robi
 *
 * Nie rzuca. Rezerwacja jest już zapisana, kiedy to biegnie, więc awaria
 * poczty nie ma prawa jej cofnąć ani oznaczyć jako nieudanej. Niepowodzenie
 * ląduje w `send_error` przy konkretnym dokumencie i w rejestrze awarii —
 * czyli tam, gdzie obsługa je zobaczy i będzie mogła wysłać ręcznie.
 */

export type WynikWysylki = {
  /** Ile dokumentów faktycznie wyszło. */
  wyslane: number;
  /** Ile odpadło — z powodem, dla obsługi. */
  bledy: { title: string; powod: string }[];
  /** Ile pominięto, bo już wcześniej wyszły. */
  pominiete: number;
};

type DoWyslania = {
  id: string;
  documentId: string;
  title: string;
  fileName: string;
  mime: string;
};

/**
 * Wyślij klientowi dokumenty tej rezerwacji.
 *
 * `tylkoAutoSend = false` służy ręcznej wysyłce z panelu: obsługa świadomie
 * wysyła to, co jest przypięte, także dokument z wyłączonym automatem.
 */
export async function wyslijDokumentyRezerwacji(
  reservationId: string,
  opcje: { tylkoAutoSend?: boolean; ponow?: boolean } = {},
): Promise<WynikWysylki> {
  const tylkoAutoSend = opcje.tylkoAutoSend ?? true;
  const ponow = opcje.ponow ?? false;
  const db = getDb();

  const warunki = [
    eq(schema.reservationDocuments.reservationId, reservationId),
  ];
  if (tylkoAutoSend) warunki.push(eq(schema.documents.autoSend, true));
  // Bez `ponow` bierzemy wyłącznie te, które jeszcze nie wyszły — to jest cała
  // ochrona przed podwójną wysyłką.
  if (!ponow) warunki.push(isNull(schema.reservationDocuments.sentAt));

  const kandydaci: DoWyslania[] = await db
    .select({
      id: schema.reservationDocuments.id,
      documentId: schema.documents.id,
      title: schema.documents.title,
      fileName: schema.documents.fileName,
      mime: schema.documents.mime,
    })
    .from(schema.reservationDocuments)
    .innerJoin(
      schema.documents,
      eq(schema.documents.id, schema.reservationDocuments.documentId),
    )
    .where(and(...warunki));

  if (kandydaci.length === 0) {
    return { wyslane: 0, bledy: [], pominiete: 0 };
  }

  // Dane klienta i rezerwacji — jednym zapytaniem, bo list jest jeden.
  const [r] = await db
    .select({
      reference: schema.reservations.reference,
      customerName: schema.reservations.customerName,
      customerEmail: schema.reservations.customerEmail,
      locale: schema.reservations.locale,
      startDate: schema.reservations.startDate,
      endDate: schema.reservations.endDate,
      brand: schema.carModels.brand,
      model: schema.carModels.model,
    })
    .from(schema.reservations)
    .leftJoin(
      schema.carModels,
      eq(schema.carModels.id, schema.reservations.carModelId),
    )
    .where(eq(schema.reservations.id, reservationId))
    .limit(1);
  if (!r) return { wyslane: 0, bledy: [], pominiete: 0 };

  /*
    Pliki czytane z dysku PRZED wysyłką, żeby brakujący plik nie zabrał
    ze sobą pozostałych. Dokument bez pliku jest błędem tego dokumentu,
    a nie całej wiadomości.
  */
  const zalaczniki: { filename: string; content: Buffer }[] = [];
  const bledy: { title: string; powod: string }[] = [];
  const wyslaneWiersze: string[] = [];

  for (const k of kandydaci) {
    const plik = await readDocument(k.fileName);
    if (!plik) {
      bledy.push({ title: k.title, powod: "brak pliku w magazynie" });
      await oznaczBlad(k.id, "brak pliku w magazynie");
      continue;
    }
    zalaczniki.push({ filename: nazwaPliku(k.title), content: plik });
    wyslaneWiersze.push(k.id);
  }

  if (zalaczniki.length === 0) {
    return { wyslane: 0, bledy, pominiete: 0 };
  }

  const wynik = await wyslijDokumenty({
    reference: r.reference,
    carName: `${r.brand ?? ""} ${r.model ?? ""}`.trim() || "—",
    startDate: r.startDate,
    endDate: r.endDate,
    customerName: r.customerName,
    customerEmail: r.customerEmail,
    locale: r.locale === "en" ? "en" : "pl",
    zalaczniki,
  });

  if (wynik.ok) {
    await db
      .update(schema.reservationDocuments)
      .set({
        sentAt: new Date(),
        sendError: null,
        sendAttempts: sql`${schema.reservationDocuments.sendAttempts} + 1`,
      })
      .where(
        sql`${schema.reservationDocuments.id} IN (${sql.join(
          wyslaneWiersze.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
      );
    return { wyslane: zalaczniki.length, bledy, pominiete: 0 };
  }

  for (const id of wyslaneWiersze) await oznaczBlad(id, wynik.powod);
  bledy.push(...kandydaci.map((k) => ({ title: k.title, powod: wynik.powod })));

  /*
    Alert dla obsługi — ERROR, bo klient NIE dostał tego, co miał dostać,
    a sam się o tym nie dowie. Rezerwacja zostaje nietknięta.
  */
  reportAlert({
    module: "booking",
    severity: "error",
    key: "dokumenty:wysylka-nieudana",
    title: "Dokumenty nie dotarły do klienta",
    detail:
      `Rezerwacja ${r.reference}: nie udało się wysłać ${zalaczniki.length} dokumentów. ` +
      "Rezerwacja jest zapisana i nietknięta — brakuje wyłącznie wiadomości. " +
      "Można wysłać ręcznie z karty rezerwacji.",
    context: { rezerwacja: r.reference, powod: wynik.powod },
  });

  return { wyslane: 0, bledy, pominiete: 0 };
}

/** Zapis niepowodzenia przy konkretnym dokumencie. Nigdy nie rzuca. */
async function oznaczBlad(wierszId: string, powod: string): Promise<void> {
  try {
    await getDb()
      .update(schema.reservationDocuments)
      .set({
        sendError: powod.slice(0, 500),
        sendAttempts: sql`${schema.reservationDocuments.sendAttempts} + 1`,
      })
      .where(eq(schema.reservationDocuments.id, wierszId));
  } catch (err) {
    console.error("oznaczBlad:", err);
  }
}

/**
 * Nazwa pliku widziana przez klienta w skrzynce.
 *
 * Z tytułu dokumentu, nie z UUID w magazynie: „umowa-najmu.pdf" da się
 * odszukać za rok, „a3f1…-…-….pdf" nie. Ucinane do znaków, które przetrwają
 * każdy klient pocztowy i każdy system plików.
 */
function nazwaPliku(title: string): string {
  const bezOgonkow = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L");
  const czysty = bezOgonkow
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .toLowerCase();
  return `${czysty || "dokument"}.pdf`;
}
