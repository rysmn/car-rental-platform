import type { AlertRow } from "@/lib/alerts/repo";
import type { AlertSeverity } from "@/lib/alerts/types";
import { useLocale, useTranslations } from "next-intl";
import { alertOperation } from "./actions";

/**
 * The technical half of the alerts page: what broke.
 *
 * Kept visually distinct from the operational list below it — that one is a
 * to-do list, this one is an incident register, and an operator has to be able
 * to tell at a glance which kind of problem they are looking at. Severity is
 * carried by a labelled badge rather than by colour alone: the panel is used on
 * a phone in daylight, where a red border and a grey one are the same border.
 */

const SEVERITY_STYLE: Record<AlertSeverity, string> = {
  critical: "bg-red text-white",
  error: "border-red text-red border",
  warning: "border-line-strong text-ink border",
  info: "border-line text-ink-faint border",
};

/** One button, one form — see `alertOperation`. */
function Op({
  id,
  op,
  label,
  emphasis,
}: {
  id: string;
  op: "read" | "resolve" | "open";
  label: string;
  emphasis?: boolean;
}) {
  return (
    <form action={alertOperation}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      <button
        type="submit"
        className={`label-tight tap-block border px-3 py-2 text-[10px] transition-colors ${
          emphasis
            ? "border-line-strong hover:border-ink hover:bg-ink/5 text-ink"
            : "border-line text-ink-faint hover:text-ink"
        }`}
      >
        {label}
      </button>
    </form>
  );
}

export function SystemAlerts({
  alerts,
  showingResolved,
}: {
  alerts: AlertRow[];
  showingResolved: boolean;
}) {
  const t = useTranslations("Admin.alerts");
  const locale = useLocale();

  /** "just now", "3 h ago", or a locale date for older entries. */
  const ago = (date: Date): string => {
    const mins = Math.round((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return t("ago.justNow");
    if (mins < 60) return t("ago.minutes", { count: mins });
    const hours = Math.round(mins / 60);
    if (hours < 24) return t("ago.hours", { count: hours });
    return date.toLocaleString(locale, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const stamp = (date: Date): string =>
    date.toLocaleString(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const demanding = alerts.filter(
    (a) => a.state !== "resolved" && (a.severity === "critical" || a.severity === "error"),
  ).length;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="label text-ink text-xs">{t("system.title")}</h2>
        <div className="flex items-center gap-3">
          <span className="text-ink-faint text-[11px]">
            {alerts.length === 0
              ? "0"
              : demanding > 0
                ? t("system.countDemanding", {
                    count: alerts.length,
                    demanding,
                  })
                : String(alerts.length)}
          </span>
          {/* A link, not a toggle: the page is a server component and this is
              one query parameter. A client-side switch here would be a state
              machine for something a URL already expresses. */}
          <a
            href={showingResolved ? "/admin/alerty" : "/admin/alerty?rozwiazane=1"}
            className="label-tight border-line text-ink-faint hover:text-ink tap-block border px-3 py-2 text-[10px] transition-colors"
          >
            {showingResolved ? t("system.hideResolved") : t("system.showResolved")}
          </a>
        </div>
      </div>

      {alerts.length === 0 ? (
        <p className="border-line bg-graphite/40 text-silver border p-8 text-center text-sm">
          {showingResolved
            ? t("system.emptyRegistry")
            : t("system.emptyOpen")}
        </p>
      ) : (
        <ul className="border-line divide-line divide-y border">
          {alerts.map((a) => (
            <li
              key={a.id}
              className={`flex flex-col gap-3 px-4 py-4 sm:px-5 ${
                a.state === "resolved" ? "opacity-55" : ""
              }`}
            >
              <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                <span
                  className={`label-tight rounded-pill shrink-0 px-2 py-0.5 text-[10px] ${SEVERITY_STYLE[a.severity]}`}
                >
                  {t(`severity.${a.severity}`)}
                </span>
                <span className="label-tight border-line text-ink-faint shrink-0 border px-2 py-0.5 text-[10px]">
                  {t.has(`modules.${a.module}`) ? t(`modules.${a.module}`) : a.module}
                </span>
                {/* min-w-0 so a long title wraps instead of widening the row
                    past the viewport — the whole page would then scroll
                    sideways on a phone, which is the one thing it must not do. */}
                <span className="text-ink min-w-0 flex-1 text-sm break-words">
                  {a.title}
                </span>
              </div>

              {a.detail && (
                <p className="text-ink-faint font-mono text-[11px] break-words">
                  {a.detail}
                </p>
              )}

              <div className="text-ink-faint flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                <span>
                  <span className="text-silver">{t("fields.lastSeen")}</span> {ago(a.lastSeen)}
                </span>
                <span>
                  <span className="text-silver">{t("fields.firstSeen")}</span> {stamp(a.firstSeen)}
                </span>
                <span>
                  <span className="text-silver">{t("fields.occurrences")}</span>{" "}
                  <span className={a.occurrences > 1 ? "text-ink" : ""}>
                    {a.occurrences}
                  </span>
                </span>
                {a.reopenedAt && (
                  <span className="text-red">
                    {t("fields.reopened", { when: stamp(a.reopenedAt) })}
                  </span>
                )}
                {a.state === "acknowledged" && <span>{t("fields.acknowledged")}</span>}
                {a.state === "resolved" && (
                  <span>
                    {t("fields.resolvedAt", {
                      when: a.resolvedAt ? stamp(a.resolvedAt) : "",
                    })}
                    {a.resolvedBy ? ` · ${a.resolvedBy}` : ""}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {a.state === "active" && (
                  <Op id={a.id} op="read" label={t("ops.markRead")} />
                )}
                {a.state !== "resolved" ? (
                  <Op id={a.id} op="resolve" label={t("ops.resolve")} emphasis />
                ) : (
                  <Op id={a.id} op="open" label={t("ops.reopen")} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
