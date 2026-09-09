import type { AlertRow } from "@/lib/alerts/repo";
import {
  MODULE_LABEL,
  SEVERITY_LABEL,
  type AlertSeverity,
} from "@/lib/alerts/types";
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

/** "przed chwilą", "3 godz. temu", "12.08, 14:03" — whichever is readable. */
function ago(date: Date): string {
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "przed chwilą";
  if (mins < 60) return `${mins} min temu`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} godz. temu`;
  return date.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const stamp = (date: Date): string =>
  date.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

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
  const demanding = alerts.filter(
    (a) => a.state !== "resolved" && (a.severity === "critical" || a.severity === "error"),
  ).length;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="label text-ink text-xs">Awarie systemu</h2>
        <div className="flex items-center gap-3">
          <span className="text-ink-faint text-[11px]">
            {alerts.length === 0
              ? "0"
              : `${alerts.length}${demanding > 0 ? `, w tym ${demanding} wymagających reakcji` : ""}`}
          </span>
          {/* A link, not a toggle: the page is a server component and this is
              one query parameter. A client-side switch here would be a state
              machine for something a URL already expresses. */}
          <a
            href={showingResolved ? "/admin/alerty" : "/admin/alerty?rozwiazane=1"}
            className="label-tight border-line text-ink-faint hover:text-ink tap-block border px-3 py-2 text-[10px] transition-colors"
          >
            {showingResolved ? "Ukryj rozwiązane" : "Pokaż rozwiązane"}
          </a>
        </div>
      </div>

      {alerts.length === 0 ? (
        <p className="border-line bg-graphite/40 text-silver border p-8 text-center text-sm">
          {showingResolved
            ? "Rejestr awarii jest pusty."
            : "Żadna awaria nie czeka na reakcję."}
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
                  {SEVERITY_LABEL[a.severity]}
                </span>
                <span className="label-tight border-line text-ink-faint shrink-0 border px-2 py-0.5 text-[10px]">
                  {MODULE_LABEL[a.module] ?? a.module}
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
                  <span className="text-silver">Ostatnio:</span> {ago(a.lastSeen)}
                </span>
                <span>
                  <span className="text-silver">Pierwszy raz:</span> {stamp(a.firstSeen)}
                </span>
                <span>
                  <span className="text-silver">Wystąpień:</span>{" "}
                  <span className={a.occurrences > 1 ? "text-ink" : ""}>
                    {a.occurrences}
                  </span>
                </span>
                {a.reopenedAt && (
                  <span className="text-red">
                    wróciło po rozwiązaniu — {stamp(a.reopenedAt)}
                  </span>
                )}
                {a.state === "acknowledged" && <span>oznaczone jako przeczytane</span>}
                {a.state === "resolved" && (
                  <span>
                    rozwiązane {a.resolvedAt ? stamp(a.resolvedAt) : ""}
                    {a.resolvedBy ? ` · ${a.resolvedBy}` : ""}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {a.state === "active" && (
                  <Op id={a.id} op="read" label="Przeczytane" />
                )}
                {a.state !== "resolved" ? (
                  <Op id={a.id} op="resolve" label="Rozwiązane" emphasis />
                ) : (
                  <Op id={a.id} op="open" label="Otwórz ponownie" />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
