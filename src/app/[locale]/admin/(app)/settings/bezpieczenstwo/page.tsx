import { setRequestLocale } from "next-intl/server";
import {
  NAZWA_ZDARZENIA,
  podsumujZdarzenia,
} from "@/lib/security/events";
import { turnstileSkonfigurowany } from "@/lib/security/turnstile";
import { Link } from "@/i18n/navigation";
import {
  getHealthChecks,
  getLoginActivity,
  getAccountSummary,
  type HealthState,
} from "@/lib/admin/health";
import {
  getCacheStatus,
  formatBytesPl,
  CACHE_ALERT_PERCENT,
} from "@/lib/admin/cache";
import { currentAdmin } from "@/lib/auth/guard";
import { formatDateTimePl } from "@/lib/format";
import { BuildCacheCard, type BuildCacheView } from "./BuildCacheCard";

export const metadata = { title: "Bezpieczeństwo" };

const LIGHT: Record<HealthState, { dot: string; label: string }> = {
  ok: { dot: "🟢", label: "Działa" },
  warn: { dot: "🟠", label: "Uwaga" },
  fail: { dot: "🔴", label: "Nie działa" },
  // Two distinct not-green states, deliberately. "Stale" means the check used
  // to run and has gone quiet — which is itself a fault, and usually a worse
  // one than the thing being checked. "Unknown" means it never ran at all.
  stale: { dot: "🟠", label: "Brak świeżego raportu" },
  unknown: { dot: "⚪", label: "Nie wiadomo" },
};

/** "przed chwilą" / "12 min temu" / "3 godz. temu" / "2 dni temu". */
function ago(minutes: number | null): string {
  if (minutes == null) return "nigdy";
  if (minutes < 2) return "przed chwilą";
  if (minutes < 60) return `${minutes} min temu`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} godz. temu`;
  return `${Math.round(hours / 24)} dni temu`;
}

/**
 * Bezpieczeństwo — what is actually true right now, not what was true when
 * somebody wrote the documentation.
 *
 * Every line is read from a running system: the health rows the cron scripts
 * write, and the audit log. Nothing here is a hardcoded green dot, because a
 * hardcoded green dot is worse than no dot at all — it converts "I do not know"
 * into "everything is fine", which is exactly the sentence that stops anybody
 * looking further.
 */
export default async function SecurityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const zdarzenia = await podsumujZdarzenia();
  const turnstileOn = turnstileSkonfigurowany();

  const { locale } = await params;
  setRequestLocale(locale);

  const [checks, logins, accounts, cache, admin] = await Promise.all([
    getHealthChecks(),
    getLoginActivity(),
    getAccountSummary(),
    getCacheStatus(),
    currentAdmin(),
  ]);

  // Formatted here rather than in the client component, so the card cannot
  // invent a second way of writing a number that also appears in the log.
  const cacheView: BuildCacheView = {
    dot: LIGHT[cache.state].dot,
    statusLabel:
      cache.state === "ok"
        ? "Działa"
        : cache.state === "warn"
          ? "Czyści cache — dysk powyżej progu"
          : cache.state === "fail"
            ? "Dysk pełny mimo czyszczenia — potrzebna decyzja"
            : LIGHT[cache.state].label,
    cache: formatBytesPl(cache.cacheBytes),
    disk:
      cache.diskPercent == null
        ? "—"
        : `${cache.diskPercent}%${cache.diskFree ? ` (${cache.diskFree} wolne)` : ""}`,
    threshold: `${cache.thresholdPercent}%`,
    lastCheck: cache.checkedAt
      ? `${formatDateTimePl(cache.checkedAt)} (${ago(cache.ageMinutes)})`
      : "jeszcze nie było",
    lastCleanup: cache.lastCleanupAt
      ? formatDateTimePl(cache.lastCleanupAt)
      : "Jeszcze nie wykonano",
    lastFreed:
      cache.lastFreedBytes == null ? "—" : formatBytesPl(cache.lastFreedBytes),
    note: cache.lastMessage,
    awaiting: cache.requestState !== "idle",
    // Infrastructure is a superadmin's business. A plain admin still reads
    // every number above — hiding the state would not make anything safer,
    // it would only make the person who noticed the problem unable to say so.
    canClean: admin?.role === "superadmin",
  };

  const anyBad = checks.some(
    (c) => c.state === "fail" || c.state === "stale" || c.state === "warn",
  );
  const anyUnknown = checks.some((c) => c.state === "unknown");

  return (
    <div className="max-w-4xl">
      <Link
        href="/admin/settings"
        className="-my-2 inline-flex min-h-11 items-center label-tight text-ink-faint hover:text-ink text-[10px]"
      >
        ← Ustawienia
      </Link>
      <header className="mt-4 mb-8">
        <h1 className="font-heading text-ink text-2xl font-bold">
          Bezpieczeństwo
        </h1>
        <p className="text-silver mt-1 text-sm">
          Stan odczytany z działających systemów. Nic tu nie jest wpisane na
          sztywno — jeśli coś świeci na zielono, znaczy że zameldowało się samo.
        </p>
      </header>

      {/* ── Systemy ──────────────────────────────────────────────────────── */}
      <section>
        <h2 className="label text-ink text-xs">Systemy</h2>
        <div className="border-line mt-4 border">
          {checks.map((c) => (
            <div
              key={c.key}
              className="border-line/60 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b px-4 py-3 last:border-0"
            >
              <span className="w-5 shrink-0" aria-hidden>
                {LIGHT[c.state].dot}
              </span>
              <span className="text-ink min-w-[10rem] text-sm">{c.label}</span>
              <span className="text-silver text-xs">
                {LIGHT[c.state].label}
              </span>
              {c.detail && (
                <span className="text-ink-faint text-xs">{c.detail}</span>
              )}
              <span className="text-ink-faint ml-auto text-xs tabular-nums">
                {ago(c.ageMinutes)}
              </span>
              <span className="text-ink-faint w-full text-xs">
                {c.description}
                {c.state === "stale" && (
                  <>
                    {" — "}
                    <strong className="text-silver font-normal">
                      powinno raportować co{" "}
                      {c.expectedEveryMinutes >= 60
                        ? `${Math.round(c.expectedEveryMinutes / 60)} godz.`
                        : `${c.expectedEveryMinutes} min`}
                      , a milczy
                    </strong>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>

        {anyUnknown && (
          <p className="text-ink-faint mt-3 text-xs">
            „Nie wiadomo” znaczy, że dany sprawdzian nigdy się nie zameldował.
            Skrypty zapisują swój stan przy każdym uruchomieniu, więc pierwsze
            wpisy pojawią się po najbliższym przebiegu — monitoring co 15 minut,
            kopia w nocy o 03:00.
          </p>
        )}
        {!anyBad && !anyUnknown && (
          <p className="mt-3 text-xs text-emerald-400">
            Wszystkie systemy zameldowały się na czas.
          </p>
        )}
      </section>

      {/* ── Docker build cache ───────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="label text-ink text-xs">Docker build cache</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          Cache budowania obrazów rośnie z każdym wdrożeniem i nie sprząta po
          sobie sam — w sierpniu urósł do 14 GB i podniósł zajęcie dysku do 83%.
          Serwer sprawdza go co 15 minut i czyści sam dopiero od{" "}
          {cache.thresholdPercent}% zajętego dysku. Poniżej progu nie usuwa
          niczego, tylko zapisuje pomiar.
        </p>
        <BuildCacheCard {...cacheView} />
        <p className="text-ink-faint mt-3 text-xs">
          Czyszczone jest wyłącznie build cache. Obrazy produkcyjne, obrazy
          rollback, kontenery, wolumeny (baza, media, certyfikaty), kopie i
          snapshoty są poza zasięgiem tego mechanizmu — nawet gdy dysk jest
          pełny. Jeśli po czyszczeniu zajęcie nadal przekracza{" "}
          {CACHE_ALERT_PERCENT}%, serwer wysyła alert i czeka na decyzję
          człowieka, zamiast usuwać cokolwiek więcej.
        </p>
      </section>

      {/* ── Logowania ────────────────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="label text-ink text-xs">Logowania do panelu</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          Prosto z dziennika zdarzeń — tego samego, który obejrzałby ktoś
          badający włamanie.
        </p>
        <div className="border-line bg-line grid gap-px border sm:grid-cols-3">
          <div className="bg-void p-5">
            <p className="label-tight text-ink-faint text-[10px]">
              Nieudane — ostatnia godzina
            </p>
            <p
              className={`font-heading mt-2 text-2xl font-bold tabular-nums ${
                logins.failedLastHour >= 10 ? "text-red" : "text-ink"
              }`}
            >
              {logins.failedLastHour}
            </p>
          </div>
          <div className="bg-void p-5">
            <p className="label-tight text-ink-faint text-[10px]">
              Nieudane — doba
            </p>
            <p className="font-heading text-ink mt-2 text-2xl font-bold tabular-nums">
              {logins.failedLastDay}
            </p>
          </div>
          <div className="bg-void p-5">
            <p className="label-tight text-ink-faint text-[10px]">
              Udane — doba
            </p>
            <p className="font-heading text-ink mt-2 text-2xl font-bold tabular-nums">
              {logins.successLastDay}
            </p>
          </div>
        </div>
        <p className="text-ink-faint mt-3 text-xs">
          Ostatnie nieudane logowanie:{" "}
          {logins.lastFailureAt ? (
            <>
              {formatDateTimePl(logins.lastFailureAt)}
              {logins.lastFailureIp ? ` z adresu ${logins.lastFailureIp}` : ""}
            </>
          ) : (
            "brak w historii"
          )}
          . Konto blokuje się samo po serii nieudanych prób, a adres, który
          próbuje zbyt szybko, dostaje odmowę na pięć minut.
        </p>
      </section>

      {/* ── Konta ────────────────────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="label text-ink text-xs">Konta</h2>
        <div className="border-line mt-4 border p-5">
          <p className="text-ink text-sm">
            {accounts.total} {accounts.total === 1 ? "konto" : "konta"},{" "}
            {accounts.active} aktywne, {accounts.superadmins} z pełnymi
            uprawnieniami
            {accounts.locked > 0 ? `, ${accounts.locked} zablokowane` : ""}.
          </p>

          {accounts.total === 1 && (
            <p className="mt-3 text-xs text-amber-500">
              Jedno konto to jeden punkt awarii. Zgubione hasło albo zablokowane
              konto oznacza brak dostępu do panelu do czasu ręcznego odzyskania
              z serwera.
            </p>
          )}
          {accounts.withTwoFactor === 0 ? (
            <p className="mt-2 text-xs text-amber-500">
              Dwuskładnikowe logowanie (2FA): nieaktywne na żadnym koncie.
              Mechanizm jest gotowy — włącza się go w Ustawieniach → Moje konto,
              razem z dziesięcioma kodami zapasowymi. Bez 2FA jedyną przeszkodą
              między obcym a panelem jest hasło.
            </p>
          ) : (
            <p className="text-ink-faint mt-2 text-xs">
              Dwuskładnikowe logowanie (2FA): aktywne na{" "}
              {accounts.withTwoFactor}{" "}
              {accounts.withTwoFactor === 1 ? "koncie" : "kontach"}.
            </p>
          )}
          <Link
            href="/admin/users"
            className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap mt-4 inline-flex h-9 items-center border px-4 text-xs transition-colors"
          >
            Zarządzaj kontami
          </Link>
        </div>
      </section>

      {/* ── Ochrona formularzy i ruchu ───────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="label text-ink text-xs">Ochrona przed robotami</h2>
        <div className="border-line mt-4 border p-5">
          <p className="text-ink text-sm">
            {turnstileOn ? "🟢" : "⚪"} Cloudflare Turnstile:{" "}
            {turnstileOn ? "włączone" : "nieskonfigurowane"}
          </p>
          {!turnstileOn && (
            <p className="text-ink-faint mt-2 text-xs leading-relaxed">
              Brakuje zmiennych <code className="text-silver">TURNSTILE_SITE_KEY</code>{" "}
              i <code className="text-silver">TURNSTILE_SECRET_KEY</code>. Klucze
              tworzy się w panelu Cloudflare (Turnstile → Add site), są darmowe,
              a włączenie wymaga tylko restartu kontenera — bez przebudowy obrazu.
              Do tego czasu formularzy pilnują pułapka na roboty, pomiar czasu
              wypełniania i limity częstotliwości, które działają ZAWSZE i nie
              zależą od żadnej usługi zewnętrznej.
            </p>
          )}

          <h3 className="label-tight text-ink-faint mt-6 text-[10px]">
            Odrzucone próby — ostatnie 24 godziny
          </h3>
          {zdarzenia.length === 0 ? (
            <p className="text-ink-faint mt-2 text-xs">
              Nic nie zostało odrzucone. To jest normalny wynik dla małego
              serwisu — pusty dziennik nie znaczy, że ochrona nie działa.
            </p>
          ) : (
            <ul className="divide-line border-line mt-3 divide-y border-t text-sm">
              {zdarzenia.map((z) => (
                <li
                  key={z.kind}
                  className="flex items-center justify-between gap-4 py-2"
                >
                  <span className="text-silver">
                    {NAZWA_ZDARZENIA[z.kind] ?? z.kind}
                  </span>
                  <span className="text-ink tabular-nums">{z.ile}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-ink-faint mt-4 text-xs leading-relaxed">
            Dziennik zapisuje czas, rodzaj blokady, adres trasy i SKRÓCONY
            identyfikator — nie adres IP i nie e-mail. Wpisy są tylko do
            dopisywania: nie da się ich zmienić ani skasować z panelu.
          </p>
        </div>
      </section>

      {/* ── Odzyskiwanie ─────────────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="label text-ink text-xs">Odzyskiwanie</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          Czynności wykonywane z konsoli serwera — panel ich nie uruchamia
          celowo. Przycisk „przywróć bazę” w przeglądarce to jedno kliknięcie
          dzielące od skasowania dnia pracy.
        </p>
        <div className="border-line border p-5">
          <dl className="grid gap-3 text-sm sm:grid-cols-[14rem_1fr]">
            <dt className="text-ink-faint text-xs">Punkt przywracania</dt>
            <dd className="text-silver font-mono text-xs">
              ./scripts/snapshot.sh &quot;opis&quot;
            </dd>
            <dt className="text-ink-faint text-xs">Cofnięcie zmian</dt>
            <dd className="text-silver font-mono text-xs">
              ./scripts/rollback.sh &lt;znacznik&gt;
            </dd>
            <dt className="text-ink-faint text-xs">Kopia na komputer</dt>
            <dd className="text-silver font-mono text-xs">
              pobierz-kopie (Windows / macOS)
            </dd>
          </dl>
          <p className="text-ink-faint mt-4 text-xs">
            Pełny opis procedur:{" "}
            <code className="text-silver">docs/BEZPIECZENSTWO.md</code>
          </p>
        </div>
      </section>
    </div>
  );
}
