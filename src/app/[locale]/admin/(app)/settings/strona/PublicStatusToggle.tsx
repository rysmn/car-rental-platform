"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { updatePublicStatus, type SaveResult } from "../../actions";

/**
 * The one switch that decides whether visitors see how the fleet is doing today.
 *
 * ## Why it saves on change and not on a "Zapisz" button
 *
 * It is a single boolean read at a glance next to the calendar. A form with one
 * checkbox and a submit button asks the operator to do two things to express one
 * decision, and the state it saves is the state already on screen. The button
 * stays in the markup as the no-JavaScript path — `requestSubmit()` is what the
 * change handler calls, so both routes go through exactly the same action.
 */
export function PublicStatusToggle({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState<SaveResult | null, FormData>(
    updatePublicStatus,
    null,
  );
  // Mirrored so the sentence under the switch answers immediately; the value
  // that gets saved is still whatever the form posts.
  const [on, setOn] = useState(enabled);
  const t = useTranslations("Admin.publicStatus");

  // The action returns stable codes for its own messages; anything else is
  // passed through unchanged (it is already a finished sentence).
  const codes: Record<string, string> = {
    visible: t("visible"),
    hidden: t("hidden"),
    generic: t("genericError"),
  };
  const text = (code: string) => codes[code] ?? code;

  return (
    <form
      action={action}
      className="border-line-strong bg-graphite/60 border p-5"
    >
      <label className="tap-block flex items-start gap-3">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={enabled}
          disabled={pending}
          onChange={(e) => {
            setOn(e.target.checked);
            e.currentTarget.form?.requestSubmit();
          }}
          className="mt-1 h-5 w-5 shrink-0"
        />
        <span>
          <span className="text-ink block text-sm font-semibold">
            {t("title")}
          </span>
          <span className="text-ink-faint mt-1 block text-xs leading-relaxed">
            {on ? t("enabledDesc") : t("disabledDesc")}
          </span>
          <span className="text-ink-faint mt-2 block text-xs leading-relaxed">
            {t("note")}
          </span>
        </span>
      </label>

      <div className="mt-4 flex items-center gap-3">
        {/* Widoczny tylko bez JavaScriptu — z JS zmiana zapisuje się sama. */}
        <noscript>
          <button
            type="submit"
            className="label border-line-strong text-ink h-9 border px-4 text-[11px]"
          >
            {t("save")}
          </button>
        </noscript>
        {pending && <span className="text-ink-faint text-xs">{t("saving")}</span>}
        {!pending && state?.ok && (
          <span className="text-xs text-emerald-400">
            {state.message ? text(state.message) : t("saved")}
          </span>
        )}
        {!pending && state && !state.ok && (
          <span className="text-red text-xs">{text(state.error)}</span>
        )}
      </div>
    </form>
  );
}
