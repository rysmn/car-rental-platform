import type { CarDay, SalesMonth } from "@/lib/admin/economics";
import {
  EXPENSE_LABEL,
  EXPENSE_GROUP_LABEL,
  EXPENSE_GROUP_OF,
  type ExpenseCategory,
  type ExpenseGroup,
} from "@/lib/admin/expense-options";
import { formatPln, pluralPl } from "@/lib/format";

/**
 * Charts for the per-car economics pages.
 *
 * Hand-rolled SVG rather than a charting library, for two reasons that are not
 * preference: the Content-Security-Policy admits no third-party script host, and
 * these render on the server, so a client-side chart runtime would be pure cost.
 * Every mark carries a `<title>`, which is the hover tooltip — no JavaScript.
 *
 * PALETTE — validated, not chosen by eye. The four hues below were run through
 * the data-viz validator against this panel's black surface on the all-pairs
 * list and clear every gate (worst normal-vision ΔE 18.3, worst CVD ΔE 8.8).
 * The obvious brand-first pick — red, orange, amber for the three cost groups —
 * FAILED at ΔE 1.4 under deuteranopia: three cost bars that are one bar to a
 * colourblind reader. Do not re-order or substitute a hue here without re-running
 * that validation; "it looks fine" is exactly the judgement the check exists to
 * replace.
 */
const C = {
  /** Money in. Also the recovered-capital fill — same meaning, same hue. */
  revenue: "#3987e5",
  /** Money out, aggregate. */
  expense: "#ED1C24",
  group: {
    wear: "#ED1C24",
    standing: "#c98500",
    running: "#199e70",
  } satisfies Record<ExpenseGroup, string>,
  /** Recessive furniture: grid, axes, idle days. Never carries meaning alone. */
  idle: "#3a3a3a",
  grid: "#242424",
  axis: "#5a5a5a",
  /**
   * Last year's figure standing behind this year's. Deliberately a neutral, not
   * a second hue: it is the same measure at an earlier time, so the encoding is
   * emphasis — subject against ground — exactly as `idle` works in the
   * occupancy strip. Two blues were tried first and failed the validator's
   * normal-vision floor at ΔE 14.7; against the revenue blue this grey scores
   * ΔE 18.7 normal and 18.4 under deuteranopia on the #0a0a0a panel, and it
   * cannot be mistaken for a cost.
   */
  baseline: "#6b6b6b",
};

/** Compact money for axis ends and tight labels: "1,2 tys. zł", "185 tys. zł". */
function shortPln(grosze: number): string {
  const zl = grosze / 100;
  const abs = Math.abs(zl);
  if (abs >= 1_000_000)
    return `${(zl / 1_000_000).toLocaleString("pl-PL", { maximumFractionDigits: 1 })} mln zł`;
  if (abs >= 1000)
    return `${(zl / 1000).toLocaleString("pl-PL", { maximumFractionDigits: abs >= 10_000 ? 0 : 1 })} tys. zł`;
  return `${Math.round(zl)} zł`;
}

function formatPl(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/* ── Legend ───────────────────────────────────────────────────────────────── */

/**
 * Always present for two or more series.
 *
 * The swatch carries identity; the text stays in the panel's own ink colour.
 * A label written in its series colour reads as decoration and fails the moment
 * the reader is colourblind — the pairing is the point.
 */
export function Legend({
  items,
}: {
  items: { color: string; label: string; value?: string }[];
}) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2 text-xs">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 shrink-0"
            style={{ backgroundColor: i.color }}
          />
          <span className="text-silver">{i.label}</span>
          {i.value && (
            <span className="text-ink-faint tabular-nums">{i.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ── Payback meter ────────────────────────────────────────────────────────── */

/**
 * One ratio against a limit — a meter, not a chart.
 *
 * Deliberately shows the OVER-recovery case too: a car past 100% has stopped
 * repaying capital and started making money, which is the single most useful
 * thing this page can tell an operator, and a bar clipped at full would hide it.
 */
export function PaybackMeter({
  recoveredGrosze,
  purchaseGrosze,
}: {
  recoveredGrosze: number;
  purchaseGrosze: number;
}) {
  const ratio = purchaseGrosze > 0 ? recoveredGrosze / purchaseGrosze : 0;
  const pct = Math.round(ratio * 100);
  const filled = Math.max(0, Math.min(1, ratio));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-heading text-ink text-2xl font-bold tabular-nums">
          {pct}%
        </span>
        <span className="text-ink-faint text-xs tabular-nums">
          {formatPln(recoveredGrosze, "pl")} z {formatPln(purchaseGrosze, "pl")}
        </span>
      </div>
      <div
        className="mt-3 h-2 w-full"
        style={{ backgroundColor: C.grid }}
        role="img"
        aria-label={`Zwrot z zakupu: ${pct} procent`}
      >
        <div
          className="h-full"
          style={{
            width: `${filled * 100}%`,
            backgroundColor: ratio >= 1 ? C.group.running : C.revenue,
          }}
        />
      </div>
    </div>
  );
}

/* ── Cumulative net curve ─────────────────────────────────────────────────── */

/**
 * Running revenue − costs, against the purchase price it has to reach.
 *
 * One series plus a reference line, so no legend box is needed — the title
 * names the series and the target line is labelled where it sits. The point of
 * the chart is the crossing: where the curve meets the dashed line is the day
 * the car has paid for itself.
 */
export function NetCurve({
  days,
  targetGrosze,
  height = 180,
}: {
  days: CarDay[];
  targetGrosze: number | null;
  height?: number;
}) {
  if (days.length < 2) {
    return <EmptyPlot label="Za mało danych, by narysować krzywą." />;
  }

  const W = 1000;
  const padL = 8;
  // Room on the right for the end-of-line value label — the one direct label
  // this chart carries. Without it the curve has no scale at all: a reader can
  // see the shape and has no idea whether it is worth 600 zł or 600 000 zł.
  const padR = 150;
  const padT = 12;
  const padB = 18;

  const values = days.map((d) => d.cumulativeNetGrosze);
  // The target belongs to the y-domain only when it is within reach of the
  // data; a car 5% of the way to a 400 000 zł purchase would otherwise draw its
  // whole history as a flat line pinned to the axis.
  const dataMax = Math.max(0, ...values);
  const dataMin = Math.min(0, ...values);
  const showTarget = targetGrosze != null && targetGrosze <= dataMax * 4;
  const max = Math.max(dataMax, showTarget ? targetGrosze : 0) || 1;
  const min = dataMin;
  const span = max - min || 1;

  const x = (i: number) => padL + (i / (days.length - 1)) * (W - padL - padR);
  const y = (v: number) =>
    padT + (1 - (v - min) / span) * (height - padT - padB);

  const line = days
    .map(
      (d, i) =>
        `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.cumulativeNetGrosze).toFixed(1)}`,
    )
    .join(" ");

  const zeroY = y(0);

  return (
    <figure className="mt-4">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="h-auto w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Skumulowany wynik od ${formatPl(days[0].date)} do ${formatPl(days[days.length - 1].date)}: ${formatPln(values[values.length - 1], "pl")}`}
      >
        <line
          x1={padL}
          x2={W - padR}
          y1={zeroY}
          y2={zeroY}
          stroke={C.axis}
          strokeWidth="1"
        />
        {showTarget && (
          <>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(targetGrosze)}
              y2={y(targetGrosze)}
              stroke={C.axis}
              strokeWidth="1.5"
              strokeDasharray="6 5"
            />
            <text
              x={padL + 4}
              y={y(targetGrosze) - 5}
              fill="#a5a5a5"
              fontSize="16"
            >
              cena zakupu {shortPln(targetGrosze)}
            </text>
          </>
        )}
        <path
          d={line}
          fill="none"
          stroke={C.revenue}
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
        {/* Invisible per-day hit targets: the hover layer, with no JavaScript. */}
        {days.map((d, i) => (
          <rect
            key={d.date}
            x={x(i) - (W - padL - padR) / days.length / 2}
            y={padT}
            width={(W - padL - padR) / days.length}
            height={height - padT - padB}
            fill="transparent"
          >
            {/* ONE string child, always. React separates adjacent children
                with comment markers, and inside an SVG <title> the HTML parser
                and the client renderer disagree about them — which is a
                hydration mismatch that throws away the whole tree. */}
            <title>{`${formatPl(d.date)} — narastająco ${formatPln(d.cumulativeNetGrosze, "pl")}`}</title>
          </rect>
        ))}
        {/* The end-of-line value: this chart's only direct label, and the only
            thing that gives the curve a magnitude. */}
        <circle
          cx={x(days.length - 1)}
          cy={y(values[values.length - 1])}
          r="4"
          fill={C.revenue}
        />
        <text
          x={x(days.length - 1) + 10}
          y={y(values[values.length - 1]) + 6}
          fill="#ffffff"
          fontSize="17"
        >
          {shortPln(values[values.length - 1])}
        </text>
      </svg>
      <div className="text-ink-faint mt-1 flex justify-between text-[10px] tabular-nums">
        <span>{formatPl(days[0].date)}</span>
        <span>{formatPl(days[days.length - 1].date)}</span>
      </div>
      {/* Say so when the target is not on the chart. A caption that promises a
          dashed line the reader cannot find is worse than no caption: they
          assume the car is nearly paid off and the line is just hard to see. */}
      {targetGrosze != null && !showTarget && (
        <figcaption className="text-ink-faint mt-2 text-xs">
          Cena zakupu ({shortPln(targetGrosze)}) jest poza skalą tego wykresu —
          wynik nie zbliżył się jeszcze na tyle, by dało się je pokazać razem.
          Postęp zwrotu jest wyżej, na pasku „Zwrot z zakupu”.
        </figcaption>
      )}
    </figure>
  );
}

/* ── Daily revenue vs expenses ────────────────────────────────────────────── */

/**
 * Money in above the line, money out below it.
 *
 * A diverging form because that is what the data is: two quantities of opposite
 * sign sharing ONE scale. Plotting cost on a second y-axis would let any pair of
 * numbers be made to look like whatever the author wanted.
 */
export function DailyFlow({
  days,
  height = 150,
}: {
  days: CarDay[];
  height?: number;
}) {
  if (days.length === 0) {
    return <EmptyPlot label="Brak danych w tym okresie." />;
  }

  const W = 1000;
  const padT = 10;
  const padB = 10;
  const slot = W / days.length;
  const barW = Math.max(1, slot - 2); // the 2px surface gap between bars

  const peak =
    Math.max(
      1,
      ...days.map((d) => Math.max(d.revenueGrosze, d.expenseGrosze)),
    ) || 1;
  const half = (height - padT - padB) / 2;
  const mid = padT + half;
  const h = (v: number) => (v / peak) * half;

  return (
    <figure className="mt-4">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="h-auto w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Dzienny przychód i wydatki"
      >
        <line x1={0} x2={W} y1={mid} y2={mid} stroke={C.axis} strokeWidth="1" />
        {days.map((d, i) => {
          const cx = i * slot + (slot - barW) / 2;
          return (
            <g key={d.date}>
              {d.revenueGrosze > 0 && (
                <rect
                  x={cx}
                  y={mid - h(d.revenueGrosze)}
                  width={barW}
                  height={h(d.revenueGrosze)}
                  fill={C.revenue}
                />
              )}
              {d.expenseGrosze > 0 && (
                <rect
                  x={cx}
                  y={mid}
                  width={barW}
                  height={h(d.expenseGrosze)}
                  fill={C.expense}
                />
              )}
              {/* Full-height hit target so hovering an empty day still answers. */}
              <rect
                x={i * slot}
                y={0}
                width={slot}
                height={height}
                fill="transparent"
              >
                <title>
                  {`${formatPl(d.date)}${
                    d.revenueGrosze > 0
                      ? ` — przychód ${formatPln(d.revenueGrosze, "pl")}`
                      : " — bez wynajmu"
                  }${
                    d.expenseGrosze > 0
                      ? ` · wydatek ${formatPln(d.expenseGrosze, "pl")}`
                      : ""
                  }`}
                </title>
              </rect>
            </g>
          );
        })}
      </svg>
      <Legend
        items={[
          { color: C.revenue, label: "Przychód" },
          { color: C.expense, label: "Wydatki" },
        ]}
      />
    </figure>
  );
}

/* ── Occupancy strip ──────────────────────────────────────────────────────── */

/**
 * One cell per day: earning, or standing still.
 *
 * Emphasis rather than two competing hues — the rented days are the subject and
 * the idle ones are the recessive ground. The gap between them is the answer to
 * "czas postojowy", and seeing it as a run of grey says more than the number.
 */
export function OccupancyStrip({ days }: { days: CarDay[] }) {
  if (days.length === 0) return <EmptyPlot label="Brak danych." />;

  const W = 1000;
  const H = 26;
  const slot = W / days.length;
  const cellW = Math.max(1, slot - 1);
  const rented = days.filter((d) => d.rented).length;

  return (
    <figure className="mt-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-6 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Zajętość: ${rented} z ${days.length} dni wynajęte`}
      >
        {days.map((d, i) => (
          <rect
            key={d.date}
            x={i * slot}
            y={0}
            width={cellW}
            height={H}
            fill={d.rented ? C.revenue : C.idle}
          >
            <title>{`${formatPl(d.date)} — ${d.rented ? "wynajęty" : "postój"}`}</title>
          </rect>
        ))}
      </svg>
      <Legend
        items={[
          {
            color: C.revenue,
            label: "Wynajęty",
            value: `${rented} ${pluralPl(rented, "dzień", "dni", "dni")}`,
          },
          {
            color: C.idle,
            label: "Postój",
            value: `${days.length - rented} ${pluralPl(days.length - rented, "dzień", "dni", "dni")}`,
          },
        ]}
      />
    </figure>
  );
}

/* ── Cost composition ─────────────────────────────────────────────────────── */

/** Part-to-whole across the three cost groups, plus the ranked detail beneath. */
export function CostBreakdown({
  byGroup,
  byCategory,
}: {
  byGroup: Record<ExpenseGroup, number>;
  byCategory: Partial<Record<ExpenseCategory, number>>;
}) {
  const total = byGroup.wear + byGroup.standing + byGroup.running;
  if (total === 0) {
    return (
      <EmptyPlot label="Brak zapisanych wydatków — dodaj je przy egzemplarzu w zakładce Flota." />
    );
  }

  const groups = (["wear", "standing", "running"] as const).filter(
    (g) => byGroup[g] > 0,
  );
  const ranked = Object.entries(byCategory)
    .map(([k, v]) => [k as ExpenseCategory, v ?? 0] as const)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const top = ranked[0]?.[1] ?? 1;

  const W = 1000;
  const H = 22;
  let cursor = 0;

  return (
    <div className="mt-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-5 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Struktura kosztów według grup"
      >
        {groups.map((g) => {
          // 2px of surface between segments so neighbouring fills never fuse
          // into one block — the gap is what makes the boundary readable.
          const w = (byGroup[g] / total) * W;
          const x = cursor;
          cursor += w;
          return (
            <rect
              key={g}
              x={x}
              y={0}
              width={Math.max(0, w - 2)}
              height={H}
              fill={C.group[g]}
            >
              <title>
                {`${EXPENSE_GROUP_LABEL[g]} — ${formatPln(byGroup[g], "pl")} (${Math.round(
                  (byGroup[g] / total) * 100,
                )}%)`}
              </title>
            </rect>
          );
        })}
      </svg>
      <Legend
        items={groups.map((g) => ({
          color: C.group[g],
          label: EXPENSE_GROUP_LABEL[g],
          value: formatPln(byGroup[g], "pl"),
        }))}
      />

      {/* Ranked detail. Length carries the magnitude, so one hue is correct
          here — a colour per category would be eighteen meaningless hues. */}
      <ul className="mt-6 space-y-2">
        {ranked.map(([cat, value]) => (
          <li key={cat} className="flex items-center gap-3 text-xs">
            <span className="text-silver w-44 shrink-0 truncate">
              {EXPENSE_LABEL[cat]}
            </span>
            <span className="h-2 flex-1" style={{ backgroundColor: C.grid }}>
              <span
                className="block h-full"
                style={{
                  width: `${Math.max(2, (value / top) * 100)}%`,
                  // Coloured by the group the category belongs to, so the
                  // ranked list and the stacked bar above agree at a glance.
                  backgroundColor: C.group[EXPENSE_GROUP_OF[cat]],
                }}
              />
            </span>
            <span className="text-silver w-24 shrink-0 text-right tabular-nums">
              {formatPln(value, "pl")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Shared empty state ───────────────────────────────────────────────────── */

function EmptyPlot({ label }: { label: string }) {
  return (
    <p className="border-line text-ink-faint mt-4 border border-dashed px-5 py-8 text-center text-xs">
      {label}
    </p>
  );
}

/* ── Sales trend: month on month, year on year ────────────────────────────── */

/**
 * "2026-08" → "sie", with the year appended only where it changes.
 *
 * Twelve ticks share the width of a phone. Repeating "25" beside every month
 * of 2025 spends that width on the one thing the reader can infer from the
 * tick before it, and the labels start colliding; stating the year at January
 * and at the left edge says the same thing in half the space.
 */
function monthTick(month: string, withYear = true): string {
  const [y, m] = month.split("-").map(Number);
  const name = new Intl.DateTimeFormat("pl-PL", { month: "short" })
    .format(new Date(Date.UTC(y, m - 1, 1)))
    .replace(".", "");
  return withYear ? `${name} ${String(y).slice(2)}` : name;
}

/** "+12,4%" / "−8,1%" / "—" when there was no base to compare against. */
export function formatPct(pct: number | null): string {
  if (pct == null) return "—";
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded).toLocaleString("pl-PL", {
    maximumFractionDigits: 1,
  })}%`;
}

/**
 * Twelve months of sales, each beside the same month a year earlier.
 *
 * Two bars per month rather than two lines: the question is "was August better
 * than last August", which is a comparison of magnitudes at a point, not a
 * trend to trace. Last year stands behind as grey ground so this year reads as
 * the subject — see `C.baseline`.
 *
 * The month still being traded is hatched, not solid. Its bar is genuinely
 * shorter because the month is genuinely unfinished, and a solid bar there
 * would read as a collapse in sales every single month.
 */
export function SalesTrend({
  months,
  height = 210,
}: {
  months: SalesMonth[];
  height?: number;
}) {
  if (months.length === 0) {
    return <EmptyPlot label="Brak danych sprzedażowych." />;
  }

  const W = 1000;
  const padT = 30; // room for the peak label and the one direct value
  const padB = 6;
  const slot = W / months.length;
  const gap = 3; // the surface gap between the pair
  const barW = Math.max(3, (slot - 14 - gap) / 2);

  const peak = Math.max(
    1,
    ...months.map((m) => Math.max(m.revenueGrosze, m.prevYearGrosze ?? 0)),
  );
  const base = height - padB;
  const h = (v: number) => ((v || 0) / peak) * (base - padT);

  return (
    <figure className="mt-4">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="h-auto w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Przychód miesięczny za ostatnie ${months.length} miesięcy, zestawiony z tym samym miesiącem rok wcześniej`}
      >
        <defs>
          <pattern
            id="salesPartial"
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="8" height="8" fill={C.revenue} opacity="0.25" />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="8"
              stroke={C.revenue}
              strokeWidth="4"
            />
          </pattern>
        </defs>

        {/* Peak gridline — the chart's scale, stated once. */}
        <line
          x1={0}
          x2={W}
          y1={padT}
          y2={padT}
          stroke={C.grid}
          strokeWidth="1"
        />
        <line
          x1={0}
          x2={W}
          y1={base}
          y2={base}
          stroke={C.axis}
          strokeWidth="1"
        />

        {months.map((m, i) => {
          const groupL = i * slot + (slot - (barW * 2 + gap)) / 2;
          const prev = m.prevYearGrosze ?? 0;
          return (
            <g key={m.month}>
              {prev > 0 && (
                <rect
                  x={groupL}
                  y={base - h(prev)}
                  width={barW}
                  height={h(prev)}
                  fill={C.baseline}
                />
              )}
              {m.revenueGrosze > 0 && (
                <rect
                  x={groupL + barW + gap}
                  y={base - h(m.revenueGrosze)}
                  width={barW}
                  height={h(m.revenueGrosze)}
                  fill={m.partial ? "url(#salesPartial)" : C.revenue}
                />
              )}
              <rect
                x={i * slot}
                y={0}
                width={slot}
                height={height}
                fill="transparent"
              >
                <title>
                  {`${monthTick(m.month)}${
                    m.partial ? " (miesiąc w toku)" : ""
                  } — przychód ${formatPln(m.revenueGrosze, "pl")}${
                    m.prevYearGrosze != null
                      ? ` · rok wcześniej ${formatPln(m.prevYearGrosze, "pl")} (r/r ${formatPct(m.yoyPct)})`
                      : " · brak danych sprzed roku"
                  }${m.prevMonthGrosze != null ? ` · m/m ${formatPct(m.momPct)}` : ""}`}
                </title>
              </rect>
            </g>
          );
        })}
      </svg>

      {/* Month ticks live in HTML, not in the SVG: the plot is stretched to the
          panel width, and text inside it would stretch with it. */}
      <div
        className="text-ink-faint mt-1 grid gap-0 text-center text-[9px]"
        style={{
          gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))`,
        }}
      >
        {months.map((m, i) => (
          <span key={m.month} className={m.partial ? "text-silver" : undefined}>
            {monthTick(m.month, i === 0 || m.month.endsWith("-01"))}
          </span>
        ))}
      </div>

      {/* The legend names the series and nothing else. A bare figure beside
          "Przychód" reads as a total for the whole chart; the one month it
          actually described is already the headline tile above. */}
      <Legend
        items={[
          { color: C.revenue, label: "Przychód w miesiącu" },
          { color: C.baseline, label: "Ten sam miesiąc rok wcześniej" },
        ]}
      />
      <figcaption className="text-ink-faint mt-2 text-[10px]">
        Skala do {shortPln(peak)}. Ostatni słupek jest kreskowany, bo miesiąc
        jeszcze trwa — porównuj go z ostrożnością.
      </figcaption>
    </figure>
  );
}
