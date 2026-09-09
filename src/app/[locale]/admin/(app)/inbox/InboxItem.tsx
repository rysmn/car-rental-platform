"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { updateLead, type LeadResult } from "../chatbot/actions";
import {
  closeRequest,
  loadTranscript,
  markRequestRead,
  type TranscriptLine,
} from "./actions";
import { summarise } from "@/lib/inbox/summary";
/* Napisy z modułu bez `"use client"` — patrz komentarz w `lib/inbox/labels`.
   Trzymanie ich tutaj sprawiało, że serwerowa lista widziała referencję
   kliencką zamiast obiektu i rząd filtrów źródeł znikał bez śladu. */
import {
  REASON_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  STATUS_OPTIONS,
} from "@/lib/inbox/labels";
import type { LeadReason, LeadStatus, RequestSource } from "@/lib/db/schema";

export type InboxView = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  subject: string | null;
  question: string | null;
  car: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  location: string | null;
  seats: number | null;
  /** Górna granica budżetu w groszach. Cztery pola jednego faktu — patrz `budgetLine`. */
  budget: number | null;
  budgetMin: number | null;
  budgetKind: string | null;
  budgetCurrency: string | null;
  budgetRate: string | null;
  company: string | null;
  partnerModel: string | null;
  investRange: string | null;
  lang: string | null;
  /* Enumy, nie napisy: słownik etykiet jest po nich indeksowany, więc
     literówka w źródle byłaby pustą etykietą zamiast błędu kompilacji. */
  status: LeadStatus;
  source: RequestSource;
  /** Czego sprawa dotyczy. `null` dla wierszy sprzed etapu 44D. */
  reason: LeadReason | null;
  unread: boolean;
  note: string | null;
  createdLabel: string;
  conversationId: string | null;
  reservationRef: string | null;
};

/**
 * Jedna sprawa w skrzynce.
 *
 * KARTA, NIE WIERSZ TABELI. Panel jest używany z telefonu przy kliencie
 * i przy aucie, a tabela ściśnięta do 320 px zawsze kończy się albo poziomym
 * przewijaniem, albo tekstem po jednym słowie w linii. Dlatego to jest
 * pionowa karta na każdej szerokości, a desktop dostaje tylko szerszy odstęp
 * — nie inny układ, którego nikt później nie testuje.
 *
 * OTWARCIE = PRZECZYTANE. Rozwinięcie sprawy zdejmuje ją z licznika, bo to
 * jest dokładnie moment, w którym ktoś ją zobaczył. Nie ma osobnego przycisku
 * „oznacz jako przeczytane": przycisk, który trzeba nacisnąć po przeczytaniu,
 * jest naciskany co drugi raz, a licznik, któremu nie można wierzyć, jest
 * gorszy niż jego brak.
 */
export function InboxItem({
  item,
  autoOpen = false,
}: {
  item: InboxView;
  /** Przyszedł tu z odnośnika w mailu — patrz `?open=` na stronie listy. */
  autoOpen?: boolean;
}) {
  const [state, action, pending] = useActionState<LeadResult | null, FormData>(
    updateLead,
    null,
  );
  const [closeState, closeAction, closing] = useActionState(closeRequest, null);
  const [open, setOpen] = useState(autoOpen);
  /* Sprawa otwarta z odnośnika w mailu jest przeczytana od pierwszej klatki —
     stan początkowy, nie `setState` w efekcie, który dokłada drugi render
     tylko po to, żeby zgasić kropkę, którą i tak już widać rozwiniętą. */
  const [unread, setUnread] = useState(item.unread && !autoOpen);
  const [, startTransition] = useTransition();
  const [transcript, setTranscript] = useState<TranscriptLine[] | null>(null);
  const [loadingChat, setLoadingChat] = useState(false);
  const card = useRef<HTMLElement>(null);

  const markSeen = () => {
    if (!unread) return;
    // Optymistycznie: kropka gaśnie od razu, zapis leci w tle. Gdyby się nie
    // udał, następne wejście na listę pokaże prawdę z bazy.
    setUnread(false);
    startTransition(() => {
      void markRequestRead(item.id);
    });
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) markSeen();
  };

  /*
   * Sprawa otwarta z odnośnika w powiadomieniu: rozwinięta i PRZEWINIĘTA
   * pod oko. Bez przewinięcia operator, który dostał maila o dwustu
   * zgłoszeniu na liście, ląduje na górze strony i szuka go ręcznie —
   * czyli dokładnie tego, czego odnośnik miał go pozbawić.
   */
  useEffect(() => {
    if (!autoOpen || !item.unread) return;
    card.current?.scrollIntoView({ block: "center" });
    // Sam ZAPIS, bez dotykania stanu: `unread` startuje już jako `false`
    // wyżej. `markRead` w bazie jest idempotentne i jednokierunkowe, więc
    // powtórne wejście pod ten adres niczego nie przestawia.
    void markRequestRead(item.id);
  }, [autoOpen, item.id, item.unread]);

  const showTranscript = () => {
    if (transcript || loadingChat) return;
    setLoadingChat(true);
    startTransition(async () => {
      setTranscript(await loadTranscript(item.id));
      setLoadingChat(false);
    });
  };

  const tel = item.phone?.replace(/\s/g, "");
  /* Podsumowanie układa `lib/inbox/summary` — ta sama funkcja, która pisze
     treść powiadomienia e-mail, więc mail i panel nie mogą się rozjechać. */
  const summary = summarise({
    name: item.name,
    phone: item.phone,
    email: item.email,
    car: item.car,
    dateFrom: item.dateFrom,
    dateTo: item.dateTo,
    location: item.location,
    seats: item.seats,
    budgetGrosze: item.budget,
    budgetMinGrosze: item.budgetMin,
    budgetKind: item.budgetKind,
    budgetCurrency: item.budgetCurrency,
    budgetPlnPerEur: item.budgetRate,
    locale: item.lang,
    subject: item.subject,
    question: item.question,
    reason: item.reason,
    company: item.company,
    partnerModel: item.partnerModel,
    investRange: item.investRange,
    source: item.source,
    status: item.status,
    reservationRef: item.reservationRef,
  });

  return (
    <article
      ref={card}
      id={`sprawa-${item.id}`}
      className={`border-line/60 border-b px-4 py-4 last:border-0 ${
        unread ? "bg-surface-1" : ""
      }`}
    >
      {/* ── Nagłówek sprawy ─────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        {/* Kropka nieprzeczytanego. `aria-label`, bo sam kolor nie jest
            informacją dla kogoś, kto go nie widzi. */}
        <span
          aria-label={unread ? "Nieprzeczytana" : undefined}
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
            unread ? "bg-red" : "bg-transparent"
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* KANAŁ i SPRAWA to dwie różne rzeczy i stoją obok siebie
                właśnie po to: „czatem" mówi, którędy przyszło, „Zapytanie
                firmowe" — czego dotyczy. Do 44D była tylko pierwsza z nich. */}
            <span className="label-tight border-line text-ink-faint border px-1.5 text-[10px]">
              {SOURCE_LABEL[item.source] ?? item.source}
            </span>
            {item.reason && (
              <span className="label-tight border-line text-ink border px-1.5 text-[10px]">
                {REASON_LABEL[item.reason]}
              </span>
            )}
            {item.lang && item.lang !== "pl" && (
              <span className="label-tight border-line text-ink-faint border px-1.5 text-[10px] uppercase">
                {item.lang}
              </span>
            )}
            <span className="text-ink-faint text-[11px]">
              {item.createdLabel}
            </span>
            <span className="border-line text-ink-faint ml-auto border px-2 text-[10px]">
              {STATUS_LABEL[item.status] ?? item.status}
            </span>
          </div>

          <h2 className={`text-ink mt-2 text-sm ${unread ? "font-bold" : ""}`}>
            {item.subject ?? item.question?.slice(0, 90) ?? "Prośba o kontakt"}
          </h2>

          <p className="text-silver mt-1 text-xs">
            {item.name ?? "—"}
            {item.car ? ` · ${item.car}` : ""}
            {item.reservationRef ? ` · ${item.reservationRef}` : ""}
          </p>
        </div>
      </div>

      {/* ── Kontakt: na telefonie to są JEDYNE dwa przyciski, których obsługa
             naprawdę używa, więc stoją osobno i mają pełne pole trafienia ── */}
      <div className="mt-3 flex flex-wrap gap-2 pl-5">
        {tel && (
          <a
            href={`tel:${tel}`}
            className="label border-line-strong text-ink hover:border-ink tap inline-flex items-center border px-3 text-[11px]"
          >
            ☎ {item.phone}
          </a>
        )}
        {item.email && (
          <a
            href={`mailto:${item.email}`}
            className="label border-line-strong text-ink hover:border-ink tap inline-flex items-center border px-3 text-[11px]"
          >
            ✉ {item.email}
          </a>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="label text-ink-faint hover:text-ink tap ml-auto inline-flex items-center px-2 text-[11px]"
        >
          {open ? "Zwiń" : "Otwórz"}
        </button>
      </div>

      {/* ── Szczegóły ───────────────────────────────────────────────────── */}
      {open && (
        <div className="mt-4 pl-5">
          {/* Treść klienta. Renderowana jako TEKST — React nie wykonuje
              znaczników, więc wiadomość z `<script>` jest tu zwykłym napisem
              i tak ma zostać. */}
          {item.question && (
            <p className="text-silver border-line/60 border-l-2 pl-3 text-xs whitespace-pre-wrap italic">
              „{item.question}”
            </p>
          )}

          {/* PODSUMOWANIE SPRAWY — to, co operator czyta, zanim zadzwoni.
              Dwie kolumny etykieta/wartość, nie siatka kafelków: czyta się je
              z góry na dół jak notatkę, a na 360 px nic się nie zawija na
              jedno słowo w linii. */}
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[11px]">
            {summary.map((line) => (
              <div key={line.label} className="contents">
                <dt className="text-ink-faint whitespace-nowrap">
                  {line.label}
                </dt>
                <dd className="text-ink min-w-0 break-words">{line.value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 flex flex-wrap gap-3">
            {item.conversationId && (
              <button
                type="button"
                onClick={showTranscript}
                disabled={loadingChat || transcript !== null}
                className="text-ink-faint hover:text-ink tap-area text-[11px] underline underline-offset-2 disabled:no-underline disabled:opacity-50"
              >
                {loadingChat
                  ? "Wczytuję rozmowę…"
                  : transcript
                    ? "Rozmowa poniżej"
                    : "Pokaż całą rozmowę"}
              </button>
            )}
            {item.reservationRef && (
              <Link
                href="/admin/reservations"
                className="text-ink-faint hover:text-ink tap-area text-[11px] underline underline-offset-2"
              >
                Rezerwacja {item.reservationRef}
              </Link>
            )}
          </div>

          {/* TRANSKRYPT W TYM SAMYM MIEJSCU, nie na innej stronie.
              Do 44D był odnośnik do zakładki czatu — czyli wyjście ze sprawy
              po to, żeby ją zrozumieć, i powrót przyciskiem wstecz do listy
              zwiniętej od nowa. Wczytywany na żądanie, bo dwieście rozmów
              w liście to osiem tysięcy wierszy pobranych na darmo. */}
          {transcript && (
            <div className="border-line/60 mt-3 max-h-80 overflow-y-auto border p-3">
              {transcript.length === 0 ? (
                <p className="text-ink-faint text-[11px]">
                  Transkrypt tej rozmowy już nie istnieje — rozmowy kasujemy po
                  90 dniach.
                </p>
              ) : (
                <ol className="space-y-2">
                  {transcript.map((m) => (
                    <li key={m.id} className="text-[11px]">
                      <span className="label-tight text-ink-faint mr-2 text-[9px]">
                        {m.role === "user" ? "KLIENT" : "ASYSTENT"}
                      </span>
                      <span className="text-ink-faint text-[9px]">{m.at}</span>
                      {/* Tekstem, nie znacznikami: wiadomość z `<script>`
                          w środku ma tu zostać zwykłym napisem. */}
                      <p className="text-silver mt-0.5 break-words whitespace-pre-wrap">
                        {m.body}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {/* Status i notatka — jedyne dwie rzeczy, które obsługa zmienia.
              Reszta jest zapisem tego, co powiedział klient, a zapisu, który
              da się przepisać, nie nazywa się zapisem. */}
          <form action={action} className="mt-4 flex flex-col gap-3">
            <input type="hidden" name="id" value={item.id} />
            <label className="flex flex-col gap-1">
              <span className="label-tight text-ink-faint text-[10px]">
                Status
              </span>
              <select
                name="status"
                defaultValue={item.status}
                className="border-line-strong bg-surface-1 text-ink h-11 w-full border px-2 text-xs sm:max-w-[14rem]"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="label-tight text-ink-faint text-[10px]">
                Notatka pracownika
              </span>
              <input
                name="note"
                defaultValue={item.note ?? ""}
                placeholder="Oddzwonić po 17"
                className="border-line-strong bg-surface-1 text-ink placeholder:text-ink-faint h-11 w-full border px-2 text-xs"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={pending}
                className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap inline-flex items-center border px-4 text-xs transition-colors disabled:opacity-50"
              >
                {pending ? "Zapisywanie…" : "Zapisz"}
              </button>
              {state?.ok && (
                <span className="text-xs text-emerald-400">Zapisano ✓</span>
              )}
              {state && !state.ok && (
                <span className="text-red text-xs">{state.error}</span>
              )}
            </div>
          </form>

          {item.status !== "closed" && (
            <form action={closeAction} className="mt-3">
              <input type="hidden" name="id" value={item.id} />
              <button
                type="submit"
                disabled={closing}
                className="label text-ink-faint hover:text-ink tap inline-flex items-center text-[11px] underline underline-offset-2 disabled:opacity-50"
              >
                {closing ? "Zamykam…" : "Załatwione — zamknij sprawę"}
              </button>
              {closeState && !closeState.ok && (
                <span className="text-red ml-3 text-xs">
                  {closeState.error}
                </span>
              )}
            </form>
          )}
        </div>
      )}

      {!open && item.note && (
        <p className="text-silver mt-2 pl-5 text-[11px]">{item.note}</p>
      )}
    </article>
  );
}
