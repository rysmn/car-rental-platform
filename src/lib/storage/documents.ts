import "server-only";
import { randomUUID } from "node:crypto";
import { getStorage } from "./index";

/** Klucz obiektu w magazynie (lokalnie: `.storage/documents/…`, w S3: prefiks `documents/`). */
function kluczDokumentu(fileName: string): string {
  return `documents/${fileName}`;
}

/**
 * Umowy, regulaminy i pozostałe dokumenty — punkty 15 i 16.
 *
 * WŁASNY KATALOG I WŁASNY CZYTNIK, z tego samego powodu co faktury.
 * `/api/media` jest publiczne z założenia, bo serwuje zdjęcie hero i galerię
 * aut. Dokument bywa umową z nazwiskiem i warunkami handlowymi. Jeden katalog
 * i jeden czytnik dla obu znaczy, że jedno zgadnięte UUID wydaje cudzą umowę.
 *
 * `staging-media.sh` kopiuje do kopii testowej WYŁĄCZNIE pliki z pierwszego
 * poziomu i nigdy nie schodzi w podkatalogi — dokumenty leżą w podkatalogu,
 * więc ta reguła obejmuje je bez dopisywania czegokolwiek.
 *
 * ## Co wolno wgrać
 *
 * PDF i nic więcej. Nie z ostrożności, tylko dlatego, że dokument do podpisu
 * ma wyglądać u każdego tak samo — a to potrafi zagwarantować PDF, nie DOCX
 * ani zdjęcie. Typ sprawdzany po BAJTACH nagłówka, bo typ MIME z przeglądarki
 * jest deklaracją, nie dowodem.
 */


// Prefiks adresu mieszka w `lib/documents/adres.ts` — tamten plik nie ma
// `server-only`, więc zna go także przeglądarka. Tu byłby nieosiągalny dla
// komponentu klienckiego.
export { DOCUMENT_URL_PREFIX } from "@/lib/documents/adres";

const MAX_BYTES = 12 * 1024 * 1024;

/** `%PDF-` — pierwsze pięć bajtów każdego prawdziwego PDF-a. */
function jestPdf(b: Buffer): boolean {
  return (
    b.length > 5 &&
    b[0] === 0x25 &&
    b[1] === 0x50 &&
    b[2] === 0x44 &&
    b[3] === 0x46 &&
    b[4] === 0x2d
  );
}

export type WynikZapisu =
  | { ok: true; fileName: string; size: number }
  | {
      ok: false;
      error: "empty" | "too_large" | "not_pdf" | "write_failed";
    };

export async function saveDocument(file: File): Promise<WynikZapisu> {
  if (!file || file.size === 0) return { ok: false, error: "empty" };
  if (file.size > MAX_BYTES) return { ok: false, error: "too_large" };

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!jestPdf(buffer)) return { ok: false, error: "not_pdf" };

  // Nazwa generowana. Nazwa od klienta nigdy nie jest używana, więc nie ma jak
  // przemycić separatora ścieżki ani drugiego rozszerzenia.
  const fileName = `${randomUUID()}.pdf`;
  try {
    await getStorage().put({
      key: kluczDokumentu(fileName),
      body: buffer,
      contentType: "application/pdf",
      visibility: "private",
    });
  } catch {
    return { ok: false, error: "write_failed" };
  }
  return { ok: true, fileName, size: buffer.length };
}

/**
 * Odczyt pliku po nazwie z bazy.
 *
 * Nazwa jest sprawdzana wzorcem mimo że pochodzi z naszej kolumny: między
 * kolumną a dyskiem nie ma żadnej innej bramki, a `..` w nazwie wyprowadziłoby
 * odczyt poza katalog. Kosztuje jedno porównanie i zamyka pytanie na zawsze.
 */
export async function readDocument(fileName: string): Promise<Buffer | null> {
  if (!/^[0-9a-f-]{36}\.pdf$/i.test(fileName)) return null;
  try {
    return await getStorage().get(kluczDokumentu(fileName));
  } catch {
    return null;
  }
}

/**
 * Skasuj plik dokumentu z magazynu.
 *
 * Wołane WYŁĄCZNIE po usunięciu wiersza z bazy i tylko wtedy, gdy żadna inna
 * wersja tego pliku nie używa — patrz `usunDokument`. Odwrotna kolejność
 * zostawiałaby w bazie wiersz wskazujący na nieistniejący plik, czyli dokument,
 * który wygląda na dostępny i nie da się otworzyć.
 *
 * Nie rzuca: brak pliku na dysku przy kasowaniu jest stanem docelowym, a nie
 * awarią.
 */
export async function deleteDocumentFile(fileName: string): Promise<void> {
  if (!/^[0-9a-f-]{36}\.pdf$/i.test(fileName)) return;
  try {
    await getStorage().delete(kluczDokumentu(fileName));
  } catch {
    /* pliku już nie ma — to jest ten stan, o który chodziło */
  }
}
