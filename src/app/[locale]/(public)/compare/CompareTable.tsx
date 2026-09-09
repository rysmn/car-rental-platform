"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FavoriteButton } from "@/components/fleet/FavoriteButton";
import { VehicleStatus } from "@/components/fleet/VehicleStatus";
import type { FleetState } from "@/lib/fleet/status";
import { zdjecieNaPozycji } from "@/lib/fleet/zdjecie-motywu";

export type CompareRow = {
  key: string;
  label: string;
  /** One cell per car, already formatted. "—" where the fleet holds nothing. */
  values: string[];
  /**
   * What a money cell actually draws — `<Money>`, which carries both currencies
   * and lets CSS pick one, so the table switches with the rest of the page.
   *
   * `values` stays beside it and is not redundant: it is the row's textual
   * identity, and it is what "show differences only" compares. Two cars whose
   * złoty prices are equal are equal whatever currency is on screen, and a
   * filter that read rendered nodes would have to guess at that.
   */
  nodes?: React.ReactNode[];
  /**
   * Indices of the cars holding the better figure, for the handful of rows
   * where "better" is arithmetic rather than taste.
   */
  best?: number[];
};

export type CompareColumn = {
  id: string;
  slug: string;
  name: string;
  /*
    Cała lista, nie jedno zdjęcie: pierwsze widoczne zależy od motywu, a ta
    tabela rysuje surowy <img> (adresy z /api/media omijają optymalizator),
    więc nie może skorzystać z `CarPhoto`. Reguła zostaje jedna — poniżej pyta
    o nią `zdjecieNaPozycji`, tę samą funkcję co reszta floty.
  */
  images: readonly string[];
  fromLabel: string;
  priceLabel: string | null;
  totalLabel: string | null;
  unavailable: boolean;
  bookHref: string;
  /**
   * Today's state, from the one central source, or null when the operator has
   * hidden public statuses — exactly the same prop a fleet card takes.
   */
  state?: FleetState | null;
  /** The Availability Engine's verdict for the chosen dates; null without them. */
  freeForDates?: boolean | null;
  /** Pierwszy wolny dzień modelu (`YYYY-MM-DD`) — patrz `VehicleStatus`. */
  nextFreeDay?: string | null;
};

/**
 * The comparison itself.
 *
 * ## Why the rows arrive pre-formatted
 *
 * Every value is turned into a string on the server, where the fleet, the price
 * calculator and the Rules Centre already live. This component decides layout
 * and nothing else — it cannot invent a figure, because it never sees a number
 * it could do arithmetic on.
 *
 * ## Desktop and phone
 *
 * One table, scrolled inside its own box. Three columns of car do not fit on a
 * 390px screen and squeezing them produces something unreadable; letting the
 * table scroll sideways *within the page* keeps the whole comparison in one
 * shape the visitor already understands, without the page itself ever scrolling
 * horizontally. The first column is sticky so the row label stays in view while
 * the cars move.
 */
export function CompareTable({
  columns,
  rows,
  range,
  today,
}: {
  columns: CompareColumn[];
  rows: CompareRow[];
  range: { from: string; to: string } | null;
  /** Dzisiejsza data `YYYY-MM-DD`, policzona na serwerze — nigdy w przeglądarce. */
  today?: string;
}) {
  const t = useTranslations("Compare");
  const tSaved = useTranslations("Saved");
  const locale = useLocale();
  const [diffOnly, setDiffOnly] = useState(false);

  const shown = useMemo(() => {
    if (!diffOnly) return rows;
    // A row where every car says the same thing helps nobody decide.
    return rows.filter((r) => new Set(r.values).size > 1);
  }, [rows, diffOnly]);

  /** Drop one car without leaving the page: same URL, one id fewer. */
  const withoutHref = (id: string) => {
    const rest = columns.filter((c) => c.id !== id).map((c) => c.id);
    const q = new URLSearchParams({ cars: rest.join(",") });
    if (range) {
      q.set("od", range.from);
      q.set("do", range.to);
    }
    return `${locale === "en" ? "/en" : ""}/compare?${q.toString()}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="text-silver flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={diffOnly}
            onChange={(e) => setDiffOnly(e.target.checked)}
            className="accent-red size-4"
          />
          {t("differencesOnly")}
        </label>
        <Link
          href="/saved"
          className="label-tight text-ink-faint hover:text-ink tap text-[11px] transition-colors"
        >
          {t("addCar")}
        </Link>
      </div>

      {/* The scroll lives here, on the table's own box — never on the page. */}
      <div className="border-line overflow-x-auto border">
        <table className="w-full min-w-[38rem] border-collapse text-sm">
          <thead>
            <tr>
              <th className="bg-void border-line sticky left-0 z-10 w-40 border-r border-b p-3 text-left align-bottom">
                <span className="label-tight text-ink-faint text-[10px]">
                  {t("title")}
                </span>
              </th>
              {columns.map((c) => (
                <th
                  key={c.id}
                  className="border-line min-w-[13rem] border-b p-3 text-left align-bottom"
                >
                  <div className="flex flex-col gap-2">
                    <div className="bg-surface-2 relative aspect-[16/10] w-full overflow-hidden">
                      {c.images.length > 0 ? (
                        /* /api/media bypasses the optimiser, same as elsewhere.
                           Obie warstwy idą z serwera, właściwą odsłania CSS —
                           serwer nie zna motywu, a wybór po hydracji byłby
                           widocznym mrugnięciem. */
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={c.images[0]}
                            alt={c.name}
                            className="theme-dark-only h-full w-full object-cover"
                          />
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={
                              c.images[zdjecieNaPozycji(0, true)] ?? c.images[0]
                            }
                            alt={c.name}
                            className="theme-light-only h-full w-full object-cover"
                          />
                        </>
                      ) : (
                        <span className="text-ink-faint flex h-full items-center justify-center text-[11px]">
                          —
                        </span>
                      )}
                      {/* Stan w prawym górnym rogu zdjęcia — ta sama pigułka co
                          na kartach floty. Serce jest w prawym dolnym rogu, więc
                          nie ma o co się bić. Bez zdjęcia pigułka nadal działa:
                          leży wtedy na szarej płycie zastępczej, a nie na
                          fotografii, i czarna przesłona nie przeszkadza. */}
                      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end p-2.5">
                        <VehicleStatus
                          state={c.state ?? null}
                          freeForDates={c.freeForDates ?? null}
                          nextFreeDay={c.nextFreeDay ?? null}
                          today={today}
                          variant="onMedia"
                          className="max-w-full text-right"
                        />
                      </div>
                      <FavoriteButton carId={c.id} carName={c.name} />
                    </div>
                    <span className="font-heading text-ink text-base font-bold">
                      {c.name}
                    </span>
                    {/* Stan stoi teraz NA ZDJĘCIU wyżej, nie pod nazwą —
                        ten sam fakt dwa razy w jednej kolumnie byłby dokładnie
                        tym rozjazdem, przed którym `VehicleStatus` ma chronić.
                        Bez statusów publicznych i bez wybranego terminu nie ma
                        czego pokazać — wtedy zostaje dotychczasowy napis. */}
                    {c.unavailable && c.freeForDates == null && !c.state && (
                      <span className="label-tight text-red text-[10px]">
                        {t("unavailable")}
                      </span>
                    )}
                    <a
                      href={withoutHref(c.id)}
                      className="label-tight text-ink-faint hover:text-red tap text-[10px] transition-colors"
                    >
                      {t("removeCar")}
                    </a>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} className="border-line border-b last:border-0">
                <th
                  scope="row"
                  className="bg-void border-line sticky left-0 z-10 border-r p-3 text-left align-top"
                >
                  <span className="label-tight text-ink-faint text-[10px]">
                    {r.label}
                  </span>
                </th>
                {r.values.map((v, i) => (
                  <td
                    key={i}
                    className={`p-3 align-top text-xs ${
                      r.best?.includes(i)
                        ? "text-ink font-semibold"
                        : "text-silver"
                    }`}
                  >
                    {/* A money cell draws both currencies and lets CSS choose;
                        everything else is the string the server formatted. */}
                    {r.nodes?.[i] ?? v}
                    {/* The mark is arithmetic only — cheaper, more seats, lower
                        deposit. Nothing here calls a car "the best". */}
                    {r.best?.includes(i) && (
                      <span aria-hidden className="text-red ml-1">
                        ●
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="bg-void border-line sticky left-0 z-10 border-t border-r p-3" />
              {columns.map((c) => (
                <td key={c.id} className="border-line border-t p-3 align-top">
                  <div className="flex flex-col gap-2">
                    <Link
                      href={{
                        pathname: "/fleet/[slug]",
                        params: { slug: c.slug },
                      }}
                      className="label-tight border-line-strong text-ink hover:border-ink tap inline-flex h-10 items-center justify-center border px-3 text-[10px] transition-colors"
                    >
                      {tSaved("details")}
                    </Link>
                    <a
                      href={c.bookHref}
                      className="label-tight bg-red tap inline-flex h-10 items-center justify-center px-3 text-[10px] text-white transition-opacity hover:opacity-90"
                    >
                      {tSaved("book")}
                    </a>
                  </div>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-ink-faint text-xs">{t("lead")}</p>
    </div>
  );
}
