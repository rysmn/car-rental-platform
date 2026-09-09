import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { currentAdmin } from "@/lib/auth/guard";
import { readDocument } from "@/lib/storage/documents";
import { znajdz } from "@/lib/booking/manage-core";

/**
 * Jedyny czytnik plików dokumentów — punkty 15 i 16.
 *
 * DWIE DROGI DOSTĘPU, JEDNA BRAMKA
 *
 * Dokument wydajemy dwóm rodzajom odbiorców i każdy ma inny dowód, że mu wolno:
 *
 *   · PANEL — zalogowana sesja administracyjna. Widzi wszystko, bo to jego
 *     katalog.
 *   · KLIENT — numer rezerwacji plus KLUCZ ZARZĄDZANIA, ten sam, którym
 *     otwiera „Zarządzaj rezerwacją". Widzi wyłącznie dokumenty przypięte
 *     do JEGO rezerwacji, i tylko te wersje, które faktycznie mu udostępniono.
 *
 * Nie ma trzeciej drogi. W szczególności sam identyfikator dokumentu nie
 * wystarcza: umowa najmu to nie jest plik, który ma leżeć pod zgadywalnym
 * adresem, a UUID w adresie to za mało, żeby uznać, że ktoś ma do niego prawo.
 *
 * Odpowiedź jest zawsze `404` — nigdy `403`. Rozróżnienie „nie ma takiego
 * pliku" od „jest, ale nie dla ciebie" mówi pytającemu, czego zgadł prawie.
 */

export const dynamic = "force-dynamic";

function nieMa() {
  return new NextResponse("Not found", { status: 404 });
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ nazwa: string }> },
) {
  const { nazwa } = await ctx.params;
  const url = new URL(request.url);

  const db = getDb();
  const [dok] = await db
    .select({
      id: schema.documents.id,
      title: schema.documents.title,
      fileName: schema.documents.fileName,
      mime: schema.documents.mime,
    })
    .from(schema.documents)
    .where(eq(schema.documents.fileName, nazwa))
    .limit(1);
  if (!dok) return nieMa();

  const admin = await currentAdmin();
  let wolno = Boolean(admin);

  if (!wolno) {
    /*
      Droga klienta. Numer i klucz idą w zapytaniu, bo ten adres trafia do
      wiadomości e-mail i musi dać się otworzyć jednym kliknięciem — dokładnie
      jak „Zarządzaj rezerwacją", z którego bierzemy tę samą funkcję `znajdz`.
      Dzięki temu reguły dostępu do rezerwacji są w systemie JEDNE.
    */
    const reference = url.searchParams.get("r");
    const token = url.searchParams.get("k");
    const znaleziona = await znajdz(reference, token);
    if (znaleziona) {
      // Klucz otwiera JEGO rezerwację — ale nie każdy dokument w systemie.
      // Wolno tylko to, co tej rezerwacji faktycznie udostępniono.
      const [przypiety] = await db
        .select({ id: schema.reservationDocuments.id })
        .from(schema.reservationDocuments)
        .where(
          and(
            eq(schema.reservationDocuments.reservationId, znaleziona.wiersz.id),
            eq(schema.reservationDocuments.documentId, dok.id),
          ),
        )
        .limit(1);
      wolno = Boolean(przypiety);
    }
  }

  if (!wolno) return nieMa();

  const plik = await readDocument(dok.fileName);
  if (!plik) return nieMa();

  return new NextResponse(new Uint8Array(plik), {
    headers: {
      "Content-Type": dok.mime || "application/pdf",
      // `inline`: dokument ma się otworzyć do CZYTANIA, bo o to prosi
      // zamówienie („do zapoznania się przed podpisaniem"). Pobranie zostaje
      // decyzją czytającego, nie skutkiem kliknięcia.
      "Content-Disposition": `inline; filename="${dok.fileName}"`,
      // Prywatny i bez pośredników: to bywa umowa z warunkami handlowymi.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
