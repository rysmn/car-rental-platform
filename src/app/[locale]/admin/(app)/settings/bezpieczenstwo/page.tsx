import { setRequestLocale, getTranslations } from "next-intl/server";
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
import { pick } from "@/lib/i18n-pick";
import { BuildCacheCard, type BuildCacheView } from "./BuildCacheCard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.settings.security" });
  return { title: t("metaTitle") };
}

const DOT: Record<HealthState, string> = {
  ok: "🟢",
  warn: "🟠",
  fail: "🔴",
  // Two distinct not-green states, deliberately. "Stale" means the check used
  // to run and has gone quiet — which is itself a fault, and usually a worse
  // one than the thing being checked. "Unknown" means it never ran at all.
  stale: "🟠",
  unknown: "⚪",
};

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
  const t = await getTranslations("Admin.settings.security");
  const tc = await getTranslations("Admin.settings.common");

  const [checks, logins, accounts, cache, admin] = await Promise.all([
    getHealthChecks(),
    getLoginActivity(),
    getAccountSummary(),
    getCacheStatus(),
    currentAdmin(),
  ]);

  /** "przed chwilą" / "12 min temu" / "3 godz. temu" / "2 dni temu". */
  const ago = (minutes: number | null): string => {
    if (minutes == null) return t("ago.never");
    if (minutes < 2) return t("ago.justNow");
    if (minutes < 60) return t("ago.minutes", { n: minutes });
    const hours = Math.round(minutes / 60);
    if (hours < 48) return t("ago.hours", { n: hours });
    return t("ago.days", { n: Math.round(hours / 24) });
  };

  // Formatted here rather than in the client component, so the card cannot
  // invent a second way of writing a number that also appears in the log.
  const cacheView: BuildCacheView = {
    dot: DOT[cache.state],
    statusLabel:
      cache.state === "ok"
        ? t("health.ok")
        : cache.state === "warn"
          ? t("cache.statusWarn")
          : cache.state === "fail"
            ? t("cache.statusFail")
            : t(`health.${cache.state}`),
    cache: formatBytesPl(cache.cacheBytes),
    disk:
      cache.diskPercent == null
        ? "—"
        : cache.diskFree
          ? t("cache.diskWithFree", {
              percent: cache.diskPercent,
              free: cache.diskFree,
            })
          : `${cache.diskPercent}%`,
    threshold: `${cache.thresholdPercent}%`,
    lastCheck: cache.checkedAt
      ? t("cache.lastCheckValue", {
          date: formatDateTimePl(cache.checkedAt),
          ago: ago(cache.ageMinutes),
        })
      : t("cache.neverChecked"),
    lastCleanup: cache.lastCleanupAt
      ? formatDateTimePl(cache.lastCleanupAt)
      : t("cache.neverCleaned"),
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
        {tc("back")}
      </Link>
      <header className="mt-4 mb-8">
        <h1 className="font-heading text-ink text-2xl font-bold">
          {t("title")}
        </h1>
        <p className="text-silver mt-1 text-sm">{t("subtitle")}</p>
      </header>

      {/* ── Systemy ──────────────────────────────────────────────────────── */}
      <section>
        <h2 className="label text-ink text-xs">{t("systems.heading")}</h2>
        <div className="border-line mt-4 border">
          {checks.map((c) => (
            <div
              key={c.key}
              className="border-line/60 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b px-4 py-3 last:border-0"
            >
              <span className="w-5 shrink-0" aria-hidden>
                {DOT[c.state]}
              </span>
              <span className="text-ink min-w-[10rem] text-sm">{pick(c.label, locale)}</span>
              <span className="text-silver text-xs">
                {t(`health.${c.state}`)}
              </span>
              {c.detail && (
                <span className="text-ink-faint text-xs">{c.detail}</span>
              )}
              <span className="text-ink-faint ml-auto text-xs tabular-nums">
                {ago(c.ageMinutes)}
              </span>
              <span className="text-ink-faint w-full text-xs">
                {pick(c.description, locale)}
                {c.state === "stale" && (
                  <>
                    {" — "}
                    <strong className="text-silver font-normal">
                      {t("systems.stale", {
                        interval:
                          c.expectedEveryMinutes >= 60
                            ? t("systems.everyHours", {
                                n: Math.round(c.expectedEveryMinutes / 60),
                              })
                            : t("systems.everyMinutes", {
                                n: c.expectedEveryMinutes,
                              }),
                      })}
                    </strong>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>

        {anyUnknown && (
          <p className="text-ink-faint mt-3 text-xs">
            {t("systems.unknownNote")}
          </p>
        )}
        {!anyBad && !anyUnknown && (
          <p className="mt-3 text-xs text-emerald-400">
            {t("systems.allOk")}
          </p>
        )}
      </section>

      {/* ── Docker build cache ───────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="label text-ink text-xs">Docker build cache</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          {t("cache.intro", { threshold: cache.thresholdPercent })}
        </p>
        <BuildCacheCard {...cacheView} />
        <p className="text-ink-faint mt-3 text-xs">
          {t("cache.scope", { alert: CACHE_ALERT_PERCENT })}
        </p>
      </section>

      {/* ── Logowania ────────────────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="label text-ink text-xs">{t("logins.heading")}</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          {t("logins.intro")}
        </p>
        <div className="border-line bg-line grid gap-px border sm:grid-cols-3">
          <div className="bg-void p-5">
            <p className="label-tight text-ink-faint text-[10px]">
              {t("logins.failedHour")}
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
              {t("logins.failedDay")}
            </p>
            <p className="font-heading text-ink mt-2 text-2xl font-bold tabular-nums">
              {logins.failedLastDay}
            </p>
          </div>
          <div className="bg-void p-5">
            <p className="label-tight text-ink-faint text-[10px]">
              {t("logins.successDay")}
            </p>
            <p className="font-heading text-ink mt-2 text-2xl font-bold tabular-nums">
              {logins.successLastDay}
            </p>
          </div>
        </div>
        <p className="text-ink-faint mt-3 text-xs">
          {t("logins.lastFailure")}{" "}
          {logins.lastFailureAt ? (
            <>
              {formatDateTimePl(logins.lastFailureAt)}
              {logins.lastFailureIp
                ? t("logins.fromAddress", { ip: logins.lastFailureIp })
                : ""}
            </>
          ) : (
            t("logins.none")
          )}
          {t("logins.lockout")}
        </p>
      </section>

      {/* ── Konta ────────────────────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="label text-ink text-xs">{t("accounts.heading")}</h2>
        <div className="border-line mt-4 border p-5">
          <p className="text-ink text-sm">
            {t("accounts.summary", {
              total: accounts.total,
              active: accounts.active,
              superadmins: accounts.superadmins,
              locked: accounts.locked,
            })}
          </p>

          {accounts.total === 1 && (
            <p className="mt-3 text-xs text-amber-500">
              {t("accounts.singleAccount")}
            </p>
          )}
          {accounts.withTwoFactor === 0 ? (
            <p className="mt-2 text-xs text-amber-500">
              {t("accounts.noTwoFactor")}
            </p>
          ) : (
            <p className="text-ink-faint mt-2 text-xs">
              {t("accounts.withTwoFactor", {
                count: accounts.withTwoFactor,
              })}
            </p>
          )}
          <Link
            href="/admin/users"
            className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap mt-4 inline-flex h-9 items-center border px-4 text-xs transition-colors"
          >
            {t("accounts.manage")}
          </Link>
        </div>
      </section>

      {/* ── Ochrona formularzy i ruchu ───────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="label text-ink text-xs">{t("protection.heading")}</h2>
        <div className="border-line mt-4 border p-5">
          <p className="text-ink text-sm">
            {turnstileOn ? "🟢" : "⚪"}{" "}
            {t("protection.turnstile", {
              state: turnstileOn
                ? t("protection.on")
                : t("protection.off"),
            })}
          </p>
          {!turnstileOn && (
            <p className="text-ink-faint mt-2 text-xs leading-relaxed">
              {t.rich("protection.missingVars", {
                code: (chunks) => <code className="text-silver">{chunks}</code>,
              })}
            </p>
          )}

          <h3 className="label-tight text-ink-faint mt-6 text-[10px]">
            {t("protection.rejectedHeading")}
          </h3>
          {zdarzenia.length === 0 ? (
            <p className="text-ink-faint mt-2 text-xs">
              {t("protection.none")}
            </p>
          ) : (
            <ul className="divide-line border-line mt-3 divide-y border-t text-sm">
              {zdarzenia.map((z) => (
                <li
                  key={z.kind}
                  className="flex items-center justify-between gap-4 py-2"
                >
                  <span className="text-silver">
                    {NAZWA_ZDARZENIA[z.kind]
                      ? pick(NAZWA_ZDARZENIA[z.kind], locale)
                      : z.kind}
                  </span>
                  <span className="text-ink tabular-nums">{z.ile}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-ink-faint mt-4 text-xs leading-relaxed">
            {t("protection.logNote")}
          </p>
        </div>
      </section>

      {/* ── Odzyskiwanie ─────────────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="label text-ink text-xs">{t("recovery.heading")}</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          {t("recovery.intro")}
        </p>
        <div className="border-line border p-5">
          <dl className="grid gap-3 text-sm sm:grid-cols-[14rem_1fr]">
            <dt className="text-ink-faint text-xs">{t("recovery.restorePoint")}</dt>
            <dd className="text-silver font-mono text-xs">
              ./scripts/snapshot.sh &quot;opis&quot;
            </dd>
            <dt className="text-ink-faint text-xs">{t("recovery.rollback")}</dt>
            <dd className="text-silver font-mono text-xs">
              ./scripts/rollback.sh &lt;znacznik&gt;
            </dd>
            <dt className="text-ink-faint text-xs">{t("recovery.copy")}</dt>
            <dd className="text-silver font-mono text-xs">
              pobierz-kopie (Windows / macOS)
            </dd>
          </dl>
          <p className="text-ink-faint mt-4 text-xs">
            {t.rich("recovery.docs", {
              code: (chunks) => <code className="text-silver">{chunks}</code>,
            })}
          </p>
        </div>
      </section>
    </div>
  );
}
