import { setRequestLocale, getTranslations } from "next-intl/server";
import { guardPage } from "@/lib/auth/guard";
import { Link } from "@/i18n/navigation";
import { getHealthChecks, getAccountSummary } from "@/lib/admin/health";
import { getChatbotStatus } from "@/lib/admin/chat-status";
import { pick } from "@/lib/i18n-pick";
import { getSetting } from "@/lib/admin/settings";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.settings.hub" });
  return { title: t("metaTitle") };
}

/**
 * The settings hub.
 *
 * One 563-line form used to hold everything; it is now a set of pages, and this
 * is the map. Each card carries a live status line rather than a description
 * alone — the point of a hub is to answer "is anything here wrong?" without
 * opening six pages.
 */
type Card = {
  href:
    | "/admin/settings/konto"
    | "/admin/settings/strona"
    | "/admin/settings/chatbot"
    | "/admin/settings/bezpieczenstwo"
    | "/admin/settings/legal"
    | "/admin/settings/google"
    | "/admin/users"
    | "/admin/audit";
  title: string;
  description: string;
  status?: string;
  tone?: "good" | "warn" | "bad";
};

export default async function SettingsHubPage({
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
  await guardPage("ustawienia.zmien");

  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Admin.settings.hub");

  const [checks, accounts, chatbot, google, social, company] =
    await Promise.all([
      getHealthChecks(),
      getAccountSummary(),
      getChatbotStatus(),
      getSetting("google"),
      getSetting("social"),
      getSetting("company"),
    ]);

  const bad = checks.filter((c) => c.state === "fail").length;
  const attention = checks.filter(
    (c) => c.state === "warn" || c.state === "stale",
  ).length;
  const unknown = checks.filter((c) => c.state === "unknown").length;

  const securityStatus =
    bad > 0
      ? {
          status: t("cards.security.bad", { count: bad }),
          tone: "bad" as const,
        }
      : attention > 0
        ? {
            status: t("cards.security.attention", { count: attention }),
            tone: "warn" as const,
          }
        : unknown > 0
          ? {
              status: t("cards.security.unknown", { count: unknown }),
              tone: "warn" as const,
            }
          : { status: t("cards.security.good"), tone: "good" as const };

  /*
    GOOGLE — status liczony z DANYCH, nigdy z samego faktu, że moduł
    istnieje.

    Zamówienie mówi wprost: żadnego zielonego „Aktywny" ani „Połączono",
    dopóki nie da się tego potwierdzić. Potwierdzić da się dokładnie tyle, ile
    widać w ustawieniach — czy pola są wypełnione i czy przełącznik ma czym
    zadziałać. Czy wizytówka w Google naprawdę istnieje i czy jest zweryfikowana,
    wiedziałoby dopiero odpytanie Google, a to jest płatne API i nowy koszt.
    Dlatego status mówi o TYM, co wiemy, i milczy o tym, czego nie wiemy.
  */
  const hasGeo = google.lat !== null && google.lng !== null;
  /*
    Współrzędne CELOWO nie liczą się do „czy właściciel to skonfigurował".

    Domyślna wartość klucza `google` niesie parę współrzędnych z repozytorium —
    te same, które od miesięcy są w danych strukturalnych. Gdyby liczyły się
    jako konfiguracja, świeży system meldowałby „dane wpisane" komuś, kto nie
    wpisał ani jednego znaku. Konfiguracją jest to, co da się wziąć wyłącznie
    z wizytówki Google: cztery pola niżej.
  */
  const googleFields = [
    social.googleBusiness,
    google.reviewUrl,
    company.mapsUrl,
    google.placeId,
  ];
  // Przełącznik włączony, ale bez danych — na stronie nic z niego nie wyjdzie.
  /*
    Pasek opinii wymaga wizytówki, a nie oceny: bez ani jednej opinii i tak ma
    co pokazać — odnośnik do listy opinii. Dlatego liczy się tu obecność
    Place ID lub linku wizytówki, a nie to, czy wpisano gwiazdki.
  */
  const hasProfileSource =
    google.placeId.trim() !== "" || social.googleBusiness.trim() !== "";
  const jalowe = [
    google.showMap && !hasGeo,
    google.showReviewButton && google.reviewUrl.trim() === "",
    google.showGoogleButton && social.googleBusiness.trim() === "",
    google.showReviewBar && !hasProfileSource,
  ].filter(Boolean).length;
  const widoczne = [
    google.showMap && hasGeo,
    google.showReviewButton && google.reviewUrl.trim() !== "",
    google.showGoogleButton && social.googleBusiness.trim() !== "",
    google.showReviewBar && hasProfileSource,
  ].filter(Boolean).length;

  const nicNieWpisano = googleFields.every((v) => v.trim() === "");

  const googleStatus: Pick<Card, "status" | "tone"> =
    nicNieWpisano && jalowe === 0 && widoczne === 0
      ? // Neutralnie, bez tonu — to nie usterka, tylko etap. Wizytówki jeszcze nie ma.
        { status: t("cards.google.waiting") }
      : jalowe > 0
        ? {
            status:
              jalowe === 1
                ? t("cards.google.oneSwitchEmpty")
                : t("cards.google.switchesEmpty", { count: jalowe }),
            tone: "warn",
          }
        : widoczne > 0
          ? {
              status: t("cards.google.ofFour", { count: widoczne }),
              tone: "good",
            }
          : { status: t("cards.google.dataNoShow") };

  const cards: Card[] = [
    {
      href: "/admin/settings/konto",
      title: t("cards.account.title"),
      description: t("cards.account.description"),
    },
    {
      href: "/admin/users",
      title: t("cards.admins.title"),
      description: t("cards.admins.description"),
      status:
        accounts.total === 1
          ? t("cards.admins.single")
          : t("cards.admins.multi", {
              total: accounts.total,
              active: accounts.active,
            }),
      tone: accounts.total === 1 ? "warn" : undefined,
    },
    {
      href: "/admin/settings/strona",
      title: t("cards.public.title"),
      description: t("cards.public.description"),
    },
    {
      href: "/admin/settings/chatbot",
      title: t("cards.chatbot.title"),
      description: t("cards.chatbot.description"),
      // Read from the running system, never written by hand. The sentence that
      // used to sit here said the bot was "jeszcze nie zbudowany" for weeks
      // after it started answering customers on the public site.
      status: `${chatbot.dot} ${pick(chatbot.label, locale)}`,
      tone:
        chatbot.state === "active"
          ? ("good" as const)
          : chatbot.state === "unavailable"
            ? ("bad" as const)
            : undefined,
    },
    {
      href: "/admin/settings/bezpieczenstwo",
      title: t("cards.security.title"),
      description: t("cards.security.description"),
      ...securityStatus,
    },
    {
      href: "/admin/settings/legal",
      title: t("cards.legal.title"),
      description: t("cards.legal.description"),
    },
    {
      href: "/admin/audit",
      title: t("cards.audit.title"),
      description: t("cards.audit.description"),
    },
    /*
      Ostatni kafel — prawy dolny róg siatki. Siatka ma dwie kolumny
      (`sm:grid-cols-2`), więc ósma pozycja domyka czwarty wiersz obok
      „Historii zmian" i pod „Dokumentami prawnymi". Do tego momentu było tam
      puste pole tła.
    */
    {
      href: "/admin/settings/google",
      title: t("cards.google.title"),
      description: t("cards.google.description"),
      ...googleStatus,
    },
  ];

  const toneClass = (tone?: Card["tone"]) =>
    tone === "bad"
      ? "text-red"
      : tone === "warn"
        ? "text-amber-500"
        : tone === "good"
          ? "text-emerald-400"
          : "text-silver";

  return (
    <div className="max-w-4xl">
      <header className="mb-8">
        <h1 className="font-heading text-ink text-2xl font-bold">
          {t("title")}
        </h1>
        <p className="text-silver mt-1 text-sm">{t("subtitle")}</p>
      </header>

      <div className="border-line bg-line grid gap-px border sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="bg-void hover:bg-ink/5 group flex flex-col p-6 transition-colors"
          >
            <span className="text-ink group-hover:text-ink text-sm font-semibold">
              {c.title}
            </span>
            <span className="text-ink-faint mt-2 flex-1 text-xs">
              {c.description}
            </span>
            {c.status && (
              <span className={`mt-3 text-xs ${toneClass(c.tone)}`}>
                {c.status}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* Named rather than hidden. Somebody who read a plan and comes looking
          for "Powiadomienia" should find out here that it does not exist yet,
          instead of concluding they clicked the wrong thing. */}
      <section className="border-line mt-12 border-t pt-8">
        <h2 className="label text-ink text-xs">{t("planned.heading")}</h2>
        <ul className="text-ink-faint mt-4 grid gap-2 text-xs sm:grid-cols-2">
          <li>
            {t.rich("planned.roles", {
              strong: (chunks) => (
                <strong className="text-silver font-normal">{chunks}</strong>
              ),
            })}
          </li>
          <li>
            {t.rich("planned.twofa", {
              strong: (chunks) => (
                <strong className="text-silver font-normal">{chunks}</strong>
              ),
            })}
          </li>
          <li>
            {t.rich("planned.notifications", {
              strong: (chunks) => (
                <strong className="text-silver font-normal">{chunks}</strong>
              ),
            })}
          </li>
          <li>
            {t.rich("planned.thresholds", {
              strong: (chunks) => (
                <strong className="text-silver font-normal">{chunks}</strong>
              ),
            })}
          </li>
          <li>
            {t.rich("planned.integrations", {
              strong: (chunks) => (
                <strong className="text-silver font-normal">{chunks}</strong>
              ),
            })}
          </li>
          <li>
            {t.rich("planned.invoices", {
              strong: (chunks) => (
                <strong className="text-silver font-normal">{chunks}</strong>
              ),
            })}
          </li>
        </ul>
      </section>
    </div>
  );
}
