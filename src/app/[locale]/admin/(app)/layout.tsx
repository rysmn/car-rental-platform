import Image from "next/image";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { signOut } from "@/lib/auth/config";
import { currentAdmin } from "@/lib/auth/guard";
import { can, type Permission } from "@/lib/auth/permissions";
import {
  Gauge,
  CalendarCheck,
  Users,
  CarFront,
  ChartNoAxesCombined,
  Wallet,
  MessageCircleMore,
  Tag,
  Settings,
  UserCog,
  FileClock,
  ScrollText,
  FileText,
  TriangleAlert,
  Mail,
  HandCoins,
  ShieldAlert,
} from "lucide-react";
import { MobileNav } from "@/components/admin/MobileNav";
import { AdminNavLinks } from "@/components/admin/AdminNavLinks";
import { CriticalLock } from "@/components/admin/CriticalLock";
import { oknoDoKiedy, OKNO_MS } from "@/lib/auth/critical";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { getAttentionItems } from "@/lib/admin/dashboard";
import { countDemandingAlerts } from "@/lib/alerts/repo";
import { countPendingReservations, countUnread } from "@/lib/inbox/repo";

/**
 * One size and one weight for every pictogram in the sidebar.
 *
 * 18px at stroke 1.5 is the same hairline the panel already draws its rules
 * and its burger menu with, so the icons read as part of the furniture rather
 * than as decoration dropped on top of it.
 *
 * Kolor NIE jest już dziedziczony z odnośnika: każda sekcja ma własny, podany
 * w `NAV` i wstrzykiwany jako `--nav`. Rozróżnienie kolorem jest szybsze niż
 * czytanie etykiety, a panel jest używany codziennie przez te same osoby, więc
 * to one najwięcej na tym zyskują. Tekst zostaje jasnoszary — kolor niesie
 * piktogram, nie napis, żeby menu nie zamieniło się w tęczę.
 *
 * `aria-hidden` because every one of them sits beside its own name. An icon
 * that repeats the label out loud makes the menu twice as long to listen to
 * and no clearer.
 */
const ICON = { size: 18, strokeWidth: 1.5, "aria-hidden": true } as const;

/**
 * Kolor sekcji Alertów z palety właściciela — trzymany osobno, bo używają go
 * dwa miejsca (kafel w pasku bocznym i ikona w górnej belce na telefonie),
 * a rozjechanie się ich dwóch byłoby widoczne od razu.
 */
const ALERT_COLOR = "#FFD84D";

/**
 * Kolor Skrzynki. Celowo INNY niż kolor Alertów: dwie odznaki obok siebie,
 * obie z liczbą, muszą różnić się czymś więcej niż piktogramem — inaczej
 * operator odruchowo czyta obie jako „coś się zepsuło".
 */
const INBOX_COLOR = "#4DA3FF";

/**
 * Kolor Rezerwacji — trzeci i ostatni, bo trzy są trzy różne rzeczy:
 *
 *   REZERWACJE — klient ZAMÓWIŁ auto i czeka na potwierdzenie.
 *   SKRZYNKA   — klient PYTA i czeka na odpowiedź człowieka.
 *   ALERTY     — coś jest zepsute.
 *
 * Zamówienie nie jest pytaniem, a żadne z nich nie jest awarią. Do etapu 44D
 * nowa rezerwacja nie miała własnej liczby w panelu: ginęła wśród terminów
 * przeglądów i ubezpieczeń na liście „do zrobienia", czyli wśród rzeczy,
 * które mogą poczekać do jutra — a ta jedna nie może.
 *
 * Ta sama wartość co pozycja „Rezerwacje" w `NAV` niżej: odznaka i wpis w menu
 * prowadzą w to samo miejsce, więc różny kolor sugerowałby dwie różne sekcje.
 */
const RESERVATION_COLOR = "#2EC4B6";

const NAV = [
  {
    href: "/admin",
    label: "Pulpit",
    icon: <Gauge {...ICON} />,
    color: "#4DA3FF",
  },
  {
    href: "/admin/reservations",
    perm: "rezerwacje.podglad" as Permission,
    label: "Rezerwacje",
    icon: <CalendarCheck {...ICON} />,
    color: "#2EC4B6",
  },
  {
    href: "/admin/customers",
    perm: "klienci.podglad" as Permission,
    label: "Klienci",
    icon: <Users {...ICON} />,
    color: "#6CC2FF",
  },
  {
    href: "/admin/fleet",
    perm: "flota.podglad" as Permission,
    label: "Flota",
    icon: <CarFront {...ICON} />,
    color: "#60A5FA",
  },
  /**
   * Zaraz za Flotą, bo szkoda jest stanem AUTA, zanim stanie się papierem
   * u ubezpieczyciela. Operator, który patrzy na flotę, ma mieć szkody na
   * wyciągnięcie ręki, a nie w sekcji finansowej.
   */
  {
    href: "/admin/szkody",
    perm: "wydania.prowadz" as Permission,
    label: "Szkody",
    icon: <ShieldAlert {...ICON} />,
    color: "#F87171",
  },
  {
    href: "/admin/analytics",
    perm: "analityka.podglad" as Permission,
    label: "Analityka",
    icon: <ChartNoAxesCombined {...ICON} />,
    color: "#4ADE80",
  },
  // Analityka answers "which car earns"; Finanse answers "what was left".
  // Adjacent on purpose — they are two halves of the same question.
  {
    href: "/admin/finanse",
    perm: "finanse.podglad" as Permission,
    label: "Finanse",
    icon: <Wallet {...ICON} />,
    color: "#34D399",
  },
  /**
   * Zaraz za Finansami, bo to jest ich przeciwieństwo: Finanse mówią, co firma
   * zarobiła, a Kaucje — ile cudzych pieniędzy trzyma i ma oddać. Sąsiadują,
   * żeby nikt nie pomylił jednego z drugim.
   */
  {
    href: "/admin/kaucje",
    perm: "kaucje.prowadz" as Permission,
    label: "Kaucje",
    icon: <HandCoins {...ICON} />,
    color: "#F472B6",
  },
  {
    href: "/admin/chatbot",
    perm: "czat.podglad" as Permission,
    label: "Chatbot",
    icon: <MessageCircleMore {...ICON} />,
    color: "#C084FC",
  },
  {
    href: "/admin/pricing",
    perm: "ceny.zmien" as Permission,
    label: "Cennik",
    icon: <Tag {...ICON} />,
    color: "#FBBF24",
  },
  /**
   * Between the price list and the settings on purpose: this is business
   * policy, so it belongs beside what the company charges rather than beside
   * SSH keys and backups.
   */
  {
    href: "/admin/zasady",
    perm: "zasady.zmien" as Permission,
    label: "Zasady wynajmu",
    icon: <ScrollText {...ICON} />,
    color: "#B388FF",
  },
  /*
    Umowy i dokumenty — tuż za „Zasadami wynajmu" i przed Ustawieniami.

    Sąsiedztwo jest celowe: zasady mówią, na czym firma wynajmuje, a to są
    pliki, w których jest to napisane i które klient podpisuje. Trzymanie ich
    obok kluczy SSH i kopii zapasowych zrobiłoby z umowy najmu sprawę
    informatyczną, którą nie jest.
  */
  {
    href: "/admin/dokumenty",
    perm: "dokumenty.podglad" as Permission,
    label: "Umowy i dokumenty",
    icon: <FileText {...ICON} />,
    color: "#4DD0E1",
  },
  {
    href: "/admin/settings",
    perm: "ustawienia.zmien" as Permission,
    label: "Ustawienia",
    icon: <Settings {...ICON} />,
    color: "#94A3B8",
  },
  {
    href: "/admin/users",
    perm: "konta.zarzadzaj" as Permission,
    label: "Użytkownicy",
    icon: <UserCog {...ICON} />,
    color: "#2DD4BF",
  },
  {
    href: "/admin/audit",
    perm: "audyt.podglad" as Permission,
    label: "Dziennik zdarzeń",
    icon: <FileClock {...ICON} />,
    color: "#FB923C",
  },
] as const;

// The admin panel must never appear in search results. robots.txt asks
// crawlers not to fetch it; this tag covers anything that fetches it anyway.
export const metadata = {
  robots: { index: false, follow: false, nocache: true },
};

async function doSignOut() {
  "use server";
  await signOut({ redirectTo: "/admin/login" });
}

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Authoritative access check (defense in depth with the middleware guard).
  // `currentAdmin` re-reads the account, so deleting or deactivating someone
  // takes effect on their very next request rather than when their JWT expires.
  const admin = await currentAdmin();

  if (!admin) redirect("/admin/login");

  /*
    OBOWIĄZKOWE 2FA — rozdział 13.6 punkt 1, w wersji, która nie zamyka
    właściciela przed panelem.

    Zamówienie mówi „obowiązkowe" i to jest obowiązkowe: konto bez drugiego
    składnika nie wchodzi do żadnej sekcji panelu. Ale NIE odrzucamy takiego
    konta przy logowaniu, tylko prowadzimy je na ekran włączenia — bo różnica
    między tymi dwiema decyzjami to różnica między „musisz to teraz ustawić"
    a „nie masz jak wejść i nie masz jak tego naprawić".

    Ekran włączenia stoi POZA tym layoutem (`/admin/2fa`, obok logowania)
    i to jest cała sztuczka: gdyby był w środku, przekierowanie wpadłoby
    w pętlę samo na siebie, a rozpoznawanie „czy to już ta strona" wymagałoby
    nagłówka ze ścieżką, którego Next nie podaje.

    Droga awaryjna, gdy telefon i kartka z kodami przepadną razem:
    `scripts/wylacz-2fa.ts` z konsoli serwera.
  */
  if (!admin.twoFactor) redirect("/admin/2fa");

  /*
    Menu widoczne dla TEJ roli — rozdział 13.6 punkt 5.

    To jest uprzejmość, nie zabezpieczenie: ukrycie odnośnika nie broni przed
    wpisaniem adresu z ręki. Prawdziwa kontrola stoi w każdej akcji panelu
    (`requirePermission`) i w każdej trasie API. Menu pełne pozycji, które
    kończą się komunikatem „brak uprawnień", byłoby jednak dla pracownika
    codziennym zaproszeniem do klikania w ścianę.
  */
  const nav = NAV.filter(
    (item) => !("perm" in item) || can(admin.role, item.perm),
  );

  // Counted here rather than per page so the badge is the same number
  // wherever the operator happens to be standing.
  //
  // Two counts, because the badge answers two questions at once. `attention` is
  // the operational to-do list; `breakage` is how many CRITICAL or ERROR system
  // alerts are still open. A broken booking form is not "one more thing to do
  // this week" — it wins the badge outright, in red, whatever else is pending.
  const [attention, breakage, unread, pendingReservations] = await Promise.all([
    getAttentionItems(),
    countDemandingAlerts(),
    /*
     * TRZECI licznik, świadomie osobny od dwóch powyżej.
     *
     * Zapytanie klienta nie jest awarią systemu ani pozycją na liście zadań
     * operacyjnych. Wrzucone do któregokolwiek z tamtych liczników znika:
     * przy awarii — bo awaria wygrywa odznakę, a przy zadaniach — bo tam
     * mieszkają terminy przeglądów i ubezpieczeń, których jest zawsze kilka.
     * Klient czekający na odpowiedź ma własną liczbę i własne miejsce.
     */
    countUnread(),
    /*
     * CZWARTY licznik i ostatni. „Nowe rezerwacje" nie mieściły się w żadnym
     * z trzech: nie są awarią, nie są zapytaniem, a na liście `attention`
     * stały obok terminów przeglądów, czyli rzeczy, które mogą poczekać.
     * Zamówienie czekające na potwierdzenie nie może.
     */
    countPendingReservations(),
  ]);
  const urgent = attention.filter((a) => a.urgent).length;

  const themeToggle = (
    <ThemeToggle
      labels={{ light: "Włącz tryb jasny", dark: "Włącz tryb ciemny" }}
    />
  );

  return (
    // No `data-theme` here any more: the panel inherits whatever the visitor
    // chose on <html>, same as the public site. It used to be pinned dark,
    // which is unreadable on a phone in direct sun — and a phone in a car park
    // is where this panel actually gets used.
    <div className="bg-void text-ink flex min-h-screen">
      <aside className="border-line hidden w-60 shrink-0 flex-col border-r md:flex print:hidden">
        <div className="border-line border-b p-6">
          {/* One lockup per theme — CSS shows the right one, the same trick
              the public hero uses for its photography. */}
          <Image
            src="/brand/aa-logo-dark.png"
            alt="A&A Corporation"
            width={200}
            height={110}
            className="hero-photo--dark h-8 w-auto"
          />
          <Image
            src="/brand/aa-logo-mono-black.png"
            alt="A&A Corporation"
            width={200}
            height={110}
            className="hero-photo--light h-8 w-auto"
          />
          {/* The theme sits beside the panel's own name, top left, because
              that is where somebody looks when the screen is unreadable —
              not at the bottom of a sidebar they have to scroll. */}
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="label-tight text-ink-faint text-[10px]">
              Panel administracyjny
            </p>
            {themeToggle}
          </div>

          {/*
            SKRZYNKA NAD ALERTAMI i to nie jest kwestia kolejności alfabetycznej.
            Alert mówi „coś jest zepsute", skrzynka — „ktoś czeka na odpowiedź".
            Do etapu 44D panel miał licznik tylko dla tego pierwszego, więc
            jedyne miejsce z odznaką mówiło o rzeczach, a nie o ludziach.
          */}
          {/* TRZY ODZNAKI, TRZY RÓŻNE PYTANIA, w kolejności od najbardziej
              zobowiązującej: ktoś zamówił auto → ktoś czeka na odpowiedź →
              coś jest zepsute. Jedna wspólna liczba nie odpowiadałaby na
              żadne z nich. */}
          <Link
            href="/admin/reservations"
            className="border-line-strong hover:border-ink hover:bg-ink/5 tap-block mt-4 flex items-center justify-between gap-2 border px-3 py-2 transition-colors"
          >
            <span className="label-tight text-ink flex items-center gap-2 text-[10px]">
              <CalendarCheck
                size={16}
                strokeWidth={1.5}
                aria-hidden
                style={{ color: RESERVATION_COLOR }}
                className="admin-nav-icon shrink-0"
              />{" "}
              Rezerwacje
            </span>
            <span
              className={`label-tight rounded-pill px-2 py-0.5 text-[10px] ${
                pendingReservations > 0
                  ? "bg-red text-white"
                  : "border-line text-ink-faint border"
              }`}
            >
              {pendingReservations}
            </span>
          </Link>

          <Link
            href="/admin/inbox"
            className="border-line-strong hover:border-ink hover:bg-ink/5 tap-block mt-2 flex items-center justify-between gap-2 border px-3 py-2 transition-colors"
          >
            <span className="label-tight text-ink flex items-center gap-2 text-[10px]">
              <Mail
                size={16}
                strokeWidth={1.5}
                aria-hidden
                style={{ color: INBOX_COLOR }}
                className="admin-nav-icon shrink-0"
              />{" "}
              Skrzynka
            </span>
            <span
              className={`label-tight rounded-pill px-2 py-0.5 text-[10px] ${
                unread > 0
                  ? "bg-red text-white"
                  : "border-line text-ink-faint border"
              }`}
            >
              {unread}
            </span>
          </Link>

          <Link
            href="/admin/alerty"
            className="border-line-strong hover:border-ink hover:bg-ink/5 tap-block mt-2 flex items-center justify-between gap-2 border px-3 py-2 transition-colors"
          >
            {/* Piktogram zamiast emoji: emoji ma kolor narzucony przez system
                operacyjny i na każdym z nich wygląda inaczej, a ten jeden ma
                mieć kolor z palety — #FFD84D, ten sam co sekcja Alertów. */}
            <span className="label-tight text-ink flex items-center gap-2 text-[10px]">
              <TriangleAlert
                size={16}
                strokeWidth={1.5}
                aria-hidden
                style={{ color: ALERT_COLOR }}
                className="admin-nav-icon shrink-0"
              />{" "}
              Alerty
            </span>
            <span
              className={`label-tight rounded-pill px-2 py-0.5 text-[10px] ${
                breakage > 0 || urgent > 0
                  ? "bg-red text-white"
                  : "border-line text-ink-faint border"
              }`}
            >
              {/* Breakage first and on its own: "3 awarie" and "3 rzeczy do
                  zrobienia" must never be added into one number, or an outage
                  disappears into a fortnight of paperwork. */}
              {breakage > 0 ? `${breakage} ⚠` : attention.length}
            </span>
          </Link>
        </div>
        <nav className="flex-1 p-4">
          <AdminNavLinks nav={nav} />
        </nav>
        <div className="border-line border-t p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="label-tight text-ink-faint text-[10px]">
              Wygląd
            </span>
            <ThemeToggle
              labels={{ light: "Włącz tryb jasny", dark: "Włącz tryb ciemny" }}
            />
          </div>
          <p className="text-ink truncate text-xs">{admin.name}</p>
          <p className="text-ink-faint truncate text-[10px]">{admin.email}</p>
          {/* Kłódka operacji krytycznych — jedno okno na całe konto, patrz
              `lib/auth/critical.ts`. Stoi pod nazwą konta, bo dotyczy KONTA,
              a nie sekcji, w której akurat stoi obsługa. */}
          <CriticalLock
            otwarteDo={oknoDoKiedy(admin.id)}
            okresMs={OKNO_MS}
            ma2FA={admin.twoFactor}
          />
          <form action={doSignOut}>
            <button className="label-tight text-red hover:text-ink tap mt-3 text-[10px] transition-colors">
              Wyloguj
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="print:hidden">
          <MobileNav
            nav={nav}
            admin={admin}
            onSignOut={doSignOut}
            alerts={breakage > 0 ? breakage : attention.length}
            alertColor={ALERT_COLOR}
            inbox={unread}
            inboxColor={INBOX_COLOR}
            reservations={pendingReservations}
            reservationColor={RESERVATION_COLOR}
            themeToggle={themeToggle}
          />
        </div>
        <div className="p-4 text-[15px] md:p-10 md:text-base print:p-0">
          {children}
        </div>
      </main>
    </div>
  );
}
