"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

/**
 * MIKROFON — zamiana mowy na tekst i NIC WIĘCEJ.
 *
 * Ten hak nie wie, czym jest rezerwacja, dostępność ani przekazanie do
 * człowieka, i nigdy nie będzie wiedział. Jego jedynym produktem jest NAPIS,
 * który `ChatWidget` wstawia do zwykłego pola wiadomości:
 *
 *     GŁOS → rozpoznawanie w PRZEGLĄDARCE → napis → pole tekstowe → send()
 *
 * Kontrakt zapisany nad `ChatWidget.send()` mówi wprost, czego robić nie
 * wolno: drugiej trasy „głosowej", drugiego zestawu reguł, osobnego parsera.
 * Zdanie POWIEDZIANE i zdanie WPISANE wchodzą do asystenta tym samym wejściem,
 * więc rezerwacja, cennik, skrzynka i zgłoszenia z etapu 44D działają dla obu
 * bez jednej linii nowego kodu. Dlatego ten plik nie importuje niczego
 * z `lib/chat` — nie ma po co.
 *
 * ZERO KOSZTU, I TO JEST DECYZJA PROJEKTOWA, NIE OSZCZĘDNOŚĆ. Rozpoznawanie
 * robi wyłącznie `SpeechRecognition` przeglądarki. Żadnego Whispera, Google
 * Speech, Azure ani AWS — każdy z nich jest rozliczany za minutę audio i każdy
 * oznaczałby wysyłanie głosu klienta do trzeciej firmy. Gdy przeglądarka tego
 * API nie ma, mikrofon **znika**, a czat działa dalej tak samo: pisaniem.
 * Płatnego zapasowego rozwiązania nie ma i nie będzie.
 *
 * PRYWATNOŚĆ. Nagranie nie powstaje po naszej stronie ani na sekundę: nie ma
 * `MediaRecorder`, nie ma `Blob`, nie ma `getUserMedia`, nie ma żądania do
 * A&A z dźwiękiem. Do naszego serwera trafia dokładnie to, co trafiłoby przy
 * pisaniu — tekst wiadomości, i to dopiero gdy klient sam naciśnie „Wyślij".
 * Sam transkrypt nigdzie nie jest logowany; `console` w tym pliku nie ma.
 *
 * Uczciwie o granicy tego rozwiązania: `SpeechRecognition` w Chrome wysyła
 * dźwięk do usługi rozpoznawania Google — to dzieje się WEWNĄTRZ przeglądarki,
 * na jej warunkach i za zgodą, której przeglądarka żąda sama. My nie dokładamy
 * tam żadnego konta, klucza ani umowy i nie mamy do tego dostępu. Klient, który
 * tego nie chce, po prostu nie naciska mikrofonu.
 */

/**
 * Stany, które widzi klient. `unsupported` nie jest błędem — to informacja,
 * że tej przeglądarki nie stać na rozpoznawanie mowy, więc przycisku nie ma.
 */
export type VoiceState =
  | "unsupported"
  | "idle"
  | "listening"
  | "processing"
  /** Transkrypt stoi w polu wiadomości i czeka, aż klient go przeczyta. */
  | "ready"
  | "error";

/*
 * WŁASNE, MINIMALNE TYPY — bo `lib.dom` ich nie ma.
 *
 * TypeScript zna `SpeechRecognitionResultList`, ale nie zna ani samego
 * `SpeechRecognition`, ani jego zdarzeń. Gotowy pakiet typów
 * (`@types/dom-speech-recognition`) byłby NOWĄ ZALEŻNOŚCIĄ dla trzech
 * interfejsów, których używamy w jednym pliku — a etap ma nie dokładać nic.
 * Opisujemy więc dokładnie tyle, ile wołamy, i ani pola więcej.
 */
type RecognitionResultEvent = {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};

type RecognitionErrorEvent = { error: string };

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onspeechend: (() => void) | null;
}

type RecognitionCtor = new () => Recognition;

/**
 * Wykrywanie możliwości, nie zgadywanie po nazwie przeglądarki.
 *
 * `webkitSpeechRecognition` to nadal jedyna nazwa w Chrome i w Safari, więc
 * sprawdzamy obie. Sprawdzenie po `navigator.userAgent` byłoby zgadywaniem,
 * które myli się przy każdej nowej wersji — a tutaj pomyłka znaczy przycisk,
 * który nic nie robi.
 */
function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Locale = "pl" | "en";

/**
 * Język rozpoznawania bierze się z języka STRONY, nie z ustawień systemu.
 *
 * Klient czytający wersję angielską mówi po angielsku, a `pl-PL` zrobiłby
 * z „I need an SUV" fonetyczną papkę. Projekt ma dziś dwa języki
 * (`src/i18n/routing.ts`) i tylko one są tutaj wymienione — dopisanie DE czy
 * UA to jedna linia, ale dopiero gdy strona naprawdę będzie je miała. Mapa,
 * która obiecuje język nieistniejący w interfejsie, kłamie.
 */
const BCP47: Record<Locale, string> = { pl: "pl-PL", en: "en-GB" };

const MESSAGES = {
  denied: [
    "Dostęp do mikrofonu jest wyłączony. Możesz dalej pisać.",
    "Microphone access is disabled. You can continue by typing.",
  ],
  noDevice: [
    "Nie znaleziono mikrofonu. Napisz wiadomość, a odpowiem tak samo.",
    "No microphone found. Type your message and I will answer just the same.",
  ],
  nothingHeard: [
    "Nie dosłyszałem. Spróbuj ponownie albo napisz wiadomość.",
    "I didn't catch that. Please try again or type your message.",
  ],
  network: [
    "Rozpoznawanie mowy nie miało połączenia. Spróbuj ponownie albo napisz.",
    "Speech recognition lost its connection. Try again or type instead.",
  ],
  failed: [
    "Nie udało się rozpoznać mowy. Spróbuj ponownie albo napisz wiadomość.",
    "Speech recognition failed. Please try again or type your message.",
  ],
} as const;

const say = (locale: Locale, key: keyof typeof MESSAGES) =>
  MESSAGES[key][locale === "en" ? 1 : 0];

export type VoiceInput = {
  /** Czy w ogóle rysować przycisk. `false` = ta przeglądarka nie umie. */
  supported: boolean;
  state: VoiceState;
  /** Tekst rozpoznawany NA ŻYWO. Podgląd — nigdy nie trafia do wiadomości. */
  interim: string;
  /** Komunikat dla klienta. Nigdy kod błędu. */
  message: string | null;
  toggle: () => void;
  stop: () => void;
};

export function useVoiceInput({
  locale,
  active,
  onTranscript,
}: {
  locale: Locale;
  /**
   * Czy panel czatu jest otwarty. Zamknięcie MUSI uciszyć mikrofon — inaczej
   * zostaje nasłuchiwanie w tle, o którym klient nie wie, a to jest dokładnie
   * to, czego obiecaliśmy nie robić.
   */
  active: boolean;
  /** Gotowy, ostateczny transkrypt. Wołane raz na wypowiedź. */
  onTranscript: (text: string) => void;
}): VoiceInput {
  /**
   * Czy ta przeglądarka umie rozpoznawać mowę — pytanie zadane RAZ, poza
   * Reactem.
   *
   * `useSyncExternalStore`, a nie `useState` + `useEffect`, i to nie jest
   * upiększenie: serwer nie ma `window`, więc migawka serwerowa musi brzmieć
   * „nie umie" — inaczej HTML z serwera miałby przycisk, którego pierwszy
   * render klienta by nie miał, i to jest błąd hydratacji. Ustawianie stanu
   * w efekcie robiłoby to samo o jeden render drożej i jest w tym projekcie
   * błędem lintera (`react-hooks/set-state-in-effect`).
   *
   * Subskrypcja jest pusta, bo obecność API nie zmienia się w trakcie życia
   * karty. Nie ma czego nasłuchiwać i nie udajemy, że jest.
   */
  const supported = useSyncExternalStore(
    () => () => {},
    () => recognitionCtor() !== null,
    () => false,
  );

  const [rawState, setState] = useState<VoiceState>("idle");
  const [interim, setInterim] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const state: VoiceState = supported ? rawState : "unsupported";

  /**
   * JEDNA instancja i ani jednej więcej.
   *
   * Podwójne kliknięcie, kliknięcie w trakcie startu, klawiatura razem
   * z dotykiem — każde z nich potrafi zawołać `start()` drugi raz. Druga
   * instancja to drugi strumień z mikrofonu i dwa komplety zdarzeń, czyli
   * transkrypt wklejony dwa razy. Referencja jest zajęta od chwili utworzenia
   * obiektu, a nie od pierwszego zdarzenia — dlatego to `ref`, nie stan:
   * stan aktualizuje się po renderze, a drugie kliknięcie przychodzi wcześniej.
   */
  const recRef = useRef<Recognition | null>(null);
  /** Czy ta sesja dała cokolwiek — decyduje o komunikacie „nie dosłyszałem". */
  const gotSpeechRef = useRef(false);
  /** Błąd już obsłużony; `onend` po nim nie ma nic do dodania. */
  const failedRef = useRef(false);

  /*
   * Świeże wartości dla uchwytów zdarzeń bez przebudowywania instancji.
   * Uchwyty żyją tak długo, jak sesja rozpoznawania, a `locale` i funkcja
   * z zewnątrz mogą się w tym czasie zmienić.
   */
  const localeRef = useRef(locale);
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    localeRef.current = locale;
    onTranscriptRef.current = onTranscript;
  }, [locale, onTranscript]);

  /**
   * PRZERWIJ I WYRZUĆ — dla zamknięcia czatu, zmiany języka i odmontowania.
   *
   * `abort()`, nie `stop()`, i to jest różnica, którą widać dopiero w użyciu:
   * `stop()` prosi o dokończenie i DOSTARCZA ostatni wynik, więc transkrypt
   * wpadłby do pola, którego klient już nie ogląda — albo, po zamknięciu
   * rozmowy, do pola należącego do NASTĘPNEJ. Uchwyty są odpinane przed
   * przerwaniem, żeby spóźnione zdarzenie nie miało już gdzie trafić.
   */
  const cancel = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    rec.onspeechend = null;
    try {
      rec.abort();
    } catch {
      /* przeglądarka zamknęła sesję sama — nie ma czego przerywać */
    }
    setState("idle");
    setInterim("");
  }, []);

  /**
   * SKOŃCZ I ODDAJ — dla drugiego kliknięcia w mikrofon.
   *
   * Tu `abort()` byłby błędem: „już powiedziałem" znaczy „weź to, co
   * powiedziałem", a nie „zapomnij". `stop()` domyka sesję i przepuszcza
   * ostatni wynik przez `onresult`, więc tekst ląduje w polu tak samo, jak
   * przy naturalnym końcu wypowiedzi.
   */
  const finish = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    setState("processing");
    try {
      rec.stop();
    } catch {
      cancel();
    }
  }, [cancel]);

  const start = useCallback(() => {
    if (recRef.current) return; // już słucha — drugie kliknięcie tu nie dojdzie
    const Ctor = recognitionCtor();
    // Nie do osiągnięcia dopóki `supported` rządzi przyciskiem — ale przycisk
    // jest jednym z wywołujących, nie jedynym gwarantem.
    if (!Ctor) return;

    const rec = new Ctor();
    recRef.current = rec;
    gotSpeechRef.current = false;
    failedRef.current = false;
    setMessage(null);
    setInterim("");

    rec.lang = BCP47[localeRef.current] ?? BCP47.pl;
    /*
     * Jedna wypowiedź, jedna sesja. `continuous` znaczyłoby mikrofon otwarty,
     * dopóki ktoś go nie zamknie — na telefonie w kieszeni to nasłuchiwanie,
     * na które nikt się nie pisał.
     */
    rec.continuous = false;
    rec.maxAlternatives = 1;
    /*
     * Wyniki tymczasowe SĄ włączone, ale wyłącznie jako podgląd pod polem
     * wiadomości. Do pola tekstowego, do wysyłki i do zgłoszenia trafia
     * wyłącznie wynik `isFinal` — tymczasowy potrafi zmienić się w połowie
     * zdania i wysłanie go byłoby wysłaniem czegoś, czego klient nie
     * powiedział do końca.
     */
    rec.interimResults = true;

    rec.onresult = (e) => {
      let finalText = "";
      let preview = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0]?.transcript ?? "";
        if (r.isFinal) finalText += text;
        else preview += text;
      }
      setInterim(preview);
      const ready = finalText.trim();
      if (ready) {
        gotSpeechRef.current = true;
        setInterim("");
        setState("ready");
        onTranscriptRef.current(ready);
      }
    };

    // Klient skończył mówić; przeglądarka jeszcze liczy.
    rec.onspeechend = () => {
      setState((s) => (s === "listening" ? "processing" : s));
    };

    rec.onerror = (e) => {
      // Przerwanie na nasze żądanie nie jest awarią i nie zasługuje na komunikat.
      if (e.error === "aborted") return;
      failedRef.current = true;
      const l = localeRef.current;
      const text =
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? say(l, "denied")
          : e.error === "audio-capture"
            ? say(l, "noDevice")
            : e.error === "no-speech"
              ? say(l, "nothingHeard")
              : e.error === "network"
                ? say(l, "network")
                : say(l, "failed");
      setMessage(text);
      setState("error");
      setInterim("");
    };

    rec.onend = () => {
      recRef.current = null;
      setInterim("");
      if (failedRef.current) return; // komunikat już stoi
      if (!gotSpeechRef.current) {
        setMessage(say(localeRef.current, "nothingHeard"));
        setState("error");
        return;
      }
      /*
       * `ready` przeżywa koniec sesji celowo: to jedyny stan, który mówi
       * klientowi „tekst jest w polu, przeczytaj go i wyślij". Zgaśnie sam,
       * gdy pole opustoszeje po wysłaniu — patrz `ChatWidget`.
       */
      setState((s) => (s === "ready" ? s : "idle"));
    };

    try {
      rec.start();
      setState("listening");
    } catch {
      /*
       * `start()` rzuca, gdy sesja już trwa — zdarza się przy szybkim
       * podwójnym kliknięciu, zanim uchwyty zdążą cokolwiek zgłosić.
       * Sprzątamy referencję, żeby przycisk nie został zablokowany na stałe.
       */
      recRef.current = null;
      setMessage(say(localeRef.current, "failed"));
      setState("error");
    }
  }, []);

  const toggle = useCallback(() => {
    if (recRef.current) finish();
    else start();
  }, [finish, start]);

  // Zamknięty czat, zmieniony język, zdemontowany komponent — trzy sposoby
  // na to samo: koniec sesji. Nowa zaczyna się dopiero od kliknięcia.
  useEffect(() => {
    if (!active) cancel();
  }, [active, cancel]);

  useEffect(() => {
    cancel();
  }, [locale, cancel]);

  useEffect(() => cancel, [cancel]);

  return { supported, state, interim, message, toggle, stop: cancel };
}
