"use client";

import { useActionState, useState } from "react";
import { updateChatbot, type SaveResult } from "../actions";
import type { ChatbotSettings } from "@/lib/admin/settings";
import type { ChatbotAiPanel } from "@/lib/admin/chatbot-ai";

const inputCls =
  "h-10 w-full border border-line-strong bg-surface-1 px-3 text-sm text-ink placeholder:text-ink-faint";
const labelCls = "label-tight text-[10px] text-ink-faint";

function Feedback({ state }: { state: SaveResult | null }) {
  if (!state) return null;
  if (state.ok)
    return (
      <span className="text-xs text-emerald-400">
        {state.message ?? "Zapisano ✓"}
      </span>
    );
  return <span className="text-red text-xs">{state.error}</span>;
}

/** A labelled checkbox row — the shape used for every capability below. */
function Can({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="border-line/60 tap-block flex items-start gap-3 border-b py-3 last:border-0">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 shrink-0"
      />
      <span>
        <span className="text-ink block text-sm">{label}</span>
        <span className="text-ink-faint block text-xs">{hint}</span>
      </span>
    </label>
  );
}

export function ChatbotForm({
  settings,
  hardLimits,
  ai,
}: {
  settings: ChatbotSettings;
  hardLimits: readonly string[];
  /** Live state of the AI layer. Never carries a credential — see chatbot-ai.ts. */
  ai: ChatbotAiPanel;
}) {
  const [state, action, pending] = useActionState(updateChatbot, null);
  // Mirrored in local state only to grey out the rest of the form when the
  // assistant is off — the saved value is still whatever the form posts.
  const [enabled, setEnabled] = useState(settings.enabled);

  return (
    <form action={action} className="max-w-3xl">
      {/* ── Master switch ─────────────────────────────────────────────── */}
      <div className="border-line-strong bg-graphite/60 border p-5">
        <label className="tap-block flex items-start gap-3">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={settings.enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0"
          />
          <span>
            <span className="text-ink block text-sm font-semibold">
              Asystent włączony
            </span>
            <span className="text-ink-faint block text-xs">
              Gdy wyłączony, na stronie nie pojawia się nic — niezależnie od
              pozostałych ustawień.
            </span>
          </span>
        </label>
      </div>

      <fieldset
        disabled={!enabled}
        className={enabled ? "" : "pointer-events-none opacity-40"}
      >
        {/* ── Podstawy ────────────────────────────────────────────────── */}
        <section className="border-line mt-10 border-t pt-6">
          <h2 className="label text-ink text-xs">Podstawy</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Nazwa asystenta</span>
              <input
                name="name"
                defaultValue={settings.name}
                placeholder="Asystent A&A"
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Język</span>
              <select
                name="language"
                defaultValue={settings.language}
                className={inputCls}
              >
                <option value="auto">Automatyczny (jak strona)</option>
                <option value="pl">Zawsze polski</option>
                <option value="en">Zawsze angielski</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Pozycja na stronie</span>
              <select
                name="position"
                defaultValue={settings.position}
                className={inputCls}
              >
                <option value="right">Prawy dolny róg</option>
                <option value="left">Lewy dolny róg</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Kiedy ma się pokazywać</span>
              <select
                name="availability"
                defaultValue={settings.availability}
                className={inputCls}
              >
                <option value="always">Zawsze — 24/7</option>
                <option value="offHours">Tylko poza godzinami obsługi</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Automatyczne otwarcie</span>
              <select
                name="autoOpenSeconds"
                defaultValue={String(settings.autoOpenSeconds)}
                className={inputCls}
              >
                <option value="0">Nigdy — klient sam klika</option>
                <option value="15">Po 15 sekundach</option>
                <option value="30">Po 30 sekundach</option>
                <option value="60">Po 60 sekundach</option>
              </select>
            </label>
            {/* Mode. The hybrid option is disabled rather than hidden when
                there are no credentials — hiding it would make the
                architecture look like a limitation instead of a choice. */}
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Silnik odpowiedzi</span>
              <select
                name="mode"
                defaultValue={settings.mode}
                className={inputCls}
              >
                <option value="deterministic">
                  Deterministyczny — tylko reguły
                </option>
                <option value="hybrid" disabled={!ai.configured}>
                  {ai.configured
                    ? "Hybrydowy — reguły + model przy trudnych pytaniach"
                    : "Hybrydowy — brak poświadczeń Cloudflare"}
                </option>
              </select>
            </label>
          </div>
          <p className="text-ink-faint mt-3 text-xs">
            Tryb deterministyczny odpowiada z Twoich danych: cennika, floty,
            dostępności i FAQ. Nie korzysta z żadnego zewnętrznego modelu, nie
            wymaga klucza API i nie generuje kosztów miesięcznych. Nie potrafi
            za to zrozumieć dowolnie sformułowanego zdania — gdy nie jest pewny,
            dopytuje albo proponuje kontakt z pracownikiem.
          </p>
          <p className="text-ink-faint mt-2 text-xs">
            „Automatyczne otwarcie” domyślnie wyłączone. Panel wyskakujący zaraz
            po wejściu jest jedną z najbardziej irytujących rzeczy na stronie
            wypożyczalni, a kto potrzebuje pomocy, ten kliknie sam.
          </p>
          {/* ── AI layer: state, budget, kill switch ────────────────────── */}
          <div className="border-line-strong bg-graphite/40 mt-4 border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className={labelCls}>Cloudflare AI</span>
              <span
                className={
                  ai.status === "ACTIVE"
                    ? "text-sm text-emerald-400"
                    : ai.status === "PAUSED"
                      ? "text-sm text-amber-400"
                      : "text-ink-faint text-sm"
                }
              >
                {ai.status}
              </span>
            </div>
            <p className="text-ink-faint mt-1 text-xs">{ai.explanation}</p>

            <dl className="text-ink mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-ink-faint">Zużycie dziś</dt>
                <dd>
                  {ai.neuronsToday} / {ai.neuronCap}
                </dd>
              </div>
              <div>
                <dt className="text-ink-faint">Wywołania AI</dt>
                <dd>{ai.callsToday}</dd>
              </div>
              <div>
                <dt className="text-ink-faint">Fallbacki</dt>
                <dd>{ai.fallbacksToday}</dd>
              </div>
              <div>
                <dt className="text-ink-faint">Model</dt>
                <dd className="truncate">{ai.model.replace("@cf/meta/", "")}</dd>
              </div>
            </dl>

            {/* The kill switch. Deliberately separate from the mode: after a
                3 a.m. pause nobody should have to remember what the mode was
                in order to put it back. */}
            <label className="tap-block mt-4 flex items-start gap-3">
              <input
                type="checkbox"
                name="aiPaused"
                defaultChecked={settings.aiPaused}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>
                <span className="text-ink block text-sm">
                  Zatrzymaj AI awaryjnie
                </span>
                <span className="text-ink-faint block text-xs">
                  Cały ruch wraca na reguły od następnej wiadomości. Bez
                  restartu, bez wdrożenia. Chatbot działa dalej.
                </span>
              </span>
            </label>

            <p className="text-ink-faint mt-3 text-xs">
              Limit {ai.neuronCap} neuronów to 80% darmowego przydziału
              Cloudflare. Po jego wyczerpaniu model przestaje być pytany, a
              asystent odpowiada regułami — bez błędu widocznego dla klienta i
              bez możliwości naliczenia opłaty. Licznik zeruje się o północy
              UTC.
            </p>
          </div>

          <p className="text-ink-faint mt-3 text-xs">
            „Tylko poza godzinami” bierze harmonogram z{" "}
            <strong className="text-silver font-normal">
              Dane firmy i kontakt
            </strong>{" "}
            — jedno źródło prawdy o tym, kiedy jesteście dostępni. Gdy ktoś
            siedzi przy telefonie, bot nie konkuruje z człowiekiem.
          </p>
        </section>

        {/* ── Co może ─────────────────────────────────────────────────── */}
        <section className="border-line mt-10 border-t pt-6">
          <h2 className="label text-ink text-xs">Co asystent może robić</h2>
          <p className="text-ink-faint mt-1 mb-3 text-xs">
            Każda z tych rzeczy w najgorszym razie kończy się źle sformułowanym
            zdaniem — nigdy błędną transakcją.
          </p>
          <div className="border-line bg-void/40 border px-4">
            <Can
              name="can_faq"
              label="Odpowiadać na częste pytania"
              hint="Kaucja, dokumenty, limit kilometrów, wiek kierowcy"
              defaultChecked={settings.can.faq}
            />
            <Can
              name="can_offer"
              label="Przedstawiać ofertę"
              hint="Jakie auta są w flocie i czym się różnią"
              defaultChecked={settings.can.offer}
            />
            <Can
              name="can_availability"
              label="Sprawdzać dostępność"
              hint="Które auta są wolne w podanym terminie"
              defaultChecked={settings.can.availability}
            />
            <Can
              name="can_prices"
              label="Podawać ceny"
              hint="Z cennika, z uwzględnieniem długości najmu — bez rabatów"
              defaultChecked={settings.can.prices}
            />
            <Can
              name="can_startBooking"
              label="Pomagać rozpocząć rezerwację"
              hint="Zbiera termin i auto, przekazuje do formularza. Nie potwierdza"
              defaultChecked={settings.can.startBooking}
            />
            <Can
              name="can_handoff"
              label="Przekazać rozmowę człowiekowi"
              hint="Gdy nie wie albo klient prosi o kontakt"
              defaultChecked={settings.can.handoff}
            />
          </div>
        </section>

        {/* ── Czego nie może — nie do zmiany ──────────────────────────── */}
        <section className="border-line mt-10 border-t pt-6">
          <h2 className="label text-ink text-xs">
            Czego asystent nie zrobi nigdy
          </h2>
          <p className="text-ink-faint mt-1 mb-3 text-xs">
            Celowo bez przełączników. To nie są preferencje, tylko granice
            wpisane w kod bota — checkbox „bot może zwracać pieniądze” to
            checkbox, który kiedyś ktoś zaznaczy.
          </p>
          <ul className="border-line bg-void/40 border px-5 py-4">
            {hardLimits.map((limit) => (
              <li
                key={limit}
                className="text-silver flex items-baseline gap-2 py-1 text-sm"
              >
                <span className="text-red" aria-hidden>
                  ✕
                </span>
                {limit}
              </li>
            ))}
          </ul>
        </section>

        {/* ── Przekazanie i teksty ────────────────────────────────────── */}
        <section className="border-line mt-10 border-t pt-6">
          <h2 className="label text-ink text-xs">Przekazanie i teksty</h2>
          <div className="mt-4 grid gap-3">
            <label className="flex flex-col gap-1">
              <span className={labelCls}>
                E-mail do przekazywania rozmów (puste = adres firmowy)
              </span>
              <input
                name="handoffEmail"
                type="email"
                defaultValue={settings.handoffEmail}
                placeholder="kontakt@aacorporation.pl"
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Powitanie (puste = wbudowane)</span>
              <input
                name="greeting"
                defaultValue={settings.greeting}
                placeholder="Dzień dobry, w czym mogę pomóc?"
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>
                Gdy nie potrafi pomóc (puste = wbudowane)
              </span>
              <input
                name="fallback"
                defaultValue={settings.fallback}
                placeholder="Przekażę to naszemu zespołowi — odezwiemy się rano."
                className={inputCls}
              />
            </label>
          </div>
        </section>
      </fieldset>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="label bg-red hover:bg-red-hover inline-flex h-10 items-center px-6 text-xs text-white transition-colors disabled:opacity-50"
        >
          {pending ? "Zapisywanie…" : "Zapisz ustawienia"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
