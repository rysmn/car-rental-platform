"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Osłona formularza publicznego — trzy warstwy w jednym komponencie.
 *
 * Warstwy są opisane po stronie serwera, w `lib/security/form-guard`, i to TAM
 * są egzekwowane. Ten plik wyłącznie DOSTARCZA im danych; sam z siebie nie
 * zabezpiecza niczego i nie próbuje udawać, że zabezpiecza — kod działający
 * w przeglądarce atakującego jest kodem atakującego.
 *
 * 1. **Pułapka.** Pole `website`, ukryte tak, żeby nie widział go człowiek
 *    ANI CZYTNIK EKRANU: `aria-hidden`, `tabIndex={-1}`, `autoComplete="off"`
 *    i wyprowadzenie poza ekran zamiast `display:none`. Cztery zabiegi zamiast
 *    jednego, bo `display:none` rozpoznaje dziś każdy sensowny automat, a samo
 *    ukrycie wizualne bez `aria-hidden` kazałoby niewidomemu klientowi wypełnić
 *    pole „Twoja strona WWW" i skończyłoby się odrzuceniem jego zgłoszenia.
 *
 * 2. **Czas.** Znacznik otwarcia formularza. Wyliczany PRZY MONTOWANIU
 *    i trzymany w referencji, więc przerysowanie go nie odświeża — inaczej
 *    każde naciśnięcie klawisza zerowałoby zegar i pomiar mierzyłby czas od
 *    ostatniej litery zamiast od otwarcia.
 *
 * 3. **Turnstile.** Rysowany TYLKO wtedy, gdy serwer podał klucz witryny.
 *    Klucz przychodzi jako właściwość, a nie ze zmiennej `NEXT_PUBLIC_*`,
 *    właśnie po to, żeby włączenie go nie wymagało przebudowy obrazu.
 */

export type OslonaPola = {
  website: string;
  /** `undefined`, dopóki formularz nie zamontował się w przeglądarce. */
  startedAt?: number;
  turnstileToken?: string;
};

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          /** Wyzwanie interaktywne nie zostało rozwiązane na czas. */
          "timeout-callback"?: () => void;
          /** Co robić z tokenem, który wygasł. `auto` = Cloudflare sam odnawia. */
          "refresh-expired"?: "auto" | "manual" | "never";
          theme?: "auto" | "light" | "dark";
          size?: "normal" | "flexible" | "compact";
        },
      ) => string;
      reset: (id?: string) => void;
      /** Usuwa widget i jego wpis w rejestrze biblioteki. */
      remove?: (id?: string) => void;
    };
  }
}

const SKRYPT =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * Ile token Cloudflare jest ważny — 300 s, wartość podana przez dostawcę.
 *
 * TO JEST SEDNO TEGO PLIKU. Token jest ważny pięć minut i jest JEDNORAZOWY.
 * Formularz rezerwacji ma osiemnaście pól, kalendarz i wybór dodatków, więc
 * klient potrafi wypełniać go dłużej niż pięć minut — a wtedy wysyłał token,
 * którego Cloudflare już nie uznaje. Serwer odpowiadał odmową, klient widział
 * „Weryfikacja bezpieczeństwa nie powiodła się. Odśwież stronę", tracił
 * wszystko, co wpisał, i najczęściej nie zaczynał od nowa.
 */
const WAZNOSC_TOKENU_MS = 300_000;

/**
 * Kiedy odnawiamy token SAMI, nie czekając na jego wygaśnięcie.
 *
 * Minuta zapasu przed końcem ważności. Odnowienie jest CICHE: stary token
 * zostaje w formularzu, dopóki nie przyjdzie nowy, więc przycisk nie mruga,
 * nie ma komunikatu i klient niczego nie zauważa — a token pod przyciskiem
 * jest w każdej chwili świeży. Wszystkie pozostałe ścieżki w tym pliku
 * (wygaśnięcie, przeterminowanie, odmowa serwera) są siatką pod tym
 * mechanizmem, nie jego zamiennikiem.
 */
const ODNOWIENIE_PO_MS = 240_000;

/**
 * Powyżej tego wieku nie wysyłamy tokenu w ogóle.
 *
 * Wysłanie tokenu, o którym z zegarka wiadomo, że jest martwy, kosztuje
 * klienta całą rundę do serwera i z powrotem, a w dzienniku bezpieczeństwa
 * zostawia zdarzenie „odrzucony", które wygląda jak atak, a jest naszym
 * niedopatrzeniem. Próg jest niższy od ważności o dwadzieścia sekund — tyle
 * może trwać samo żądanie u klienta na słabym łączu.
 */
const MAX_WIEK_PRZY_WYSYLCE_MS = WAZNOSC_TOKENU_MS - 20_000;

/** Stan weryfikacji widziany przez formularz. */
export type StanOslony =
  /** Klucza nie ma — Turnstile nie działa i nie udaje, że działa. */
  | "wylaczona"
  /** Widget się rysuje albo odnawia token; trwa sekundy, nie minuty. */
  | "ladowanie"
  /** Token jest i jest świeży. */
  | "gotowa"
  /** Token był i go nie ma: wygasł, przeterminował się albo serwer go odrzucił. */
  | "wygasla"
  /** Weryfikacji nie da się załadować — awaria Cloudflare, sieć, blokada. */
  | "awaria";

export function useFormShield(siteKey: string | null) {
  /*
    Zegar startuje w efekcie, nie w ciele hooka.

    `useRef(Date.now())` wygląda niewinnie i jest błędem dwa razy: `Date.now()`
    liczy się przy KAŻDYM renderowaniu (choć wynik trafia do referencji tylko
    raz), a na serwerze daje czas serwera, nie czas otwarcia formularza
    u klienta. Przy stronie serwowanej z pamięci podręcznej ten czas mógłby być
    sprzed godzin — i pomiar „za szybko wypełniony" nigdy by się nie odezwał.
    Efekt uruchamia się dopiero w przeglądarce, w chwili, w której człowiek
    naprawdę zobaczył formularz.

    Wartość początkowa `0` znaczy „nie wiem" i serwer traktuje ją tak samo:
    brak znacznika = brak pomiaru czasu, pozostałe warstwy działają.
  */
  const startedAt = useRef(0);
  useEffect(() => {
    if (startedAt.current === 0) startedAt.current = Date.now();
  }, []);
  const [website, setWebsite] = useState("");
  const [turnstileToken, setTokenRaw] = useState<string | undefined>();
  /** Kiedy token przyszedł — do oceny, czy nie jest już martwy. */
  const wydanyO = useRef(0);

  /*
    AWARIA WERYFIKACJI — i dlaczego ten stan w ogóle istnieje.

    27.08.2026 formularze produkcyjne przestały działać: CSP nie przepuszczała
    skryptu Cloudflare, token nigdy nie powstawał, a warunek gotowości brzmiał
    „jest klucz ⇒ musi być token". Skutkiem był przycisk wyłączony NA ZAWSZE
    i napis „Sprawdzanie…", pod którym nic się już nie działo. Klient nie
    dostawał ani błędu, ani rady — formularz po prostu przestawał istnieć.

    Przyczyna była wtedy po naszej stronie, ale ta sama ślepa ulica otwiera się
    przy każdej rzeczy, na którą nie mamy wpływu: awaria Cloudflare, blokada
    w sieci firmowej, rozszerzenie blokujące skrypty, telefon w tunelu.
    Dlatego niemożność załadowania weryfikacji jest teraz STANEM, który
    komponent zna i umie pokazać, a nie ciszą.

    Co to zmienia, a czego NIE zmienia: przycisk się odblokowuje i pojawia się
    zdanie z wyjaśnieniem oraz możliwość ponowienia. Token się NIE pojawia
    i nic go nie udaje — wysyłka idzie bez niego, a decyzję podejmuje serwer
    (`security/form-guard`), tak samo jak dotąd. Przeglądarka nie dostaje tu
    prawa przepuszczenia samej siebie, bo kod działający u atakującego jest
    kodem atakującego.
  */
  const [awaria, setAwaria] = useState(false);
  /**
   * Token BYŁ i go nie ma.
   *
   * Osobno od awarii, bo to inna sytuacja i inna rada dla klienta: przy awarii
   * weryfikacja nie wstała w ogóle, tutaj wstała i się przeterminowała.
   * Widoczne dla klienta tylko wtedy, gdy nowy token jeszcze nie przyszedł —
   * odnowienie, które trwa sekundę, nie ma prawa migać komunikatem.
   */
  const [wygasla, setWygasla] = useState(false);
  /** Rośnie przy „spróbuj ponownie" i wymusza przerysowanie widgetu od zera. */
  const [proba, setProba] = useState(0);

  /**
   * Token przyszedł (albo zniknął) z widgetu.
   *
   * Stabilna — bez tego efekt rysujący widget przeliczałby się przy każdym
   * naciśnięciu klawisza w formularzu i kasował wyzwanie w trakcie
   * rozwiązywania.
   */
  const przyjmijToken = useCallback((token: string | undefined) => {
    setTokenRaw(token);
    if (token) {
      wydanyO.current = Date.now();
      setWygasla(false);
      setAwaria(false);
    } else {
      wydanyO.current = 0;
    }
  }, []);

  const pola = useCallback(
    (): OslonaPola => ({
      website,
      // `0` = jeszcze nie wiemy; serwer pomija wtedy pomiar czasu.
      startedAt: startedAt.current || undefined,
      turnstileToken,
    }),
    [website, turnstileToken],
  );

  /** Czy token nadaje się do wysłania — istnieje i nie jest przeterminowany. */
  const tokenSwiezy = useCallback(
    () =>
      Boolean(turnstileToken) &&
      Date.now() - wydanyO.current < MAX_WIEK_PRZY_WYSYLCE_MS,
    [turnstileToken],
  );

  /**
   * Czy wysyłka może iść.
   *
   * Bez klucza — zawsze. Z kluczem — po rozwiązaniu ALBO gdy weryfikacji nie
   * dało się załadować. Ten trzeci przypadek nie jest furtką: token nadal nie
   * istnieje, więc serwer widzi dokładnie to samo, co przy jego braku.
   * Odblokowany przycisk oznacza tu „możesz spróbować", a nie „przeszedłeś".
   */
  const gotowa = !siteKey || Boolean(turnstileToken) || awaria;

  const stan: StanOslony = !siteKey
    ? "wylaczona"
    : awaria
      ? "awaria"
      : turnstileToken
        ? "gotowa"
        : wygasla
          ? "wygasla"
          : "ladowanie";

  const sprobujPonownie = useCallback(() => {
    setAwaria(false);
    setWygasla(false);
    setTokenRaw(undefined);
    wydanyO.current = 0;
    setProba((n) => n + 1);
  }, []);

  /**
   * Token wygasł albo został odrzucony — pokaż to i zdobądź nowy.
   *
   * NIE przerysowuje widgetu przez `key`: robi to sam widget, który wie, czy
   * Cloudflare już się odnawia. Tutaj zostaje wyłącznie prawda widziana przez
   * formularz — „tokenu nie ma" — i komunikat dla klienta.
   */
  const zglosWygasniecie = useCallback(() => {
    setTokenRaw(undefined);
    wydanyO.current = 0;
    setWygasla(true);
  }, []);

  /**
   * Token właśnie poszedł na serwer — jest zużyty, niezależnie od odpowiedzi.
   *
   * Token Cloudflare jest JEDNORAZOWY: `siteverify` przyjmuje go dokładnie raz,
   * a drugie użycie dostaje `timeout-or-duplicate`. Bez tej linii wystarczyła
   * jedna nieudana wysyłka (źle wpisany telefon, brak auta w terminie), żeby
   * KAŻDA następna próba w tym samym formularzu była odrzucana przez
   * weryfikację — z komunikatem, który nie ma nic wspólnego z prawdziwą
   * przyczyną. Klient poprawiał pole, klikał znowu i znowu dostawał odmowę.
   *
   * Przerysowanie idzie przez `proba`, bo widget ma wtedy wydać token NOWY,
   * a nie ten sam.
   */
  const zuzyjToken = useCallback(() => {
    setTokenRaw(undefined);
    wydanyO.current = 0;
    setProba((n) => n + 1);
  }, []);

  return {
    pola,
    gotowa,
    stan,
    awaria,
    wygasla,
    proba,
    tokenSwiezy,
    sprobujPonownie,
    zglosWygasniecie,
    zuzyjToken,
    zglosAwarie: useCallback(() => setAwaria(true), []),
    website,
    setWebsite,
    setToken: przyjmijToken,
  };
}

/** Samo pole-pułapka. Renderowane w każdym chronionym formularzu. */
export function HoneypotField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      aria-hidden="true"
      /*
        Poza ekranem, a nie `display:none`. Automaty od lat pomijają pola
        ukryte przez `display`/`visibility`; pole wyprowadzone w lewo istnieje
        dla nich normalnie, a dla człowieka nie istnieje w ogóle.
      */
      style={{
        position: "absolute",
        left: "-9999px",
        width: "1px",
        height: "1px",
        overflow: "hidden",
      }}
    >
      <label>
        Nie wypełniaj tego pola
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}

/**
 * Widget Turnstile.
 *
 * Renderowanie jawne (`render=explicit`), nie automatyczne: skrypt Cloudflare
 * w trybie automatycznym szuka swoich elementów raz, przy załadowaniu, i nie
 * widzi formularza, który pojawił się później — a w tej aplikacji formularze
 * pojawiają się i znikają wraz z nawigacją po stronie klienta.
 */
/**
 * Ile czekamy na GOTOWOŚĆ biblioteki Cloudflare, zanim uznamy weryfikację za
 * niedostępną.
 *
 * Liczba dotyczy wyłącznie tego, czy `window.turnstile` w ogóle się pojawi —
 * nie czasu, w którym człowiek rozwiązuje zagadkę. To rozróżnienie jest tu
 * najważniejsze: limit nałożony na całość odbierałby formularz komuś, kto
 * akurat dostał zagadkę obrazkową i klika ją wolniej, niż ktoś wymyślił
 * w stałej.
 *
 * Dwadzieścia sekund, a nie osiem, i to też jest wnioskiem z pomiaru:
 * `api.js` odpowiada przekierowaniem i dociąga drugi plik, przez co na
 * produkcji obiekt pojawiał się po kilku sekundach nawet przy dobrym łączu.
 * Osiem sekund zamieniłoby telefon w tunelu w fałszywą awarię — a fałszywa
 * awaria uczy klienta, że temu formularzowi nie należy ufać.
 */
const CZAS_NA_SKRYPT_MS = 20_000;

/**
 * Ile czekamy na TOKEN, licząc od zamontowania widgetu.
 *
 * Drugi limit, bo pierwszy nie wystarcza i to też jest wnioskiem z pomiaru,
 * a nie z ostrożności. Widget potrafi narysować się poprawnie (`render`
 * zwraca identyfikator, Cloudflare stawia swój kontener i ukryte pole) i mimo
 * to nie wydać tokenu ani razu: gdy wyzwanie się zacina, gdy sieć przepuszcza
 * skrypt, a blokuje ramkę, gdy przeglądarka zostaje rozpoznana jako automat.
 * Pierwsza wersja tej poprawki pilnowała wyłącznie tego, czy widget się
 * narysował — więc w takiej sytuacji milczała, a formularz wisiał dalej,
 * dokładnie tak jak przed naprawą.
 *
 * Czterdzieści pięć sekund, bo tyle z zapasem starcza człowiekowi na zagadkę
 * obrazkową. Po tym czasie NIE unieważniamy niczego: pojawia się zdanie
 * z wyjaśnieniem, przycisk przestaje być zablokowany, a jeżeli klient dokończy
 * wyzwanie sekundę później, token po prostu przychodzi i wysyłka idzie
 * normalną drogą.
 */
const CZAS_NA_TOKEN_MS = 45_000;

/**
 * Ile po wygaśnięciu czekamy na Cloudflare, zanim przerysujemy widget sami.
 *
 * `refresh-expired: "auto"` znaczy, że dostawca odnawia token bez naszego
 * udziału — i najczęściej tak robi. „Najczęściej" nie jest gwarancją, więc po
 * dziesięciu sekundach ciszy wołamy `reset` sami. Wcześniej nie: dwa
 * jednoczesne odnowienia to dwa wyzwania i dwa tokeny, z których jeden
 * natychmiast się marnuje.
 */
const CZAS_NA_ODNOWIENIE_MS = 10_000;

export function TurnstileWidget({
  siteKey,
  onToken,
  onAwaria,
  onWygasl,
  className,
}: {
  siteKey: string;
  onToken: (token: string | undefined) => void;
  /** Weryfikacji nie da się załadować — formularz ma przestać czekać. */
  onAwaria?: () => void;
  /** Token wygasł albo się przeterminował — formularz ma o tym wiedzieć. */
  onWygasl?: () => void;
  className?: string;
}) {
  const boks = useRef<HTMLDivElement>(null);
  const narysowany = useRef(false);

  useEffect(() => {
    let porzucone = false;
    let zegar: ReturnType<typeof setTimeout> | undefined;
    let sonda: ReturnType<typeof setInterval> | undefined;
    let zegarTokenu: ReturnType<typeof setTimeout> | undefined;
    let zegarOdnowienia: ReturnType<typeof setTimeout> | undefined;
    let zegarWygasniecia: ReturnType<typeof setTimeout> | undefined;
    let mamToken = false;
    let idWidgetu: string | undefined;

    const posprzataj = () => {
      if (zegar) clearTimeout(zegar);
      if (sonda) clearInterval(sonda);
      zegar = undefined;
      sonda = undefined;
    };

    const stopZegaryTokenu = () => {
      if (zegarTokenu) clearTimeout(zegarTokenu);
      if (zegarOdnowienia) clearTimeout(zegarOdnowienia);
      if (zegarWygasniecia) clearTimeout(zegarWygasniecia);
      zegarTokenu = undefined;
      zegarOdnowienia = undefined;
      zegarWygasniecia = undefined;
    };

    /** Czekamy na token: albo przyjdzie, albo po 45 s mówimy o tym klientowi. */
    const uzbrojZegarTokenu = () => {
      if (zegarTokenu) clearTimeout(zegarTokenu);
      zegarTokenu = setTimeout(() => {
        if (!mamToken) awaria();
      }, CZAS_NA_TOKEN_MS);
    };

    const awaria = () => {
      posprzataj();
      stopZegaryTokenu();
      if (porzucone || mamToken) return;
      onToken(undefined);
      onAwaria?.();
    };

    /** Poproś Cloudflare o nowe wyzwanie w tym samym widgecie. */
    const przerysuj = () => {
      if (porzucone || !idWidgetu) return false;
      try {
        window.turnstile?.reset(idWidgetu);
        mamToken = false;
        uzbrojZegarTokenu();
        return true;
      } catch {
        return false;
      }
    };

    /*
      WYGAŚNIĘCIE TOKENU — ścieżka, przez którą przechodzi każdy klient
      wypełniający formularz dłużej niż pięć minut.

      Token przestaje być ważny, więc znika z formularza; przycisk NIE zostaje
      w stanie „Sprawdzanie…" bez końca, bo zaraz obok stoją dwa zegary: jeden
      pilnuje, żeby odnowienie w ogóle nastąpiło, drugi — żeby cisza nie trwała
      dłużej niż czterdzieści pięć sekund. Wpisane dane nie są niczym ruszane:
      ten kod nie zna żadnego pola formularza.
    */
    const wygasl = () => {
      if (porzucone) return;
      mamToken = false;
      onToken(undefined);
      onWygasl?.();
      uzbrojZegarTokenu();
      // Cloudflare odnawia sam (`refresh-expired: auto`). Jeśli w dziesięć
      // sekund nic nie przyszło — przerysowujemy widget własnoręcznie.
      if (zegarOdnowienia) clearTimeout(zegarOdnowienia);
      zegarOdnowienia = setTimeout(() => {
        if (!mamToken) przerysuj();
      }, CZAS_NA_ODNOWIENIE_MS);
    };

    const narysuj = () => {
      if (porzucone || narysowany.current || !boks.current) return;
      if (!window.turnstile?.render) return;
      narysowany.current = true;
      posprzataj();
      try {
        idWidgetu = window.turnstile.render(boks.current, {
          sitekey: siteKey,
          callback: (token) => {
            mamToken = true;
            stopZegaryTokenu();
            onToken(token);
            /*
              CICHE ODNOWIENIE — właściwa naprawa wygasania.

              Minutę przed końcem ważności prosimy o nowy token, nie mówiąc
              o tym klientowi ani słowa. Stary token zostaje w formularzu do
              chwili, w której przyjdzie nowy, więc przycisk nie mruga i nikt
              nie widzi „Sprawdzanie…". Formularz wypełniany pół godziny ma
              pod przyciskiem token sprzed najwyżej czterech minut.
            */
            zegarWygasniecia = setTimeout(() => {
              if (!porzucone) przerysuj();
            }, ODNOWIENIE_PO_MS);
          },
          /*
            Token wygasł u Cloudflare. Do 29.08.2026 kasowało to wyłącznie
            token — a że przycisk był wyłączony „dopóki nie ma tokenu",
            formularz potrafił zostać na „Sprawdzanie…" bez końca i bez słowa
            wyjaśnienia, jeżeli odnowienie się nie udało.
          */
          "expired-callback": wygasl,
          /* Wyzwanie interaktywne nierozwiązane na czas — ta sama rada. */
          "timeout-callback": wygasl,
          /* Dostawca odnawia sam; nasz `reset` jest siatką pod tym. */
          "refresh-expired": "auto",
          /*
            Błąd zgłoszony przez samo Cloudflare — zły klucz witryny, domena
            spoza listy w panelu, sieć, która nie dopuszcza wyzwania. Kiedyś
            kasowało to wyłącznie token, czyli zostawiało przycisk wyłączony
            bez słowa wyjaśnienia. Teraz jest to awaria z nazwy.
          */
          "error-callback": awaria,
          theme: "auto",
          size: "flexible",
        });
      } catch {
        // `render` rzuca m.in. przy nieprawidłowym kluczu witryny.
        narysowany.current = false;
        awaria();
      }
    };

    /*
      CZEKAMY NA GOTOWOŚĆ API, NIE NA ZDARZENIE `load` SKRYPTU — i to jest
      poprawka drugiej przyczyny awarii z 27.08.2026.

      `api.js?render=explicit` nie jest właściwą biblioteką, tylko zapalnikiem:
      odpowiada przekierowaniem 302 na `…/turnstile/v0/b/<skrót>/api.js` i to
      dopiero TAMTEN plik ustawia `window.turnstile`. Zdarzenie `load` na naszym
      elemencie skryptu pada, gdy skończy się pierwszy z nich — czyli zanim
      `window.turnstile` w ogóle istnieje. Poprzednia wersja wołała wtedy
      `render`, wychodziła po cichu na braku obiektu i NIE PONAWIAŁA nigdy
      więcej. Pomiar na produkcji: obiekt pojawiał się po około dziewięciu
      sekundach, czyli długo po jedynym momencie, w którym ktokolwiek go szukał.
      Skutkiem był pusty kontener i przycisk wyłączony bez żadnego błędu —
      w konsoli czysto, w sieci same odpowiedzi 200.

      Sonda co 150 ms pyta o `window.turnstile.render` aż do skutku albo do
      limitu. Odpowiada na wszystkie warianty naraz: pierwsze zamontowanie,
      ponowne zamontowanie po nawigacji, skrypt dodany wcześniej przez inny
      formularz i „spróbuj ponownie".
    */
    const CO_ILE_MS = 150;
    sonda = setInterval(narysuj, CO_ILE_MS);
    narysuj();

    zegar = setTimeout(() => {
      if (!narysowany.current) awaria();
    }, CZAS_NA_SKRYPT_MS);

    /* Drugi zegar: widget mógł się narysować i mimo to nigdy nie wydać tokenu. */
    uzbrojZegarTokenu();

    if (!window.turnstile) {
      const istniejacy = document.querySelector<HTMLScriptElement>(
        `script[src="${SKRYPT}"]`,
      );
      if (!istniejacy) {
        const skrypt = document.createElement("script");
        skrypt.src = SKRYPT;
        skrypt.async = true;
        skrypt.defer = true;
        /*
          Skrypt odrzucony przez CSP zgłasza `error` na elemencie — i to jest
          najszybszy sygnał, jaki przeglądarka daje. Dokładnie ta ścieżka
          zamieniła 27.08 formularz w martwy prostokąt z napisem „Sprawdzanie…".
        */
        skrypt.addEventListener("error", awaria);
        document.head.appendChild(skrypt);
      } else {
        istniejacy.addEventListener("error", awaria);
      }
    }

    return () => {
      porzucone = true;
      posprzataj();
      stopZegaryTokenu();
      /*
        Widget usuwany JAWNIE, nie przez skasowanie węzła przez Reacta.
        Bez tego każde „spróbuj ponownie" i każde zużycie tokenu zostawiało
        w bibliotece Cloudflare martwy wpis, a po kilkunastu wysyłkach
        w jednej karcie widget przestawał się rysować.
      */
      if (idWidgetu) {
        try {
          window.turnstile?.remove?.(idWidgetu);
        } catch {
          /* Biblioteka mogła już zniknąć razem ze stroną. */
        }
      }
      narysowany.current = false;
    };
  }, [siteKey, onToken, onAwaria, onWygasl]);

  return <div ref={boks} className={className} />;
}

/**
 * Zdanie, które klient widzi, gdy z weryfikacją coś jest nie tak.
 *
 * Jedno miejsce dla wszystkich trzech formularzy — komunikat o tym samym
 * problemie nie ma prawa brzmieć w każdym z nich inaczej. Mówi, co się stało,
 * i co zrobić. Nie mówi „turnstile_invalid", „error-code" ani „siteverify":
 * nazwa techniczna nie pomaga klientowi w niczym, a wygląda jak awaria
 * większa, niż jest.
 *
 * Trzy warianty, bo to trzy różne sytuacje i trzy różne rady:
 *   · `awaria`          — weryfikacja nie wstała w ogóle, a formularz jest
 *                         fail-open („Napisz do nas", partnerstwo): można
 *                         wysłać mimo to, decyzję i tak podejmuje serwer,
 *   · `awariaBlokujaca` — to samo, ale w REZERWACJI, która jest fail-closed.
 *                         Zdanie o „wyślij mimo to" byłoby tu nieprawdą:
 *                         bez potwierdzonej weryfikacji rezerwacja nie
 *                         powstanie, więc rada brzmi „spróbuj za chwilę albo
 *                         zadzwoń", a nie „naciśnij i zobacz",
 *   · `wygasla`         — weryfikacja działała i się przeterminowała; nowa
 *                         jest w drodze, wystarczy kliknąć jeszcze raz.
 */
export function TurnstileInfo({
  wariant,
  onPonow,
}: {
  wariant: "awaria" | "awariaBlokujaca" | "wygasla";
  onPonow: () => void;
}) {
  const t = useTranslations("FormShield");
  const zdanie =
    wariant === "wygasla"
      ? t("wygasla")
      : wariant === "awariaBlokujaca"
        ? t("awariaRezerwacja")
        : t("awaria");
  return (
    <p role="alert" className="text-ink-muted mt-2 text-xs leading-relaxed">
      {zdanie}{" "}
      <button
        type="button"
        onClick={onPonow}
        className="text-ink underline underline-offset-2 hover:no-underline"
      >
        {wariant === "wygasla" ? t("odswiez") : t("sprobujPonownie")}
      </button>
    </p>
  );
}
