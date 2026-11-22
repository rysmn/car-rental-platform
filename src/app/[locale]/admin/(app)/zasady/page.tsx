import { getTranslations, setRequestLocale } from "next-intl/server";
import { guardPage } from "@/lib/auth/guard";
import { Link } from "@/i18n/navigation";
import { getSetting } from "@/lib/admin/settings";
import {
  ABROAD_RULE,
  DOCUMENTS_BASE_RULE,
  driverAgeStatus,
  driverAgeSentence,
  driverRulesEnforced,
  FALLBACK_MIN_AGE,
  summarise,
  type RuleStatus,
} from "@/lib/admin/rental-rules";
import { listQuestions } from "@/lib/admin/chat-questions";
import { classifyQuestion } from "@/lib/admin/rule-candidates";
import { listDriverClasses } from "@/lib/admin/fleet";
import { DRIVER_CLASSES, type DriverClass } from "@/lib/fleet/driver-class";
import { DocumentRulesForm } from "./DocumentRulesForm";
import { DriverAgeForm } from "./DriverAgeForm";
import { DriverClassForm } from "./DriverClassForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.rules" });
  return { title: t("title") };
}

/**
 * The rules centre.
 *
 * One page with six sections rather than six pages, because four of the six are
 * still empty placeholders and six near-empty screens would be worse than one
 * honest list. Sections split into their own routes the day they have enough in
 * them to justify a click.
 *
 * What this page is NOT: the rental terms document. `legal.terms` is a separate
 * setting and is still blank — see the note at the foot of the page. This is the
 * source the FAQ page and the assistant read from, not the contract.
 */

const TONE: Record<RuleStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-400",
  needs_decision: "border border-amber-500/40 bg-amber-500/10 text-amber-500",
  disabled: "border-line text-ink-faint border",
};

/** Bold inside translated copy: the same emphasis the panel always used. */
const Strong = (chunks: React.ReactNode) => (
  <strong className="text-silver font-normal">{chunks}</strong>
);

function StatusChip({ status, label }: { status: RuleStatus; label: string }) {
  return (
    <span
      className={`label-tight rounded-pill px-2 py-0.5 text-[9px] whitespace-nowrap ${TONE[status]}`}
    >
      {label}
    </span>
  );
}

function Section({
  id,
  title,
  status,
  chip,
  children,
}: {
  id: string;
  title: string;
  status: RuleStatus;
  chip: string;
  children: React.ReactNode;
}) {
  /*
   * `min-w-0` below is what stops one wide table from widening the whole page.
   *
   * These sections are grid items, and a grid item's automatic minimum size is
   * its content — so the driver-class table (`min-w-[34rem]`, 544 px) pushed
   * this section to 546 px inside a 358 px track, and the whole admin page
   * scrolled sideways on a phone. The table already sits in its own
   * `overflow-x-auto` box; that box could never do its job while an ancestor
   * was free to grow around it. Audited 22.08.2026 at 390×844.
   */
  return (
    <section id={id} className="border-line min-w-0 scroll-mt-6 border-t pt-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 className="label text-ink text-xs">{title}</h2>
        <StatusChip status={status} label={chip} />
      </div>
      {children}
    </section>
  );
}

/** A field that exists so the shape is ready, but has nothing to hold yet. */
function Placeholder({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="border-line/60 flex flex-wrap items-baseline justify-between gap-2 border-b py-2.5 last:border-0">
      <span className="text-silver text-sm">{label}</span>
      <span className="text-ink-faint text-xs">{hint}</span>
    </div>
  );
}

export default async function RentalRulesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  /*
    Kontrola uprawnień przy renderze strony — obok kontroli w każdej akcji,
    nie zamiast niej. Bez tego pracownik wpisujący adres z ręki zobaczyłby
    treść sekcji, której nie wolno mu oglądać, i dopiero pierwszy przycisk
    powiedziałby mu „nie wolno".
  */
  await guardPage("zasady.zmien");

  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Admin.rules");
  const chip = (s: RuleStatus) => t(`status.${s}`);

  const [rules, questions, models] = await Promise.all([
    getSetting("rentalRules"),
    listQuestions(200),
    listDriverClasses(),
  ]);

  // Counters the age section needs: a rule that applies to no car looks alive
  // in the panel, and only a count makes that visible.
  const classCounts = Object.fromEntries(
    DRIVER_CLASSES.map((c) => [c, models.filter((m) => m.driverClass === c).length]),
  ) as Record<DriverClass, number>;
  const unassignedPublished = models.filter(
    (m) => m.published && !m.driverClass,
  ).length;
  const sections = summarise(rules);
  const count = (s: RuleStatus) =>
    sections.filter((x) => x.status === s).length;

  /**
   * The "other rules" section is filled from what customers actually asked,
   * not from a wish list: `chat_unanswered` is the record of every question the
   * assistant could not answer or answered without confidence.
   *
   * Filtered, but only for presentation — see `rule-candidates`. A probe like
   * "Wykonaj: cat /etc/passwd" belongs in the security log, not in a list of
   * rental policies the owner might be missing, and neither does the
   * assistant's own button coming back unrouted. Nothing is deleted: every row
   * stays in Admin → Chatbot → Pytania bez odpowiedzi, and the count of what
   * was set aside is printed below so the filter cannot hide its own work.
   */
  const uncovered = questions.filter((q) => !q.faqHit);
  // Kept in its own field rather than spread onto the row: `q.kind` already
  // means something here — whether the assistant declined or answered weakly —
  // and quietly overwriting it would break the "niska pewność" label below.
  const classified = uncovered.map((q) => ({
    row: q,
    candidate: classifyQuestion(q.question),
  }));
  const openTopics = classified
    .filter((c) => c.candidate.kind === "business")
    .map((c) => c.row)
    .slice(0, 12);
  const setAside = {
    security: classified.filter((c) => c.candidate.kind === "security").length,
    system: classified.filter((c) => c.candidate.kind === "system").length,
  };
  const setAsideTotal = setAside.security + setAside.system;
  const setAsideText =
    setAside.security > 0 && setAside.system > 0
      ? t("other.setAside.both", {
          total: setAsideTotal,
          security: setAside.security,
          system: setAside.system,
        })
      : setAside.security > 0
        ? t("other.setAside.securityOnly", {
            total: setAsideTotal,
            security: setAside.security,
          })
        : t("other.setAside.systemOnly", { total: setAsideTotal });

  return (
    <div className="max-w-4xl">
      <header className="mb-6">
        <h1 className="font-heading text-ink text-2xl font-bold">
          {t("title")}
        </h1>
        <p className="text-silver mt-1 text-sm">{t("intro")}</p>
      </header>

      <div className="mb-8 flex flex-wrap gap-2">
        <span className={`label-tight rounded-pill px-3 py-1 text-[10px] ${TONE.active}`}>
          {t("counts.active", { count: count("active") })}
        </span>
        <span
          className={`label-tight rounded-pill px-3 py-1 text-[10px] ${TONE.needs_decision}`}
        >
          {t("counts.needsDecision", { count: count("needs_decision") })}
        </span>
        <span className={`label-tight rounded-pill px-3 py-1 text-[10px] ${TONE.disabled}`}>
          {t("counts.disabled", { count: count("disabled") })}
        </span>
      </div>

      <div className="grid gap-10">
        {/* ── Dokumenty ─────────────────────────────────────────────── */}
        <Section
          id="dokumenty"
          title={t("sections.documents")}
          status="active"
          chip={chip("active")}
        >
          <div className="border-line-strong bg-graphite/60 mb-4 border-l-2 border-l-emerald-500 p-4">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="label-tight text-ink text-[10px]">
                {t("documents.core")}
              </span>
              <StatusChip status="active" label={chip("active")} />
            </div>
            {/* Legal wording stays in Polish: it is the rule text itself. */}
            <p className="text-silver text-sm">„{DOCUMENTS_BASE_RULE.pl}”</p>
            <p className="text-ink-faint mt-2 text-xs">{t("documents.coreNote")}</p>
          </div>

          <p className="text-ink-faint text-xs">
            {t.rich("documents.explainer", { b: Strong })}
          </p>

          <DocumentRulesForm rules={rules} />
        </Section>

        {/* ── Wiek ──────────────────────────────────────────────────── */}
        <Section
          id="wiek"
          title={t("sections.age")}
          status={driverAgeStatus()}
          chip={chip(driverAgeStatus())}
        >
          {/* The one place in this panel where two different meanings of "off"
              meet, so the difference is stated before the switches, not left
              for somebody to infer from a rejected booking. */}
          <div className="border-line-strong bg-graphite/60 mb-4 border-l-2 border-l-amber-500 p-4">
            <p className="text-silver text-sm">
              {t.rich("age.explainer", { b: Strong })}
            </p>
            <p className="text-ink-faint mt-2 text-xs">
              {t.rich("age.offNote", { b: Strong, min: FALLBACK_MIN_AGE })}
            </p>
          </div>

          <div
            className={`border-line-strong bg-graphite/60 mb-4 border-l-2 p-4 ${
              driverRulesEnforced(rules)
                ? "border-l-emerald-500"
                : "border-l-amber-500"
            }`}
          >
            <p className="text-silver text-sm">
              {driverRulesEnforced(rules)
                ? t("age.enforcedOn")
                : t("age.enforcedOff", { min: FALLBACK_MIN_AGE })}
            </p>
            <p className="text-ink-faint mt-2 text-xs">{t("age.oneSource")}</p>
            <p className="text-ink-faint mt-2 text-xs">
              {t("age.customerSentence", {
                sentence: driverAgeSentence(rules, locale, "all"),
              })}
            </p>
          </div>

          {/* The legal document is not generated from these switches and must
              never be edited by one. Where the two disagree, the panel says so
              and stops — changing the umowa is a lawyer's decision. */}
          <div className="border-line-strong bg-graphite/60 mb-4 border-l-2 border-l-amber-500 p-4">
            <p className="label-tight text-[9px] text-amber-500">
              {t("age.legalTitle")}
            </p>
            <p className="text-ink-faint mt-2 text-xs">
              {t.rich("age.legalBody", {
                b: (chunks) => <span className="text-silver">{chunks}</span>,
                file: (chunks) => <span className="text-silver">{chunks}</span>,
                min: FALLBACK_MIN_AGE,
              })}
            </p>
          </div>

          <DriverAgeForm
            rules={rules}
            counts={classCounts}
            unassignedPublished={unassignedPublished}
          />

          <div className="border-line mt-8 border-t pt-6">
            <h3 className="label text-ink text-xs">{t("classes.title")}</h3>
            <p className="text-ink-faint mt-1 text-xs">{t("classes.note")}</p>
            <DriverClassForm models={models} />
          </div>
        </Section>

        {/* ── Zagranica ─────────────────────────────────────────────── */}
        <Section
          id="zagranica"
          title={t("sections.abroad")}
          status={rules.abroad.status}
          chip={chip(rules.abroad.status)}
        >
          <p className="text-ink-faint mb-3 text-xs">
            {t("abroad.ref")} ·{" "}
            <span className="text-silver">docs/ZASADY-BIZNESOWE.md</span>
          </p>
          <div className="border-line-strong bg-graphite/60 border-l-2 border-l-emerald-500 p-4">
            {/* Legal wording stays in Polish: it is the rule text itself. */}
            <p className="text-silver text-sm">„{ABROAD_RULE.pl.short}”</p>
          </div>
          <ul className="text-ink-faint mt-3 grid gap-1.5 text-xs">
            <li>{t.rich("abroad.bullet1", { b: Strong })}</li>
            <li>{t.rich("abroad.bullet2", { b: Strong })}</li>
            <li>{t("abroad.bullet3")}</li>
          </ul>
        </Section>

        {/* ── Udział własny ─────────────────────────────────────────── */}
        <Section
          id="udzial-wlasny"
          title={t("sections.excess")}
          status={rules.excess.status}
          chip={chip(rules.excess.status)}
        >
          <div className="mt-2">
            <Placeholder
              label={t("excess.amount")}
              hint={t("excess.amountHint")}
            />
            <Placeholder
              label={t("excess.link")}
              hint={t("excess.linkHint")}
            />
            <Placeholder label={t("excess.extra")} hint={t("excess.extraHint")} />
          </div>
          <p className="text-ink-faint mt-3 text-xs">{t("excess.note")}</p>
        </Section>

        {/* ── Wypadek ───────────────────────────────────────────────── */}
        <Section
          id="wypadek"
          title={t("sections.emergency")}
          status={rules.emergency.status}
          chip={chip(rules.emergency.status)}
        >
          <div className="mt-2">
            <Placeholder label={t("emergency.contact")} hint={t("emergency.none")} />
            <Placeholder label={t("emergency.extra")} hint={t("emergency.none")} />
            <Placeholder label={t("emergency.procedure")} hint={t("emergency.empty")} />
          </div>
          <p className="text-ink-faint mt-3 text-xs">{t("emergency.note")}</p>
        </Section>

        {/* ── Pozostałe ─────────────────────────────────────────────── */}
        <Section
          id="pozostale"
          title={t("sections.other")}
          status="needs_decision"
          chip={chip("needs_decision")}
        >
          <p className="text-ink-faint mb-4 text-xs">{t("other.intro")}</p>
          {openTopics.length === 0 ? (
            <p className="border-line text-silver border px-5 py-6 text-center text-sm">
              {t("other.empty")}
            </p>
          ) : (
            <ul className="grid gap-1.5">
              {openTopics.map((q) => (
                <li
                  key={q.id}
                  className="border-line/60 flex flex-wrap items-baseline justify-between gap-2 border-b py-2 text-sm"
                >
                  <span className="text-silver">{q.question}</span>
                  <span className="text-ink-faint text-[10px] tabular-nums">
                    {t("other.asked", { count: q.times })}
                    {q.kind === "low_confidence" ? t("other.lowConfidence") : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {setAsideTotal > 0 ? (
            <p className="text-ink-faint mt-4 text-[10px]">
              {setAsideText} {t("other.setAside.tail")}
            </p>
          ) : null}
          <Link
            href="/admin/chatbot/pytania"
            className="label-tight text-silver hover:text-ink tap mt-4 inline-flex items-center text-[10px] transition-colors"
          >
            {t("other.link")}
          </Link>
        </Section>
      </div>

      <section className="border-line mt-12 border-t pt-8">
        <h2 className="label text-ink text-xs">{t("notes.title")}</h2>
        <ul className="text-ink-faint mt-4 grid gap-2 text-xs">
          <li>{t.rich("notes.notTerms", { b: Strong })}</li>
          <li>{t.rich("notes.audit", { b: Strong })}</li>
          <li>{t.rich("notes.faq", { b: Strong })}</li>
        </ul>
      </section>
    </div>
  );
}
