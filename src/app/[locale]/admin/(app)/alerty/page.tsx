import { setRequestLocale } from "next-intl/server";
import { guardPage } from "@/lib/auth/guard";
import { getAttentionItems, type AttentionItem } from "@/lib/admin/dashboard";
import { listAlerts } from "@/lib/alerts/repo";
import { Link, type AppHref } from "@/i18n/navigation";
import { SystemAlerts } from "./SystemAlerts";

export const metadata = { title: "Alerty" };

const KIND_LABEL: Record<AttentionItem["kind"], string> = {
  overdue: "Zaległe zwroty",
  decision: "Do potwierdzenia",
  pickup: "Wydania dzisiaj",
  return: "Zwroty dzisiaj",
  payment: "Płatności",
  tyres: "Opony",
  document: "Dokumenty i badania",
  service: "Serwis i olej",
  cost: "Raty i opłaty",
  deadline: "Mandaty, szkody, kaucje i inne",
  deposit: "Kaucje",
};

/**
 * Everything that needs attention, in one place.
 *
 * The dashboard shows the top of this list; this page shows all of it,
 * grouped, so nothing falls off the bottom. Grouping by kind rather than by
 * urgency alone: "co mam dziś zrobić z płatnościami" is a different question
 * from "co jest najpilniejsze", and both get asked.
 *
 * Two lists, one page, since 22.08.2026. The list below is operational — what
 * needs DOING — and it is computed live from the business tables. The one above
 * it is technical: what BROKE, read from `system_alerts`, which is written as
 * failures happen because nothing can reconstruct them afterwards. They stay on
 * one page because an operator does not know which kind of problem they have
 * until they have looked, and a panel that made them choose a menu item first
 * would hide half of every incident.
 */
export default async function AlertsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ rozwiazane?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await guardPage("alerty.podglad");

  const { rozwiazane } = await searchParams;
  const includeResolved = rozwiazane === "1";

  const [items, alerts] = await Promise.all([
    getAttentionItems(),
    listAlerts({ includeResolved }),
  ]);
  const urgent = items.filter((a) => a.urgent);
  // Worst first: a car that never came back, then decisions somebody is
  // waiting on, then today's returns, then money, then paperwork.
  const kinds: AttentionItem["kind"][] = [
    "overdue",
    "decision",
    "pickup",
    "return",
    "payment",
    "tyres",
    "document",
    "service",
    "cost",
    "deadline",
    "deposit",
  ];

  return (
    <div>
      <h1 className="font-heading text-3xl font-bold">Alerty</h1>
      <p className="text-ink-muted mt-2 max-w-2xl text-sm">
        Dwie listy: <strong className="text-ink">awarie systemu</strong> — co się
        zepsuło, oraz <strong className="text-ink">do zrobienia</strong> — co
        czeka na decyzję albo na pieniądze.
      </p>

      <div className="mt-8">
        <SystemAlerts alerts={alerts} showingResolved={includeResolved} />
      </div>

      <div className="border-line mt-12 border-t pt-8">
        <h2 className="label text-ink text-xs">Do zrobienia</h2>
        <p className="text-ink-muted mt-2 max-w-2xl text-sm">
          {items.length === 0
            ? "Nic nie wymaga uwagi."
            : `${items.length} do przejrzenia, w tym ${urgent.length} pilnych. Pilne to te, które kosztują dziś: zwrot na dziś, pieniądze za trwający wynajem, dokument po terminie.`}
        </p>
      </div>

      {items.length === 0 ? (
        <p className="border-line bg-graphite/40 text-silver mt-8 border p-10 text-center text-sm">
          Zwroty, płatności, dokumenty i serwisy są na bieżąco.
        </p>
      ) : (
        <div className="mt-8 flex flex-col gap-10">
          {kinds.map((kind) => {
            const group = items.filter((a) => a.kind === kind);
            if (group.length === 0) return null;
            return (
              <section key={kind}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="label text-ink text-xs">{KIND_LABEL[kind]}</h2>
                  <span className="text-ink-faint text-[11px]">
                    {group.length}
                  </span>
                </div>
                <ul className="border-line divide-line divide-y border">
                  {group.map((a, i) => {
                    const body = (
                      <span className="flex flex-col gap-1 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
                        <span className="flex items-center gap-3">
                          <span aria-hidden>{a.urgent ? "⚠️" : "•"}</span>
                          <span className="text-ink text-sm">{a.subject}</span>
                        </span>
                        <span className="flex flex-col gap-1 pl-7 sm:items-end sm:pl-0">
                          <span
                            className={`text-xs ${a.urgent ? "text-red" : "text-ink-faint"}`}
                          >
                            {a.detail}
                          </span>
                          <span className="label-tight border-line text-ink border px-2 py-1 text-[10px]">
                            {a.action}
                          </span>
                        </span>
                      </span>
                    );
                    return (
                      <li key={`${a.kind}-${a.subject}-${i}`}>
                        {a.href ? (
                          <Link
                            href={a.href as AppHref}
                            className="hover:bg-ink/5 block transition-colors"
                          >
                            {body}
                          </Link>
                        ) : (
                          body
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
