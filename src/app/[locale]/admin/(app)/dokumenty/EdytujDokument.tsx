"use client";

import { useRef, useState, useTransition } from "react";
import { dodajWersje, zmienOpis } from "@/lib/documents/actions";
import { ETYKIETY_KATEGORII, KATEGORIE } from "@/lib/documents/kategorie";

/**
 * EDYTUJ — jeden formularz, dwie różne operacje, i to rozróżnienie jest sednem.
 *
 * ## Opis wolno poprawić. Treści — nie
 *
 * Nazwa, kategoria, opis i data obowiązywania opisują dokument z zewnątrz.
 * Literówka w nazwie nie zmienia tego, co klient dostał, więc poprawia się ją
 * w miejscu.
 *
 * Plik PDF to co innego: klient, który dostał wersję 1, dostał KONKRETNY tekst.
 * Wgranie nowego pliku tworzy więc NOWĄ WERSJĘ — stara zostaje w historii,
 * nietknięta, razem z dowodem, kto ją otrzymał. Nadpisanie pliku pod tym samym
 * wierszem sprawiłoby, że historyczna rezerwacja wyglądałaby, jakby klient
 * dostał dzisiejszą treść.
 *
 * Formularz mówi to wprost, zamiast liczyć na to, że administrator się domyśli.
 *
 * ## Język
 *
 * Nie da się zmienić. Dokument PL i dokument EN to dwie różne pozycje
 * w katalogu, każda z własną numeracją wersji i własnym kluczem
 * `(slug, locale, version)`. Przełączenie języka w miejscu rozerwałoby tę
 * numerację i mogło zderzyć się z istniejącą wersją w drugim języku. Nowy
 * język to nowy dokument — wgrany tak samo jak pierwszy.
 */
export function EdytujDokument({
  dokument,
  onZamknij,
}: {
  dokument: {
    id: string;
    slug: string;
    locale: string;
    version: number;
    title: string;
    description: string | null;
    category: string;
    effectiveFrom: string | null;
    autoSend: boolean;
    bilingual: boolean;
  };
  onZamknij: () => void;
}) {
  const [czeka, start] = useTransition();
  const [wynik, setWynik] = useState<{ ok: boolean; tekst: string } | null>(
    null,
  );
  const formOpis = useRef<HTMLFormElement>(null);
  const formPlik = useRef<HTMLFormElement>(null);

  const POLE = "border-line bg-void text-ink h-11 w-full border px-3 text-sm";

  return (
    <div className="border-line bg-void/60 mt-3 border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-heading text-ink text-sm font-bold">
          Edycja: {dokument.title}
        </h3>
        <p className="text-ink-faint text-xs">
          {dokument.slug} · {dokument.locale.toUpperCase()} · wersja{" "}
          {dokument.version}
        </p>
      </div>

      {wynik && (
        <p
          role="status"
          className={`mt-3 text-sm ${wynik.ok ? "text-ink" : "text-ink-muted"}`}
        >
          {wynik.tekst}
        </p>
      )}

      {/* ── OPIS — poprawiany w miejscu ─────────────────────────────────── */}
      <form
        ref={formOpis}
        action={(fd) => {
          setWynik(null);
          start(async () => {
            const r = await zmienOpis(dokument.id, fd);
            setWynik(
              r.ok
                ? { ok: true, tekst: "Zapisano zmiany opisu." }
                : { ok: false, tekst: r.error },
            );
          });
        }}
        className="mt-4 space-y-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="label-tight text-ink-faint text-[10px]">
              Nazwa widoczna
            </span>
            <input
              name="title"
              required
              defaultValue={dokument.title}
              className={POLE}
            />
          </label>
          <label className="block space-y-1">
            <span className="label-tight text-ink-faint text-[10px]">
              Kategoria
            </span>
            <select
              name="category"
              defaultValue={dokument.category}
              className={POLE}
            >
              {KATEGORIE.map((k) => (
                <option key={k} value={k}>
                  {ETYKIETY_KATEGORII[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="label-tight text-ink-faint text-[10px]">
              Obowiązuje od (opcjonalnie)
            </span>
            <input
              type="date"
              name="effectiveFrom"
              defaultValue={dokument.effectiveFrom ?? ""}
              className={POLE}
            />
          </label>
          <label className="block space-y-1">
            <span className="label-tight text-ink-faint text-[10px]">
              Język
            </span>
            <input
              value={dokument.locale === "en" ? "angielski" : "polski"}
              readOnly
              disabled
              className={`${POLE} opacity-60`}
            />
          </label>
        </div>
        <label className="border-line bg-paper flex items-start gap-3 rounded-lg border p-3">
          <input
            type="checkbox"
            name="bilingual"
            defaultChecked={dokument.bilingual}
            className="mt-0.5 h-5 w-5 shrink-0"
          />
          <span className="space-y-1">
            <span className="text-ink block text-sm font-medium">
              Plik zawiera obie wersje językowe PL i EN
            </span>
            <span className="text-ink-faint block text-xs">
              Zaznacz tylko wtedy, gdy w samym PDF-ie jest polski i angielski
              tekst. Taki dokument trafia do klienta w obu językach. Bez tego
              angielski klient go nie dostanie — i tak ma być: dokument prawny
              w języku, którego klient nie zna, jest gorszy niż jego brak.
            </span>
          </span>
        </label>
        <p className="text-ink-faint -mt-1 text-xs">
          Języka nie da się zmienić w miejscu: dokument PL i EN to dwie osobne
          pozycje, każda z własną numeracją wersji. Osobną wersję w drugim
          języku wgraj jako nowy dokument — chyba że plik jest dwujęzyczny,
          wtedy wystarczy zaznaczenie powyżej.
        </p>

        <label className="block space-y-1">
          <span className="label-tight text-ink-faint text-[10px]">
            Opis (opcjonalnie)
          </span>
          <textarea
            name="description"
            rows={2}
            defaultValue={dokument.description ?? ""}
            className="border-line bg-void text-ink w-full border px-3 py-2 text-sm"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={czeka}
            className="label bg-red hover:bg-red-hover inline-flex h-11 items-center px-5 text-xs text-white transition-colors disabled:opacity-50"
          >
            {czeka ? "Zapisywanie…" : "Zapisz opis"}
          </button>
          <button
            type="button"
            onClick={onZamknij}
            className="label border-line-strong text-ink hover:border-ink inline-flex h-11 items-center border px-5 text-xs transition-colors"
          >
            Zamknij
          </button>
        </div>
      </form>

      {/* ── PLIK — zawsze NOWA WERSJA ───────────────────────────────────── */}
      <form
        ref={formPlik}
        action={(fd) => {
          setWynik(null);
          // Identyfikator i język zostają te same — o tym, że to KOLEJNA wersja
          // tego dokumentu, decyduje `slug` + `locale`, a numer liczy baza.
          fd.set("slug", dokument.slug);
          fd.set("locale", dokument.locale);
          start(async () => {
            const r = await dodajWersje(fd);
            if (r.ok) {
              setWynik({
                ok: true,
                tekst: `Wgrano jako wersję ${r.version}. Poprzednia wersja zostaje w historii.`,
              });
              formPlik.current?.reset();
            } else {
              setWynik({ ok: false, tekst: r.error });
            }
          });
        }}
        className="border-line mt-5 space-y-3 border-t pt-4"
      >
        <p className="text-ink text-sm font-semibold">Zastąp plik PDF</p>
        <p className="text-ink-muted text-xs leading-relaxed">
          Wgranie pliku tworzy <strong>nową wersję</strong>. Obecna wersja{" "}
          {dokument.version} zostaje w historii razem z informacją, którzy
          klienci ją otrzymali — nic nie jest nadpisywane.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="label-tight text-ink-faint text-[10px]">
              Nazwa nowej wersji
            </span>
            <input
              name="title"
              required
              defaultValue={dokument.title}
              className={POLE}
            />
          </label>
          <label className="block space-y-1">
            <span className="label-tight text-ink-faint text-[10px]">
              Plik PDF (do 12 MB)
            </span>
            <input
              type="file"
              name="plik"
              required
              accept="application/pdf"
              className="border-line bg-void text-ink w-full border p-2 text-sm"
            />
          </label>
        </div>
        <input type="hidden" name="category" value={dokument.category} />
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name="aktywuj"
            defaultChecked
            className="h-5 w-5"
          />
          <span className="text-ink text-sm">
            Nowa wersja ma od razu obowiązywać
          </span>
        </label>
        <button
          type="submit"
          disabled={czeka}
          className="label border-line-strong text-ink hover:border-ink inline-flex h-11 items-center border px-5 text-xs transition-colors disabled:opacity-50"
        >
          {czeka ? "Wgrywanie…" : "Wgraj nową wersję"}
        </button>
      </form>
    </div>
  );
}
