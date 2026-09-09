"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import type { ChatBlock, ChatSlots, DateShortcut } from "@/lib/chat/types";
import { EMPTY_SLOTS } from "@/lib/chat/types";
import { DateRangePicker } from "@/components/date/DateRangePicker";
import { useVoiceInput } from "@/components/chat/useVoiceInput";
import {
  addDaysIso,
  formatRange,
  inclusiveDays,
  todayIso,
  weekendRange,
} from "@/lib/dates";

/**
 * The assistant, as the visitor sees it.
 *
 * Design constraints that are not negotiable, from the brief and from what a
 * car-rental site actually needs:
 *
 * · **It must not cover anything.** On mobile the launcher sits above the safe
 *   area and the panel is a sheet that leaves the top of the page reachable; on
 *   desktop the panel is a 380px column, never the whole screen.
 * · **It renders blocks, never HTML.** Everything the server sends is data with
 *   a `kind`; there is no `dangerouslySetInnerHTML` anywhere in this file, so a
 *   reply can never inject markup into the page.
 * · **Nothing is remembered across visits.** Conversation id and slots live in
 *   `sessionStorage`, so closing the tab ends the conversation. No cookie, no
 *   identifier that outlives the session — which keeps the widget outside the
 *   consent banner's scope.
 */

type Locale = "pl" | "en";

type Message = { from: "bot" | "user"; blocks: ChatBlock[] };

const STORAGE_KEY = "aa-chat";

/**
 * Najdłuższa wiadomość, jaką klient może wysłać. Jedna definicja, dwa
 * zastosowania: atrybut pola tekstowego i przycięcie transkryptu z mikrofonu.
 * Dwie liczby w dwóch miejscach rozjechałyby się przy pierwszej zmianie.
 */
const MAX_MESSAGE = 500;

/** Ile klient czeka na odpowiedź, zanim zobaczy komunikat zamiast kropek. */
const CLIENT_TIMEOUT_MS = 20_000;

/*
  POMIAR PRZED MALOWANIEM, NIE PO (06.09.2026).

  `useEffect` biegnie PO tym, jak przeglądarka narysuje klatkę. Uruchamiacz
  zdążył się więc pokazać nisko, na `bottom-6`, a dopiero potem — po zmierzeniu
  paska zgód — podskakiwał o jego wysokość. Zmierzone na produkcji, 412 px:
  skok o 176 px i `layout-shift` 0,0312, czyli jedna czwarta całego CLS strony
  głównej na telefonie.

  `useLayoutEffect` wykonuje ten sam pomiar w tej samej klatce, PRZED
  malowaniem, więc uruchamiacz od razu stoi tam, gdzie ma stać. Rozgałęzienie
  po `window` jest wyłącznie po to, żeby render serwerowy nie zgłaszał
  ostrzeżenia — na serwerze nie ma czego mierzyć.
*/
const useEfektUkladu =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const money = (grosze: number, locale: Locale) =>
  new Intl.NumberFormat(locale === "en" ? "en-GB" : "pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 0,
  }).format(grosze / 100);

const t = (locale: Locale, pl: string, en: string) =>
  locale === "en" ? en : pl;

/**
 * The opening message, built on the client.
 *
 * Rendered locally rather than fetched: it is fixed text and a fixed menu, so a
 * round trip would buy nothing and would start a conversation record for
 * somebody who only clicked the button out of curiosity. The first REAL message
 * is what opens a conversation server-side.
 */
export type ChatCan = {
  faq: boolean;
  offer: boolean;
  availability: boolean;
  prices: boolean;
  startBooking: boolean;
  handoff: boolean;
};

const ALL_ON: ChatCan = {
  faq: true,
  offer: true,
  availability: true,
  prices: true,
  startBooking: true,
  handoff: true,
};

function greetingFor(locale: Locale, can: ChatCan = ALL_ON): Message {
  return {
    from: "bot",
    blocks: [
      {
        kind: "text",
        text: t(
          locale,
          "Dzień dobry 👋 Jestem Asystentem A&A. Pomogę Ci znaleźć samochód, sprawdzić dostępność i cenę. W czym mogę pomóc?",
          "Hello 👋 I'm the A&A Assistant. I can help you find a car, check availability and prices. How can I help?",
        ),
      },
      {
        kind: "quick",
        // Filtered, not greyed out: a button the assistant will refuse to act
        // on is worse than no button. With everything switched off only the
        // greeting text remains, which is the honest result of that choice.
        options: (
          [
            [
              "offer",
              "🚘 Znajdź samochód",
              "🚘 Find a car",
              "znajdź samochód",
              "find a car",
            ],
            [
              "availability",
              "📅 Sprawdź dostępność",
              "📅 Check availability",
              "sprawdź dostępność",
              "check availability",
            ],
            [
              "prices",
              "💰 Sprawdź cenę",
              "💰 Check price",
              "sprawdź cenę",
              "check price",
            ],
            [
              "offer",
              "🚗 Zobacz flotę",
              "🚗 See the fleet",
              "pokaż flotę",
              "show the fleet",
            ],
            [
              "offer",
              "✈️ Lotnisko",
              "✈️ Airport",
              "wynajem na lotnisku",
              "airport rental",
            ],
            [
              "offer",
              "🏢 Dla firm",
              "🏢 For business",
              "wynajem dla firmy",
              "business rental",
            ],
            [
              "handoff",
              "💬 Pracownik",
              "💬 Talk to a person",
              "porozmawiaj z pracownikiem",
              "talk to a person",
            ],
          ] as [keyof ChatCan, string, string, string, string][]
        )
          .filter(([cap]) => can[cap])
          .map(([, pl, en, vpl, ven]) => ({
            label: t(locale, pl, en),
            value: t(locale, vpl, ven),
          })),
      },
    ],
  };
}

export function ChatWidget({
  name,
  locale,
  position,
  autoOpenSeconds,
  privacyHref,
  can = ALL_ON,
}: {
  name: string;
  locale: Locale;
  position: "left" | "right";
  autoOpenSeconds: number;
  privacyHref: string;
  /** The admin panel's capability switches. Filters the greeting menu. */
  can?: ChatCan;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [slots, setSlots] = useState<ChatSlots>(EMPTY_SLOTS);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [bannerHeight, setBannerHeight] = useState(0);
  /** Czy pomiar dolnych pasków już się odbył — patrz `visibility` uruchamiacza. */
  const [zmierzony, setZmierzony] = useState(false);
  /**
   * The calendar, when it is up: the range it opened with, or two nulls.
   *
   * It is a layer over the panel, not a page and not a second dialog — which is
   * what makes closing it return the customer to the conversation instead of
   * ending it. `null` means no calendar.
   */
  const [picker, setPicker] = useState<{
    from: string | null;
    to: string | null;
  } | null>(null);

  /**
   * How much room the cookie banner is taking at the bottom of the screen.
   *
   * The banner is `fixed bottom-0 z-50`; the launcher is `bottom-6 z-40`. On a
   * phone the banner is taller than that, so it sits on top of the launcher and
   * swallows the tap — a first-time visitor simply cannot open the assistant.
   * A headless-browser run caught it: Playwright reported the banner
   * "intercepts pointer events" and the click never landed.
   *
   * Raising the z-index would be the wrong fix, because then the chat would
   * cover the consent choice instead, and that one is not ours to obstruct. So
   * the launcher moves up by exactly the banner's height and moves back when
   * the visitor answers.
   *
   * ## Od 04.09.2026 mierzone są DWA elementy, nie jeden
   *
   * Na stronie auta stoi na dole telefonu przyklejony pas rezerwacji
   * (`[data-pasek-rezerwacji]`, etap sprzedażowy 2). Leży NAD paskiem zgód,
   * więc uruchamiacz musi ustąpić obu naraz — pomiar samego paska zgód
   * postawiłby go dokładnie na przycisku „ZAREZERWUJ", czyli na tym jednym
   * elemencie, którego asystentowi nie wolno zasłonić.
   *
   * Wysokości się SUMUJĄ, bo elementy się nie nakładają: pas siada na pasku
   * zgód, nie na nim. Żaden z trzech komponentów nie zna klas pozostałych —
   * wspólny jest wyłącznie znacznik w atrybucie.
   */
  useEfektUkladu(() => {
    if (typeof document === "undefined") return;

    const measure = () => {
      const wysokosc = (sel: string) => {
        const el = document.querySelector<HTMLElement>(sel);
        return el ? Math.round(el.getBoundingClientRect().height) : 0;
      };
      /*
        Pas schowany (klawiatura albo formularz na ekranie) zjeżdża przez
        `translate`, więc nadal ma wysokość — a nie zajmuje już miejsca.
        `aria-hidden` jest tym samym przełącznikiem, którym pas ogłasza to
        czytnikom ekranu, więc jest też jedyną prawdą o jego widoczności,
        jakiej trzeba tu szukać.
      */
      const pas = document.querySelector<HTMLElement>(
        "[data-pasek-rezerwacji]:not([aria-hidden='true'])",
      );
      setBannerHeight(
        wysokosc("[data-consent-banner]") +
          (pas ? Math.round(pas.getBoundingClientRect().height) : 0),
      );
    };

    measure();
    setZmierzony(true);
    // The banner mounts after hydration and disappears on a click, so both the
    // tree and the element's own size have to be watched.
    const mo = new MutationObserver(measure);
    // `attributes` doszło razem z pasem rezerwacji: on nie znika z drzewa,
    // tylko przełącza `aria-hidden` i zjeżdża w dół. Bez tego uruchamiacz
    // zostawałby podniesiony nad pasem, którego już nie widać.
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-hidden"],
    });
    /*
      Drugi obserwator — na `<html>` (06.09.2026).

      Od tej zmiany o widoczności paska zgód decyduje atrybut `data-zgody`
      na `<html>`, ustawiany przed pierwszym malowaniem. Pasek zostaje wtedy
      w drzewie i zmienia wyłącznie `display`, więc obserwator pilnujący
      `document.body` nie zobaczyłby niczego: kliknięcie „Akceptuję"
      zdejmowałoby pasek z ekranu, a uruchamiacz zostawałby uniesiony nad
      pustym miejscem.
    */
    const moHtml = new MutationObserver(measure);
    moHtml.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-zgody"],
    });
    window.addEventListener("resize", measure);
    return () => {
      mo.disconnect();
      moHtml.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  /**
   * How much of the screen the on-screen keyboard is covering.
   *
   * The panel is `position: fixed` with `bottom: 0`, and on iOS "bottom" means
   * the bottom of the LAYOUT viewport — which does not move when the keyboard
   * opens. The result is a message box sitting behind the keyboard, invisible,
   * while the customer types blind. `dvh` units do not fix this either: they
   * track browser chrome, not the keyboard.
   *
   * `visualViewport` is the part that does move, so the gap between it and the
   * layout viewport is exactly the keyboard's height, and lifting the panel by
   * that amount puts the input back where the thumb expects it.
   *
   * Zero on desktop, where the two viewports agree — so nothing below `sm:`
   * changes for a mouse.
   */
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!open || !vv) return;

    const measure = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      // Small negative values appear mid-scroll on Android; clamp them away.
      setKeyboardInset(covered > 24 ? Math.round(covered) : 0);
    };

    measure();
    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    return () => {
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
    };
  }, [open]);

  // Keep the newest message in view when the keyboard pushes the panel up.
  useEffect(() => {
    if (keyboardInset > 0 && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [keyboardInset]);

  // Restore the in-progress conversation on a soft navigation within the tab.
  //
  // This is the case the "no setState in an effect" rule carves out: reading a
  // value from an external store (sessionStorage) that does not exist during
  // the server render. A lazy `useState` initialiser would run on the server
  // too and produce a hydration mismatch.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        conversationId: string | null;
        slots: ChatSlots;
        messages: Message[];
      };
      /* eslint-disable react-hooks/set-state-in-effect */
      setConversationId(saved.conversationId ?? null);
      setSlots(saved.slots ?? EMPTY_SLOTS);
      setMessages(saved.messages ?? []);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      // A malformed entry is not worth a crash — start fresh.
    }
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          conversationId,
          slots,
          messages: messages.slice(-20),
        }),
      );
    } catch {
      /* storage full or blocked — the conversation still works in memory */
    }
  }, [conversationId, slots, messages]);

  useEffect(() => {
    if (autoOpenSeconds <= 0) return;
    const timer = setTimeout(() => {
      setOpen(true);
      setMessages((m) => (m.length === 0 ? [greetingFor(locale, can)] : m));
    }, autoOpenSeconds * 1000);
    return () => clearTimeout(timer);
  }, [autoOpenSeconds, locale, can]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  /**
   * JEDYNE WEJŚCIE WIADOMOŚCI DO ASYSTENTA — i to jest przygotowanie pod
   * etap 44E (mikrofon), zapisane tutaj, żeby nikt go później nie ominął.
   *
   * `send` przyjmuje NAPIS i nie wie, skąd on pochodzi. Dziś wołają je trzy
   * rzeczy: pole tekstowe, przyciski szybkiej odpowiedzi (podstawiają zdanie,
   * jakby klient je wpisał) i kalendarz. Rozpoznawanie mowy będzie czwartą
   * i nie potrzebuje do tego ani jednej linii nowej logiki biznesowej:
   *
   *     GŁOS → ROZPOZNAWANIE MOWY → send(rozpoznanyTekst) → /api/chat
   *
   * Co z tego wynika dla 44E — i czego robić NIE WOLNO. Nie wolno dodać
   * drugiej trasy „głosowej", drugiego zestawu reguł ani osobnego zapisu
   * rozmowy. Wszystko, co dzieje się po tej funkcji — intencje, rezerwacja,
   * przekazanie do człowieka, zgłoszenie w skrzynce — jest wspólne, a asystent
   * odpowiadający inaczej na zdanie powiedziane niż na wpisane to dwa produkty
   * do utrzymania zamiast jednego.
   *
   * Mikrofon dokłada więc dokładnie dwie rzeczy: przycisk i zamianę mowy na
   * tekst. Trzecia oznacza, że coś poszło nie tak.
   */
  const send = useCallback(
    async (
      raw: string,
      /**
       * A range chosen in the calendar, sent beside the message.
       *
       * Not embedded in the text: dates picked from a grid are already exact,
       * and asking the parser (or the model) to read them back out of a
       * sentence is a chance to get them wrong for no benefit. The text is what
       * the customer and the operator read; this is what the assistant acts on.
       */
      dates?: { from: string; to: string },
    ) => {
      const message = raw.trim();
      if (!message || busy) return;

      setError(null);
      setBusy(true);
      setMessages((m) => [
        ...m,
        { from: "user", blocks: [{ kind: "text", text: message }] },
      ]);
      setInput("");

      /*
        LIMIT CZASU PO STRONIE KLIENTA (audyt 02.09.2026, P7).

        Serwer ma własny budżet — 4 s na czytanie modelu i zejście na parser
        deterministyczny — ale to pilnuje modelu, nie połączenia. Gdy odpowiedź
        nie wraca wcale (zerwany zasięg w windzie, uśpiona karta, proxy, które
        trzyma gniazdo), `fetch` czeka tyle, ile przeglądarka uzna za stosowne,
        a klient patrzy na kropki bez końca.

        Dwadzieścia sekund: pięć razy więcej niż budżet modelu i wielokrotnie
        więcej niż najwolniejsza zmierzona odpowiedź, więc nie przerwie
        niczego, co jeszcze pracuje — a jednocześnie krócej, niż człowiek jest
        skłonny czekać, nie wiedząc, czy cokolwiek się dzieje.
      */
      const przerwij = new AbortController();
      const zegar = setTimeout(() => przerwij.abort(), CLIENT_TIMEOUT_MS);
      /*
        Nieudane wysłanie ZDEJMUJE dymek klienta i oddaje tekst do pola.

        Zostawienie dymka pod komunikatem o błędzie wygląda, jakby wiadomość
        doszła, a przecież właśnie nie doszła; a skoro tekst zniknął z pola,
        ponowienie znaczyło przepisanie go z ekranu. Teraz „spróbuj ponownie"
        to jedno naciśnięcie.
      */
      const cofnij = () => {
        setMessages((m) => m.slice(0, -1));
        setInput(message);
      };

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: przerwij.signal,
          body: JSON.stringify({
            action: "message",
            conversationId,
            message,
            locale,
            slots,
            dates,
          }),
        });

        if (res.status === 429) {
          cofnij();
          setError(
            t(
              locale,
              "Za dużo wiadomości naraz. Spróbuj ponownie za chwilę.",
              "Too many messages at once. Please try again shortly.",
            ),
          );
          return;
        }
        if (!res.ok) throw new Error(String(res.status));

        /*
          `res.json()` też może paść — odpowiedź obcięta w połowie albo strona
          błędu proxy w HTML-u zamiast JSON-a. Bez tego `await` w tym samym
          `try` klient dostawał wyjątek i biały ekran zamiast komunikatu.
        */
        const data = (await res.json()) as {
          conversationId: string;
          blocks: ChatBlock[];
          slots: ChatSlots;
        };
        setConversationId(data.conversationId);
        setSlots(data.slots);
        setMessages((m) => [...m, { from: "bot", blocks: data.blocks }]);
      } catch (err) {
        cofnij();
        const przerwane =
          err instanceof DOMException && err.name === "AbortError";
        setError(
          przerwane
            ? t(
                locale,
                "Odpowiedź nie przyszła na czas. Spróbuj ponownie albo zadzwoń do nas.",
                "The reply did not arrive in time. Please try again or give us a call.",
              )
            : t(
                locale,
                "Coś poszło nie tak. Spróbuj ponownie albo zadzwoń do nas.",
                "Something went wrong. Please try again or give us a call.",
              ),
        );
      } finally {
        clearTimeout(zegar);
        setBusy(false);
      }
    },
    [busy, conversationId, locale, slots],
  );

  /**
   * MIKROFON — czwarty wywołujący zapowiedziany nad `send`, i jedyny, który
   * `send` NIE woła.
   *
   * Rozpoznany tekst ląduje w polu wiadomości i tam zostaje. Nic nie wychodzi
   * samo: klient czyta, poprawia „Wolwo" na „Volvo", dopisuje termin i dopiero
   * wtedy naciska „Wyślij". Automatyczna wysyłka po ostatnim słowie
   * oszczędzałaby jedno kliknięcie, a kosztowała rozmowę zaczętą od zdania,
   * którego klient nie powiedział — i zgłoszenie w skrzynce z tym zdaniem
   * w środku.
   *
   * DOPISUJE, nie nadpisuje: ktoś, kto wpisał połowę zdania i dokończył je
   * głosem, ma dostać całość, a nie utratę tego, co już napisał.
   */
  const applyTranscript = useCallback((text: string) => {
    setInput((prev) => {
      const base = prev.trim();
      return (base ? `${base} ${text}` : text).slice(0, MAX_MESSAGE);
    });
    // Kursor wraca do pola, żeby poprawka była jednym ruchem, nie dwoma.
    inputRef.current?.focus();
  }, []);

  const voice = useVoiceInput({
    locale,
    active: open,
    onTranscript: applyTranscript,
  });

  const listening = voice.state === "listening";

  /**
   * Sześć stanów mikrofonu sprowadzonych do JEDNEGO zdania dla klienta.
   *
   * `unsupported` nie ma tu wpisu celowo — przy braku API nie ma ani
   * przycisku, ani komunikatu, bo nie ma o czym informować: czat wygląda
   * dokładnie tak, jak wyglądał przed tym etapem.
   *
   * `ready` gaśnie samo, gdy pole opustoszeje po wysłaniu — dlatego warunek
   * patrzy na `input`, a nie na osobny stan do sprzątania. Podgląd na żywo
   * (`interim`) jest tutaj i TYLKO tutaj; do pola wiadomości nie wchodzi.
   */
  const voiceNote =
    voice.state === "listening"
      ? `${t(locale, "Słucham…", "Listening…")}${
          voice.interim ? ` ${voice.interim}` : ""
        }`
      : voice.state === "processing"
        ? t(locale, "Zamieniam mowę na tekst…", "Processing speech…")
        : voice.state === "ready" && input.trim()
          ? t(
              locale,
              "Gotowe — sprawdź tekst i wyślij.",
              "Ready — check the text and send.",
            )
          : voice.state === "error"
            ? voice.message
            : null;

  /**
   * Open the calendar over the conversation.
   *
   * The message box loses focus first: on a phone the keyboard is half the
   * screen, and a date grid behind it is a date grid nobody can use.
   */
  const openPicker = useCallback((from: string | null, to: string | null) => {
    if (typeof document !== "undefined") {
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
    setPicker({ from, to });
  }, []);

  /**
   * A chosen range, on its way to the assistant.
   *
   * The customer's own bubble says what they chose in their own date format;
   * the exact days travel beside it, so nothing depends on reading them back
   * out of the sentence.
   */
  const sendDates = useCallback(
    (from: string, to: string) => {
      setPicker(null);
      void send(
        `${t(locale, "Termin", "Dates")}: ${formatRange(from, to, locale)}`,
        { from, to },
      );
    },
    [send, locale],
  );

  // Escape closes the calendar and nothing else. The conversation behind it is
  // untouched — losing a conversation to a stray key press would be worse than
  // the calendar staying up.
  useEffect(() => {
    if (!picker) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setPicker(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picker]);

  /**
   * Closing the panel ends the conversation. Everything goes.
   *
   * Not a minimise. A visitor who closes the assistant and comes back later —
   * possibly on a shared or family device — must not find somebody's dates,
   * headcount and pickup point still sitting there, and must not be able to
   * ask "what dates did I give you?" and be told.
   *
   * The three places context actually lives, all cleared here:
   *
   *   1. React state — messages, slots, conversation id, draft input, error
   *   2. `sessionStorage` — the copy that survives a soft navigation
   *   3. the server's conversation row — abandoned rather than deleted, by
   *      dropping the id. The next message opens a NEW conversation, so the
   *      transcript, the lead and the analytics of the old one stay exactly
   *      where they are. Reset ends a conversation; it does not erase business
   *      records.
   *
   * The server never held the slots in the first place — they travel in each
   * request and come back in each reply — so once the client forgets them,
   * there is nothing left anywhere that could restore them.
   */
  const endConversation = useCallback(() => {
    /**
     * Tell the server the conversation is over, before forgetting the id.
     *
     * `sendBeacon` rather than `fetch`: it survives the visitor closing the tab
     * a moment later, and it cannot delay the panel closing. Nothing is read
     * back and nothing here depends on it succeeding — the reset below is what
     * protects the next visitor, and it runs either way.
     */
    if (conversationId) {
      try {
        navigator.sendBeacon(
          "/api/chat",
          new Blob([JSON.stringify({ action: "end", conversationId })], {
            type: "application/json",
          }),
        );
      } catch {
        /* no beacon support — the row simply stays `active` and ages out */
      }
    }
    setOpen(false);
    setMessages([]);
    setSlots(EMPTY_SLOTS);
    setConversationId(null);
    setInput("");
    setError(null);
    setBusy(false);
    setPicker(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage blocked — the in-memory state above is already cleared */
    }
  }, [conversationId]);

  // Opening greets from local state — see `greetingFor`. Done in the handler,
  // not an effect, so no render cascades and no request is made until the
  // visitor actually says something.
  const openChat = useCallback(() => {
    setOpen(true);
    setMessages((m) => (m.length === 0 ? [greetingFor(locale, can)] : m));
  }, [locale, can]);

  /*
   * Two buttons, two decisions, two events.
   *
   * "Zobacz samochód" and "Zarezerwuj" both used to report `booking_click`, so
   * the funnel could not tell somebody browsing a car page from somebody
   * heading for the form — the two stages had one number between them. They are
   * separate beacons now, both fire-and-forget with `keepalive` so a navigation
   * that starts immediately does not cancel them.
   */
  const track = useCallback(
    (action: "booking_click" | "car_opened") => {
      if (!conversationId) return;
      void fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, conversationId }),
        keepalive: true,
      }).catch(() => {});
    },
    [conversationId],
  );
  const trackBookingClick = useCallback(() => track("booking_click"), [track]);
  const trackCarOpened = useCallback(() => track("car_opened"), [track]);

  /**
   * Whether the launcher may claim the assistant is available.
   *
   * Two facts, no third status system and no request made to draw a dot:
   *
   *   1. This component exists at all only when `chatbot.enabled` is true in
   *      the admin panel. Switched off, the public layout renders nothing here
   *      and `/api/chat` answers 404 — so a green dot on a switched-off
   *      assistant is not a state that can occur.
   *   2. `navigator.onLine` — the browser's own connectivity, not ours. A
   *      device with no network cannot reach the assistant whatever the panel
   *      says, and promising otherwise is the one thing this dot must not do.
   *
   * Deliberately NOT the widget's `error` flag, which was the first instinct:
   * closing the panel clears it, and the launcher is only on screen while the
   * panel is closed, so that branch could never have rendered. A status that
   * cannot go false is decoration wearing a status's clothes.
   *
   * Starts `true` so the server render and the first client render agree; the
   * effect corrects it immediately if the device really is offline.
   */
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  const side = position === "left" ? "left-4 sm:left-6" : "right-4 sm:right-6";

  /**
   * The launcher's own horizontal offset — same setting, hardened.
   *
   * `position: fixed` is measured against the initial containing block, and on
   * a phone that block is NOT the screen: when a page overflows sideways, the
   * layout viewport stretches to the content. This site overflows by 49px at
   * 320px (the header's right-hand cluster is `shrink-0` and simply does not
   * fit), so `right: 1rem` put the launcher's right edge at 353px on a 320px
   * screen — 33px of it, including the arrow, off the glass. Measured on an
   * emulated iPhone SE: `innerWidth` 369, `clientWidth` 320.
   *
   * That is the page's bug, not this button's, and it is not this task's to
   * fix — the old launcher was clipped in exactly the same way. But the button
   * can decline to depend on it: `100vw` still reports the real 320px, so the
   * offset grows by however much the page overruns and the pill stays on
   * screen. On a page that does not overflow the two terms are equal and this
   * is plain `right-4` / `sm:right-6`.
   *
   * Kept separate from `side` above, which the open panel also uses: the panel
   * is full-bleed on mobile and has no such problem, and widening this change
   * to it would be a change nobody asked for.
   */
  const launcherSide =
    position === "left"
      ? "left-[max(1rem,calc(100%_-_100vw_+_1rem))] sm:left-[max(1.5rem,calc(100%_-_100vw_+_1.5rem))]"
      : "right-[max(1rem,calc(100%_-_100vw_+_1rem))] sm:right-[max(1.5rem,calc(100%_-_100vw_+_1.5rem))]";

  return (
    <>
      {/*
        Launcher.
        ---------
        The one control on the site that steps outside the brand book's sharp
        geometry (§10: zero radius, hairlines, no elevation) — on purpose. It is
        not another site button; it is the door to the assistant, sitting on a
        page that is black from edge to edge, and the hairline box that used to
        live here disappeared into that background. Signal red stays reserved
        for the brand, so the rim borrows a palette nothing else on the site
        uses — violet → blue → sky — and the two never compete for the eye.

        Vertical position, in the order things can cover it:
          · 1.5rem, tak samo na telefonie i na monitorze.

            Do 04.09.2026 wieczorem na telefonie stało tu 5rem — stała rezerwa
            na przyklejone wezwanie do rezerwacji, z czasów, gdy nikt tego
            wezwania nie mierzył. Od etapu sprzedażowego 2 mierzone są OBA
            dolne elementy, jakie ta strona ma (`[data-pasek-rezerwacji]`
            i `[data-consent-banner]` — innych na stronach publicznych nie ma,
            sprawdzone), więc rezerwa przestała cokolwiek chronić, a zaczęła
            szkodzić: unosiła uruchamiacz 80 px nad dolną krawędź, czyli
            w środek treści. Zmierzone przy 360 px i 375 px na `/fleet`:
            pigułka przykrywała filtr „Whole rental" (środek przycisku pod
            pigułką, `elementFromPoint`). Przy 5 rem i kole 52 px nie było tego
            widać, bo koło sięgało tylko do 292 px.

            Rezerwa wraca dokładnie wtedy, gdy jest po co — inline `bottom`
            niżej podnosi uruchamiacz o ZMIERZONĄ wysokość obu elementów.
          · `env(safe-area-inset-bottom)` clears the iPhone home indicator,
          · the `max(…, 100% - 100vh + …)` term clears the same overflow the
            horizontal offset does — see `launcherSide`. When the layout
            viewport is stretched past the glass, the bottom of the layout is
            NOT the bottom of the screen: on an emulated iPhone SE the pill's
            last 7px sat under the fold, at 320px its last 28px did. `100vh`
            still reports the real height, so the offset grows by the excess.
            On any page that does not overflow the two terms are equal and this
            is plain `bottom-6`.
          · the inline `bottom` takes over while the cookie banner is up — see
            the measuring effect above; same rule, same two guards.

        Horizontal position is `launcherSide` — the admin panel's own left/right
        setting, hardened against the page's sideways overflow. It is not
        hard-coded here and must not become so.
      */}
      {!open && (
        <button
          type="button"
          onClick={openChat}
          aria-label={
            online
              ? t(
                  locale,
                  "Porozmawiaj z AI — asystent jest dostępny",
                  "Chat with AI — the assistant is available",
                )
              : t(locale, "Porozmawiaj z AI", "Chat with AI")
          }
          /*
            NIEWIDOCZNY DO PIERWSZEGO POMIARU (06.09.2026).

            Uruchamiacz jedzie w HTML-u z serwera, więc maluje się na długo
            przed hydratacją — a wysokość paska zgód zna dopiero po niej.
            Efekt: pigułka pojawiała się nisko i podskakiwała o 176 px
            w chwili hydratacji. `layout-shift` 0,0382 — po naprawie paska
            językowego CAŁA reszta CLS strony głównej.

            `visibility: hidden` to jedyne miejsce, w którym można to przeciąć
            bez zmiany czegokolwiek innego: element bez malowania nie ma
            poprzedniego położenia, więc jego pojawienie się nie jest
            przesunięciem — a że jest `fixed`, nie rusza też niczego wokół.
            Pomiar biegnie w efekcie UKŁADU, czyli przed najbliższym
            malowaniem, więc pigułka zapala się już na swoim miejscu.

            Świadomie nie `hidden`/`display:none`: przycisk ma zostać
            w drzewie dostępności i w DOM od początku, żeby nic nie zależało
            od tego, kiedy dokładnie skończy się hydratacja.
          */
          style={{
            visibility: zmierzony ? undefined : "hidden",
            ...(bannerHeight > 0
              ? {
                  bottom: `max(calc(${bannerHeight + 16}px + env(safe-area-inset-bottom)), calc(100% - 100vh + ${bannerHeight + 16}px))`,
                }
              : null),
          }}
          /* The 2px padding IS the gradient rim: the gradient paints the whole
             button and the inner span covers all of it but the edge. A real
             `border-image` cannot be rounded, and two stacked elements would
             each need their own hover state. */
          /*
            DRUGI PLAN, NIE DRUGA FUNKCJA (04.09.2026).

            Zmierzone na produkcji: ten przycisk miał 248 × 58 px przy ekranie
            390 px, czyli **64 % jego szerokości**, i był najbardziej
            kontrastowym stałym elementem całego serwisu — w kolorach, których
            paleta strony nie zna. Jedyne stałe wezwanie do działania na
            telefonie prowadziło więc do rozmowy, a nie do rezerwacji.

            Asystent zostaje w całości: ta sama logika, ten sam backend, ten
            sam wskaźnik dostępności, ta sama nazwa dla czytnika ekranu. Zmienia
            się wyłącznie to, ile miejsca zajmuje i jak głośno o sobie mówi.

              telefon  — koło 48 × 48 px (pole dotyku 52 px z obwódką), sam
                         znak, napis schowany do `sr-only`; cień słabszy,
                         jasność bez podbicia
              monitor  — pigułka wraca z napisem, ale niższa (52 px zamiast 68)
                         i z tym samym stonowanym cieniem

            Pozycja pionowa i pozioma BEZ ZMIAN — kolizja z paskiem zgód
            i z krawędzią ekranu jest już rozwiązana wyżej i nie ma powodu
            ruszać rachunku, który działa.

            ── WYGLĄD ZATWIERDZONY 04.09.2026 wieczorem ────────────────────

            Czarna kapsuła w neonowej obwódce, TEN SAM język na telefonie
            i na monitorze — różni je wyłącznie rozmiar, nigdy stylistyka.

            NIC SIĘ TU NIE RUSZA. Poprzednia wersja miała pod zieloną kropką
            `animate-ping` — rozlewającą się aureolę, która na zrzucie
            z telefonu zajmowała pół kapsuły i czytała się jako
            zielono-turkusowe wypełnienie. Właściciel odrzucił dokładnie to.
            Kropka ma teraz STAŁY blask, gwiazdka i strzałka też, obwódka
            świeci stałym `box-shadow`, a przy najechaniu zmienia się WYŁĄCZNIE
            siła tego blasku (jedyna zmiana, jedyne przejście — `box-shadow`).
            Zniknęły: pulsowanie kropki, przesuwanie strzałki i wciśnięcie
            skalujące przycisk. `prefers-reduced-motion` nie ma tu nic do
            wyłączenia, bo nie ma ani jednej animacji.

            Wnętrze jest PŁASKĄ czernią (`#050509`), nie gradientem: gradient
            wypełnienia na czarnej stronie czyta się jak zabrudzenie, a nie
            jak głębia. Gradient jest jeden i jest nim obwódka —
            fiolet `#a855f7` → electric blue `#3b82f6` → cyan `#22d3ee`,
            grubsza (2,5 px zamiast 2) i z zewnętrznym bloomem.

            ── POPRZEDNIA POPRAWKA WYGLĄDU, tego samego wieczoru ───────────

            Właściciel obejrzał koło i poprosił o powrót WYGLĄDU pigułki na
            telefonie — znak, zielona kropka, napis, strzałka — przy
            zachowaniu MAŁEGO rozmiaru. To nie jest cofnięcie audytu: audyt
            zakwestionował 248 px na ekranie 390 px, a nie obecność napisu.

            Kompromis został policzony, a nie wyczuty. „Porozmawiaj z AI"
            w Montserrat Semibold ma zmierzone 136 px przy 15 px kroju
            i 114 px przy 12 px. Przy 12 px, wewnętrznym odstępie 10 px,
            znaku 16 px, kropce 8 px, strzałce 12 px i przerwach po 4 px
            pigułka wychodzi ~186 px — mniej niż 248 px sprzed audytu
            i mniej niż 52 % najwęższego telefonu (360 px).

            Odstępy zeszły z 12/6 px na 10/4 px nie dla samej estetyki, tylko
            dlatego, że pierwsza wersja (198 px) przykrywała ŚRODEK dwóch
            przycisków strony: „Zarezerwuj teraz" w bloku otwierającym przy
            360 px i filtra „Za cały wynajem" na `/fleet` przy 430 px —
            oba o 3–5 px. Węższa pigułka odsuwa się od nich o 7–9 px.
            Zmierzone `elementFromPoint`, czyli tym, co widzi palec.

              telefon  — pigułka 50 px + 2 × 2,5 px obwódki = 55 px
                         (pole dotyku z zapasem nad progiem 44 px),
                         napis 13 px, znak 17 px, kropka 9 px, strzałka 12 px,
                         ~200 px szerokości przy polskim napisie (55 % ekranu
                         360 px; przed audytem sprzedażowym było 69 %)
              monitor  — 53 + 5 px = 58 px, napis 15 px, znak 26 px

            12 px nie jest tu wyjątkiem od typografii serwisu — etykiety
            w `TrustStrip` i w panelu rezerwacji stoją na 11 px. Napis wraca
            więc na ekran w kroju, który ta strona już zna.

            Hierarchia bez zmian: to nadal DRUGI PLAN. Przyklejony pas
            [CENA] [ZAREZERWUJ] zostaje głównym wezwaniem, a uruchamiacz
            ustępuje jemu i paskowi zgód tym samym pomiarem, co dotąd —
            patrz efekt mierzący dwa dolne elementy wyżej w tym pliku.
          */
          className={`group fixed bottom-[max(calc(1.5rem_+_env(safe-area-inset-bottom)),calc(100%_-_100vh_+_1.5rem))] z-40 cursor-pointer touch-manipulation rounded-full bg-[linear-gradient(110deg,#a855f7_0%,#3b82f6_50%,#22d3ee_100%)] p-[2.5px] shadow-[0_0_18px_-3px_rgba(99,102,241,0.55),0_0_7px_0_rgba(34,211,238,0.28),0_6px_18px_-10px_rgba(0,0,0,0.9)] transition-[box-shadow] duration-200 select-none hover:shadow-[0_0_24px_-2px_rgba(99,102,241,0.75),0_0_10px_0_rgba(34,211,238,0.4),0_6px_18px_-10px_rgba(0,0,0,0.9)] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-sky-300 ${launcherSide} print:hidden`}
        >
          {/* Telefon: pigułka 48 px + 2×2 obwódki = 52 px, czyli powyżej progu
              44 px, którego potrzebuje kciuk. Monitor: 52 + 4 = 56 px.
              `w-auto`, bo szerokość ma wynikać z napisu, a nie z ekranu —
              stała szerokość albo `w-full` to jest dokładnie ten przycisk,
              który audyt sprzedażowy zdjął ze strony. */}
          <span className="relative flex h-[50px] w-auto items-center justify-start gap-1 rounded-full bg-[#050509] px-2.5 sm:h-[53px] sm:gap-2.5 sm:px-5">
            {/* Drawn, not an emoji: an emoji renders in the platform's own
                colours and cannot pick up the rim's palette. */}
            <svg
              viewBox="0 0 24 24"
              aria-hidden
              focusable="false"
              className="h-[17px] w-[17px] shrink-0 drop-shadow-[0_0_5px_rgba(147,197,253,0.55)] sm:h-[26px] sm:w-[26px]"
            >
              <defs>
                <linearGradient
                  id="aa-chat-spark"
                  x1="2"
                  y1="2"
                  x2="22"
                  y2="22"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop stopColor="#ddd6fe" />
                  <stop offset="0.5" stopColor="#bfdbfe" />
                  <stop offset="1" stopColor="#e0f2fe" />
                </linearGradient>
              </defs>
              <path
                d="M14 4.5C14 11.9 12.4 13.5 5 13.5C12.4 13.5 14 15.1 14 22.5C14 15.1 15.6 13.5 23 13.5C15.6 13.5 14 11.9 14 4.5Z"
                fill="url(#aa-chat-spark)"
              />
              <path
                d="M6 2C6 4.8 5.3 5.5 2.5 5.5C5.3 5.5 6 6.2 6 9C6 6.2 6.7 5.5 9.5 5.5C6.7 5.5 6 4.8 6 2Z"
                fill="url(#aa-chat-spark)"
                opacity="0.7"
              />
            </svg>

            {/*
              Availability, not decoration — see `online` above for what it is
              bound to. Grey and unlit when the claim cannot be made: better to
              say nothing about availability than to promise it.
            */}
            {/* Wskaźnik dostępności ZOSTAJE — od 04.09.2026 wieczorem w wierszu
                przed napisem na KAŻDEJ szerokości, bo pigułka wróciła i róg
                koła, w którym stał na telefonie, przestał istnieć.
                Ta sama zmienna `online`, ta sama zasada: szara i niepulsująca,
                dopóki nie da się uczciwie obiecać, że asystent odpowiada. */}
            <span
              aria-hidden
              className={`flex h-[9px] w-[9px] shrink-0 sm:h-2.5 sm:w-2.5 ${online ? "" : "opacity-70"}`}
            >
              <span
                className={`h-full w-full rounded-full ${
                  online
                    ? "bg-[#22e07a] shadow-[0_0_7px_1px_rgba(34,224,122,0.8)]"
                    : "bg-zinc-500"
                }`}
              />
            </span>

            {/*
              Literal white, not `text-ink`: the pill keeps its dark core in
              both themes, so this is the palette's "ink on a red or
              photographic surface" case, which does not flip.

              JEDEN napis na każdej szerokości: „Porozmawiaj z AI" / „Chat with
              AI". Krótszy wariant („Zapytaj AI") istniał do 04.09.2026 tylko
              po to, żeby zmieścić się w szerokiej pigułce sprzed audytu —
              przy 12 px kroju długi napis mieści się nawet na 360 px i drugi
              wariant przestał mieć powód. Dwa brzmienia tego samego wejścia to
              dwa napisy do utrzymywania i dwa, które kiedyś się rozjadą.

              12 px, nie 15 px: napis ma być czytelny, a nie ma wygrywać
              z „ZAREZERWUJ". Etykiety w `TrustStrip` i w panelu rezerwacji
              stoją na 11 px, więc ten krój jest w tym serwisie u siebie.

              `whitespace-nowrap` bez `truncate`: napis ma stać w JEDNEJ linii
              i nigdy nie zostać przycięty wielokropkiem. Przycięty napis na
              wezwaniu do działania to gorszy stan niż brak wezwania — pigułka
              ma szerokość z zawartości (`w-auto`), więc nie ma czego ciąć.
            */}
            <span className="text-[0.8125rem] font-semibold tracking-[0.01em] whitespace-nowrap text-white sm:text-[0.9375rem]">
              {t(locale, "Porozmawiaj z AI", "Chat with AI")}
            </span>

            <svg
              viewBox="0 0 20 20"
              aria-hidden
              focusable="false"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              /* Strzałka należy do napisu i wraca razem z nim — od 04.09.2026
                 wieczorem także na telefonie, 12 px zamiast 18 px. Odjechała
                 na czas, w którym na telefonie napisu nie było wcale: sama,
                 w kole 48 px, byłaby drugim znakiem obok znaku głównego. */
              className="h-3 w-3 shrink-0 text-cyan-300 drop-shadow-[0_0_4px_rgba(34,211,238,0.6)] sm:h-[1.125rem] sm:w-[1.125rem]"
            >
              <path d="M4 10h11M11 5.5 15.5 10 11 14.5" />
            </svg>
          </span>
        </button>
      )}

      {open && (
        /*
          OKNO stoi WYŻEJ niż przycisk, który je otwiera — i to nie jest
          niekonsekwencja.

          Przycisk ma `z-40` celowo: pasek zgody na ciasteczka (`z-50`) ma go
          przykryć, a nie odwrotnie — dlatego wyżej mierzymy wysokość paska
          i podnosimy przycisk ponad niego. Okno rozmowy jest czym innym:
          w chwili, w której jest otwarte, jest jedyną rzeczą, z którą klient
          rozmawia.

          Na `z-40` przykrywał je przyklejony nagłówek (`sticky top-0 z-50`)
          i zabierał górne 80 px okna — razem z przyciskiem ✕. Zmierzone na
          produkcji 30.08.2026 przy 390 px: klik palcem w środek ✕ trafiał
          w nagłówek i czatu NIE DAŁO SIĘ ZAMKNĄĆ. Po angielsku działał,
          bo tam menu jest krótsze i nagłówek nie sięgał tak nisko — jedna
          usterka, która w drugim języku wyglądała na jej brak.

          `z-[60]` mieści się między nagłówkiem (50) a pełnoekranową galerią
          (100), która ma prawo przykryć wszystko.
        */
        <div
          role="dialog"
          aria-label={name}
          // The inline `bottom` only appears while a keyboard is actually up;
          // otherwise the Tailwind classes are left to do their job untouched.
          // Whichever is currently eating the bottom of the screen wins: the
          // keyboard while typing, the cookie banner before it is answered.
          style={
            Math.max(keyboardInset, bannerHeight) > 0
              ? { bottom: Math.max(keyboardInset, bannerHeight) }
              : undefined
          }
          className={`border-line-strong bg-void fixed inset-x-0 top-16 bottom-0 z-[60] flex flex-col border shadow-2xl sm:inset-auto sm:top-auto sm:bottom-6 sm:h-[min(34rem,calc(100dvh-6rem))] sm:w-[23rem] print:hidden ${side}`}
        >
          <header className="border-line flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
            <div className="min-w-0">
              <p className="text-ink truncate text-sm font-semibold">{name}</p>
              <p className="text-ink-faint text-[10px]">
                {t(locale, "Odpowiada od razu", "Replies instantly")}
              </p>
            </div>
            <button
              type="button"
              onClick={endConversation}
              aria-label={t(locale, "Zamknij czat", "Close chat")}
              // The glyph stays the same size; the hit area around it grows to
              // 44px. Closing a panel is the one action a frustrated visitor
              // must never have to aim for twice.
              className="text-ink-faint hover:text-ink -mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center text-lg leading-none"
            >
              ✕
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div key={i}>
                {m.from === "user" ? (
                  <p className="bg-ink/10 text-ink ml-auto w-fit max-w-[85%] px-3 py-2 text-sm">
                    {(m.blocks[0] as { text: string }).text}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {m.blocks.map((b, j) => (
                      <Block
                        key={j}
                        block={b}
                        locale={locale}
                        onQuick={send}
                        onOpenPicker={openPicker}
                        onPickDates={sendDates}
                        onBookingClick={trackBookingClick}
                        onCarOpened={trackCarOpened}
                        conversationId={conversationId}
                        slots={slots}
                        privacyHref={privacyHref}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <p className="text-ink-faint text-xs">
                {t(locale, "Sprawdzam…", "Checking…")}
              </p>
            )}
            {error && <p className="text-red text-xs">{error}</p>}
          </div>

          {/*
            Stan mikrofonu — jedna linijka NAD wierszem wpisywania.
            ------------------------------------------------------
            Osobny element, a nie coś wciśniętego do środka formularza: wiersz
            wpisywania jest ciasny przy 360 px i każdy dodatkowy napis w nim
            wypchnąłby przycisk „Wyślij" poza ekran. Tutaj rośnie w dół,
            a lista wiadomości (`flex-1`) oddaje mu miejsce.

            `role="status"` + `aria-live="polite"` — czytnik ekranu mówi
            „Słucham…" i „Nie dosłyszałem" sam, bez wyrywania fokusu.
          */}
          {voiceNote && (
            <p
              role="status"
              aria-live="polite"
              className={`shrink-0 px-3 pt-2 text-xs ${
                voice.state === "error" ? "text-red" : "text-ink-faint"
              }`}
            >
              {voiceNote}
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            // `max()` rather than a plain safe-area inset: on a phone the home
            // indicator needs the room, on everything else `env()` is 0 and the
            // padding must not collapse to nothing.
            className="border-line flex shrink-0 items-center gap-2 border-t px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            {/*
              `aria-label` OBOK `placeholder`, nie zamiast niego.

              Podpowiedź w polu jest jedynym opisem, jaki te pola miały, a
              znika w chwili wpisania pierwszej litery. Przeglądarka liczy
              z niej nazwę dostępną (sprawdzone przez CDP 01.09.2026: nazwa
              „Napisz wiadomość…", źródło `placeholder`), więc pole nie było
              bezimienne — ale osoba, która wróciła do niego w połowie zdania,
              słyszała już tylko „pole tekstowe". Etykieta zostaje niezależnie
              od treści; wygląd nie zmienia się o piksel.
            */}
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={MAX_MESSAGE}
              aria-label={t(locale, "Napisz wiadomość", "Type a message")}
              placeholder={t(locale, "Napisz wiadomość…", "Type a message…")}
              className="border-line-strong bg-surface-1 text-ink placeholder:text-ink-faint h-10 min-w-0 flex-1 border px-3 text-sm"
            />

            {/*
              MIKROFON — rysowany TYLKO wtedy, gdy przeglądarka naprawdę umie
              rozpoznawać mowę. Przycisk, który po naciśnięciu tłumaczy się, że
              nie działa, jest gorszy niż jego brak: wygląda na zepsutą stronę,
              a nie na starszą przeglądarkę.

              `h-10 w-10` zgodnie z wysokością wiersza, `tap-area` dokłada pole
              trafienia do 44 px na dotyku, nie ruszając wyglądu — dokładnie ta
              sama sztuczka co przy „✕". Ikona 20 px w polu 40/44 px, więc
              nie jest to „mikroskopijna ikona", a jednocześnie nie próbuje
              konkurować z czerwonym „Wyślij".
            */}
            {voice.supported && (
              <button
                type="button"
                onClick={voice.toggle}
                aria-pressed={listening}
                aria-label={
                  listening
                    ? t(locale, "Zakończ mówienie", "Stop voice input")
                    : t(locale, "Mów zamiast pisać", "Start voice input")
                }
                className={`tap-area border-line-strong bg-surface-1 inline-flex h-10 w-10 shrink-0 items-center justify-center border transition-colors ${
                  listening
                    ? "text-red border-red"
                    : "text-ink-faint hover:text-ink"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden
                  focusable="false"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-5 w-5 ${listening ? "animate-pulse" : ""}`}
                >
                  <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
                  <path d="M5 11v1a7 7 0 0 0 14 0v-1" />
                  <path d="M12 19v3" />
                </svg>
              </button>
            )}

            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="label bg-red hover:bg-red-hover inline-flex h-10 shrink-0 items-center px-4 text-xs text-white transition-colors disabled:opacity-40"
            >
              {t(locale, "Wyślij", "Send")}
            </button>
          </form>

          {/*
            JEDNA LINIJKA O ZAPISIE ROZMOWY (audyt RODO 02.09.2026).

            Do tego dnia klient nie był nigdzie informowany, że rozmowa
            zostaje w bazie na dziewięćdziesiąt dni. Polityka prywatności ma
            teraz osobny punkt 11, ale nikt nie czyta polityki przed napisaniem
            „ile kosztuje RAV4" — informacja musi stać tam, gdzie się pisze.

            Dlatego jedna linijka najmniejszym stopniem pisma, pod polem, poza
            drogą do przycisku „Wyślij": nie zasłania, nie wymaga kliknięcia
            i nie zabiera ani jednego wiersza rozmowie, bo stoi w stopce
            panelu. Odnośnik prowadzi do pełnego punktu w polityce.
          */}
          <p className="text-ink-faint shrink-0 px-3 pb-2 text-[10px] leading-snug">
            {t(
              locale,
              "Rozmowa może być zapisywana. Nie podawaj tu danych wrażliwych. ",
              "Conversations may be stored. Please do not enter sensitive data here. ",
            )}
            <a
              href={
                locale === "en"
                  ? "/en/polityka-prywatnosci"
                  : "/polityka-prywatnosci"
              }
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ink underline underline-offset-2"
            >
              {t(locale, "Polityka prywatności", "Privacy Policy")}
            </a>
          </p>

          {/*
            The calendar.
            ---------------
            Inside the panel, covering only the panel: on a phone that is a
            near-fullscreen sheet without being a separate screen, on a desktop
            it is the 23rem column the conversation already occupies. Two
            consequences, both required by the brief: it can never spill off the
            glass or drag the page sideways, because it inherits the panel's
            box; and closing it uncovers the conversation instead of ending it.

            `absolute` against the panel's own `fixed` box, so the keyboard
            offset and the cookie-banner offset that move the panel move this
            with it.
          */}
          {picker && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t(
                locale,
                "Wybierz termin wynajmu",
                "Choose your rental dates",
              )}
              className="bg-void absolute inset-0 z-10 flex flex-col"
            >
              <header className="border-line flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
                <p className="text-ink truncate text-sm font-semibold">
                  {t(locale, "Wybierz termin", "Choose dates")}
                </p>
                <button
                  type="button"
                  onClick={() => setPicker(null)}
                  aria-label={t(locale, "Zamknij kalendarz", "Close calendar")}
                  className="text-ink-faint hover:text-ink -mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center text-lg leading-none"
                >
                  ✕
                </button>
              </header>
              <div className="min-h-0 flex-1">
                <DateRangePicker
                  locale={locale}
                  initialFrom={picker.from}
                  initialTo={picker.to}
                  onConfirm={sendDates}
                  onCancel={() => setPicker(null)}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/**
 * A booking link with the conversation stapled to it.
 *
 * The car and the dates are already in the href the server built; this adds the
 * one thing only the browser knows — which conversation the customer is in — so
 * the reservation that comes out the other end can be attributed to it. It
 * carries no personal data: an id that points at a conversation row, or nothing
 * at all.
 */
function withConversation(href: string, conversationId: string | null): string {
  if (!conversationId) return href;
  const [path, hash] = href.split("#");
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}rozmowa=${conversationId}${hash ? `#${hash}` : ""}`;
}

/* ── Block renderers ──────────────────────────────────────────────────────── */

function Block({
  block,
  locale,
  onQuick,
  onOpenPicker,
  onPickDates,
  onBookingClick,
  onCarOpened,
  conversationId,
  slots,
  privacyHref,
}: {
  block: ChatBlock;
  locale: Locale;
  onQuick: (value: string) => void;
  /** Open the calendar, seeded with a range when there is one. */
  onOpenPicker: (from: string | null, to: string | null) => void;
  /** A range the customer settled on without opening the calendar. */
  onPickDates: (from: string, to: string) => void;
  onBookingClick: () => void;
  /** "Zobacz samochód" — browsing, which is not the same as going to book. */
  onCarOpened: () => void;
  conversationId: string | null;
  slots: ChatSlots;
  privacyHref: string;
}) {
  switch (block.kind) {
    case "text":
      return (
        <p className="text-ink text-sm whitespace-pre-line">{block.text}</p>
      );

    case "quick":
      return (
        <div className="flex flex-wrap gap-2">
          {block.options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onQuick(o.value)}
              // `min-h-11` = 44px, the smallest target a thumb hits reliably.
              // These were 30px: fine for a mouse, a coin-toss on a phone. A
              // browser run on 360×800 measured them and that is why this is a
              // number rather than a guess.
              className="border-line-strong text-ink hover:border-ink hover:bg-ink/5 inline-flex min-h-11 items-center border px-3 py-2 text-xs transition-colors"
            >
              {o.label}
            </button>
          ))}
        </div>
      );

    case "cars":
      return (
        <div className="space-y-3">
          {block.cars.map((c) => (
            <article key={c.modelId} className="border-line border">
              {c.image && (
                <div className="bg-surface-1 relative h-32 w-full">
                  <Image
                    src={c.image}
                    alt={c.name}
                    fill
                    sizes="360px"
                    className="object-cover"
                  />
                </div>
              )}
              <div className="p-3">
                <p className="text-ink text-sm font-semibold">{c.name}</p>
                <p className="text-ink-faint mt-1 text-xs">
                  {c.seats} {t(locale, "miejsc", "seats")} ·{" "}
                  {t(
                    locale,
                    c.gearbox === "automatic" ? "automat" : "manualna",
                    c.gearbox,
                  )}{" "}
                  · {c.fuel}
                </p>
                <dl className="mt-2 space-y-0.5 text-xs">
                  {/* A car with no priced period says so instead of showing
                      "0 zł / doba". The label changes with it: "Cena od" next
                      to a sentence would read as a broken field, so the row
                      becomes a single statement. */}
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-faint">
                      {c.fromDailyGrosze > 0
                        ? t(locale, "Cena od", "From")
                        : t(locale, "Cena", "Price")}
                    </dt>
                    <dd className="text-ink tabular-nums">
                      {c.fromDailyGrosze > 0 ? (
                        <>
                          {money(c.fromDailyGrosze, locale)}
                          {t(locale, " / doba", " / day")}
                        </>
                      ) : (
                        t(
                          locale,
                          "ustalana indywidualnie",
                          "quoted individually",
                        )
                      )}
                    </dd>
                  </div>
                  {/* Hidden at zero rather than printed as "0 zł", matching
                      what the booking panel already does. A zero deposit is
                      ambiguous — it can mean "none required" or "not set yet" —
                      and the card is not the place to guess which. */}
                  {c.depositGrosze > 0 && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-faint">
                        {t(locale, "Kaucja", "Deposit")}
                      </dt>
                      <dd className="text-ink tabular-nums">
                        {money(c.depositGrosze, locale)}
                      </dd>
                    </div>
                  )}
                  {/* Availability, in the two states it actually has.

                      `bookableUnits === 0` means the model has no rentable car
                      at all — every unit sold, in service or withdrawn — and it
                      is true whether or not dates were given. It used to be
                      shown only WITH dates, so a Renault Trafic whose only van
                      sits in the workshop looked exactly like a free one, and
                      the assistant offered it as "co mogę zaproponować dla 7
                      osób". A different date cannot help there, which is why
                      this line replaces the per-dates line rather than joining
                      it. */}
                  {c.bookableUnits === 0 ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-faint">
                        {t(locale, "Dostępność", "Availability")}
                      </dt>
                      <dd className="text-red text-right">
                        {t(
                          locale,
                          "chwilowo niedostępny",
                          "temporarily unavailable",
                        )}
                      </dd>
                    </div>
                  ) : (
                    c.freeUnits !== null && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-ink-faint">
                          {t(locale, "W tym terminie", "For your dates")}
                        </dt>
                        <dd
                          className={
                            c.freeUnits > 0 ? "text-emerald-400" : "text-red"
                          }
                        >
                          {c.freeUnits > 0
                            ? t(locale, "wolne", "available")
                            : t(locale, "zajęte", "booked")}
                        </dd>
                      </div>
                    )
                  )}
                </dl>
                {/* Two buttons, two destinations.
                    They used to share one href, so "Zarezerwuj" dropped the
                    customer at the top of the car page and left them to find
                    the form — a long scroll on a phone, and the reason the
                    button felt like it did nothing. "Zarezerwuj" now lands on
                    the form itself, with the dates and pickup point already in
                    the URL; "Szczegóły" still opens the page from the top.
                    Both are 44px tall, the smallest target a thumb hits. */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={withConversation(c.bookHref, conversationId)}
                    onClick={onCarOpened}
                    className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 inline-flex min-h-11 items-center border px-3 text-[10px] transition-colors"
                  >
                    {t(locale, "Zobacz samochód", "View car")}
                  </a>
                  <a
                    href={withConversation(
                      `${c.bookHref}#rezerwacja`,
                      conversationId,
                    )}
                    onClick={onBookingClick}
                    className="label bg-red hover:bg-red-hover inline-flex min-h-11 items-center px-3 text-[10px] text-white transition-colors"
                  >
                    {t(locale, "Zarezerwuj", "Book")}
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      );

    case "quote": {
      const q = block.quote;
      return (
        <div className="border-line-strong border p-3">
          <p className="text-ink text-sm font-semibold">{q.car.name}</p>
          <p className="text-ink-faint mt-0.5 text-xs">
            {q.dateFrom} – {q.dateTo} · {q.days} {t(locale, "dni", "days")}
          </p>
          <dl className="mt-3 space-y-1 text-xs">
            <Row
              label={t(locale, "Stawka za dobę", "Per day")}
              value={money(q.dailyGrosze, locale)}
            />
            <Row
              label={t(locale, "Wynajem", "Rental")}
              value={money(q.rentalGrosze, locale)}
            />
            {q.locationName && (
              <Row
                label={q.locationName}
                value={
                  q.locationFeeGrosze === 0
                    ? t(locale, "bez dopłaty", "no fee")
                    : money(q.locationFeeGrosze, locale)
                }
              />
            )}
            <div className="border-line mt-1 flex justify-between gap-2 border-t pt-1">
              <dt className="text-ink font-semibold">
                {t(locale, "Razem", "Total")}
              </dt>
              <dd className="text-ink font-semibold tabular-nums">
                {money(q.totalGrosze, locale)}
              </dd>
            </div>
            <Row
              label={t(locale, "Kaucja zwrotna", "Refundable deposit")}
              value={money(q.depositGrosze, locale)}
            />
          </dl>
          <p className="text-ink-faint mt-2 text-[10px]">
            {t(
              locale,
              "Cena z aktualnego cennika, bez usług dodatkowych. Ostateczną kwotę potwierdza formularz rezerwacji.",
              "From the current price list, extras not included. The booking form confirms the final amount.",
            )}
          </p>
          <p
            className={`mt-2 text-xs ${q.available ? "text-emerald-400" : "text-red"}`}
          >
            {q.available
              ? t(
                  locale,
                  "✓ Dostępne w tym terminie",
                  "✓ Available for these dates",
                )
              : t(
                  locale,
                  "✕ Niedostępne w tym terminie",
                  "✕ Not available for these dates",
                )}
          </p>
          {q.available && (
            <a
              // Same fix as the car cards: land on the form, not the page top.
              href={withConversation(
                `${q.car.bookHref}#rezerwacja`,
                conversationId,
              )}
              onClick={onBookingClick}
              className="label bg-red hover:bg-red-hover mt-3 inline-flex min-h-11 items-center px-4 text-[10px] text-white transition-colors"
            >
              {t(locale, "Zarezerwuj", "Book")}
            </a>
          )}
        </div>
      );
    }

    case "compare":
      return (
        <div className="border-line overflow-x-auto border">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-line border-b">
                <th className="text-ink-faint p-2 font-normal" />
                {block.cars.map((c) => (
                  <th key={c.modelId} className="text-ink p-2">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r) => (
                <tr
                  key={r.label}
                  className="border-line/60 border-b last:border-0"
                >
                  <th className="text-ink-faint p-2 font-normal">{r.label}</th>
                  {r.values.map((v, i) => (
                    <td key={i} className="text-ink p-2 tabular-nums">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "contact":
      return (
        <div className="border-line space-y-2 border p-3">
          {block.phones.map((p) => (
            <div key={p.number} className="flex flex-wrap items-center gap-2">
              <a
                href={`tel:${p.number.replace(/\s/g, "")}`}
                className="label border-line-strong text-ink hover:border-ink inline-flex h-8 items-center border px-3 text-[10px]"
              >
                📞 {p.number}
              </a>
              {p.whatsapp && (
                <a
                  href={`https://wa.me/${p.whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="label border-line-strong text-ink hover:border-ink inline-flex h-8 items-center border px-3 text-[10px]"
                >
                  WhatsApp
                </a>
              )}
            </div>
          ))}
          {block.email && (
            <a
              href={`mailto:${block.email}`}
              className="label border-line-strong text-ink hover:border-ink inline-flex h-8 items-center border px-3 text-[10px]"
            >
              ✉ {block.email}
            </a>
          )}
          <p className="text-ink-faint text-[10px]">{block.hours}</p>
        </div>
      );

    case "lead":
      return (
        <LeadForm
          notice={block.notice}
          locale={locale}
          conversationId={conversationId}
          slots={slots}
          privacyHref={privacyHref}
          known={block.known}
        />
      );

    case "link":
      return (
        <a
          href={withConversation(block.href, conversationId)}
          onClick={onBookingClick}
          className="label bg-red hover:bg-red-hover inline-flex h-9 items-center px-4 text-[10px] text-white transition-colors"
        >
          {block.label}
        </a>
      );

    case "dates":
      return (
        <DatesBlock
          block={block}
          locale={locale}
          onOpenPicker={onOpenPicker}
          onPickDates={onPickDates}
        />
      );
  }
}

/* ── Dates ────────────────────────────────────────────────────────────────── */

/** `22.08` — a chip has room for a day and a month, not for a year. */
const shortDay = (iso: string, locale: Locale) =>
  locale === "en"
    ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
    : `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

/**
 * The shortcuts, resolved against the visitor's own clock.
 *
 * Never a hardcoded date: the server sends the NAME of a shortcut and this
 * turns it into days, at the moment of the tap. A panel left open overnight
 * therefore cannot offer yesterday, and "ten weekend" cannot mean the weekend
 * that was current when the message was written.
 *
 * The weekend is computed by the same function the message parser uses for the
 * word "weekend", so the button and the sentence can never disagree.
 */
function shortcutRange(kind: DateShortcut): { from: string; to: string } {
  const today = todayIso();
  switch (kind) {
    case "today":
      return { from: today, to: today };
    case "tomorrow": {
      const d = addDaysIso(today, 1);
      return { from: d, to: d };
    }
    case "weekend":
      return weekendRange(new Date(), false);
    case "next_weekend":
      return weekendRange(new Date(), true);
  }
}

function shortcutLabel(kind: DateShortcut, locale: Locale): string {
  switch (kind) {
    case "today":
      return t(locale, "Dzisiaj", "Today");
    case "tomorrow":
      return t(locale, "Jutro", "Tomorrow");
    case "weekend":
      return t(locale, "Najbliższy weekend", "This weekend");
    case "next_weekend":
      return t(locale, "Kolejny weekend", "Next weekend");
  }
}

/**
 * The date block: an invitation, or a receipt.
 *
 * With no range it offers shortcuts and the calendar. With one it states the
 * term the assistant is working with and offers to change it — which is the
 * whole of the "do not ask twice" rule as the customer experiences it: dates
 * that are already known are shown, never asked for again.
 */
function DatesBlock({
  block,
  locale,
  onOpenPicker,
  onPickDates,
}: {
  block: Extract<ChatBlock, { kind: "dates" }>;
  locale: Locale;
  onOpenPicker: (from: string | null, to: string | null) => void;
  onPickDates: (from: string, to: string) => void;
}) {
  const known = Boolean(block.from && block.to);
  const days = block.from && block.to ? inclusiveDays(block.from, block.to) : 0;

  return (
    <div className="border-line border p-3">
      {known ? (
        <>
          <p className="label-tight text-silver text-[10px]">
            {t(locale, "TERMIN", "DATES")}
          </p>
          <p className="text-ink mt-1 text-sm tabular-nums">
            {formatRange(block.from!, block.to!, locale)}
          </p>
          <p className="text-ink-faint mt-0.5 text-[10px]">
            {days}{" "}
            {t(
              locale,
              days === 1 ? "dzień" : "dni",
              days === 1 ? "day" : "days",
            )}
          </p>
        </>
      ) : (
        <>
          <p className="label-tight text-silver text-[10px]">
            {t(locale, "WYBIERZ TERMIN", "CHOOSE DATES")}
          </p>
          {block.shortcuts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {block.shortcuts.map((kind) => {
                const range = shortcutRange(kind);
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => onPickDates(range.from, range.to)}
                    // 44px, like every other tappable thing in the panel.
                    className="border-line-strong text-ink hover:border-ink hover:bg-ink/5 inline-flex min-h-11 flex-col items-start justify-center border px-3 py-1.5 text-xs transition-colors"
                  >
                    <span>{shortcutLabel(kind, locale)}</span>
                    {/* The dates themselves, so a shortcut can never be
                        mistaken for a different week than it means. */}
                    <span className="text-ink-faint text-[10px] tabular-nums">
                      {range.from === range.to
                        ? shortDay(range.from, locale)
                        : `${shortDay(range.from, locale)} – ${shortDay(range.to, locale)}`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      <button
        type="button"
        onClick={() => onOpenPicker(block.from, block.to)}
        className="label bg-red hover:bg-red-hover mt-3 inline-flex min-h-11 items-center px-4 text-[10px] text-white transition-colors"
      >
        {block.openLabel}
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="text-ink tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * The callback form.
 *
 * Nothing is sent until the visitor presses the button, and the button sits
 * directly under a sentence saying what the data is used for with a link to the
 * privacy policy. That press is what the server records as consent — there is
 * no path that writes a phone number without it.
 */
function LeadForm({
  notice,
  locale,
  conversationId,
  slots,
  privacyHref,
  known,
}: {
  notice: string;
  locale: Locale;
  conversationId: string | null;
  slots: ChatSlots;
  privacyHref: string;
  /** Kontakt, który ta rozmowa już zostawiła — patrz `withKnownContact`. */
  known?: { name: string | null; phone: string | null; email: string | null };
}) {
  /*
   * Pola wypełnione tym, co klient JUŻ podał w tej rozmowie. Nadal edytowalne
   * — to jest podpowiedź, nie zamknięcie: ktoś, kto chce oddzwonienia na inny
   * numer, poprawia jedno pole zamiast wpisywać trzy.
   */
  const [name, setName] = useState(known?.name ?? "");
  const [phone, setPhone] = useState(known?.phone ?? "");
  const [email, setEmail] = useState(known?.email ?? "");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  if (state === "done") {
    return <p className="text-xs text-emerald-400">{message}</p>;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() && !email.trim()) {
      setState("error");
      setMessage(
        t(
          locale,
          "Podaj numer telefonu lub e-mail.",
          "Enter a phone number or e-mail.",
        ),
      );
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "lead",
          conversationId,
          name,
          phone,
          email,
          locale,
          slots,
          consent: true,
        }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "failed");
      setState("done");
      setMessage(data.message ?? t(locale, "Dziękujemy.", "Thank you."));
    } catch {
      setState("error");
      setMessage(
        t(
          locale,
          "Nie udało się wysłać. Spróbuj ponownie.",
          "Could not send. Please try again.",
        ),
      );
    }
  };

  const field =
    "h-9 w-full border border-line-strong bg-surface-1 px-2 text-xs text-ink placeholder:text-ink-faint";

  return (
    <form onSubmit={submit} className="border-line space-y-2 border p-3">
      {/* Ten sam powód co przy polu wiadomości: podpowiedź znika po wpisaniu.
          To formularz, przez który klient zostawia kontakt — najgorsze
          miejsce na pole, które w połowie wypełniania przestaje się
          przedstawiać. `autoComplete` dokłada WCAG 1.3.5, tak jak w
          formularzach na stronie. */}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label={t(locale, "Imię (opcjonalnie)", "Name (optional)")}
        autoComplete="name"
        placeholder={t(locale, "Imię (opcjonalnie)", "Name (optional)")}
        maxLength={120}
        className={field}
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        aria-label={t(locale, "Telefon", "Phone")}
        autoComplete="tel"
        placeholder={t(locale, "Telefon", "Phone")}
        maxLength={40}
        inputMode="tel"
        className={field}
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-label="E-mail"
        autoComplete="email"
        placeholder="E-mail"
        maxLength={200}
        inputMode="email"
        className={field}
      />
      <p className="text-ink-faint text-[10px]">
        {notice}{" "}
        <a
          href={privacyHref}
          className="underline underline-offset-2"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t(locale, "Polityka prywatności", "Privacy Policy")}
        </a>
      </p>
      <button
        type="submit"
        disabled={state === "sending"}
        className="label bg-red hover:bg-red-hover inline-flex h-9 items-center px-4 text-[10px] text-white transition-colors disabled:opacity-50"
      >
        {state === "sending"
          ? t(locale, "Wysyłanie…", "Sending…")
          : t(locale, "Poproś o kontakt", "Request a callback")}
      </button>
      {state === "error" && <p className="text-red text-[10px]">{message}</p>}
    </form>
  );
}
