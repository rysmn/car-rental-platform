"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/auth/audit";
import { deleteDocumentFile, saveDocument } from "@/lib/storage/documents";
import { KATEGORIE } from "./repo";
import { nastepnaWersja } from "./repo";

/**
 * Cztery akcje katalogu dokumentów — punkt 15.
 *
 * Tylko cztery i lista jest zamknięta świadomie: każdy eksport z pliku
 * `"use server"` jest publicznym punktem końcowym, osiągalnym z przeglądarki
 * po samej nazwie. Odczyt siedzi w `repo.ts`, który tej dyrektywy nie ma.
 *
 * CZEGO TU NIE MA: kasowania. Zamówienie mówi „Nie niszcz historycznej wersji
 * zaakceptowanej/udostępnionej klientowi", a `reservation_documents` odwołuje
 * się do wersji przez `ON DELETE restrict`. Wersję wycofuje się przez
 * `ustawAktywna` na inną albo przez dezaktywację — nie przez usunięcie.
 */

const wejscie = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    // Slug jest tożsamością dokumentu ponad wersjami i wchodzi do klucza
    // unikalnego. Wąski wzorzec, żeby „Regulamin " i „regulamin" nie stały się
    // dwoma różnymi dokumentami.
    .regex(/^[a-z0-9-]+$/, "slug"),
  locale: z.enum(["pl", "en"]),
  category: z.enum(KATEGORIE),
  /*
    Deklaracja o TREŚCI pliku, nie preferencja. Zaznacza ją człowiek, który
    otworzył PDF i zobaczył w nim obie wersje językowe — dlatego przychodzi
    z pola wyboru, a nie z żadnej analizy pliku.
  */
  bilingual: z.coerce.boolean().optional().default(false),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).optional().default(""),
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  aktywuj: z.boolean().optional().default(false),
});

export type WynikDokumentu =
  { ok: true; id: string; version: number } | { ok: false; error: string };

/**
 * Dodaj dokument albo NOWĄ WERSJĘ istniejącego — to jest ta sama operacja.
 *
 * Rozróżnia je wyłącznie to, czy `slug` już istnieje: numer wersji liczy baza,
 * nie formularz. Dwa okna panelu otwarte naraz dałyby inaczej dwie „wersje 3",
 * a klucz unikalny odrzuciłby drugą komunikatem, którego nikt by nie zrozumiał.
 */
export async function dodajWersje(formData: FormData): Promise<WynikDokumentu> {
  const admin = await requirePermission("dokumenty.zarzadzaj");

  const parsed = wejscie.safeParse({
    slug: formData.get("slug") ?? "",
    locale: formData.get("locale") ?? "pl",
    category: formData.get("category") ?? "other",
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    effectiveFrom: formData.get("effectiveFrom") ?? "",
    aktywuj: formData.get("aktywuj") === "on",
    bilingual: formData.get("bilingual") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: "Sprawdź pola formularza." };
  }
  const d = parsed.data;

  const plik = formData.get("plik");
  if (!(plik instanceof File)) return { ok: false, error: "Brak pliku." };

  const zapis = await saveDocument(plik);
  if (!zapis.ok) {
    const komunikaty: Record<string, string> = {
      empty: "Plik jest pusty.",
      too_large: "Plik jest większy niż 12 MB.",
      not_pdf:
        "Przyjmujemy wyłącznie PDF — dokument ma wyglądać u każdego tak samo.",
      write_failed: "Nie udało się zapisać pliku.",
    };
    return {
      ok: false,
      error: komunikaty[zapis.error] ?? "Nie udało się wgrać pliku.",
    };
  }

  try {
    const db = getDb();
    const version = await nastepnaWersja(d.slug, d.locale);

    const id = await db.transaction(async (tx) => {
      const [utworzony] = await tx
        .insert(schema.documents)
        .values({
          slug: d.slug,
          locale: d.locale,
          version,
          category: d.category,
          title: d.title,
          description: d.description || null,
          fileName: zapis.fileName,
          fileSize: zapis.size,
          effectiveFrom: d.effectiveFrom || null,
          active: d.aktywuj,
          bilingual: d.bilingual,
          createdBy: admin.id,
        })
        .returning({ id: schema.documents.id });

      /*
        Aktywacja zdejmuje aktywność z POPRZEDNIEJ wersji — w tej samej
        transakcji. Baza i tak na to nie pozwoli (częściowy indeks unikalny
        w migracji 0047), ale odrzucenie zapisu przez indeks jest gorsze niż
        wykonanie tego, o co operator prosił: on prosi o „ta ma obowiązywać",
        a nie o „dopisz drugą obowiązującą".
      */
      if (d.aktywuj) {
        await tx
          .update(schema.documents)
          .set({ active: false })
          .where(
            and(
              eq(schema.documents.slug, d.slug),
              eq(schema.documents.locale, d.locale),
              ne(schema.documents.id, utworzony.id),
            ),
          );
      }
      return utworzony.id;
    });

    await recordAudit({
      adminId: admin.id,
      action: "document.version_added",
      entity: "document",
      entityId: id,
      after: { slug: d.slug, locale: d.locale, version, aktywna: d.aktywuj },
    });

    revalidatePath("/admin/dokumenty");
    return { ok: true, id, version };
  } catch (err) {
    console.error("dodajWersje:", err);
    return { ok: false, error: "Nie udało się zapisać dokumentu." };
  }
}

/** Ustaw tę wersję jako obowiązującą; poprzednia przestaje nią być. */
export async function ustawAktywna(id: string): Promise<WynikDokumentu> {
  const admin = await requirePermission("dokumenty.zarzadzaj");
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Zły identyfikator." };
  }
  try {
    const db = getDb();
    const [d] = await db
      .select({
        slug: schema.documents.slug,
        locale: schema.documents.locale,
        version: schema.documents.version,
      })
      .from(schema.documents)
      .where(eq(schema.documents.id, id))
      .limit(1);
    if (!d) return { ok: false, error: "Nie znaleziono dokumentu." };

    await db.transaction(async (tx) => {
      await tx
        .update(schema.documents)
        .set({ active: false })
        .where(
          and(
            eq(schema.documents.slug, d.slug),
            eq(schema.documents.locale, d.locale),
          ),
        );
      await tx
        .update(schema.documents)
        .set({ active: true })
        .where(eq(schema.documents.id, id));
    });

    await recordAudit({
      adminId: admin.id,
      action: "document.activated",
      entity: "document",
      entityId: id,
      after: { slug: d.slug, locale: d.locale, version: d.version },
    });
    revalidatePath("/admin/dokumenty");
    return { ok: true, id, version: d.version };
  } catch (err) {
    console.error("ustawAktywna:", err);
    return { ok: false, error: "Nie udało się zmienić wersji obowiązującej." };
  }
}

/**
 * Wycofaj z obiegu — dokument przestaje obowiązywać i nic go nie zastępuje.
 *
 * Nie kasuje ani wiersza, ani pliku: klienci, którym tę wersję udostępniono,
 * mają ją nadal widzieć. To jest różnica między „przestaje dotyczyć nowych
 * najmów" a „nigdy nie istniał", i tylko pierwsze wolno zrobić klikiem.
 */
export async function wycofaj(id: string): Promise<WynikDokumentu> {
  const admin = await requirePermission("dokumenty.zarzadzaj");
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Zły identyfikator." };
  }
  try {
    const db = getDb();
    const [d] = await db
      .select({ version: schema.documents.version })
      .from(schema.documents)
      .where(eq(schema.documents.id, id))
      .limit(1);
    if (!d) return { ok: false, error: "Nie znaleziono dokumentu." };

    await db
      .update(schema.documents)
      .set({ active: false })
      .where(eq(schema.documents.id, id));

    await recordAudit({
      adminId: admin.id,
      action: "document.withdrawn",
      entity: "document",
      entityId: id,
    });
    revalidatePath("/admin/dokumenty");
    return { ok: true, id, version: d.version };
  } catch (err) {
    console.error("wycofaj:", err);
    return { ok: false, error: "Nie udało się wycofać dokumentu." };
  }
}

/* ── AUTO-SEND, edycja, usuwanie, ręczna wysyłka ─────────────────────────── */

/**
 * Włącz albo wyłącz automatyczną wysyłkę TEGO dokumentu.
 *
 * Per dokument, nie globalnie: umowa najmu ma iść do klienta, a tabela opłat
 * wewnętrznych już nie. Jeden przełącznik na wszystko zmuszałby do wyboru
 * między „wyślij wszystko" a „nie wysyłaj nic".
 *
 * OFF nie usuwa i nie odpina dokumentu — znaczy wyłącznie „nie wysyłaj sam".
 * Obsługa nadal może wysłać go ręcznie, a klient nadal widzi go na swojej
 * stronie rezerwacji.
 */
export async function ustawAutoSend(
  id: string,
  wlaczony: boolean,
): Promise<WynikDokumentu> {
  const admin = await requirePermission("dokumenty.zarzadzaj");
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Zły identyfikator." };
  }
  try {
    const db = getDb();
    const [d] = await db
      .select({
        version: schema.documents.version,
        title: schema.documents.title,
      })
      .from(schema.documents)
      .where(eq(schema.documents.id, id))
      .limit(1);
    if (!d) return { ok: false, error: "Nie znaleziono dokumentu." };

    await db
      .update(schema.documents)
      .set({ autoSend: wlaczony })
      .where(eq(schema.documents.id, id));

    await recordAudit({
      adminId: admin.id,
      action: wlaczony ? "document.autosend_on" : "document.autosend_off",
      entity: "document",
      entityId: id,
      after: { title: d.title, autoSend: wlaczony },
    });
    revalidatePath("/admin/dokumenty");
    return { ok: true, id, version: d.version };
  } catch (err) {
    console.error("ustawAutoSend:", err);
    return { ok: false, error: "Nie udało się zmienić ustawienia." };
  }
}

/**
 * Zmień OPIS dokumentu — nazwę, kategorię, datę obowiązywania.
 *
 * Nie plik. Podmiana pliku to NOWA WERSJA (`dodajWersje`), i to jest cała
 * różnica: opis można poprawić, bo literówka w nazwie nie zmienia tego, co
 * klient dostał. Treść — nie, bo klient, który dostał wersję 1, dostał
 * konkretny tekst i żadna edycja nie ma prawa tego przepisać.
 */
const opisWejscie = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).optional().default(""),
  category: z.enum(KATEGORIE),
  bilingual: z.coerce.boolean().optional().default(false),
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
});

export async function zmienOpis(
  id: string,
  formData: FormData,
): Promise<WynikDokumentu> {
  const admin = await requirePermission("dokumenty.zarzadzaj");
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Zły identyfikator." };
  }
  const parsed = opisWejscie.safeParse({
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    category: formData.get("category") ?? "other",
    effectiveFrom: formData.get("effectiveFrom") ?? "",
    bilingual: formData.get("bilingual") === "on",
  });
  if (!parsed.success) return { ok: false, error: "Sprawdź pola formularza." };
  const d = parsed.data;

  try {
    const db = getDb();
    const [przed] = await db
      .select({
        version: schema.documents.version,
        title: schema.documents.title,
        category: schema.documents.category,
        bilingual: schema.documents.bilingual,
      })
      .from(schema.documents)
      .where(eq(schema.documents.id, id))
      .limit(1);
    if (!przed) return { ok: false, error: "Nie znaleziono dokumentu." };

    await db
      .update(schema.documents)
      .set({
        title: d.title,
        description: d.description || null,
        category: d.category,
        effectiveFrom: d.effectiveFrom || null,
        bilingual: d.bilingual,
      })
      .where(eq(schema.documents.id, id));

    await recordAudit({
      adminId: admin.id,
      action: "document.description_changed",
      entity: "document",
      entityId: id,
      before: {
        title: przed.title,
        category: przed.category,
        bilingual: przed.bilingual,
      },
      after: { title: d.title, category: d.category, bilingual: d.bilingual },
    });
    revalidatePath("/admin/dokumenty");
    return { ok: true, id, version: przed.version };
  } catch (err) {
    console.error("zmienOpis:", err);
    return { ok: false, error: "Nie udało się zapisać zmian." };
  }
}

/**
 * Usuń dokument — ale tylko taki, którego nikt nie dostał.
 *
 * ## Dlaczego to nie jest zwykłe DELETE
 *
 * Wersja udostępniona klientowi jest dowodem: „ten człowiek dostał TEN tekst
 * tego dnia". Skasowanie jej niszczy odpowiedź na jedyne pytanie, które ma
 * znaczenie w sporze. Baza tego pilnuje sama (`ON DELETE restrict`), ale
 * odbicie się od klucza obcego to komunikat, którego nikt nie zrozumie.
 *
 * Więc: sprawdzamy zależności PRZED i mówimy wprost, ile rezerwacji dostało ten
 * dokument. Wtedy zamiast usunięcia proponujemy wycofanie z obiegu — dokument
 * przestaje dotyczyć nowych najmów, a historia zostaje nietknięta.
 *
 * Plik z dysku kasowany jest dopiero PO usunięciu wiersza i tylko wtedy, gdy
 * żadna inna wersja go nie używa. Odwrotna kolejność zostawiałaby w bazie
 * wiersz wskazujący na nieistniejący plik.
 */
export async function usunDokument(id: string): Promise<WynikDokumentu> {
  const admin = await requirePermission("dokumenty.zarzadzaj");
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Zły identyfikator." };
  }
  try {
    const db = getDb();
    const [d] = await db
      .select({
        version: schema.documents.version,
        title: schema.documents.title,
        fileName: schema.documents.fileName,
      })
      .from(schema.documents)
      .where(eq(schema.documents.id, id))
      .limit(1);
    if (!d) return { ok: false, error: "Nie znaleziono dokumentu." };

    const [zaleznosci] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.reservationDocuments)
      .where(eq(schema.reservationDocuments.documentId, id));
    const ile = zaleznosci?.n ?? 0;
    if (ile > 0) {
      return {
        ok: false,
        error:
          `Tego dokumentu nie da się usunąć: dostało go ${ile} ${ile === 1 ? "rezerwacja" : "rezerwacji"}. ` +
          "Usunięcie skasowałoby dowód na to, co klient otrzymał. " +
          "Użyj „Wycofaj z obiegu” — dokument przestanie dotyczyć nowych najmów, a historia zostanie.",
      };
    }

    await db.delete(schema.documents).where(eq(schema.documents.id, id));

    // Plik kasowany dopiero teraz i tylko wtedy, gdy nie używa go inna wersja.
    const [inni] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.documents)
      .where(eq(schema.documents.fileName, d.fileName));
    if ((inni?.n ?? 0) === 0) await deleteDocumentFile(d.fileName);

    await recordAudit({
      adminId: admin.id,
      action: "document.deleted",
      entity: "document",
      entityId: id,
      before: { title: d.title, version: d.version },
    });
    revalidatePath("/admin/dokumenty");
    return { ok: true, id, version: d.version };
  } catch (err) {
    console.error("usunDokument:", err);
    return { ok: false, error: "Nie udało się usunąć dokumentu." };
  }
}

/**
 * Wyślij klientowi dokumenty tej rezerwacji — ręcznie, z panelu.
 *
 * Potrzebne w trzech sytuacjach, które zdarzają się naprawdę: automat był
 * wyłączony, wcześniejsza wysyłka się nie powiodła, albo klient prosi
 * o ponowne przesłanie.
 *
 * `ponow` przełamuje ochronę przed podwójną wysyłką — świadomie i tylko tutaj,
 * bo to jest decyzja człowieka, a nie skutek odświeżonej strony.
 */
export async function wyslijDokumentyRecznie(
  reservationId: string,
  ponow = false,
): Promise<{ ok: boolean; komunikat: string }> {
  const admin = await requirePermission("dokumenty.zarzadzaj");
  if (!z.string().uuid().safeParse(reservationId).success) {
    return { ok: false, komunikat: "Zły identyfikator rezerwacji." };
  }
  try {
    const { wyslijDokumentyRezerwacji } = await import("./wysylka");
    // `tylkoAutoSend: false` — obsługa wysyła to, co przypięte, także dokument
    // z wyłączonym automatem. To jest cały sens ręcznej wysyłki.
    const wynik = await wyslijDokumentyRezerwacji(reservationId, {
      tylkoAutoSend: false,
      ponow,
    });

    await recordAudit({
      adminId: admin.id,
      action: "document.sent_manually",
      entity: "reservation",
      entityId: reservationId,
      after: { wyslane: wynik.wyslane, bledy: wynik.bledy.length },
    });
    revalidatePath(`/admin/reservations/${reservationId}`);

    if (wynik.wyslane > 0) {
      return {
        ok: true,
        komunikat: `Wysłano ${wynik.wyslane} ${wynik.wyslane === 1 ? "dokument" : "dokumentów"}.`,
      };
    }
    if (wynik.bledy.length > 0) {
      return { ok: false, komunikat: `Nie wysłano: ${wynik.bledy[0].powod}` };
    }
    return {
      ok: false,
      komunikat:
        "Nie było czego wysłać — wszystkie dokumenty tej rezerwacji już wyszły. Użyj „wyślij ponownie”, jeśli klient prosi o kopię.",
    };
  } catch (err) {
    console.error("wyslijDokumentyRecznie:", err);
    return { ok: false, komunikat: "Nie udało się wysłać." };
  }
}
