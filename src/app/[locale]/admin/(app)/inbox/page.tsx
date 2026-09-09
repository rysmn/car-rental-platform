import { setRequestLocale } from "next-intl/server";
import { guardPage } from "@/lib/auth/guard";
import { Link } from "@/i18n/navigation";
import { listInbox, inboxCounts, parseInboxFilter } from "@/lib/inbox/repo";
import { formatDateTimePl } from "@/lib/format";
import { InboxItem, type InboxView } from "./InboxItem";
import {
  REASON_LABEL,
  SETTLED_STATUSES,
  SOURCE_LABEL,
  STATUS_LABEL,
} from "@/lib/inbox/labels";

export const metadata = { title: "Skrzynka" };

/**
 * Skrzynka — zapytania klientów czekające na odpowiedź CZŁOWIEKA.
 *
 * Trzy rzeczy, których nie wolno mieszać, i to jest cały powód, dla którego
 * ta strona istnieje osobno:
 *
 *   REZERWACJE  → `/admin/reservations`. Zamówienie, nie pytanie.
 *   SKRZYNKA    → tutaj. Pytanie, które czeka na odpowiedź.
 *   ALERTY      → `/admin/alerty`. Awaria techniczna, nie klient.
 *
 * Do etapu 44D jedyna odznaka z licznikiem w panelu dotyczyła ALERTÓW — czyli
 * jedyne miejsce, które mówiło „zajmij się tym", mówiło o rzeczach zepsutych,
 * a o klientach czekających na odpowiedź nie mówiło nic. Leady leżały w
 * zakładce czatu, gdzie trzeba było wiedzieć, żeby ich szukać.
 *
 * FILTRY SĄ ODNOŚNIKAMI, nie stanem po stronie klienta. Dzięki temu widok
 * „nieprzeczytane od firm" da się wysłać koledze linkiem, wraca się do niego
 * przyciskiem wstecz i działa bez JavaScriptu. Nieznana wartość w adresie
 * jest po cichu pomijana — patrz `parseInboxFilter`.
 */
export default async function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    status?: string;
    source?: string;
    reason?: string;
    unread?: string;
    q?: string;
    /** Id sprawy z odnośnika w powiadomieniu — rozwiń ją i przewiń do niej. */
    open?: string;
  }>;
}) {
  /*
    Kontrola uprawnień przy renderze strony — obok kontroli w każdej akcji,
    nie zamiast niej. Bez tego pracownik wpisujący adres z ręki zobaczyłby
    treść sekcji, której nie wolno mu oglądać, i dopiero pierwszy przycisk
    powiedziałby mu „nie wolno".
  */
  await guardPage("skrzynka.podglad");

  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const filter = parseInboxFilter(sp);

  const [rows, counts] = await Promise.all([listInbox(filter), inboxCounts()]);

  const unreadTotal = counts
    .filter((c) => !SETTLED_STATUSES.includes(c.status))
    .reduce((a, c) => a + c.unread, 0);
  const bySource = new Map<string, number>();
  const byReason = new Map<string, number>();
  for (const c of counts) {
    bySource.set(c.source, (bySource.get(c.source) ?? 0) + c.total);
    if (c.reason)
      byReason.set(c.reason, (byReason.get(c.reason) ?? 0) + c.total);
  }

  const items: InboxView[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    subject: r.subject,
    question: r.question,
    car: r.carBrand ? `${r.carBrand} ${r.carModel}` : null,
    dateFrom: r.dateFrom ? String(r.dateFrom).slice(0, 10) : null,
    dateTo: r.dateTo ? String(r.dateTo).slice(0, 10) : null,
    location: r.locationName,
    seats: r.seats,
    budget: r.budgetGrosze,
    // Cztery pola jednego faktu — patrz `budgetLine` w `lib/inbox/summary`.
    budgetMin: r.budgetMinGrosze,
    budgetKind: r.budgetKind,
    budgetCurrency: r.budgetCurrency,
    budgetRate: r.budgetPlnPerEur,
    company: r.company,
    partnerModel: r.partnerModel,
    investRange: r.investRange,
    lang: r.leadLocale,
    status: r.status,
    source: r.source,
    reason: r.reason,
    unread: r.readAt === null,
    note: r.note,
    // Formatowane na serwerze: wynik zależy od strefy czasowej, a formatowanie
    // w przeglądarce rozjechałoby render serwera z hydratacją.
    createdLabel: formatDateTimePl(r.createdAt),
    conversationId: r.conversationId,
    reservationRef: r.reservationRef,
  }));

  /**
   * Adres filtra, z zachowaniem pozostałych kryteriów.
   *
   * FORMA OBIEKTOWA, nie sklejony napis: `Link` z `@/i18n/navigation` jest
   * typowany po `routing.ts`, więc adres z doklejonym `?status=…` nie należy
   * do unii tras i nie przechodzi kontroli typów. Parametry idą osobno.
   */
  const href = (patch: Record<string, string | undefined>) => {
    const merged = {
      status: sp.status,
      source: sp.source,
      reason: sp.reason,
      unread: sp.unread,
      q: sp.q,
      ...patch,
    };
    const query: Record<string, string> = {};
    for (const [k, v] of Object.entries(merged)) if (v) query[k] = v;
    return { pathname: "/admin/inbox" as const, query };
  };

  const chip = (active: boolean) =>
    `label-tight tap-block inline-flex items-center border px-3 text-[10px] ${
      active
        ? "border-ink text-ink"
        : "border-line text-ink-faint hover:border-ink-faint"
    }`;

  return (
    <div className="max-w-4xl">
      <header className="mb-6">
        <h1 className="font-heading text-ink text-2xl font-bold">Skrzynka</h1>
        <p className="text-silver mt-1 text-sm">
          Zapytania klientów czekające na odpowiedź. Rezerwacje są w module{" "}
          <Link
            href="/admin/reservations"
            className="underline underline-offset-2"
          >
            Rezerwacje
          </Link>
          , a awarie techniczne w{" "}
          <Link href="/admin/alerty" className="underline underline-offset-2">
            Alertach
          </Link>{" "}
          — to trzy różne rzeczy i trzy różne liczniki.
        </p>
      </header>

      {/* ── Filtry ──────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href={href({
            unread: undefined,
            status: undefined,
            source: undefined,
            reason: undefined,
          })}
          className={chip(!sp.unread && !sp.status && !sp.source && !sp.reason)}
        >
          Wszystkie
        </Link>
        <Link
          href={href({ unread: sp.unread === "1" ? undefined : "1" })}
          className={chip(sp.unread === "1")}
        >
          Nieprzeczytane {unreadTotal > 0 ? `(${unreadTotal})` : ""}
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(SOURCE_LABEL).map(([value, label]) => (
          <Link
            key={value}
            href={href({ source: sp.source === value ? undefined : value })}
            className={chip(sp.source === value)}
          >
            {label} {bySource.get(value) ? `(${bySource.get(value)})` : ""}
          </Link>
        ))}
      </div>

      {/* CZEGO SPRAWA DOTYCZY — oś niezależna od kanału. Pokazujemy tylko te
          tematy, które w skrzynce faktycznie są: pełna lista jedenastu
          przycisków, z których dziewięć zawsze zwraca pustkę, to nie filtr,
          tylko ściana. */}
      {byReason.size > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {Object.entries(REASON_LABEL)
            .filter(([value]) => byReason.has(value))
            .map(([value, label]) => (
              <Link
                key={value}
                href={href({ reason: sp.reason === value ? undefined : value })}
                className={chip(sp.reason === value)}
              >
                {label} ({byReason.get(value)})
              </Link>
            ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(STATUS_LABEL).map(([value, label]) => (
          <Link
            key={value}
            href={href({ status: sp.status === value ? undefined : value })}
            className={chip(sp.status === value)}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Szukanie zwykłym formularzem GET: adres zostaje w historii, więc
          wynik da się zalinkować i wrócić do niego wstecz. */}
      <form method="get" action="/admin/inbox" className="mb-6 flex gap-2">
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        {sp.source && <input type="hidden" name="source" value={sp.source} />}
        {sp.unread && <input type="hidden" name="unread" value={sp.unread} />}
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Nazwisko, telefon, e-mail, treść"
          aria-label="Szukaj w skrzynce"
          className="border-line-strong bg-surface-1 text-ink placeholder:text-ink-faint h-11 min-w-0 flex-1 border px-3 text-xs"
        />
        <button
          type="submit"
          className="label border-line-strong text-ink hover:border-ink tap inline-flex items-center border px-4 text-xs"
        >
          Szukaj
        </button>
      </form>

      {/* ── Lista ───────────────────────────────────────────────────────── */}
      <div className="border-line border">
        {items.length === 0 ? (
          <p className="text-ink-faint p-8 text-center text-sm">
            {sp.q || sp.status || sp.source || sp.unread
              ? "Nic nie pasuje do tych filtrów."
              : "Brak zapytań. Pojawią się tu prośby o kontakt z asystenta, zapytania firmowe i zgłoszenia z formularza."}
          </p>
        ) : (
          items.map((i) => (
            <InboxItem key={i.id} item={i} autoOpen={i.id === sp.open} />
          ))
        )}
      </div>
    </div>
  );
}
