import { getTranslations, setRequestLocale } from "next-intl/server";
import { guardPage } from "@/lib/auth/guard";
import { Link } from "@/i18n/navigation";
import { getSetting } from "@/lib/admin/settings";
import { getChatStats, listLeads, listUnanswered } from "@/lib/chat/repo";
import { formatDateTimePl } from "@/lib/format";
import { ChatbotTabs } from "./ChatbotTabs";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.chatbot" });
  return { title: t("dashboard.metaTitle") };
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn";
}) {
  return (
    <div className="bg-void p-5">
      <p className="label-tight text-ink-faint text-[10px]">{label}</p>
      <p
        className={`font-heading mt-2 text-2xl font-bold tabular-nums ${
          tone === "good"
            ? "text-emerald-400"
            : tone === "warn"
              ? "text-amber-500"
              : "text-ink"
        }`}
      >
        {value}
      </p>
      {hint && <p className="text-ink-faint mt-1 text-xs">{hint}</p>}
    </div>
  );
}

export default async function ChatbotDashboard({
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
  await guardPage("czat.podglad");

  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Admin.chatbot");

  const [settings, stats, leads, unanswered] = await Promise.all([
    getSetting("chatbot"),
    getChatStats(),
    listLeads(5),
    listUnanswered(5),
  ]);

  return (
    <div className="max-w-5xl">
      <header className="mb-6">
        <h1 className="font-heading text-ink text-2xl font-bold">{t("dashboard.title")}</h1>
        <p className="text-silver mt-1 text-sm">
          {t("dashboard.subtitle", { mode: settings.mode })}
        </p>
      </header>

      <ChatbotTabs active="/admin/chatbot" />

      {/* Status first: the question somebody opening this page is asking. */}
      <div
        className={`mb-8 border-l-2 p-4 ${
          settings.enabled
            ? "border-line-strong border-l-emerald-500 bg-graphite/60"
            : "border-line-strong border-l-amber-500 bg-graphite/60"
        }`}
      >
        <p className="text-ink text-sm">
          {settings.enabled ? t("dashboard.statusOn") : t("dashboard.statusOff")} —{" "}
          {settings.enabled
            ? t("dashboard.statusOnText")
            : t("dashboard.statusOffText")}
        </p>
        <Link
          href="/admin/settings/chatbot"
          className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap mt-3 inline-flex h-8 items-center border px-3 text-[10px] transition-colors"
        >
          {settings.enabled ? t("dashboard.changeSettings") : t("dashboard.enable")}
        </Link>
      </div>

      <div className="border-line bg-line grid gap-px border sm:grid-cols-2 lg:grid-cols-4">
        <Tile label={t("dashboard.tiles.today")} value={String(stats.today)} />
        <Tile
          label={t("dashboard.tiles.activeNow")}
          value={String(stats.activeNow)}
          hint={t("dashboard.tiles.activeHint")}
        />
        <Tile label={t("dashboard.tiles.month")} value={String(stats.month)} />
        <Tile
          label={t("dashboard.tiles.leadsNew")}
          value={String(stats.leadsNew)}
          tone={stats.leadsNew > 0 ? "warn" : undefined}
          hint={t("dashboard.tiles.leadsTotal", { count: stats.leadsTotal })}
        />
        <Tile
          label={t("dashboard.tiles.toBooking")}
          value={String(stats.wentToBooking)}
          hint={t("dashboard.tiles.toBookingHint")}
        />
        <Tile
          label={t("dashboard.tiles.fromChat")}
          value={String(stats.reservationsFromChat)}
          tone={stats.reservationsFromChat > 0 ? "good" : undefined}
          hint={t("dashboard.tiles.fromChatHint")}
        />
        <Tile
          label={t("dashboard.tiles.conversion")}
          value={
            stats.conversionPct == null
              ? "—"
              : `${Math.round(stats.conversionPct)}%`
          }
          hint={t("dashboard.tiles.conversionHint")}
        />
        <Tile
          label={t("dashboard.tiles.unanswered")}
          value={String(stats.unansweredOpen)}
          tone={stats.unansweredOpen > 0 ? "warn" : undefined}
        />
      </div>

      <section className="mt-12">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="label text-ink text-xs">{t("dashboard.recentLeads")}</h2>
          <Link
            href="/admin/chatbot/leady"
            className="text-ink-faint hover:text-ink tap text-xs"
          >
            {t("common.viewAll")}
          </Link>
        </div>
        {leads.length === 0 ? (
          <p className="border-line text-silver border px-5 py-6 text-center text-sm">
            {t("dashboard.noLeads")}
          </p>
        ) : (
          <div className="border-line border">
            {leads.map((l) => (
              <div
                key={l.id}
                className="border-line/60 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b px-4 py-3 last:border-0"
              >
                <span className="text-ink-faint w-32 shrink-0 text-xs">
                  {formatDateTimePl(l.createdAt)}
                </span>
                <span className="text-ink text-sm">{l.name ?? "—"}</span>
                <span className="text-silver text-xs">
                  {l.phone ?? l.email ?? "—"}
                </span>
                {l.carBrand && (
                  <span className="text-ink-faint text-xs">
                    {l.carBrand} {l.carModel}
                  </span>
                )}
                <span className="border-line text-ink-faint ml-auto border px-2 text-[10px]">
                  {t.has(`leadStatus.${l.status}`) ? t(`leadStatus.${l.status}`) : l.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-12">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="label text-ink text-xs">
            {t("dashboard.unansweredTop")}
          </h2>
          <Link
            href="/admin/chatbot/pytania"
            className="text-ink-faint hover:text-ink tap text-xs"
          >
            {t("common.viewAll")}
          </Link>
        </div>
        {unanswered.length === 0 ? (
          <p className="border-line text-silver border px-5 py-6 text-center text-sm">
            {t("common.allAnswered")}
          </p>
        ) : (
          <div className="border-line border">
            {unanswered.map((u) => (
              <div
                key={u.id}
                className="border-line/60 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b px-4 py-3 last:border-0"
              >
                <span className="text-ink flex-1 text-sm">{u.question}</span>
                <span className="text-ink-faint text-xs">{u.category}</span>
                <span className="text-silver text-xs tabular-nums">
                  ×{u.times}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
