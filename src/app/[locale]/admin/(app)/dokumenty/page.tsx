import { setRequestLocale } from "next-intl/server";
import { requirePermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import {
  ETYKIETY_KATEGORII,
  listaWersji,
  type Kategoria,
  type WersjaDokumentu,
} from "@/lib/documents/repo";
import { formatDatePl } from "@/lib/format";
import { DokumentForm } from "./DokumentForm";
import { WierszWersji } from "./WierszWersji";

export const dynamic = "force-dynamic";

export const metadata = { title: "Umowy i dokumenty" };

/**
 * „Umowy i dokumenty" — punkt 15 zamówienia.
 *
 * ## Dlaczego lista jest grupowana po dokumencie, a nie po dacie
 *
 * Operator nie pyta „co wgrano ostatnio". Pyta „która wersja regulaminu
 * obowiązuje" i „czy angielska nadąża za polską". Płaska lista wersji
 * posortowana po dacie odpowiada na trzecie pytanie, którego nikt nie zadaje,
 * i ukrywa dwa pierwsze między wierszami.
 *
 * Dlatego wiersz to DOKUMENT (slug + język), a wersje są pod nim — najnowsza
 * u góry, obowiązująca oznaczona. Historia jest widoczna od razu, bo „która
 * wersja obowiązywała we wrześniu" to pytanie, które pada w sporze, czyli
 * wtedy, gdy nikt nie ma czasu jej szukać.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const admin = await requirePermission("dokumenty.podglad");
  const mozeZarzadzac = can(admin.role, "dokumenty.zarzadzaj");

  const wszystkie = await listaWersji();

  // Grupowanie po (slug, język) — jeden nagłówek, pod nim wersje.
  const grupy = new Map<string, WersjaDokumentu[]>();
  for (const w of wszystkie) {
    const klucz = `${w.slug}|${w.locale}`;
    const lista = grupy.get(klucz) ?? [];
    lista.push(w);
    grupy.set(klucz, lista);
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-heading text-ink text-2xl font-bold">
          Umowy i dokumenty
        </h1>
        <p className="text-ink-muted max-w-2xl text-sm leading-relaxed">
          Każde wgranie tworzy NOWĄ WERSJĘ — poprzednia zostaje. Klient, któremu
          udostępniono starszą wersję, ma ją widzieć nadal, więc żadnej wersji
          nie da się skasować; wersję wycofuje się z obiegu albo zastępuje inną.
        </p>
      </header>

      {mozeZarzadzac && <DokumentForm />}

      {grupy.size === 0 ? (
        <p className="border-line text-ink-muted border border-dashed p-8 text-center text-sm">
          Nie ma jeszcze żadnego dokumentu. Pierwszy wgrany plik z kategorią
          „Przy rezerwacji” trafi do klienta po potwierdzeniu rezerwacji.
        </p>
      ) : (
        <div className="space-y-6">
          {[...grupy.entries()].map(([klucz, wersje]) => {
            const czolo = wersje[0];
            const obowiazujaca = wersje.find((w) => w.active) ?? null;
            return (
              <section
                key={klucz}
                className="border-line border"
                aria-label={`${czolo.title} (${czolo.locale.toUpperCase()})`}
              >
                <header className="border-line flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b p-4">
                  <div className="min-w-0">
                    <h2 className="font-heading text-ink truncate text-base font-bold">
                      {czolo.title}
                    </h2>
                    <p className="text-ink-faint text-xs">
                      {czolo.slug} · {czolo.locale.toUpperCase()} ·{" "}
                      {ETYKIETY_KATEGORII[czolo.category as Kategoria] ??
                        czolo.category}
                    </p>
                  </div>
                  <p className="text-xs">
                    {obowiazujaca ? (
                      <span className="text-ink">
                        Obowiązuje wersja {obowiazujaca.version}
                      </span>
                    ) : (
                      <span className="text-ink-muted">
                        Żadna wersja nie obowiązuje
                      </span>
                    )}
                  </p>
                </header>

                <ul className="divide-line divide-y">
                  {wersje.map((w) => (
                    <WierszWersji
                      key={w.id}
                      mozeZarzadzac={mozeZarzadzac}
                      dokument={{
                        id: w.id,
                        slug: w.slug,
                        locale: w.locale,
                        version: w.version,
                        title: w.title,
                        description: w.description,
                        category: w.category,
                        effectiveFrom: w.effectiveFrom,
                        active: w.active,
                        autoSend: w.autoSend,
                        bilingual: w.bilingual,
                        fileName: w.fileName,
                      }}
                      opis={[
                        `wgrana ${formatDatePl(w.createdAt.toISOString().slice(0, 10))}`,
                        w.effectiveFrom
                          ? `obowiązuje od ${formatDatePl(w.effectiveFrom)}`
                          : null,
                        w.fileSize > 0
                          ? `${Math.max(1, Math.round(w.fileSize / 1024))} kB`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
