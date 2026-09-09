import { NextResponse, after, type NextRequest } from "next/server";
import { z } from "zod";
import { clientIpOfRequest as clientIp } from "@/lib/security/client-ip";
import { notifyInboxLead } from "@/lib/inbox/notify";
import { reportAlert } from "@/lib/alerts/record";
import { getSetting } from "@/lib/admin/settings";
import { DeterministicProvider } from "@/lib/chat/deterministic";
import { categorise, INTENTS, normalize, parse } from "@/lib/chat/nlu";
import { validPickedDates, withPickedDates } from "@/lib/chat/picker";
import { getVocabulary } from "@/lib/chat/data";
import { getEurRate } from "@/lib/currency/rate";
import {
  contactLeftInConversation,
  conversationExists,
  createLead,
  endConversation,
  markCarOpened,
  logUnanswered,
  markBookingFormStarted,
  markWentToBooking,
  recordTurn,
  startConversation,
  recordDemand,
  settleUnanswered,
  pendingUnanswered,
} from "@/lib/chat/repo";
import { EMPTY_SLOTS, type ChatReply, type ChatSlots } from "@/lib/chat/types";
import { readHybrid, aiLogLine } from "@/lib/chat/ai/provider";
import { getDb } from "@/lib/db";
import { komunikatSesji, sprawdzSesjeCzatu } from "@/lib/chat/session-guard";
import { countRecent, recordSecurityEvent } from "@/lib/security/events";

/**
 * The assistant's public endpoint — the one part of this feature that anyone on
 * the internet can reach.
 *
 * Its defences, in the order an attacker meets them:
 *
 * 1. **Off means off.** If the admin switch is off, this returns 404 before
 *    touching the database. There is no "disabled but still answering" state.
 * 2. **Rate limiting per address**, in memory, forgetful by design (see below).
 * 3. **Schema validation** — an oversized or malformed body is rejected before
 *    any handler runs. The message is capped at 500 characters: no legitimate
 *    question is longer, and a 100 KB "message" is not a question.
 * 4. **The provider can only read.** `lib/chat/data` exposes fleet, prices,
 *    availability, FAQ and contact details. There is no function there that
 *    writes anything or reads a customer, so no input — however cleverly
 *    phrased — can reach one. This is the actual security boundary; the
 *    OUT_OF_SCOPE refusal message is only politeness on top of it.
 * 5. **Slots come back from the client, so they are re-validated.** A forged
 *    `carModelIds` is just an id that either resolves against the live fleet or
 *    does not; a forged price is impossible because the client never sends one.
 *
 * Deliberately absent: any echo of server configuration, environment variables
 * or error internals. A failure returns a fixed Polish sentence.
 */

export const dynamic = "force-dynamic";

/* ── Rate limiting ────────────────────────────────────────────────────────── */

/**
 * Two windows, same spirit as the login limiter in `proxy.ts`: generous enough
 * that a real conversation never notices, in memory only so it can never become
 * a permanent block, and forgetful across restarts.
 */
const BURST_WINDOW_MS = 60_000;
const BURST_MAX = 12; // messages per minute
const HOUR_WINDOW_MS = 60 * 60_000;
const HOUR_MAX = 120; // messages per hour

const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < HOUR_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);

  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= HOUR_WINDOW_MS)) hits.delete(key);
    }
  }

  const burst = recent.filter((t) => now - t < BURST_WINDOW_MS).length;
  return burst > BURST_MAX || recent.length > HOUR_MAX;
}

/**
 * Adresy, o które ten proces zdążył już zapytać bazę. Jeden wpis na adres, na
 * całe życie procesu — pytanie niżej nie może zamienić się w zapytanie na
 * każdą wiadomość.
 */
const sprawdzoneWBazie = new Set<string>();

/**
 * PAMIĘĆ PO RESTARCIE — druga warstwa tego samego limitu.
 *
 * Wiadra wyżej żyją w pamięci procesu, więc restart aplikacji dawał czystą
 * kartę każdemu, kto wcześniej ten endpoint zalewał (audyt 02.09.2026, P8).
 * Nie ma tu nowej tabeli i nie ma migracji: każde przekroczenie limitu ZAWSZE
 * zostawiało ślad w `security_events` jako `chat_flood`, więc historia już
 * istnieje — brakowało tylko jej odczytania.
 *
 * Na pierwsze żądanie z danego adresu w tym procesie sprawdzamy, ile razy ten
 * adres wpadł na limit w ostatniej godzinie, i tyle znaczników wkładamy do
 * jego wiadra. Znaczniki są datowane na **pół godziny wstecz**, nie na teraz,
 * i to jest cała subtelność: liczą się do progu godzinowego (120), ale NIE
 * wpadają do okna minutowego (12). Ktoś, kto raz przekroczył limit i wrócił po
 * wdrożeniu, nie zostaje przez to zablokowany; ktoś, kto zalewał endpoint
 * setki razy, wraca tuż pod sufitem, na którym skończył.
 *
 * Koszt: JEDNO zapytanie na adres na proces. Nie na wiadomość.
 *
 * Czego to NIE robi: nie jest wspólnym licznikiem dla wielu kontenerów.
 * Współdzielony jest sam SYGNAŁ o zalewaniu, nie bieżące wiadro — pełny
 * licznik między procesami wymagałby własnej tabeli i zapisu przy każdej
 * wiadomości, czyli dołożenia bazy do ścieżki, która dziś działa bez niej.
 */
async function przypomnijSobieZalewanie(ip: string): Promise<void> {
  if (sprawdzoneWBazie.has(ip) || hits.has(ip)) return;
  sprawdzoneWBazie.add(ip);
  // Higiena pamięci taka sama jak przy wiadrach — zbiór nie rośnie bez końca.
  if (sprawdzoneWBazie.size > 5000) sprawdzoneWBazie.clear();

  const ile = await countRecent("chat_flood", HOUR_WINDOW_MS, ip);
  if (ile <= 0) return;

  const polGodzinyTemu = Date.now() - HOUR_WINDOW_MS / 2;
  hits.set(
    ip,
    Array.from({ length: Math.min(ile, HOUR_MAX) }, () => polGodzinyTemu),
  );
}

/**
 * Stamp the conversation onto every car link the assistant just produced.
 *
 * The booking form reports "the visitor started filling me in" by posting the
 * conversation id it was given — and it is given one only when the URL that
 * opened it carried `?rozmowa=`. The assistant's own car cards never carried
 * it: `toCard` builds `od`, `do`, `odbior` and `zrodlo`, and nothing else. So
 * the whole chat → car → form step of the funnel recorded `false` for every
 * conversation there has ever been, while `went_to_booking` (posted by the
 * widget, which knows the id) worked fine. Found in the audit of 22.08.2026.
 *
 * Done here rather than inside `toCard` on purpose. The data layer builds cards
 * from the fleet and has no business knowing which conversation asked; the
 * route is the one place that already holds the id. Threading it down through
 * `findCars` would have put a conversation identifier into half a dozen
 * signatures to serve one query parameter.
 *
 * The id is a UUID — an opaque key that is already in this response body and in
 * the widget's own state. No personal data enters the URL, and no second
 * identification scheme is created.
 */
function withConversationLinks(
  blocks: ChatReply["blocks"],
  conversationId: string,
): ChatReply["blocks"] {
  const stamp = (href: string) =>
    href.includes("rozmowa=")
      ? href
      : `${href}${href.includes("?") ? "&" : "?"}rozmowa=${conversationId}`;

  return blocks.map((b) => {
    if (b.kind === "cars") {
      return {
        ...b,
        cars: b.cars.map((c) => ({ ...c, bookHref: stamp(c.bookHref) })),
      };
    }
    if (b.kind === "quote") {
      return {
        ...b,
        quote: {
          ...b.quote,
          car: { ...b.quote.car, bookHref: stamp(b.quote.car.bookHref) },
        },
      };
    }
    if (b.kind === "compare") {
      return {
        ...b,
        cars: b.cars.map((c) => ({ ...c, bookHref: stamp(c.bookHref) })),
      };
    }
    return b;
  });
}

/**
 * Wypełnij formularz kontaktu tym, co ta rozmowa już zostawiła.
 *
 * REGUŁA ETAPU 44D: o informację, którą asystent ma z bieżącej rozmowy, nie
 * pytamy drugi raz. Formularz pojawia się w kilkunastu odpowiedziach — przy
 * wycenie indywidualnej, przy pytaniu o warunki, przy aucie spoza floty —
 * a klient, który zostawił numer piętnaście minut wcześniej, zastawał trzy
 * puste pola i pytanie zadane od nowa.
 *
 * Tutaj, a nie w regułach: `DeterministicProvider` odpowiada na jedną
 * wiadomość i celowo nie ma dostępu do bazy poza warstwą `lib/chat/data`,
 * która nie czyta klientów. Trasa już trzyma identyfikator rozmowy i już
 * stempluje nim odnośniki — to jest to samo miejsce i ta sama odpowiedzialność.
 *
 * Zwracamy WYŁĄCZNIE kontakt, który przyszedł z tej rozmowy, wyszukany po jej
 * własnym identyfikatorze. Żadne zgłoszenie z innej rozmowy ani z formularza
 * publicznego tędy nie wychodzi: `conversation_id` jest tu jedynym kluczem,
 * a nie jest zgadywalny.
 */
async function withKnownContact(
  blocks: ChatReply["blocks"],
  conversationId: string,
): Promise<ChatReply["blocks"]> {
  if (!blocks.some((b) => b.kind === "lead")) return blocks;

  const known = await contactLeftInConversation(conversationId);
  if (!known) return blocks;

  return blocks.map((b) => (b.kind === "lead" ? { ...b, known } : b));
}

/* ── Request shape ────────────────────────────────────────────────────────── */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const slotsSchema = z.object({
  carModelIds: z.array(z.string().regex(UUID_RE)).max(3).default([]),
  /*
   * The axes the search runs on, all three round-tripped through the browser.
   *
   * They were missing here until 22.08.2026, and Zod strips what it does not
   * declare — so the server answered "Szukam SUV-a" with six SUVs, handed the
   * widget `bodyType: "suv"`, and then threw it away the moment the widget sent
   * it back. "Dla 5 osób" one message later returned nine cars: every model
   * seating five, the SUV the visitor had actually asked for silently
   * forgotten. Closed enums rather than free strings, for the same reason as
   * `dateIntent` below — these choose which rows a query returns.
   */
  bodyType: z.enum(["suv", "sedan", "van"]).nullable().default(null),
  driverClass: z
    .enum(["standard", "premium", "van_bus"])
    .nullable()
    .default(null),
  /**
   * The budget, as four fields that travel together. Grosze, clamped: a forged
   * value can only narrow the visitor's own results.
   *
   * `budgetKind` decides whether the two amounts are per day or for the whole
   * rental, so it is a closed enum — a free string here would be read as
   * "per day" and quote the wrong cars at somebody who typed a weekly figure.
   */
  budgetGrosze: z
    .number()
    .int()
    .min(0)
    .max(10_000_000)
    .nullable()
    .default(null),
  budgetMinGrosze: z
    .number()
    .int()
    .min(0)
    .max(10_000_000)
    .nullable()
    .default(null),
  budgetKind: z.enum(["day", "total"]).nullable().default(null),
  budgetCurrency: z.enum(["pln", "eur"]).nullable().default(null),
  segment: z.string().max(40).nullable().default(null),
  seats: z.number().int().min(1).max(9).nullable().default(null),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  locationId: z.string().regex(UUID_RE).nullable().default(null),
  awaiting: z
    .enum([
      "seats",
      "dates",
      "location",
      "which_car",
      "lead_contact",
      "confirm_intent",
    ])
    .nullable()
    .default(null),
  pendingIntent: z.string().max(30).nullable().default(null),
  // A closed enum rather than a loose string: this one decides which handler
  // runs when a range comes back from the calendar, so an unknown value must
  // not reach the router at all.
  dateIntent: z.enum(INTENTS).nullable().default(null),
  // Round-tripped through the browser, so both are clamped. The worst a forged
  // value can do is bring forward or suppress one optional question.
  turns: z.number().int().min(0).max(200).default(0),
  nudged: z.boolean().default(false),
  lastDemand: z.string().max(120).nullable().default(null),
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("message"),
    conversationId: z.string().regex(UUID_RE).nullable().default(null),
    message: z.string().trim().min(1).max(500),
    locale: z.enum(["pl", "en"]).default("pl"),
    slots: slotsSchema.optional(),
    /**
     * A range chosen in the calendar, sent beside the message rather than
     * inside it.
     *
     * Shape only here; `validPickedDates` then checks it against the booking
     * rules — past days, backwards ranges, over-long or too-distant rentals are
     * dropped and the turn continues as an ordinary message. Nothing here can
     * reach a price or an availability answer except as two dates.
     */
    dates: z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .nullish(),
  }),
  z.object({
    action: z.literal("lead"),
    conversationId: z.string().regex(UUID_RE).nullable().default(null),
    name: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(40).optional(),
    email: z.string().trim().max(200).optional(),
    locale: z.enum(["pl", "en"]).default("pl"),
    slots: slotsSchema.optional(),
    /** The visitor pressed the consent button. Absent = no row is written. */
    consent: z.literal(true),
  }),
  z.object({
    action: z.literal("booking_click"),
    conversationId: z.string().regex(UUID_RE),
  }),
  /**
   * The visitor opened a car the assistant showed — "Zobacz samochód", not
   * "Zarezerwuj". Carries an id and nothing else, so a forged one can only mark
   * an abandoned conversation as having looked at a car.
   */
  z.object({
    action: z.literal("car_opened"),
    conversationId: z.string().regex(UUID_RE),
  }),
  /**
   * The booking page mounted with this conversation on it — the funnel stage
   * between the click and the finished reservation. Carries an id and nothing
   * else, so a forged one can only mark an abandoned conversation as having
   * reached the form; it reads nothing back and destroys nothing.
   */
  z.object({
    action: z.literal("booking_form_started"),
    conversationId: z.string().regex(UUID_RE),
  }),
  /**
   * The visitor closed the panel. Carries an id and nothing else, so the worst
   * a forged one can do is close a conversation that was already abandoned —
   * it reads no data back and destroys none.
   */
  z.object({
    action: z.literal("end"),
    conversationId: z.string().regex(UUID_RE),
  }),
]);

const FAILED = { error: "Nie udało się przetworzyć wiadomości." };

export async function POST(request: NextRequest) {
  const settings = await getSetting("chatbot");
  // The single off switch. Nothing below this line runs when it is off.
  if (!settings.enabled) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const ip = clientIp(request);
  await przypomnijSobieZalewanie(ip);
  if (rateLimited(ip)) {
    /*
      Limit po adresie istniał od początku; nowe jest to, że zostawia ŚLAD.
      Jedno przekroczenie nikogo nie interesuje — dopiero seria z tego samego
      skróconego identyfikatora pokazuje, że ktoś siedzi na tym endpoincie.
    */
    void recordSecurityEvent({
      kind: "chat_flood",
      endpoint: "/api/chat",
      subject: ip,
      detail: { warstwa: "ip" },
    });
    return NextResponse.json(
      { error: "Za dużo wiadomości. Spróbuj ponownie za chwilę." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(FAILED, { status: 400 });
  }

  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(FAILED, { status: 400 });
  }
  const input = parsedBody.data;

  try {
    if (input.action === "booking_click") {
      if (await conversationExists(input.conversationId)) {
        await markWentToBooking(input.conversationId);
      }
      return NextResponse.json({ ok: true });
    }

    if (input.action === "car_opened") {
      if (await conversationExists(input.conversationId)) {
        await markCarOpened(input.conversationId);
      }
      return NextResponse.json({ ok: true });
    }

    if (input.action === "booking_form_started") {
      if (await conversationExists(input.conversationId)) {
        await markBookingFormStarted(input.conversationId);
      }
      return NextResponse.json({ ok: true });
    }

    if (input.action === "end") {
      if (await conversationExists(input.conversationId)) {
        await endConversation(input.conversationId);
      }
      return NextResponse.json({ ok: true });
    }

    if (input.action === "lead") {
      // A lead with no way to reach anyone is not a lead.
      if (!input.phone && !input.email) {
        return NextResponse.json(
          { error: "Podaj numer telefonu lub adres e-mail." },
          { status: 400 },
        );
      }
      const conversationId =
        input.conversationId && (await conversationExists(input.conversationId))
          ? input.conversationId
          : null;

      try {
        const saved = await createLead({
          conversationId,
          name: input.name?.trim() || null,
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          slots: { ...EMPTY_SLOTS, ...(input.slots ?? {}) } as ChatSlots,
          topic: "chat",
          // Only meaningful when the budget was said in euro, and then it is
          // what makes the złoty figure in the row explainable later.
          plnPerEur: (await getEurRate())?.plnPerEur ?? null,
          // So the operator calls back in the language the visitor was using.
          locale: input.locale,
          /*
           * Kanał i temat wyprowadza `createLead` z ZAPISANEJ rozmowy —
           * z intencji przy wiadomościach klienta, nie z tego żądania.
           * Przeglądarka nie ma jak zgłosić, że jest zapytaniem firmowym.
           */
        });

        /*
         * Powiadomienie do obsługi — dopiero po odesłaniu odpowiedzi, bo
         * klient nie ma czekać na dostawcę poczty, żeby zobaczyć „dziękujemy".
         *
         * Wołane BEZWARUNKOWO, także przy `created === false`: całą decyzję
         * „czy to już wysyłaliśmy" podejmuje zasuwka `notified_at` wewnątrz
         * `notifyInboxLead`. Warunek `if (saved.created)` byłby drugą,
         * słabszą wersją tej samej reguły — i jedyną, która nie broni przed
         * dwoma równoległymi żądaniami.
         */
        after(() => notifyInboxLead(saved.id));
      } catch (err) {
        /*
         * A visitor left their number and it did not get written down.
         *
         * The outer catch below would already record this as
         * `chat:route-exception`, but that title sends an operator looking for
         * a broken assistant when the thing that actually happened is a lost
         * customer. Named here, and the error still rethrown so the response
         * and the generic backstop behave exactly as before.
         *
         * Deliberately no name, phone or e-mail in the alert: the register is
         * an incident log, not a copy of the lead. The conversation id is
         * enough to find the transcript in the panel.
         */
        reportAlert({
          module: "chat",
          severity: "error",
          key: "chat:lead-not-saved",
          title: "Kontakt zostawiony w czacie nie został zapisany",
          detail:
            "Odwiedzający podał dane do kontaktu, a lead nie trafił do bazy. Ten klient jest stracony, dopóki się nie odezwie ponownie.",
          error: err,
          context: { rozmowa: conversationId },
        });
        throw err;
      }

      return NextResponse.json({
        ok: true,
        message:
          input.locale === "en"
            ? "Thank you — someone from A&A will contact you."
            : "Dziękujemy — opiekun A&A odezwie się do Ciebie.",
      });
    }

    /* ── A normal message ────────────────────────────────────────────── */

    const conversationId =
      input.conversationId && (await conversationExists(input.conversationId))
        ? input.conversationId
        : await startConversation(input.locale);

    /*
     * Limit NA ROZMOWĘ — rozdział 13.2.
     *
     * Tuż po ustaleniu `conversationId`, a przed czymkolwiek, co kosztuje:
     * przed odczytem nierozstrzygniętych pytań, przed kursem euro i przed
     * modelem AI. Cały sens tego limitu polega na tym, żeby pętla nie
     * generowała kosztów, więc musi stać PRZED nimi.
     *
     * Odpowiadamy 200, nie 429, i normalnym zdaniem w dymku: po drugiej
     * stronie bywa człowiek, który pisze szybko, a widok błędu technicznego
     * w oknie czatu wygląda jak awaria strony.
     */
    const sesja = await sprawdzSesjeCzatu(conversationId, input.message);
    if (!sesja.ok) {
      /*
        Kształt odpowiedzi jest DOKŁADNIE ten sam co przy zwykłej wiadomości
        (`conversationId`, `blocks`, `slots`, `locale`) — widget nie ma prawa
        rozpoznać, że to odpowiedź z limitu, bo gdyby rozpoznał, musiałby ją
        obsłużyć osobno i to byłaby druga ścieżka renderowania do utrzymania.
      */
      return NextResponse.json({
        conversationId,
        blocks: [
          { kind: "text", text: komunikatSesji(sesja.powod, input.locale) },
        ],
        slots: { ...EMPTY_SLOTS, ...(input.slots ?? {}) },
        locale: input.locale,
      });
    }

    const slots: ChatSlots = {
      ...EMPTY_SLOTS,
      ...(input.slots ?? {}),
      pendingIntent: (input.slots?.pendingIntent ??
        null) as ChatSlots["pendingIntent"],
      dateIntent: input.slots?.dateIntent ?? null,
      // Counted here rather than in the provider: the provider answers one
      // message and has no way to know it is the sixth.
      turns: (input.slots?.turns ?? 0) + 1,
    };

    // What the assistant failed to answer last turn, if anything. Read before
    // this turn is recorded, so it describes the previous exchange.
    const unsettled = await pendingUnanswered(conversationId);

    /**
     * Who reads the message.
     *
     * `readHybrid` runs the rules first and only consults Cloudflare when they
     * are unsure — roughly one message in five. Everything after this point is
     * unchanged: the same handlers, the same `computeQuote()`, the same
     * availability lookup. The model contributes a reading of the sentence and
     * nothing else, so no price or availability answer can come from it.
     *
     * Wrapped anyway. `readHybrid` is written not to throw, but this endpoint
     * must answer even if that promise is one day broken by a change further
     * down, and `respond()` is the behaviour we shipped for months.
     */
    // The six capability switches from the admin panel. They gate which
    // intents the assistant will serve; they cannot switch off a refusal.
    const provider = new DeterministicProvider(settings.can);
    const chatRequest = {
      message: input.message,
      slots,
      locale: input.locale,
    };

    /**
     * A range picked in the calendar, once the booking rules have accepted it.
     *
     * When there is one, the language model is skipped entirely: there is
     * nothing to interpret in two dates from a grid, and a neuron spent
     * re-reading a machine-written sentence is a neuron wasted.
     */
    const picked = input.dates ? validPickedDates(input.dates) : null;

    let reply;
    let aiUsed = false;
    let aiFallback = false;
    if (picked) {
      const vocab = await getVocabulary();
      const rules = parse(input.message, vocab, new Date(), input.locale);
      reply = await provider.respondTracked(
        chatRequest,
        withPickedDates(rules, slots, picked),
      );
    } else {
      try {
        const vocab = await getVocabulary();
        const outcome = await readHybrid(
          input.message,
          vocab,
          new Date(),
          input.locale,
          {
            // Two independent switches: the mode, and the operator's kill switch.
            aiEnabled: settings.mode === "hybrid" && !settings.aiPaused,
            db: getDb(),
          },
        );
        // Technical facts only — no message text, no customer data, no secret.
        console.info(
          `[chat] ${aiLogLine(outcome, process.env.CF_AI_MODEL || "")}`,
        );
        aiUsed = outcome.source === "ai";
        // "The model was asked and could not deliver" — a refusal, a timeout, a
        // malformed reading. Being over the daily cap is not a fallback; it is
        // the budget working, and counting it as a failure would make a healthy
        // system look broken every afternoon.
        aiFallback = outcome.failure !== null;
        reply = await provider.respondTracked(chatRequest, outcome.parsed);
      } catch (err) {
        console.error("[chat] hybrid reader failed, using rules:", err);
        // A warning, not an error: the customer still gets an answer, because
        // the rules layer is the answer and the model only ever refines it.
        // Worth recording all the same — a model that has been failing for a
        // week is a bill for nothing and a quietly worse assistant.
        reportAlert({
          module: "chat",
          severity: "warning",
          key: "chat:hybrid-reader-failed",
          title: "Warstwa AI asystenta nie odpowiedziała — zadziałały reguły",
          error: err,
        });
        aiFallback = true;
        reply = await provider.respond(chatRequest);
      }
    }

    // The transcript stores the bot's words, not its markup — a flat string of
    // the text blocks is what an operator reads in the admin panel.
    const botText = reply.blocks
      .filter((b) => b.kind === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n");

    /**
     * The funnel, read off the reply rather than reported by each handler.
     *
     * A car card or a quote in the blocks IS the customer having been shown a
     * car — there is no second definition of it, and deriving it here means a
     * new handler cannot forget to say so. `sawPrice` is the quote block alone:
     * every car card carries an "od" figure, so counting those as "checked the
     * price" would make the step identical to the one before it and the funnel
     * would have a stage that never loses anybody.
     */
    const matchedCar = reply.blocks.some(
      (b) => b.kind === "cars" || b.kind === "quote",
    );
    const sawPrice = reply.blocks.some((b) => b.kind === "quote");
    const searchedCar =
      reply.intent === "FIND_CAR" ||
      reply.intent === "CHECK_AVAILABILITY" ||
      reply.intent === "GET_PRICE" ||
      reply.intent === "COMPARE_CARS" ||
      reply.intent === "START_BOOKING" ||
      Boolean(reply.demand);

    await recordTurn({
      conversationId,
      userMessage: input.message,
      botBlocks: botText,
      intent: reply.intent,
      locale: reply.locale,
      slots: reply.slots,
      unanswered: reply.unanswered,
      handoff: reply.handoff,
      searchedCar,
      matchedCar,
      sawPrice,
      alternativesShown: reply.alternativesShown ?? false,
      aiUsed,
      aiFallback,
      // Park this turn's failure for the next one to settle, or clear the
      // previous one now that it has been settled below.
      pendingUnanswered: reply.unanswered ? normalize(input.message) : null,
    });

    /**
     * What A&A does not have, and what it has but could not free up.
     *
     * Written after the turn so a failure here can never cost the customer an
     * answer — the reply has already been produced by this point. Deduplicated
     * per conversation by the database; see `recordDemand`.
     */
    if (reply.demand) {
      try {
        await recordDemand({
          conversationId,
          demand: reply.demand,
          inFleet: reply.demandInFleet ?? false,
          unavailable: reply.unavailable ?? false,
          alternativesShown: reply.alternativesShown ?? false,
          locale: reply.locale,
          dateFrom: reply.slots.dateFrom,
          dateTo: reply.slots.dateTo,
        });
      } catch (err) {
        console.error("[chat] demand not recorded:", err);
        reportAlert({
          module: "chat",
          severity: "warning",
          key: "chat:demand-not-recorded",
          title: "Nie zapisano zapotrzebowania z rozmowy",
          error: err,
        });
      }
    }

    // Settle the previous turn's failure: did the visitor get there in the end?
    if (unsettled && !reply.unanswered) {
      await settleUnanswered({
        normalized: unsettled,
        locale: reply.locale,
        outcome: reply.handoff ? "human" : "answered",
      });
    }

    /**
     * Two kinds of row, one list.
     *
     * `unanswered` is the assistant admitting it does not know.
     * `low_confidence` is the answer it gave anyway from a weak match — the
     * kind the audit found twenty-six of, every one invisible to the admin
     * because, by the old definition, it counted as answered.
     */
    if (reply.unanswered || reply.lowConfidence) {
      const vocab = await getVocabulary();
      const p = parse(input.message, vocab, new Date(), input.locale);
      await logUnanswered({
        question: input.message,
        normalized: normalize(input.message),
        locale: reply.locale,
        category: categorise(p),
        intent: p.intent,
        kind: reply.unanswered ? "unanswered" : "low_confidence",
      });
    }

    return NextResponse.json({
      conversationId,
      blocks: await withKnownContact(
        withConversationLinks(reply.blocks, conversationId),
        conversationId,
      ),
      slots: reply.slots,
      locale: reply.locale,
    });
  } catch (err) {
    // Logged server-side, never returned: an error message is a map of the
    // system for anyone probing it.
    console.error("chat route failed:", err);
    // The visitor asked a question and got nothing. That is an ERROR by the
    // definition in `lib/alerts/types`, and it is invisible from the outside:
    // the widget shows its polite failure line and the customer closes it.
    reportAlert({
      module: "chat",
      severity: "error",
      key: "chat:route-exception",
      title: "Asystent nie odpowiedział — wyjątek w trasie /api/chat",
      error: err,
    });
    return NextResponse.json(FAILED, { status: 500 });
  }
}
