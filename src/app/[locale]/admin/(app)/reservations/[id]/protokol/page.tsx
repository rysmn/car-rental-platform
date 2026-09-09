import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { guardPage } from "@/lib/auth/guard";
import { Link } from "@/i18n/navigation";
import { getReservation } from "@/lib/admin/reservations";
import { getSetting } from "@/lib/admin/settings";
import {
  CHECKLIST,
  CLEANLINESS_LABEL,
  FUEL_LABEL,
  GROUP_LABEL,
  compareHandovers,
  getBothHandovers,
  type HandoverRecord,
} from "@/lib/admin/handovers";
import { formatDatePl, formatDateTimePl, formatPln } from "@/lib/format";
import { PrintButton } from "../../PrintButton";

export const metadata = { title: "Protokół zdawczo-odbiorczy" };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Protokół zdawczo-odbiorczy na papier — jeden dokument z obu protokołów.
 *
 * Świadomie strona do wydruku, a nie PDF generowany na serwerze. Powody, w tej
 * kolejności:
 *
 *   1. Polskie znaki. Generator PDF-a musi osadzić własny font z pełnym
 *      Unicode; bez tego „ł", „ż" i „ó" wychodzą jako kwadraty i dokument jest
 *      gorszy niż jego brak. Przeglądarka ma ten font od zawsze.
 *   2. Ta maszyna ma 3,7 GiB RAM i build, który już raz przewrócił sesję.
 *      Dokładanie biblioteki PDF plus fontu do obrazu to koszt policzalny,
 *      a zysk — ten sam plik.
 *   3. Telefon i tak robi PDF: „Udostępnij → Drukuj → Zapisz jako PDF" na
 *      iOS i Androidzie daje plik, który operator wysyła mailem. Ta sama
 *      droga, o jedno dotknięcie dłuższa, bez żadnej nowej zależności.
 *
 * Gdyby właściciel chciał PDF zapisywany automatycznie do historii najmu —
 * to jest osobna decyzja i osobny etap; zapis plików jest już gotowy
 * (`lib/storage/signatures`), więc brakuje wyłącznie generatora.
 */
export default async function ProtocolPrintPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await guardPage("wydania.prowadz");

  if (!UUID_RE.test(id)) notFound();
  const [data, both, company] = await Promise.all([
    getReservation(id),
    getBothHandovers(id),
    getSetting("company"),
  ]);
  if (!data) notFound();

  const r = data.r;
  const differences =
    both.pickup && both.return ? compareHandovers(both.pickup, both.return) : [];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 print:hidden flex flex-wrap items-center justify-between gap-3">
        <Link
          href={{ pathname: "/admin/reservations/[id]", params: { id } }}
          className="label-tight text-ink-faint hover:text-ink -my-2 inline-flex min-h-11 items-center text-[10px] transition-colors"
        >
          ← Rezerwacja {r.reference}
        </Link>
        <PrintButton />
      </div>

      <article
        data-print="report"
        className="border-line bg-graphite/40 border p-8 print:border-0 print:p-0"
      >
        <header className="border-line flex flex-wrap items-start justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="font-heading text-ink text-xl">
              Protokół zdawczo-odbiorczy
            </h1>
            <p className="text-silver mt-1 text-sm">
              Rezerwacja {r.reference} · {formatDatePl(r.startDate)} –{" "}
              {formatDatePl(r.endDate)}
            </p>
          </div>
          <div className="text-ink-faint text-right text-xs">
            <p className="text-ink font-medium">
              A&amp;A Corporation
            </p>
            {company.address && <p>{company.address}</p>}
            {company.city && <p>{company.city}</p>}
            {company.nip && <p>NIP {company.nip}</p>}
          </div>
        </header>

        <section className="mt-5 grid gap-4 sm:grid-cols-2">
          <Block title="Najemca">
            <Line label="Imię i nazwisko" value={r.customerName} />
            <Line label="Telefon" value={r.customerPhone} />
            <Line label="E-mail" value={r.customerEmail} />
            {r.licenceNumber && (
              <Line label="Nr prawa jazdy" value={r.licenceNumber} />
            )}
          </Block>
          <Block title="Pojazd">
            <Line
              label="Auto"
              value={`${data.brand ?? ""} ${data.model ?? ""}`.trim() || "—"}
            />
            {data.plate && <Line label="Rejestracja" value={data.plate} />}
            {data.vin && <Line label="VIN" value={data.vin} />}
            <Line label="Wartość najmu" value={formatPln(r.totalGrosze, "pl")} />
            <Line
              label="Kaucja"
              value={
                r.depositVariant === "no_deposit"
                  ? "Bez kaucji"
                  : formatPln(r.depositGrosze, "pl")
              }
            />
          </Block>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2" data-print-keep>
          <Protocol title="Wydanie" record={both.pickup} />
          <Protocol title="Zwrot" record={both.return} />
        </section>

        {both.pickup && both.return && (
          <section className="border-line mt-6 border-t pt-4">
            <h2 className="label-tight text-ink-faint mb-3 text-[10px]">
              Różnice wobec wydania
            </h2>
            {differences.filter((d) => d.action).length === 0 ? (
              <p className="text-sm text-emerald-400">
                Auto wróciło w takim stanie, w jakim wyjechało.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {differences
                  .filter((d) => d.action)
                  .map((d, i) => (
                    <li
                      key={`${d.label}-${i}`}
                      className="text-silver"
                    >
                      <span className="text-ink">
                        {d.label}:
                      </span>{" "}
                      {d.from} → {d.to} · {d.action}
                    </li>
                  ))}
              </ul>
            )}
          </section>
        )}

        <section className="mt-8 grid gap-8 sm:grid-cols-2" data-print-keep>
          <Signature title="Podpis przy wydaniu" record={both.pickup} />
          <Signature title="Podpis przy zwrocie" record={both.return} />
        </section>

        <p className="text-ink-faint mt-8 text-[10px]">
          Dokument wygenerowany z panelu A&amp;A Corporation
          {" · "}
          {formatDateTimePl(new Date())}
        </p>
      </article>
    </div>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="label-tight text-ink-faint mb-2 text-[10px]">
        {title}
      </h2>
      <dl className="space-y-1">{children}</dl>
    </section>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 text-sm">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="text-silver min-w-0 break-words">
        {value}
      </dd>
    </div>
  );
}

function Protocol({
  title,
  record,
}: {
  title: string;
  record: HandoverRecord | null;
}) {
  if (!record) {
    return (
      <Block title={title}>
        <p className="text-ink-faint text-sm">
          Nie spisano.
        </p>
      </Block>
    );
  }
  const present = new Map(record.items.map((i) => [i.code, i.present]));
  const missing = CHECKLIST.filter((i) => present.get(i.code) === false);
  return (
    <Block title={title}>
      <Line label="Data" value={formatDateTimePl(record.createdAt)} />
      <Line label="Przebieg" value={`${record.odometerKm} km`} />
      <Line label="Paliwo" value={FUEL_LABEL[record.fuelEighths]} />
      <Line label="Czystość" value={CLEANLINESS_LABEL[record.cleanliness]} />
      <Line label="Kluczyki" value={String(record.keysCount)} />
      <Line
        label="Braki"
        value={
          missing.length
            ? missing
                .map((i) => `${i.label} (${GROUP_LABEL[i.group].toLowerCase()})`)
                .join(", ")
            : "brak"
        }
      />
      <Line label="Uszkodzenia" value={record.damageNote?.trim() || "brak"} />
      {record.note?.trim() && <Line label="Uwagi" value={record.note.trim()} />}
      <Line label="Spisał" value={record.by ?? "—"} />
    </Block>
  );
}

function Signature({
  title,
  record,
}: {
  title: string;
  record: HandoverRecord | null;
}) {
  return (
    <div>
      <p className="label-tight text-ink-faint text-[10px]">
        {title}
      </p>
      {record?.signatureUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={record.signatureUrl}
            alt={title}
            className="border-line mt-2 max-h-24 border bg-white"
          />
          <p className="text-ink-faint mt-1 text-xs">
            {record.signedByName ?? "—"}
            {record.signedAt ? ` · ${formatDateTimePl(record.signedAt)}` : ""}
          </p>
        </>
      ) : (
        <div className="border-line mt-2 h-24 border-b" />
      )}
    </div>
  );
}
