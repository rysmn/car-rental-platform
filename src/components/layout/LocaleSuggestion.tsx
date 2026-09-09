"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useParams } from "next/navigation";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import {
  browserSuggestion,
  dismissSuggestion,
  readChoice,
  suggestionDismissed,
} from "@/lib/locale/preference";

/** Atrybut na `<html>`, którym skrypt z `<head>` włącza pasek. */
const ATRYBUT = "data-hint-jezyka";

/**
 * Decyzja o pasku, podjęta PRZED pierwszym malowaniem.
 *
 * Powtarza dokładnie reguły z `lib/locale/preference.ts` — wybór ręczny bije
 * wszystko, odmowa zamyka temat, a `pl` gdziekolwiek w `navigator.languages`
 * znaczy „nie proponuj angielskiego". Klucze są tu wpisane wprost, bo skrypt
 * leci jako tekst do `<head>` i nie ma jak zaimportować modułu; obie strony
 * pilnuje ten sam plik, w którym te nazwy są zdefiniowane, i test
 * `e2e-pasek-jezyka` porównuje decyzję skryptu z decyzją Reacta.
 *
 * Cokolwiek pójdzie nie tak — brak `localStorage`, wyłączony JavaScript,
 * wyjątek — kończy się BRAKIEM atrybutu, czyli brakiem paska. Najgorszy
 * możliwy skutek błędu to nieotrzymana propozycja języka, nigdy przeskok
 * układu ani zasłonięta treść.
 */
export const LOCALE_HINT_INIT_SCRIPT = `(function(){try{
var e=document.documentElement;
var a=e.lang==='en'?'en':'pl';
var c=null;try{c=localStorage.getItem('aa.locale.v1')}catch(x){}
if(c==='pl'||c==='en')return;
var d=null;try{d=localStorage.getItem('aa.locale.suggest.dismissed.v1')}catch(x){return}
if(d==='1')return;
var l=(navigator.languages&&navigator.languages.length)?navigator.languages:[navigator.language||''];
var pl=false;for(var i=0;i<l.length;i++){if(String(l[i]).toLowerCase().indexOf('pl')===0){pl=true;break}}
var w=pl?'pl':'en';
if(w!==a)e.setAttribute('${ATRYBUT}',w)
}catch(x){}})()`;

/**
 * Jednolinijkowa propozycja innego języka — i świadomie NIC więcej.
 *
 * Zamówienie brzmiało „inteligentny start językowy". Najbliższa temu rzecz,
 * która nie psuje widoczności w wyszukiwarce, to propozycja zamiast
 * przekierowania — powody w `lib/locale/preference.ts`. Klient widzi jedno
 * zdanie i jeden przycisk; jeśli go zignoruje, strona jest dokładnie tym, czym
 * była.
 *
 * Trzy rzeczy, których ten pasek NIE robi, każda celowo:
 *
 *   1. **Nie przekierowuje.** Adres i treść zostają, więc robot indeksujący
 *      widzi to samo co zawsze.
 *   2. **Nie wraca.** Zamknięcie i wybór ręczny zapisują to samo „już nie
 *      pytaj". Pasek, który wraca przy każdym wejściu, jest banerem
 *      reklamowym, nie pomocą.
 *   3. **Nie decyduje na serwerze.** Decyzja zależy od `navigator.languages`
 *      i pamięci przeglądarki, których na serwerze nie ma.
 *
 * ## Dlaczego znacznik JEST teraz w HTML-u (06.09.2026)
 *
 * Do 06.09 pasek montował się dopiero po hydratacji i spychał całą stronę
 * o 86 px w dół: `layout-shift` 0,0942 na telefonie, największa pojedyncza
 * pozycja w CLS strony głównej. Poprzedni komentarz w tym miejscu tłumaczył,
 * że renderowanie go na serwerze „dawałoby przeskok układu u wszystkich" —
 * i miał rację przy założeniu, że pasek najpierw się rysuje, a potem znika
 * po hydratacji.
 *
 * Tego założenia już nie ma. Znacznik jedzie z serwera SCHOWANY
 * (`display: none` w `globals.css`), a widoczność włącza atrybut na `<html>`,
 * ustawiony synchronicznie w `<head>` — tak samo jak motyw i waluta.
 * Dla kogo pasek jest, ten ma go od PIERWSZEJ klatki; dla kogo nie jest, ten
 * nie zobaczy go nigdy. Nic się nie pojawia i nic nie znika w trakcie.
 *
 * React zostaje właścicielem ZACHOWANIA — zapamiętanego wyboru, zamknięcia
 * i sprzątania atrybutu, gdyby skrypt się nie wykonał. Sam wybór językowy,
 * jego priorytety i zapis w pamięci są bez najmniejszej zmiany.
 */
export function LocaleSuggestion() {
  const active = useLocale() as Locale;
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  /*
    Jedyny stan, jaki ten komponent trzyma: „klient właśnie zamknął pasek".
    Widoczność pierwszej klatki należy do CSS-a i atrybutu, nie do Reacta —
    inaczej wróciłby dokładnie ten przeskok, który to wszystko usuwa.
  */
  const [zamkniety, setZamkniety] = useState(false);

  /** Propozycja może dotyczyć wyłącznie TEGO DRUGIEGO języka. */
  const proponowany: Locale = active === "pl" ? "en" : "pl";

  const schowaj = () => {
    document.documentElement.removeAttribute(ATRYBUT);
  };

  useEffect(() => {
    /*
     * Priorytet 1: zapamiętany wybór ręczny.
     *
     * To jedyne miejsce, w którym cokolwiek się przełącza samo — i przełącza
     * na to, co ten człowiek sam kiedyś kliknął. `replace`, nie `push`: wejście
     * na `/` nie ma zostawiać w historii kroku, przez który „wstecz" wraca na
     * stronę, z której właśnie odesłaliśmy.
     *
     * Robot nigdy tu nie wejdzie — jego `localStorage` jest zawsze pusty —
     * więc indeksowanie widzi wyłącznie treść spod adresu, tak jak dotąd.
     */
    const chosen = readChoice();
    if (chosen && chosen !== active) {
      schowaj();
      router.replace(
        // @ts-expect-error -- jak przy `Link` niżej: unia tras.
        { pathname, params },
        { locale: chosen },
      );
      return;
    }
    if (chosen) {
      schowaj();
      return;
    }

    // Priorytet 2: język przeglądarki — wyłącznie jako propozycja.
    if (suggestionDismissed()) {
      schowaj();
      return;
    }
    const wanted = browserSuggestion();
    /*
      Sprzątanie po skrypcie z `<head>` i awaryjne włączenie paska, gdyby ten
      skrypt w ogóle nie wystartował. Oba przypadki kończą się tym samym
      stanem, jaki policzyłby skrypt — tyle że drugi z nich zapłaci za to
      przesunięciem układu. To jest właściwa kolejność: pasek bez przeskoku
      jako reguła, pasek z przeskokiem jako ostatnia deska ratunku dla
      przeglądarki, w której nie wykonał się skrypt w nagłówku.
    */
    const el = document.documentElement;
    if (!wanted || wanted === active) {
      schowaj();
      return;
    }
    if (el.getAttribute(ATRYBUT) !== wanted) el.setAttribute(ATRYBUT, wanted);
  }, [active, pathname, params, router]);

  if (zamkniety) return null;

  const copy =
    proponowany === "en"
      ? {
          text: "This site is also available in English.",
          cta: "Continue in English",
          close: "Dismiss",
        }
      : {
          text: "Ta strona jest dostępna także po polsku.",
          cta: "Przejdź na polski",
          close: "Zamknij",
        };

  return (
    <div
      /* Widoczność ustawia `globals.css` na podstawie atrybutu na `<html>`. */
      data-pasek-jezyka={proponowany}
      className="border-line bg-surface-1 text-silver flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2 text-xs"
      role="region"
      aria-label={copy.text}
    >
      <span>{copy.text}</span>
      <Link
        // @ts-expect-error -- `pathname` to unia wszystkich tras, więc TS nie
        // udowodni, że te parametry pasują akurat do tej. next-intl dokumentuje
        // ten rzut dokładnie dla tego przypadku (tak samo w `LocaleSwitcher`).
        href={{ pathname, params }}
        locale={proponowany}
        onClick={() => {
          dismissSuggestion();
          schowaj();
        }}
        className="text-ink hover:border-ink border-line-strong tap-area inline-flex items-center border-b transition-colors"
      >
        {copy.cta}
      </Link>
      <button
        type="button"
        onClick={() => {
          dismissSuggestion();
          schowaj();
          setZamkniety(true);
        }}
        aria-label={copy.close}
        className="text-ink-faint hover:text-ink tap-narrow ml-auto inline-flex h-11 w-11 items-center justify-center text-base leading-none"
      >
        ✕
      </button>
    </div>
  );
}
