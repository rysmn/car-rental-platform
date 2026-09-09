import { setRequestLocale } from "next-intl/server";
import { guardPage } from "@/lib/auth/guard";
import { Link, type AppHref } from "@/i18n/navigation";
import { listReservations } from "@/lib/admin/reservations";
import {
  STATUS_LABEL,
  type ReservationStatus,
} from "@/lib/admin/reservation-status";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatPln, formatDatePl } from "@/lib/format";
import { naleznosciDla } from "@/lib/booking/cancellation-repo";

const STATUSES: ReservationStatus[] = [
  "pending_verification",
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "rejected",
];

function asStatus(v: unknown): ReservationStatus | undefined {
  return typeof v === "string" && STATUSES.includes(v as ReservationStatus)
    ? (v as ReservationStatus)
    : undefined;
}

export default async function ReservationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /*
    Kontrola uprawnień przy renderze strony — obok kontroli w każdej akcji,
    nie zamiast niej. Bez tego pracownik wpisujący adres z ręki zobaczyłby
    treść sekcji, której nie wolno mu oglądać, i dopiero pierwszy przycisk
    powiedziałby mu „nie wolno".
  */
  await guardPage("rezerwacje.podglad");

  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const status = asStatus(sp.status);
  const q = typeof sp.q === "string" && sp.q.trim() ? sp.q.trim() : undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const { items, total, pageSize } = await listReservations({
    status,
    q,
    page,
  });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  /*
    Należności jednym zapytaniem dla całej strony, nie po jednym na wiersz:
    dwadzieścia rezerwacji to dwadzieścia zapytań, a większość i tak nie ma
    żadnej opłaty.
  */
  const oplaty = await naleznosciDla(items.map((r) => r.id));

  const pageHref = (n: number) => ({
    pathname: "/admin/reservations" as const,
    query: {
      ...(status ? { status } : {}),
      ...(q ? { q } : {}),
      ...(n > 1 ? { page: String(n) } : {}),
    },
  });

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-ink text-2xl">Rezerwacje</h1>
          <p className="text-silver mt-1 text-sm">
            {total} {total === 1 ? "rezerwacja" : "rezerwacji"} łącznie
          </p>
        </div>
      </header>

      <form
        method="get"
        className="border-line bg-graphite/40 mb-6 flex flex-wrap items-end gap-3 border p-4"
      >
        <label className="flex flex-col gap-1">
          <span className="label-tight text-ink-faint text-[10px]">Status</span>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="border-line-strong bg-surface-1 text-ink h-11 border px-3 text-sm"
          >
            <option value="">Wszystkie</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="label-tight text-ink-faint text-[10px]">Szukaj</span>
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Numer, nazwisko lub e-mail"
            className="border-line-strong placeholder:text-ink-faint bg-surface-1 text-ink h-11 min-w-48 border px-3 text-sm"
          />
        </label>
        <button
          type="submit"
          className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 inline-flex h-11 items-center border px-6 text-xs transition-colors"
        >
          Filtruj
        </button>
        {(status || q) && (
          <Link
            href="/admin/reservations"
            className="label text-ink-faint hover:text-ink inline-flex h-11 items-center px-3 text-xs transition-colors"
          >
            Wyczyść
          </Link>
        )}
      </form>

      {items.length === 0 ? (
        <p className="border-line bg-graphite/40 text-silver border p-10 text-center text-sm">
          Brak rezerwacji dla wybranych filtrów.
        </p>
      ) : (
        <div className="border-line overflow-x-auto border">
          <table className="w-full min-w-3xl border-collapse text-sm">
            <thead>
              <tr className="border-line bg-graphite/60 border-b text-left">
                <Th>Numer</Th>
                <Th>Auto</Th>
                <Th>Termin</Th>
                <Th>Klient</Th>
                <Th className="text-right">Kwota</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr
                  key={r.id}
                  className="border-line/60 hover:bg-ink/5 border-b transition-colors last:border-0"
                >
                  <Td>
                    <Link
                      href={{
                        pathname: "/admin/reservations/[id]",
                        params: { id: r.id },
                      }}
                      className="text-ink tap-area -my-2 inline-block py-2 font-mono underline-offset-4 hover:underline"
                    >
                      {r.reference}
                    </Link>
                  </Td>
                  <Td>
                    <span className="text-ink">
                      {r.brand} {r.model}
                    </span>
                    {r.plate && (
                      <span className="text-ink-faint ml-2">{r.plate}</span>
                    )}
                  </Td>
                  <Td className="text-silver whitespace-nowrap">
                    {formatDatePl(r.startDate)} – {formatDatePl(r.endDate)}
                  </Td>
                  <Td className="text-silver">{r.customerName}</Td>
                  <Td className="text-ink text-right whitespace-nowrap">
                    {formatPln(r.totalGrosze, locale)}
                  </Td>
                  <Td>
                    <StatusBadge status={r.status as ReservationStatus} />
                    {/*
                      Należność POD statusem, w tej samej komórce — bo to jest
                      dopowiedzenie do statusu, a nie osobna informacja. Nowa
                      kolumna pusta w dziewięciu wierszach na dziesięć
                      kosztowałaby szerokość tabeli na każdej innej sprawie.
                    */}
                    {(() => {
                      const o = oplaty.get(r.id);
                      if (!o || o.amountGrosze <= 0) return null;
                      const etykieta =
                        o.status === "waived"
                          ? "UMORZONE"
                          : o.status === "paid"
                            ? "ZAPŁACONE"
                            : "DO ZAPŁATY";
                      return (
                        <span
                          className={`label-tight mt-1 block text-[10px] whitespace-nowrap ${
                            o.status === "due" ? "text-red" : "text-ink-faint"
                          }`}
                          data-fee-badge={o.status}
                        >
                          {formatPln(o.amountGrosze, locale)} · {etykieta}
                        </span>
                      );
                    })()}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-between text-sm">
          <PageLink href={pageHref(page - 1)} disabled={page <= 1}>
            ← Poprzednia
          </PageLink>
          <span className="text-ink-faint">
            Strona {page} z {pages}
          </span>
          <PageLink href={pageHref(page + 1)} disabled={page >= pages}>
            Następna →
          </PageLink>
        </nav>
      )}
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`label-tight text-ink-faint px-4 py-3 text-[10px] font-normal ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: AppHref;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="text-ink-faint opacity-40">{children}</span>;
  }
  return (
    <Link
      href={href}
      className="text-silver hover:text-ink underline-offset-4 transition-colors hover:underline"
    >
      {children}
    </Link>
  );
}
