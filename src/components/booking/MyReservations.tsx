"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "@/i18n/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { formatPln, formatPlnDokladnie } from "@/lib/format";
import { formatKm } from "@/lib/booking/mileage";
import { lookupReservations } from "@/lib/booking/lookup";
import { ManageReservation } from "./ManageReservation";
import type { ReservationSummary } from "@/lib/booking/lookup";
import {
  forgetReservation,
  getMyReservationRefs,
  getMyReservationRefsOnServer,
  subscribeMyReservations,
  UNKNOWN_REFS,
} from "@/lib/booking/my-reservations";

export type MyReservationsLabels = {
  empty: string;
  emptyCta: string;
  browse: string;
  days: string;
  total: string;
  deposit: string;
  mileageIncluded: string;
  extraMileage: string;
  extraMileageNotRecorded: string;
  remove: string;
  loading: string;
  deviceNote: string;
  status: Record<ReservationSummary["status"], string>;
};

/** dd.mm.yyyy — the format the rest of the site uses for dates. */
function formatRange(start: string, end: string, locale: string) {
  const fmt = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pl-PL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `${fmt.format(new Date(start))} – ${fmt.format(new Date(end))}`;
}

export function MyReservations({
  locale,
  labels,
  kontaktTelefon = null,
  kontaktEmail = null,
}: {
  locale: string;
  labels: MyReservationsLabels;
  /** Kanał kontaktu pokazywany, gdy do odbioru zostało 24 h lub mniej.
   *  Przychodzi z ustawień firmy — ten sam, który stoi w stopce. */
  kontaktTelefon?: string | null;
  kontaktEmail?: string | null;
}) {
  // Which references this browser holds. Server-rendered as empty, since the
  // list only exists client-side.
  const refs = useSyncExternalStore(
    subscribeMyReservations,
    getMyReservationRefs,
    getMyReservationRefsOnServer,
  );

  const [fetched, setFetched] = useState<ReservationSummary[] | null>(null);

  /*
    Licznik, który wymusza ponowne odczytanie listy po zmianie albo anulowaniu
    — bez ręcznego przeładowania strony, czego zlecenie wymaga wprost.
    Zmiana terminu nie rusza `localStorage`, więc sam zestaw numerów zostaje
    ten sam i nic by się nie odświeżyło; ten licznik jest jedyną rzeczą, która
    się wtedy zmienia.
  */
  const [odswiezenie, setOdswiezenie] = useState(0);

  // Re-resolve whenever the stored set changes. Statuses move (pending →
  // confirmed) without the visitor doing anything, so this always re-reads
  // rather than trusting a cached copy.
  const key = refs.join(",");
  useEffect(() => {
    if (refs.length === 0) return;
    let cancelled = false;
    lookupReservations(refs)
      .then((rows) => {
        if (!cancelled) setFetched(rows);
      })
      .catch(() => {
        if (!cancelled) setFetched([]);
      });
    return () => {
      cancelled = true;
    };
    // `key` stands in for the array identity — refs itself is a new array only
    // when the store changes, but this keeps the intent explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, odswiezenie]);

  // Derived, not stored: an empty device needs no fetch at all, and dropping a
  // reference takes effect immediately instead of waiting for a round trip.
  const items =
    refs.length === 0
      ? []
      : (fetched?.filter((r) => refs.includes(r.reference)) ?? null);

  // Before hydration we cannot know what this browser holds, so show the
  // loading line rather than asserting the visitor has nothing.
  if (refs === UNKNOWN_REFS || items === null) {
    return <p className="text-ink-faint text-sm">{labels.loading}</p>;
  }

  if (items.length === 0) {
    return (
      <div className="border-line border p-8 text-center md:p-12">
        <p className="text-ink-muted text-sm">{labels.empty}</p>
        <div className="mt-7 flex justify-center">
          <ButtonLink href="/fleet">{labels.browse}</ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <>
      <ul className="border-line grid gap-px border sm:grid-cols-2">
        {items.map((r) => (
          /*
            Kotwica pod adres `/moje-rezerwacje#AA-XXXXXXXX`. Pasek „✓ Moja
            rezerwacja" prowadzi do KONKRETNEJ sprawy, kiedy jest tylko jedna,
            a osobnej strony rezerwacji ten serwis nie ma — i nie powinien mieć,
            bo numer jest tokenem na okaziciela i własny adres URL zapraszałby
            do zgadywania. `scroll-mt-28` odsuwa kartę spod przyklejonego
            nagłówka; bez tego kotwica ustawia ją dokładnie pod belką i wygląda,
            jakby prowadziła w złe miejsce. `target:` podświetla tę jedną kartę,
            żeby po skoku było widać, o którą chodziło.
          */
          <li
            key={r.reference}
            id={r.reference}
            className="bg-void border-line target:border-line-strong scroll-mt-28 border p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <span className="label-tight text-ink-faint text-[10px]">
                {r.reference}
              </span>
              <span className="label-tight border-line-strong text-silver border px-2 py-1 text-[10px] whitespace-nowrap">
                {labels.status[r.status]}
              </span>
            </div>

            <Link
              href={{ pathname: "/fleet/[slug]", params: { slug: r.carSlug } }}
              className="font-heading text-ink hover:text-red mt-4 block text-xl font-bold transition-colors"
            >
              {r.carName}
            </Link>

            <p className="text-silver mt-2 text-sm">
              {formatRange(r.startDate, r.endDate, locale)}
              <span className="text-ink-faint">
                {" · "}
                {r.days} {labels.days}
              </span>
            </p>

            <dl className="divide-line border-line mt-6 divide-y border-t text-sm">
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-ink-muted">{labels.total}</dt>
                <dd className="font-heading text-ink font-bold">
                  {formatPln(r.totalGrosze, locale)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-ink-muted">{labels.deposit}</dt>
                <dd className="text-silver">
                  {formatPln(r.depositGrosze, locale)}
                </dd>
              </div>
              {/*
                WARUNKI PRZEBIEGU Z DNIA ZAWARCIA — czytane z migawki wyceny.

                Nie z dzisiejszego cennika auta i to jest cała różnica: gdy
                właściciel podniesie za miesiąc stawkę BMW z 4,50 na 5,00,
                rezerwacja zawarta dziś nadal pokazuje tu 4,50. Klient widzi to,
                na co się umówił.

                Rezerwacje sprzed 01.09.2026 tych pól nie mają i mówią to
                wprost, zamiast pokazywać liczbę wziętą z dzisiaj.
              */}
              {r.includedMileageKm != null && (
                <div className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-ink-muted">{labels.mileageIncluded}</dt>
                  <dd className="text-silver">
                    {formatKm(r.includedMileageKm, locale)} km
                  </dd>
                </div>
              )}
              {r.extraMileageFeeGrosze != null ? (
                <div className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-ink-muted">{labels.extraMileage}</dt>
                  <dd className="text-silver whitespace-nowrap">
                    {formatPlnDokladnie(r.extraMileageFeeGrosze, locale)}/km
                  </dd>
                </div>
              ) : (
                r.includedMileageKm != null && (
                  <div className="py-3">
                    <p className="text-ink-faint text-xs">
                      {labels.extraMileageNotRecorded}
                    </p>
                  </div>
                )
              )}
            </dl>

            <ManageReservation
              reference={r.reference}
              locale={locale}
              kontaktTelefon={kontaktTelefon}
              kontaktEmail={kontaktEmail}
              onZmiana={() => setOdswiezenie((n) => n + 1)}
            />

            <button
              type="button"
              onClick={() => forgetReservation(r.reference)}
              className="label-tight text-ink-faint hover:text-ink tap mt-5 text-[10px] transition-colors"
            >
              {labels.remove}
            </button>
          </li>
        ))}
      </ul>

      <p className="text-ink-faint mt-8 text-xs">{labels.deviceNote}</p>
    </>
  );
}
