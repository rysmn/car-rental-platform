import { PERIODS, type PeriodKey, type Window } from "@/lib/admin/insights";

/**
 * The filter bar, as a plain GET form.
 *
 * No client component and no JavaScript: the whole panel renders on the
 * server, the filters are in the URL, and a filtered view is therefore a link
 * somebody can bookmark or send to the accountant. A React-controlled bar
 * would buy an auto-submit and cost all of that.
 */
export function InsightFilters({
  period,
  window,
  carId,
  segment,
  locationId,
  compare,
  cars,
  segments,
  locations,
}: {
  period: PeriodKey;
  window: Window;
  carId?: string;
  segment?: string;
  locationId?: string;
  compare: boolean;
  cars: { id: string; label: string }[];
  segments: { key: string; label: string }[];
  locations: { id: string; name: string }[];
}) {
  const field =
    "h-9 border border-line-strong bg-surface-1 px-2 text-xs text-ink";

  return (
    <form
      method="get"
      className="border-line bg-void flex flex-wrap items-end gap-3 border p-4"
    >
      <label className="flex flex-col gap-1">
        <span className="label-tight text-ink-faint text-[10px]">Okres</span>
        <select name="period" defaultValue={period} className={field}>
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
          <option value="custom">Własny zakres</option>
        </select>
      </label>

      {/* Always visible, not hidden behind the "custom" choice: they double as
          a readout of what the chosen preset actually resolved to. */}
      <label className="flex flex-col gap-1">
        <span className="label-tight text-ink-faint text-[10px]">Od</span>
        <input
          type="date"
          name="from"
          defaultValue={window.from}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label-tight text-ink-faint text-[10px]">Do</span>
        <input
          type="date"
          name="to"
          defaultValue={window.to}
          className={field}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="label-tight text-ink-faint text-[10px]">Samochód</span>
        <select name="car" defaultValue={carId ?? ""} className={field}>
          <option value="">Cała flota</option>
          {cars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="label-tight text-ink-faint text-[10px]">Klasa</span>
        <select name="segment" defaultValue={segment ?? ""} className={field}>
          <option value="">Wszystkie</option>
          {segments.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="label-tight text-ink-faint text-[10px]">
          Miejsce odbioru
        </span>
        <select
          name="location"
          defaultValue={locationId ?? ""}
          className={field}
        >
          <option value="">Wszystkie</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>

      <label className="text-ink tap-block flex h-9 items-center gap-2 text-xs">
        <input
          type="checkbox"
          name="compare"
          value="1"
          defaultChecked={compare}
          className="h-4 w-4"
        />
        Porównaj z poprzednim okresem
      </label>

      <button
        type="submit"
        className="label bg-red hover:bg-red-hover inline-flex h-9 items-center px-5 text-xs text-white transition-colors"
      >
        Pokaż
      </button>
    </form>
  );
}
