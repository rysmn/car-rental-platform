"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { siteConfig } from "@/lib/config/site";
import { cn } from "@/lib/utils";

/**
 * Brand logo (brand book §05–§09). Rules honored:
 *  - primary silver/red-on-black lockup on dark surfaces
 *  - never recolor / distort / rotate / add effects
 *  - protective clear space around the mark (the wrapping padding)
 *  - min 80px on screens — the header render comfortably exceeds this
 *
 * Height is capped by the 80px header (h-20): the mark plus its clear-space
 * padding has to sit inside that, so 60px is about the ceiling before the
 * lockup starts crowding the border.
 *
 * Phone sizes went up one step on 22.08.2026 — 44→48px below 380px, 52→56px
 * above — because the mark read as an afterthought beside a full-height burger.
 *
 * 02.09.2026 zeszły o jeden stopień, i to nie było cofnięcie tamtej decyzji,
 * tylko rachunek za dwa nowe elementy w belce — serce i walutę.
 *
 * Tego samego dnia, po dołożeniu MOTYWU jako szóstego elementu, znak dostał
 * cztery stopnie zamiast trzech i wrócił w górę wszędzie tam, gdzie miejsce
 * na to pozwala:
 *
 *     < 375 px   44 px  (80 px szerokości — dokładnie minimum z brand booka §05)
 *     375–389    48 px
 *     390–429    52 px
 *     ≥ 430      56 px
 *     desktop    60 px  (`md:h-15`, bez zmian)
 *
 * Rachunek przy 390 px, czyli najciaśniejszym z popularnych telefonów: ekran
 * 390 − 16 marginesu − 8 odstępu = 366 do rozdania; sześć kontrolek
 * z `.tap-narrow` mierzy 258 px razem z odstępami, więc na znak zostaje 108 —
 * a 52 px wysokości to 95 px szerokości plus 8 px światła ochronnego.
 * Poniżej 375 px znak zostaje na 44 px, bo tam każdy piksel idzie na cele
 * dotyku i to jest właściwa kolejność.
 *
 * ## Dlaczego to komponent KLIENCKI (30.08.2026)
 *
 * Znak jest jedyną rzeczą w nagłówku, która na każdej stronie znaczy „wróć na
 * początek”. Samo `<Link href="/">` tego nie robi, i to nie jest usterka
 * projektu, tylko udokumentowane zachowanie Next.js 16:
 *
 *   „The default scrolling behavior of `<Link>` **is to maintain scroll
 *   position**, similar to how browsers handle back and forwards navigation.”
 *   — `docs/01-app/03-api-reference/02-components/link.md`
 *
 * Strona główna jest wysoka (25 ekranów przy 390 px), więc po kliknięciu znaku
 * z połowy `/fleet` element strony NADAL jest widoczny w oknie i przeglądarka
 * zostaje tam, gdzie była. Klient wyjeżdża na Home w środku sekcji cennika
 * i wygląda to jak przypadkowe miejsce, w które go wyrzuciło.
 *
 * Drugi przypadek jest jeszcze prostszy: gdy klient JEST już na Home i klika
 * znak, żeby wrócić na górę, adres się nie zmienia, więc żadna nawigacja nie
 * zachodzi i nie dzieje się nic.
 *
 * Obie sytuacje rozstrzyga jeden warunek: kliknięcie znaku to świadome
 * „na początek”, więc zawsze kończy się na górze strony. Powrót przyciskiem
 * wstecz zostaje bez zmian — tam przywracanie pozycji jest tym, czego klient
 * oczekuje, i nic go nie dotyka.
 */
export function Logo({
  className,
  priority,
}: {
  className?: string;
  priority?: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("Nav");
  const pathname = usePathname();
  /**
   * Czy trwa przejście na Home wywołane kliknięciem ZNAKU.
   *
   * `useRef`, nie stan: nagłówek stoi w układzie i nie montuje się ponownie
   * przy nawigacji w obrębie języka, więc wartość przeżywa przejście, a jej
   * zmiana nie ma prawa wywołać renderu.
   */
  const wracamyNaGore = useRef(false);

  useEffect(() => {
    if (!wracamyNaGore.current) return;
    if (pathname !== "/") return;
    wracamyNaGore.current = false;
    /*
      Dwa `requestAnimationFrame`, a nie jedno.

      Przywracanie pozycji przez router dzieje się po zatwierdzeniu renderu
      nowej strony. Przewinięcie w tej samej klatce zostałoby przez nie
      nadpisane i wyglądałoby jak brak reakcji na co drugie kliknięcie —
      najgorszy możliwy rodzaj usterki, bo niepowtarzalny na żądanie.
      Druga klatka jest już po wszystkim.
    */
    const f1 = requestAnimationFrame(() => {
      const f2 = requestAnimationFrame(() =>
        window.scrollTo({ top: 0, left: 0, behavior: "auto" }),
      );
      return () => cancelAnimationFrame(f2);
    });
    return () => cancelAnimationFrame(f1);
  }, [pathname]);

  return (
    <Link
      href="/"
      /*
        „Strona główna A&A Corporation", nie „A&A Corporation — Premium Car
        Rental Warsaw & Gdańsk". Czytnik ekranu i tak powie „odnośnik", więc
        z etykiety klient ma się dowiedzieć DOKĄD ona prowadzi — a nie
        usłyszeć hasła reklamowego, którego nie da się pominąć.
      */
      aria-label={t("home")}
      className={cn("inline-flex items-center p-1", className)}
      onClick={(e) => {
        /*
          Ctrl/Cmd/Shift + klik oraz klik środkowym przyciskiem otwierają nową
          kartę i NIE są nawigacją w tej. Przejęcie ich odebrałoby klientowi
          zachowanie, którego przeglądarka uczy od dwudziestu lat.
        */
        if (
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey ||
          e.button !== 0
        ) {
          return;
        }
        if (pathname === "/") {
          // Już na Home: nawigacji nie będzie, więc nie ma na co czekać.
          e.preventDefault();
          window.scrollTo({ top: 0, left: 0, behavior: "auto" });
          return;
        }
        wracamyNaGore.current = true;
        /*
          `router.push` zamiast domyślnego zachowania odnośnika, żeby przejście
          i ustawienie znacznika były jedną decyzją. `Link` z `@/i18n/navigation`
          sam dokłada przedrostek języka, więc PL kończy na `/`, a EN na `/en` —
          i to samo robi ten router.
        */
        e.preventDefault();
        router.push("/");
      }}
    >
      {/*
        Both lockups ship; CSS picks one by theme. Swapping the `src` in JS
        instead would either flash the wrong mark before hydration or force this
        component to be a client component.
      */}
      {/*
        WARIANTY `-alpha`, NIE ORYGINAŁY (06.09.2026).

        Oba pliki wyjściowe marki są PNG typu 2 — truecolor BEZ kanału alfa —
        z tłem wypalonym w piksele: 89 % powierzchni jasnego to biel, 90 %
        ciemnego to czerń. Belka jest tymczasem przeźroczysta w 20 %
        (`bg-void/80`) i rozmywa to, co pod nią przejeżdża, więc
        nieprzezroczysta płyta znaku nie rozmywała niczego i w jasnym motywie
        czytała się jako wklejony biały prostokąt — najlepiej widoczny wtedy,
        gdy pod belkę wjechało zdjęcie.

        To była usterka PLIKU, nie arkusza. CSS umie ją tylko zamaskować:
        `mix-blend-mode: multiply` zdejmuje płytę wyłącznie na czystej bieli
        i zabija znak w ciemnym motywie, a `filter` rusza kolory marki. Tło
        zostało więc zdjęte u źródła — `scripts/logo-alfa.mjs`, odwrócenie
        domnożenia przez tło, rachunek bezstratny: złożenie wyniku z powrotem
        na tle źródłowym oddaje oryginał z błędem 0,5/255, czyli samego
        zaokrąglenia bajtu. Znak, kolory, proporcje i rozdzielczość bez
        zmian — doszedł WYŁĄCZNIE kanał alfa. Przy okazji pliki schudły
        dziesięciokrotnie (762 → 74 kB i 516 → 82 kB), bo jednolite tło
        ściska się do zera.

        Oryginały zostają w `public/brand/` jako materiał wyjściowy i nie są
        podmienione — wycofanie tej zmiany to powrót do dwóch nazw plików
        poniżej.
      */}
      <Image
        src="/brand/aa-logo-dark-alpha.png"
        alt={siteConfig.name}
        width={340}
        height={187}
        priority={priority}
        /*
          `sizes` — 25 kB → 6 kB na każdy z dwóch wariantów (06.09.2026).

          Bez tej podpowiedzi Next zamawia wariant `w=750`, bo z samych
          `width/height` nie wie, że znak stoi w belce na 80–117 px. Płaciły
          za to OBA pliki naraz, bo w drzewie stoją oba, a o widoczności
          decyduje dopiero CSS motywu — czyli 50 kB na każdą wizytę zamiast 12.

          120 px to najszerszy render (117 px przy `md:h-15`) zaokrąglony
          w górę. Przy DPR 2 przeglądarka bierze `w=256`, przy DPR 1 — `w=128`;
          jedno i drugie ma zapas nad rzeczywistą liczbą pikseli, więc ostrość
          na telefonach z gęstym ekranem jest bez zmian.
        */
        sizes="120px"
        className="h-11 w-auto min-[375px]:h-12 min-[390px]:h-13 min-[430px]:h-14 md:h-15 [[data-theme='light']_&]:hidden"
      />
      <Image
        src="/brand/aa-logo-color-light-alpha.png"
        alt={siteConfig.name}
        width={340}
        height={187}
        priority={priority}
        sizes="120px"
        aria-hidden
        className="hidden h-11 w-auto min-[375px]:h-12 min-[390px]:h-13 min-[430px]:h-14 md:h-15 [[data-theme='light']_&]:block"
      />
    </Link>
  );
}
