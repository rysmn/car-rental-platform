import { setRequestLocale } from "next-intl/server";
import { guardPage } from "@/lib/auth/guard";
import { Link } from "@/i18n/navigation";
import { getSetting } from "@/lib/admin/settings";
import {
  ABROAD_RULE,
  DOCUMENTS_BASE_RULE,
  STATUS_LABEL,
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

export const metadata = { title: "Zasady wynajmu" };

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

function StatusChip({ status }: { status: RuleStatus }) {
  return (
    <span
      className={`label-tight rounded-pill px-2 py-0.5 text-[9px] whitespace-nowrap ${TONE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function Section({
  id,
  title,
  status,
  children,
}: {
  id: string;
  title: string;
  status: RuleStatus;
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
        <StatusChip status={status} />
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

  return (
    <div className="max-w-4xl">
      <header className="mb-6">
        <h1 className="font-heading text-ink text-2xl font-bold">
          Zasady wynajmu
        </h1>
        <p className="text-silver mt-1 text-sm">
          Jedno miejsce, z którego korzystają strona, FAQ, chatbot i — docelowo
          — obsługa głosowa. Zasada zmieniona tutaj działa wszędzie, bez
          poprawiania tej samej informacji w kilku plikach.
        </p>
      </header>

      <div className="mb-8 flex flex-wrap gap-2">
        <span className={`label-tight rounded-pill px-3 py-1 text-[10px] ${TONE.active}`}>
          {count("active")} aktywne
        </span>
        <span
          className={`label-tight rounded-pill px-3 py-1 text-[10px] ${TONE.needs_decision}`}
        >
          {count("needs_decision")} wymaga decyzji
        </span>
        <span className={`label-tight rounded-pill px-3 py-1 text-[10px] ${TONE.disabled}`}>
          {count("disabled")} wyłączone
        </span>
      </div>

      <div className="grid gap-10">
        {/* ── Dokumenty ─────────────────────────────────────────────── */}
        <Section id="dokumenty" title="Dokumenty kierowcy" status="active">
          <div className="border-line-strong bg-graphite/60 mb-4 border-l-2 border-l-emerald-500 p-4">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="label-tight text-ink text-[10px]">
                Zasada podstawowa
              </span>
              <StatusChip status="active" />
            </div>
            <p className="text-silver text-sm">„{DOCUMENTS_BASE_RULE.pl}”</p>
            <p className="text-ink-faint mt-2 text-xs">
              Obowiązuje zawsze, niezależnie od przełączników poniżej. Nie da się
              jej wyłączyć — nie ma wynajmu bez prawa jazdy i dokumentu
              tożsamości.
            </p>
          </div>

          <p className="text-ink-faint text-xs">
            Każdy przełącznik odpowiada na pytanie{" "}
            <strong className="text-silver font-normal">
              „czy wolno nam to potwierdzić?”
            </strong>
            , a nie „czy tak jest”. Wyłączenie{" "}
            <strong className="text-silver font-normal">nie oznacza</strong>{" "}
            zasady przeciwnej — asystent po prostu milczy w tej sprawie i kieruje
            klienta do pracownika A&amp;A.
          </p>

          <DocumentRulesForm rules={rules} />
        </Section>

        {/* ── Wiek ──────────────────────────────────────────────────── */}
        <Section
          id="wiek"
          title="Wiek kierowcy i staż prawa jazdy"
          status={driverAgeStatus()}
        >
          {/* The one place in this panel where two different meanings of "off"
              meet, so the difference is stated before the switches, not left
              for somebody to infer from a rejected booking. */}
          <div className="border-line-strong bg-graphite/60 mb-4 border-l-2 border-l-amber-500 p-4">
            <p className="text-silver text-sm">
              Przełączniki w tej sekcji odpowiadają na pytanie{" "}
              <strong className="text-ink font-normal">
                „czy ten wymóg obowiązuje?”
              </strong>{" "}
              — inaczej niż w sekcji dokumentów, gdzie odpowiadają na pytanie
              „czy wolno nam to potwierdzić?”. Dlatego mają tu etykiety
              OBOWIĄZUJE / NIE OBOWIĄZUJE.
            </p>
            <p className="text-ink-faint mt-2 text-xs">
              Wyłączenie wymogu klasy{" "}
              <strong className="text-silver font-normal">nie znosi</strong>{" "}
              kontroli wieku — sprowadza ją do progu bezpieczeństwa{" "}
              {FALLBACK_MIN_AGE} lat, który obowiązuje zawsze i którego nie da
              się wyłączyć z panelu.
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
                ? "Formularz rezerwacji egzekwuje progi klas — sprawdza wiek kierowcy wobec klasy wybranego auta."
                : `Formularz rezerwacji odrzuca kierowcę poniżej ${FALLBACK_MIN_AGE} lat, tak jak dotychczas. Progi klas są zapisane, ale jeszcze nie działają.`}
            </p>
            <p className="text-ink-faint mt-2 text-xs">
              Jedno źródło dla wszystkich: formularz, backend, FAQ, strony
              ofertowe i asystent czytają tę samą wartość. Klient nigdy nie
              zobaczy progu, którego formularz nie stosuje.
            </p>
            <p className="text-ink-faint mt-2 text-xs">
              Zdanie, które widzi klient: „
              <span className="text-silver">
                {driverAgeSentence(rules, "pl", "all")}
              </span>
              ”
            </p>
          </div>

          {/* The legal document is not generated from these switches and must
              never be edited by one. Where the two disagree, the panel says so
              and stops — changing the umowa is a lawyer's decision. */}
          <div className="border-line-strong bg-graphite/60 mb-4 border-l-2 border-l-amber-500 p-4">
            <p className="label-tight text-[9px] text-amber-500">
              WYMAGA DECYZJI / AKTUALIZACJI REGULAMINU
            </p>
            <p className="text-ink-faint mt-2 text-xs">
              Regulamin (§3, PL i EN) mówi: ukończone {FALLBACK_MIN_AGE} lat i
              prawo jazdy wydane co najmniej rok wcześniej, a dla wybranych
              modeli dopuszcza wyższy wiek podawany{" "}
              <span className="text-silver">
                przy potwierdzeniu rezerwacji
              </span>
              . Próg 25 lat mieści się w tym zapisie, ale formularz odrzuca{" "}
              <span className="text-silver">wcześniej</span> — w chwili
              składania rezerwacji. Do rozstrzygnięcia z prawnikiem przed
              włączeniem egzekwowania; pełny wykaz miejsc w{" "}
              <span className="text-silver">docs/ZLECENIE-WIEK-KIEROWCY.md</span>
              . Panel nie zmienia dokumentu prawnego.
            </p>
          </div>

          <DriverAgeForm
            rules={rules}
            counts={classCounts}
            unassignedPublished={unassignedPublished}
          />

          <div className="border-line mt-8 border-t pt-6">
            <h3 className="label text-ink text-xs">
              Przypisanie samochodów do klas
            </h3>
            <p className="text-ink-faint mt-1 text-xs">
              Klasę można zmienić także przy edycji auta we Flocie — to jedno i
              to samo ustawienie, pokazane w dwóch miejscach. Nowe auto nie
              zapisze się bez wybranej klasy.
            </p>
            <DriverClassForm models={models} />
          </div>
        </Section>

        {/* ── Zagranica ─────────────────────────────────────────────── */}
        <Section
          id="zagranica"
          title="Wyjazdy zagraniczne"
          status={rules.abroad.status}
        >
          <p className="text-ink-faint mb-3 text-xs">
            Zasada Z-1 · zatwierdzona 20.08.2026 ·{" "}
            <span className="text-silver">docs/ZASADY-BIZNESOWE.md</span>
          </p>
          <div className="border-line-strong bg-graphite/60 border-l-2 border-l-emerald-500 p-4">
            <p className="text-silver text-sm">„{ABROAD_RULE.pl.short}”</p>
          </div>
          <ul className="text-ink-faint mt-3 grid gap-1.5 text-xs">
            <li>
              Lista krajów dozwolonych{" "}
              <strong className="text-silver font-normal">
                nie istnieje i nie powstanie
              </strong>{" "}
              — asystent odpowiada tak samo na każdy kierunek.
            </li>
            <li>
              Asystent{" "}
              <strong className="text-silver font-normal">
                nie może udzielić zgody
              </strong>{" "}
              — kieruje do pracownika i mówi wprost, że brak odpowiedzi nie
              oznacza zgody.
            </li>
            <li>
              Treść tylko do odczytu: to zatwierdzona decyzja, a pole edycyjne
              zapraszałoby do rozjechania jej z dokumentem.
            </li>
          </ul>
        </Section>

        {/* ── Udział własny ─────────────────────────────────────────── */}
        <Section
          id="udzial-wlasny"
          title="Udział własny / szkody"
          status={rules.excess.status}
        >
          <div className="mt-2">
            <Placeholder label="Kwota / zasada udziału własnego" hint="do decyzji" />
            <Placeholder
              label="Powiązanie z klasą lub pojazdem"
              hint="brak powiązania"
            />
            <Placeholder label="Dodatkowe warunki" hint="puste" />
          </div>
          <p className="text-ink-faint mt-3 text-xs">
            W cenniku opłat są dwie pozycje, których treść nie jest nigdzie
            wyjaśniona: pakiet ochronny i wynajem bez kaucji, obie po 100 zł za
            dobę. Dopóki zasada nie zostanie zatwierdzona, asystent nie mówi, co
            one obejmują.
          </p>
        </Section>

        {/* ── Wypadek ───────────────────────────────────────────────── */}
        <Section
          id="wypadek"
          title="Wypadek i awaria"
          status={rules.emergency.status}
        >
          <div className="mt-2">
            <Placeholder label="Numer kontaktowy A&A / assistance" hint="brak" />
            <Placeholder label="Numer dodatkowy" hint="brak" />
            <Placeholder label="Instrukcja postępowania" hint="pusta" />
          </div>
          <p className="text-ink-faint mt-3 text-xs">
            Do czasu podania numeru i procedury obowiązuje bezpieczne
            zachowanie: asystent rozpoznaje wypadek, kolizję i awarię, mówi że
            sprawa jest pilna, podaje kontakt do A&amp;A i wprost odmawia
            cytowania numeru pomocy drogowej z pamięci. Ta reakcja ma najwyższy
            priorytet i nie da się jej wyłączyć przełącznikiem.
          </p>
        </Section>

        {/* ── Pozostałe ─────────────────────────────────────────────── */}
        <Section
          id="pozostale"
          title="Pozostałe zasady"
          status="needs_decision"
        >
          <p className="text-ink-faint mb-4 text-xs">
            Tematy, o które klienci już pytali, a asystent nie miał czym
            odpowiedzieć. To nie jest lista życzeń — pochodzi z prawdziwych
            rozmów. Próby obejścia asystenta, pytania o cudze dane i odbicia
            własnych przycisków nie trafiają tutaj: zostają w logach, ale nie są
            propozycjami zasad.
          </p>
          {openTopics.length === 0 ? (
            <p className="border-line text-silver border px-5 py-6 text-center text-sm">
              Brak nieobsłużonych tematów.
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
                    pytano {q.times}×
                    {q.kind === "low_confidence" ? " · niska pewność" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {setAside.security + setAside.system > 0 ? (
            <p className="text-ink-faint mt-4 text-[10px]">
              Odłożono na bok{" "}
              <strong className="text-silver font-normal">
                {setAside.security + setAside.system}
              </strong>{" "}
              {setAside.security > 0
                ? `wpisów, w tym ${setAside.security} zaklasyfikowanych jako bezpieczeństwo`
                : "wpisów technicznych"}
              {setAside.security > 0 && setAside.system > 0
                ? ` i ${setAside.system} technicznych`
                : ""}
              . Nic nie zostało usunięte — wszystkie są w „Pytaniach bez
              odpowiedzi” i w Dzienniku zdarzeń.
            </p>
          ) : null}
          <Link
            href="/admin/chatbot/pytania"
            className="label-tight text-silver hover:text-ink tap mt-4 inline-flex items-center text-[10px] transition-colors"
          >
            Pełna lista i „Dodaj do FAQ” →
          </Link>
        </Section>
      </div>

      <section className="border-line mt-12 border-t pt-8">
        <h2 className="label text-ink text-xs">Warto wiedzieć</h2>
        <ul className="text-ink-faint mt-4 grid gap-2 text-xs">
          <li>
            <strong className="text-silver font-normal">
              To nie jest regulamin wynajmu.
            </strong>{" "}
            Formalny regulamin to osobne ustawienie (Ustawienia → Dokumenty
            prawne) i jest dziś pusty — a asystent przy anulowaniu rezerwacji
            powołuje się na regulamin. Warto to rozstrzygnąć.
          </li>
          <li>
            <strong className="text-silver font-normal">
              Każda zmiana trafia do Dziennika zdarzeń
            </strong>{" "}
            razem z tym, co było przed nią i kto ją wprowadził.
          </li>
          <li>
            <strong className="text-silver font-normal">
              Zasada aktywna pojawia się w FAQ i u asystenta
            </strong>{" "}
            z tej samej treści. Zasada „wymaga decyzji” nie pojawia się nigdzie —
            asystent kieruje wtedy do pracownika.
          </li>
        </ul>
      </section>
    </div>
  );
}
