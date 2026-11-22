"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { updateChatbot, type SaveResult } from "../actions";
import type { ChatbotSettings } from "@/lib/admin/settings";
import type { ChatbotAiPanel } from "@/lib/admin/chatbot-ai";
import { pick, type Bilingual } from "@/lib/i18n-pick";

const inputCls =
  "h-10 w-full border border-line-strong bg-surface-1 px-3 text-sm text-ink placeholder:text-ink-faint";
const labelCls = "label-tight text-[10px] text-ink-faint";

function Feedback({ state }: { state: SaveResult | null }) {
  const tc = useTranslations("Admin.settings.common");
  if (!state) return null;
  if (state.ok)
    return (
      <span className="text-xs text-emerald-400">
        {state.message ?? tc("saved")}
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
  hardLimits: readonly Bilingual[];
  /** Live state of the AI layer. Never carries a credential — see chatbot-ai.ts. */
  ai: ChatbotAiPanel;
}) {
  const locale = useLocale();
  const t = useTranslations("Admin.settings.chatbot");
  const tc = useTranslations("Admin.settings.common");
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
              {t("master.label")}
            </span>
            <span className="text-ink-faint block text-xs">
              {t("master.hint")}
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
          <h2 className="label text-ink text-xs">{t("basics.heading")}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={labelCls}>{t("basics.name")}</span>
              <input
                name="name"
                defaultValue={settings.name}
                placeholder={t("basics.namePlaceholder")}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>{t("basics.language")}</span>
              <select
                name="language"
                defaultValue={settings.language}
                className={inputCls}
              >
                <option value="auto">{t("basics.languageAuto")}</option>
                <option value="pl">{t("basics.languagePl")}</option>
                <option value="en">{t("basics.languageEn")}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>{t("basics.position")}</span>
              <select
                name="position"
                defaultValue={settings.position}
                className={inputCls}
              >
                <option value="right">{t("basics.positionRight")}</option>
                <option value="left">{t("basics.positionLeft")}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>{t("basics.availability")}</span>
              <select
                name="availability"
                defaultValue={settings.availability}
                className={inputCls}
              >
                <option value="always">{t("basics.availabilityAlways")}</option>
                <option value="offHours">
                  {t("basics.availabilityOffHours")}
                </option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>{t("basics.autoOpen")}</span>
              <select
                name="autoOpenSeconds"
                defaultValue={String(settings.autoOpenSeconds)}
                className={inputCls}
              >
                <option value="0">{t("basics.autoOpenNever")}</option>
                <option value="15">{t("basics.autoOpen15")}</option>
                <option value="30">{t("basics.autoOpen30")}</option>
                <option value="60">{t("basics.autoOpen60")}</option>
              </select>
            </label>
            {/* Mode. The hybrid option is disabled rather than hidden when
                there are no credentials — hiding it would make the
                architecture look like a limitation instead of a choice. */}
            <label className="flex flex-col gap-1">
              <span className={labelCls}>{t("basics.mode")}</span>
              <select
                name="mode"
                defaultValue={settings.mode}
                className={inputCls}
              >
                <option value="deterministic">
                  {t("basics.modeDeterministic")}
                </option>
                <option value="hybrid" disabled={!ai.configured}>
                  {ai.configured
                    ? t("basics.modeHybrid")
                    : t("basics.modeHybridNoCredentials")}
                </option>
              </select>
            </label>
          </div>
          <p className="text-ink-faint mt-3 text-xs">{t("basics.modeHint")}</p>
          <p className="text-ink-faint mt-2 text-xs">
            {t("basics.autoOpenHint")}
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
            <p className="text-ink-faint mt-1 text-xs">{pick(ai.explanation, locale)}</p>

            <dl className="text-ink mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-ink-faint">{t("ai.usedToday")}</dt>
                <dd>
                  {ai.neuronsToday} / {ai.neuronCap}
                </dd>
              </div>
              <div>
                <dt className="text-ink-faint">{t("ai.calls")}</dt>
                <dd>{ai.callsToday}</dd>
              </div>
              <div>
                <dt className="text-ink-faint">{t("ai.fallbacks")}</dt>
                <dd>{ai.fallbacksToday}</dd>
              </div>
              <div>
                <dt className="text-ink-faint">{t("ai.model")}</dt>
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
                  {t("ai.killLabel")}
                </span>
                <span className="text-ink-faint block text-xs">
                  {t("ai.killHint")}
                </span>
              </span>
            </label>

            <p className="text-ink-faint mt-3 text-xs">
              {t("ai.capNote", { cap: ai.neuronCap })}
            </p>
          </div>

          <p className="text-ink-faint mt-3 text-xs">
            {t.rich("basics.hoursNote", {
              strong: (chunks) => (
                <strong className="text-silver font-normal">{chunks}</strong>
              ),
            })}
          </p>
        </section>

        {/* ── Co może ─────────────────────────────────────────────────── */}
        <section className="border-line mt-10 border-t pt-6">
          <h2 className="label text-ink text-xs">{t("can.heading")}</h2>
          <p className="text-ink-faint mt-1 mb-3 text-xs">{t("can.intro")}</p>
          <div className="border-line bg-void/40 border px-4">
            <Can
              name="can_faq"
              label={t("can.faqLabel")}
              hint={t("can.faqHint")}
              defaultChecked={settings.can.faq}
            />
            <Can
              name="can_offer"
              label={t("can.offerLabel")}
              hint={t("can.offerHint")}
              defaultChecked={settings.can.offer}
            />
            <Can
              name="can_availability"
              label={t("can.availabilityLabel")}
              hint={t("can.availabilityHint")}
              defaultChecked={settings.can.availability}
            />
            <Can
              name="can_prices"
              label={t("can.pricesLabel")}
              hint={t("can.pricesHint")}
              defaultChecked={settings.can.prices}
            />
            <Can
              name="can_startBooking"
              label={t("can.startBookingLabel")}
              hint={t("can.startBookingHint")}
              defaultChecked={settings.can.startBooking}
            />
            <Can
              name="can_handoff"
              label={t("can.handoffLabel")}
              hint={t("can.handoffHint")}
              defaultChecked={settings.can.handoff}
            />
          </div>
        </section>

        {/* ── Czego nie może — nie do zmiany ──────────────────────────── */}
        <section className="border-line mt-10 border-t pt-6">
          <h2 className="label text-ink text-xs">{t("limits.heading")}</h2>
          <p className="text-ink-faint mt-1 mb-3 text-xs">
            {t("limits.intro")}
          </p>
          <ul className="border-line bg-void/40 border px-5 py-4">
            {hardLimits.map((limit) => (
              <li
                key={limit.pl}
                className="text-silver flex items-baseline gap-2 py-1 text-sm"
              >
                <span className="text-red" aria-hidden>
                  ✕
                </span>
                {pick(limit, locale)}
              </li>
            ))}
          </ul>
        </section>

        {/* ── Przekazanie i teksty ────────────────────────────────────── */}
        <section className="border-line mt-10 border-t pt-6">
          <h2 className="label text-ink text-xs">{t("handover.heading")}</h2>
          <div className="mt-4 grid gap-3">
            <label className="flex flex-col gap-1">
              <span className={labelCls}>{t("handover.email")}</span>
              <input
                name="handoffEmail"
                type="email"
                defaultValue={settings.handoffEmail}
                placeholder="kontakt@aacorporation.pl"
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>{t("handover.greeting")}</span>
              <input
                name="greeting"
                defaultValue={settings.greeting}
                placeholder={t("handover.greetingPlaceholder")}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>{t("handover.fallback")}</span>
              <input
                name="fallback"
                defaultValue={settings.fallback}
                placeholder={t("handover.fallbackPlaceholder")}
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
          {pending ? tc("saving") : t("save")}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
