"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { requestCacheCleanup, type CacheActionResult } from "./actions";

/**
 * Everything the operator needs to decide whether to touch this at all, and
 * one button that does the single safe thing.
 *
 * Deliberately preformatted on the server and handed over as plain strings:
 * this component holds no opinion about bytes, dates or thresholds, so there
 * is no second place where "2,40 GB" could come out differently from the log.
 */
export type BuildCacheView = {
  dot: string;
  statusLabel: string;
  cache: string;
  disk: string;
  threshold: string;
  lastCheck: string;
  lastCleanup: string;
  lastFreed: string;
  note: string | null;
  /** A cleanup already asked for and not yet done — the button waits it out. */
  awaiting: boolean;
  /** Superadmin? A plain admin sees the readings but not the button. */
  canClean: boolean;
};

export function BuildCacheCard(view: BuildCacheView) {
  const t = useTranslations("Admin.settings.buildCache");
  const [confirming, setConfirming] = useState(false);
  // The action takes no input — there is exactly one thing it can do, and a
  // form field that could change that is precisely what this must not have.
  // useActionState still wants an (state, payload) signature, so the payload is
  // accepted and dropped here rather than in the server action, where an unused
  // FormData parameter would suggest one day it might be read.
  const [state, formAction, pending] = useActionState<
    CacheActionResult | null,
    FormData
  >(() => requestCacheCleanup(), null);

  const rows: [string, string][] = [
    [t("rows.status"), `${view.dot} ${view.statusLabel}`],
    [t("rows.current"), view.cache],
    [t("rows.disk"), view.disk],
    [t("rows.threshold"), view.threshold],
    [t("rows.lastCheck"), view.lastCheck],
    [t("rows.lastCleanup"), view.lastCleanup],
    [t("rows.lastFreed"), view.lastFreed],
  ];

  const busy = pending || view.awaiting || state?.ok === true;

  return (
    <div className="border-line border p-5">
      <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-[16rem_1fr]">
        {rows.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-ink-faint text-xs">{term}</dt>
            <dd className="text-ink text-sm tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {view.note && <p className="text-ink-faint mt-4 text-xs">{view.note}</p>}

      {view.canClean && (
        <div className="border-line/60 mt-5 border-t pt-5">
          {confirming ? (
            <form action={formAction}>
              <p className="text-ink text-sm">{t("confirm")}</p>
              <p className="text-silver mt-1 text-xs">{t("confirmNote")}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-ink-faint hover:text-ink text-xs"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 inline-flex h-9 items-center border px-4 text-xs transition-colors disabled:opacity-50"
                >
                  {pending ? t("queuing") : t("confirmButton")}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy}
              className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 inline-flex h-9 items-center border px-4 text-xs transition-colors disabled:opacity-50"
            >
              {t("clean")}
            </button>
          )}

          {state?.ok && (
            <p className="mt-3 text-xs text-emerald-400">{state.message}</p>
          )}
          {state && !state.ok && (
            <p className="text-red mt-3 text-xs">{state.error}</p>
          )}
          {!state && view.awaiting && (
            <p className="mt-3 text-xs text-amber-500">{t("awaiting")}</p>
          )}
          <p className="text-ink-faint mt-3 text-xs">
            {t.rich("footer", {
              code: (chunks) => <code>{chunks}</code>,
            })}
          </p>
        </div>
      )}
    </div>
  );
}
