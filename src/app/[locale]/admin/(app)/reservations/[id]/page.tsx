import { notFound } from "next/navigation";
import { OdometerForm } from "../OdometerForm";
import { PaymentsPanel } from "../PaymentsPanel";
import { DepositPanel } from "../DepositPanel";
import { MoveCar } from "../MoveCar";
import { getFreeUnits } from "@/lib/booking/availability";
import { listPayments, paidTotal, summarise } from "@/lib/admin/payments";
import { listDepositEvents, summariseDeposit } from "@/lib/admin/deposits";
import {
  compareHandovers,
  getBothHandovers,
  isCleanReturn,
} from "@/lib/admin/handovers";
import {
  DAMAGE_STATUS_LABEL,
  DAMAGE_STATUS_TONE,
  listDamages,
  ourCostGrosze,
} from "@/lib/admin/damages";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getReservation } from "@/lib/admin/reservations";
import { stanWeryfikacji } from "@/lib/booking/verification";
import { stanDokumentowRezerwacji } from "@/lib/documents/repo";
import { can } from "@/lib/auth/permissions";
import { currentAdmin } from "@/lib/auth/guard";
import { DokumentyPanel } from "../DokumentyPanel";
import { type ReservationStatus } from "@/lib/admin/reservation-status";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { StatusActions } from "../StatusActions";
import { formatPln, formatDatePl, formatDateTimePl } from "@/lib/format";
import { CancellationFeePanel } from "../CancellationFeePanel";
import { naleznosc, stanNieodebrania } from "@/lib/booking/cancellation-repo";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LINE_LABEL: Record<string, string> = {
  location: "Odbiór poza siedzibą",
  extra_driver: "Dodatkowy kierowca",
  child_seat: "Fotelik dziecięcy",
  protection_package: "Pakiet ochronny",
  no_deposit: "Wariant bez kaucji",
};

export default async function ReservationDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  if (!UUID_RE.test(id)) notFound();
  const data = await getReservation(id);
  // Stan potwierdzenia adresu — punkt 8. Osobne zapytanie, bo dotyczy innej
  // tabeli i nie ma prawa spowolnić karty, gdy weryfikacji nigdy nie było.
  const weryfikacja = await stanWeryfikacji(id).catch(() => null);
  /*
    Dokumenty ze STANEM WYSYŁKI. Osobne zapytanie, bo dotyczy innej tabeli
    i nie ma prawa spowolnić karty, gdy nic nie przypięto. Nigdy nie przewraca
    widoku: brak dokumentów to pusta lista.
  */
  const dokumenty = await stanDokumentowRezerwacji(id).catch(() => []);
  /*
    Rola potrzebna wyłącznie po to, żeby zdecydować o pokazaniu przycisków
    wysyłki. Dostęp do samej karty rozstrzyga layout panelu; akcja i tak
    sprawdza uprawnienie po swojej stronie, więc to jest uprzejmość wobec
    pracownika, a nie zabezpieczenie.
  */
  const admin = await currentAdmin();
  if (!data) notFound();

  const r = data.r;

  /*
    Należność i to, czy wolno dziś uznać rezerwację za nieodebraną.

    Oba pytania idą do serwera, a nie liczą się w renderze: odczyt zegara
    w ciele komponentu jest nieczysty i lint Reacta słusznie go odrzuca.
    Tolerancja pochodzi z DZISIEJSZEJ konfiguracji, bo mówi obsłudze, od kiedy
    wypada nacisnąć przycisk — kwota nadal pochodzi z migawki rezerwacji.
  */
  const oplataAnulowania = await naleznosc(r.id);
  const { mozliwy: mozliwyNoShow, powod: powodNieodebrania } =
    await stanNieodebrania({
      reservationId: r.id,
      status: r.status,
      startDate: String(r.startDate),
      pickupTime: r.pickupTime,
    });

  const status = r.status as ReservationStatus;

  const [payments, paid, depositEvents, handovers, damages] = await Promise.all(
    [
      listPayments(r.id),
      paidTotal(r.id),
      listDepositEvents(r.id),
      getBothHandovers(r.id),
      listDamages(),
    ],
  );
  // Wolne w TYM terminie, z pominięciem tej rezerwacji — inaczej lista ukryłaby
  // auta, które są wolne dokładnie dlatego, że ta rezerwacja z nich zejdzie.
  const freeUnits =
    status === "cancelled" || status === "rejected"
      ? []
      : await getFreeUnits(
          String(r.startDate).slice(0, 10),
          String(r.endDate).slice(0, 10),
          r.id,
        );
  const ofThisRental = damages.filter((d) => d.reservationId === r.id);
  const differences =
    handovers.pickup && handovers.return
      ? compareHandovers(handovers.pickup, handovers.return)
      : [];
  const deposit = summariseDeposit(
    r.depositGrosze,
    r.depositVariant,
    depositEvents,
  );
  const today = new Date().toISOString().slice(0, 10);
  const money = summarise(
    r.totalGrosze,
    paid,
    String(r.startDate).slice(0, 10),
    today,
  );

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/admin/reservations"
        className="label-tight text-ink-faint hover:text-ink -my-2 inline-flex min-h-11 items-center text-[10px] transition-colors"
      >
        ← Rezerwacje
      </Link>

      <header className="mt-4 mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-ink font-mono text-2xl">{r.reference}</h1>
            <StatusBadge status={status} />
          </div>
          <p className="text-ink-faint mt-1 text-sm">
            Złożona {formatDateTimePl(r.createdAt)}
          </p>
        </div>
      </header>

      <div className="border-line bg-graphite/40 mb-8 border p-6">
        <h2 className="label-tight text-ink-faint mb-4 text-[10px]">
          Działania
        </h2>
        <StatusActions id={r.id} status={status} />
        <Link
          href={{ pathname: "/admin/reservations/new", query: { kopia: r.id } }}
          className="label-tight border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap mt-3 inline-flex h-11 items-center border px-4 text-[10px] transition-colors"
        >
          Kopiuj rezerwację →
        </Link>
        {status === "confirmed" && (
          <p className="text-ink-faint mt-3 text-xs">
            Termin tego auta jest teraz zablokowany w kalendarzu.
          </p>
        )}
        {status === "rejected" && (
          <div className="border-line mt-4 border-t pt-4">
            <p className="label-tight text-ink-faint text-[10px]">
              Powód odrzucenia (wysłany do klienta)
            </p>
            <p className="text-silver mt-2 text-sm">
              {r.rejectionReason?.trim()
                ? r.rejectionReason
                : "Nie podano — klient otrzymał ogólną wiadomość."}
            </p>
          </div>
        )}
      </div>

      {/* `[&>*]:min-w-0`: element siatki domyślnie ma `min-width: auto` i
          rozpycha się do szerokości treści — na 320 px wypychał całą stronę. */}
      <div className="grid gap-6 md:grid-cols-2 [&>*]:min-w-0">
        <Panel title="Klient">
          <Row label="Imię i nazwisko" value={r.customerName} />
          {/* `break-all` na SAMYM odnośniku, nie tylko na `<dd>` w `Row`.
              `break-words` na rodzicu nie pomaga, bo ten `<a>` jest
              `inline-block` — sam ustala swoją szerokość z najdłuższego
              nierozdzielnego ciągu, a adres e-mail jest właśnie takim ciągiem.
              Przy 320 px wypychało to całą stronę o 24 px. */}
          <Row
            label="E-mail"
            value={
              <a
                href={`mailto:${r.customerEmail}`}
                className="text-ink tap-area -my-2 inline-block max-w-full py-2 break-all underline-offset-4 hover:underline"
              >
                {r.customerEmail}
              </a>
            }
          />
          <Row
            label="Telefon"
            value={
              <a
                href={`tel:${r.customerPhone}`}
                className="text-ink tap-area -my-2 inline-block py-2 underline-offset-4 hover:underline"
              >
                {r.customerPhone}
              </a>
            }
          />
          {/*
            Potwierdzenie adresu e-mail — punkt 8 zamówienia.

            Status rezerwacji tego nie niesie: `pending_verification` znika
            w chwili potwierdzenia i tydzień później nie da się odróżnić
            rezerwacji z potwierdzonym adresem od wpisanej ręcznie przez
            telefon. A to jest właśnie ta różnica, która decyduje, czy na
            podany adres w ogóle warto pisać.

            Brak wiersza (`null`) nie jest usterką i nie rysuje nic: rezerwacje
            z panelu i te sprzed rozdziału 13.4 weryfikacji nie mają.
          */}
          {weryfikacja && (
            <Row
              label="Potwierdzenie e-mail"
              value={
                weryfikacja.stan === "potwierdzony" ? (
                  <span className="text-ink">
                    Potwierdzony
                    {weryfikacja.potwierdzonyO
                      ? ` · ${formatDateTimePl(weryfikacja.potwierdzonyO)}`
                      : ""}
                  </span>
                ) : weryfikacja.stan === "oczekuje" ? (
                  <span className="text-ink-muted">
                    Czeka na klienta · link ważny do{" "}
                    {formatDateTimePl(weryfikacja.wazneDo)}
                  </span>
                ) : (
                  <span className="text-ink-muted">
                    Link wygasł {formatDateTimePl(weryfikacja.wazneDo)}
                  </span>
                )
              }
            />
          )}
          {r.dateOfBirth && (
            <Row label="Data urodzenia" value={formatDatePl(r.dateOfBirth)} />
          )}
          {r.licenceNumber && (
            <Row label="Nr prawa jazdy" value={r.licenceNumber} />
          )}
          {(r.addressStreet || r.addressCity) && (
            <Row
              label="Adres"
              value={
                <span>
                  {r.addressStreet}
                  {r.addressStreet && <br />}
                  {[r.addressPostcode, r.addressCity].filter(Boolean).join(" ")}
                </span>
              }
            />
          )}
        </Panel>

        {/*
          DOKUMENTY I ICH WYSYŁKA — sekcja powstała 30.08.2026.

          Właściciel zgłosił, że klient nie dostał umowy po rezerwacji.
          Dokument BYŁ przypięty, więc z panelu wyglądał na załatwiony — a nie
          był wysłany, bo w mailu szedł tylko odnośnik do strony wymagającej
          klucza z tej samej przeglądarki. Panel nie miał jak tego pokazać,
          bo nie odróżniał „przypisano" od „wyszło". Teraz odróżnia.
        */}
        <Panel title="Dokumenty">
          <DokumentyPanel
            reservationId={id}
            mozeWysylac={
              Boolean(admin) && can(admin!.role, "dokumenty.zarzadzaj")
            }
            dokumenty={dokumenty.map((d) => ({
              id: d.id,
              title: d.title,
              fileName: d.fileName,
              autoSend: d.autoSend,
              stan: d.stan,
              sentAt: d.sentAt ? formatDateTimePl(d.sentAt) : null,
              sendError: d.sendError,
              sendAttempts: d.sendAttempts,
            }))}
          />
        </Panel>

        <Panel title="Rezerwacja">
          <Row
            label="Auto"
            value={`${data.brand ?? ""} ${data.model ?? ""}`.trim() || "—"}
          />
          {data.plate && <Row label="Rejestracja" value={data.plate} />}
          <Row
            label="Termin"
            value={`${formatDatePl(r.startDate)}${r.pickupTime ? ` ${r.pickupTime.slice(0, 5)}` : ""} – ${formatDatePl(r.endDate)}${r.returnTime ? ` ${r.returnTime.slice(0, 5)}` : ""}`}
          />
          <Row label="Liczba dni" value={String(r.days)} />
          {data.locationName && (
            <Row label="Miejsce odbioru" value={data.locationName} />
          )}
          <Row
            label="Kaucja"
            value={
              r.depositVariant === "no_deposit"
                ? "Bez kaucji"
                : "Z kaucją zwrotną"
            }
          />
        </Panel>
      </div>

      <div className="border-line bg-graphite/40 mt-6 border p-6">
        <h2 className="label-tight text-ink-faint mb-4 text-[10px]">
          Protokoły
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href={{
              pathname: "/admin/reservations/[id]/wydanie",
              params: { id: r.id },
            }}
            className="label-tight border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap inline-flex h-11 items-center border px-4 text-[10px] transition-colors"
          >
            {handovers.pickup ? "Wydanie ✓" : "Spisz wydanie →"}
          </Link>
          <Link
            href={{
              pathname: "/admin/reservations/[id]/zwrot",
              params: { id: r.id },
            }}
            className="label-tight border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap inline-flex h-11 items-center border px-4 text-[10px] transition-colors"
          >
            {handovers.return ? "Zwrot ✓" : "Spisz zwrot →"}
          </Link>
          {(handovers.pickup || handovers.return) && (
            <Link
              href={{
                pathname: "/admin/reservations/[id]/protokol",
                params: { id: r.id },
              }}
              className="label-tight border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap inline-flex h-11 items-center border px-4 text-[10px] transition-colors"
            >
              Protokół do wydruku →
            </Link>
          )}
        </div>
        {handovers.pickup && handovers.return && (
          <p
            className={`mt-4 text-sm ${
              isCleanReturn(differences) ? "text-emerald-400" : "text-amber-400"
            }`}
          >
            {isCleanReturn(differences)
              ? "Auto wróciło w takim stanie, w jakim wyjechało."
              : `Do rozliczenia: ${differences
                  .filter((d) => d.action)
                  .map((d) => d.label.toLowerCase())
                  .join(", ")}.`}
          </p>
        )}
      </div>

      <div className="border-line bg-graphite/40 mt-6 border p-6">
        <h2 className="label-tight text-ink-faint mb-4 text-[10px]">Szkody</h2>
        {ofThisRental.length === 0 ? (
          <p className="text-ink-faint text-sm">
            Z tego najmu nie ma żadnej szkody.
          </p>
        ) : (
          <ul className="divide-line divide-y">
            {ofThisRental.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <Link
                  href={{
                    pathname: "/admin/szkody/[id]",
                    params: { id: d.id },
                  }}
                  className="text-ink tap-area -my-2 inline-block py-2 text-sm underline-offset-4 hover:underline"
                >
                  {d.title}
                </Link>
                <span className="flex items-center gap-3">
                  <span className="text-silver text-sm tabular-nums">
                    {formatPln(ourCostGrosze(d), locale)}
                  </span>
                  <span
                    className={`label-tight border px-2 py-1 text-[10px] ${DAMAGE_STATUS_TONE[d.status]}`}
                  >
                    {DAMAGE_STATUS_LABEL[d.status]}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={{ pathname: "/admin/szkody", query: { nowa: "1" } }}
          className="label-tight border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap mt-4 inline-flex h-11 items-center border px-4 text-[10px] transition-colors"
        >
          Załóż szkodę →
        </Link>
      </div>

      {/*
        Należność za anulowanie — nad licznikiem, bo dotyczy rezerwacji, która
        się NIE odbyła, a licznik dotyczy tej, która się odbyła. Obsługa
        oglądająca anulowaną rezerwację ma najpierw zobaczyć, czy coś zostało
        do rozliczenia.
      */}
      <CancellationFeePanel
        reservationId={r.id}
        fee={oplataAnulowania}
        mozliwyNoShow={mozliwyNoShow}
        powodNieodebrania={powodNieodebrania}
      />

      <div className="border-line bg-graphite/40 mt-6 border p-6">
        <h2 className="label-tight text-ink-faint mb-4 text-[10px]">
          Stan licznika
        </h2>
        <OdometerForm
          reservationId={r.id}
          start={r.startOdometerKm}
          end={r.endOdometerKm}
          /*
            ROZLICZENIE NADPRZEBIEGU LICZONE ZE STAWKĄ Z REZERWACJI.

            `data.quote` to migawka warunków zamrożona w chwili zawarcia —
            i to jest jedyne dopuszczalne źródło tej liczby. Sięgnięcie po
            `car_models.extra_mileage_fee_grosze` dałoby wynik zgodny
            z DZISIEJSZYM cennikiem, czyli rachunek wystawiony według stawki,
            na którą klient się nie umawiał. Podniesienie ceny w panelu nie
            może zmieniać zamkniętych umów wstecz.

            `null` w którymkolwiek z pól znaczy „nie zapisano" (rezerwacje
            sprzed 01.09.2026) i wtedy formularz nie liczy niczego — mówi, że
            stawki nie ma, zamiast podstawić dowolną.
          */
          limitKm={data.quote?.includedMileageKm ?? null}
          stawkaGroszeZaKm={data.quote?.extraMileageFeeGrosze ?? null}
        />
      </div>

      <div className="border-line bg-graphite/40 mt-6 border p-6">
        <h2 className="label-tight text-ink-faint mb-4 text-[10px]">Wycena</h2>
        <dl className="space-y-2 text-sm">
          <PriceRow
            label={`Wynajem (${data.quote?.days ?? r.days} dni × ${formatPln(
              data.quote?.dailyPriceGrosze ?? 0,
              locale,
            )})`}
            value={formatPln(data.quote?.rentalGrosze ?? 0, locale)}
          />
          {/* `lines?.` a nie `lines.`: `quote` jest kolumną tekstową i wystarczy
              jeden wiersz z niepełnym JSON-em (import, ręczna poprawka w bazie),
              żeby CAŁA strona rezerwacji wywracała się na 500 zamiast pokazać
              wycenę bez pozycji dodatkowych. */}
          {data.quote?.lines?.map((line) => (
            <PriceRow
              key={line.code}
              label={LINE_LABEL[line.code] ?? line.code}
              value={formatPln(line.amountGrosze, locale)}
            />
          ))}
          <div className="border-line mt-3 flex items-center justify-between border-t pt-3">
            <dt className="label text-ink text-xs">Razem</dt>
            <dd className="font-heading text-ink text-lg">
              {formatPln(r.totalGrosze, locale)}
            </dd>
          </div>
          {r.depositGrosze > 0 && (
            <PriceRow
              label="Kaucja zwrotna (pobierana osobno)"
              value={formatPln(r.depositGrosze, locale)}
              muted
            />
          )}
        </dl>
      </div>

      <PaymentsPanel
        reservationId={r.id}
        totalGrosze={r.totalGrosze}
        paidGrosze={paid}
        outstandingGrosze={money.outstandingGrosze}
        status={money.status}
        payments={payments.map((p) => ({
          id: p.id,
          amountGrosze: p.amountGrosze,
          method: p.method,
          paidOn: String(p.paidOn).slice(0, 10),
          note: p.note,
        }))}
        today={today}
      />

      <MoveCar
        reservationId={r.id}
        currentCarId={r.carId}
        units={freeUnits}
        currentDailyGrosze={data.quote?.dailyPriceGrosze ?? 0}
      />

      <DepositPanel
        reservationId={r.id}
        status={deposit.status}
        dueGrosze={deposit.dueGrosze}
        securedGrosze={deposit.securedGrosze}
        returnedGrosze={deposit.returnedGrosze}
        keptGrosze={deposit.keptGrosze}
        events={depositEvents}
      />
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-line bg-graphite/40 border p-6">
      <h2 className="label-tight text-ink-faint mb-4 text-[10px]">{title}</h2>
      <dl className="space-y-3">{children}</dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    // `min-w-0` + `break-words`: adres albo długi e-mail rozpychał kartę poza
    // kolumnę siatki — na 768 px wypychało to całą stronę o 9 px.
    <div className="grid grid-cols-[7rem_1fr] gap-3 sm:grid-cols-[9rem_1fr]">
      <dt className="text-ink-faint text-xs">{label}</dt>
      <dd className="text-silver min-w-0 text-sm break-words">{value}</dd>
    </div>
  );
}

function PriceRow({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? "text-ink-faint" : "text-silver"}>{label}</dt>
      <dd className={muted ? "text-ink-faint" : "text-ink"}>{value}</dd>
    </div>
  );
}
