import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { LocaleSuggestion } from "@/components/layout/LocaleSuggestion";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { CookieConsent } from "@/components/consent/CookieConsent";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { getPublicSettings, getSetting } from "@/lib/admin/settings";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { SavedToast } from "@/components/fleet/SavedToast";
import { CurrencyProvider } from "@/components/currency/CurrencyProvider";
import { getEurRate } from "@/lib/currency/rate";
import { visibleNav } from "@/lib/config/site";
import { googleView } from "@/lib/company/google";

// Public site chrome (header + footer). The admin lives outside this group and
// renders its own shell.

/**
 * Every public page renders at request time, deliberately.
 *
 * These pages are only *shaped* by translations; their content comes from the
 * database — the fleet, the price table, the hero copy, the company details in
 * the footer, and which pages appear in the nav at all. The production image is
 * built by Docker with no database reachable, so prerendering them baked in the
 * fallbacks instead: the home page shipped the four fixture cars from
 * `lib/fleet/data` and their placeholder prices, while seven real models with
 * real prices sat in the database. Nothing looked broken, which is why it
 * survived so long.
 *
 * `force-dynamic` here covers the whole public group, so a page added later
 * cannot reintroduce the bug by forgetting its own directive. The admin panel
 * and the car pages were already dynamic for the same underlying reason.
 */
export const dynamic = "force-dynamic";

export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tc = await getTranslations("Cookies");
  const tn = await getTranslations("Nav");
  // Napisy potwierdzenia dla ulubionych — ten sam słownik, co lista `/saved`.
  const tsaved = await getTranslations("Saved");

  // Settings drive both the navigation (pages an admin has disabled disappear)
  // and the social icons, so they are fetched once here for the whole shell.
  const { social, pages, company } = await getPublicSettings();
  const chatbot = await getSetting("chatbot");
  /*
    Opinie Google dla belki. Pytanie „czy wolno pokazać ten odnośnik"
    rozstrzyga `googleView` — to samo jedno miejsce, z którego korzystają
    strona główna i kontakt — więc powłoka nie ogląda tu żadnego adresu
    ani identyfikatora. `null` znaczy: w belce nie ma gwiazdki.
  */
  const google = await getSetting("google");
  // Read once for the whole shell, like the settings above. Cached in
  // `site_settings` and refreshed at most once a day BEHIND the response, so
  // this is a row read and never a call to a central bank — see
  // `lib/currency/rate`. `null` means złoty everywhere and no switch.
  const eurRate = await getEurRate();
  // `auto` follows the page; an explicit choice overrides it, which is what an
  // operator serving one market expects the setting to do.
  const chatLocale: "pl" | "en" =
    chatbot.language === "auto"
      ? locale === "en"
        ? "en"
        : "pl"
      : chatbot.language;
  const nav = visibleNav(pages);
  const reviewsHref =
    googleView({ google, profileUrl: social.googleBusiness, locale }).reviews
      ?.allHref ?? null;
  const socialItems = [
    { key: "instagram" as const, label: "Instagram", href: social.instagram },
    { key: "facebook" as const, label: "Facebook", href: social.facebook },
    { key: "tiktok" as const, label: "TikTok", href: social.tiktok },
  ];

  return (
    // Wokół CAŁEJ powłoki, nie wokół `main`: cenę pokazuje też nagłówek
    // (przełącznik), czat i stopka porównania, a kurs ma być jeden na stronę.
    <CurrencyProvider rate={eurRate}>
      <div className="flex min-h-screen flex-col">
        {/*
        Bez JavaScriptu nic nie może zostać zwinięte na zawsze.

        `MobileFold` przycina sekcję w CSS, a rozwija ją przycisk Reacta. Gdy
        skrypt nie wystartuje, przycisk wyrenderuje się z serwera i nie zrobi
        NIC — treść zostałaby przycięta bez sposobu, żeby ją otworzyć.
        Odwrócenie przycięcia stoi więc tutaj, w jednym miejscu na cały serwis,
        zamiast powtarzać się przy każdym zwinięciu.
      */}
        <noscript
          /*
          `dangerouslySetInnerHTML`, a nie `<style>` jako dziecko — i to nie
          jest kwestia gustu.

          React serializuje dzieci `<noscript>` po swojemu, a przeglądarka
          parsuje jego zawartość jako TEKST. Przy hydratacji te dwie wersje
          się nie zgadzają i leci błąd #418: React porzuca serwerowy HTML
          i rysuje stronę od nowa po stronie klienta. Przemiatanie złapało
          to jako `pageerror` plus poziomy scroll +4 px przy 320 px —
          czyli usterkę wyglądu, której prawdziwą przyczyną był błąd
          hydratacji dwa piętra wyżej.
        */
          dangerouslySetInnerHTML={{
            __html:
              "<style>.fold-body{max-height:none!important;-webkit-mask-image:none!important;mask-image:none!important}.fold-toggle{display:none!important}</style>",
          }}
        />
        {/* Nad nagłówkiem, bo to zdanie o CAŁEJ stronie, a nie o jej treści —
          i dlatego, że pasek doklejony pod nagłówkiem przykrywałby menu przy
          otwartym hamburgerze. Renderuje się dopiero po hydracji i tylko
          komuś, komu się należy, więc dla większości odwiedzających nie
          istnieje. */}
        {/*
        „Przejdź do treści" — WCAG 2.4.1, poziom A.

        Nagłówek stawia przed treścią kilkanaście elementów, przez które
        klawiatura i czytnik ekranu przechodzą NA KAŻDEJ podstronie: logo,
        osiem pozycji menu, przełącznik języka, motyw, waluta, telefon,
        hamburger. Bez tego odnośnika przeczytanie drugiego artykułu z rzędu
        zaczyna się od powtórzenia całej nawigacji.

        Widoczny dopiero po sfokusowaniu (`sr-only` + `focus:not-sr-only`) —
        to jedyny element, którego wygląd zmienia to zlecenie, i tylko dla
        kogoś, kto właśnie go szuka. Dla myszy strona wygląda identycznie.
        Stoi PRZED nagłówkiem, bo musi być pierwszym celem klawisza Tab;
        odnośnik za nagłówkiem pomijałby nawigację dopiero po jej przejściu.
      */}
        <a
          href="#tresc"
          className="bg-void text-ink border-line focus-visible:ring-red sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:border focus:px-4 focus:py-3 focus:text-sm focus-visible:ring-2"
        >
          {tn("skipToContent")}
        </a>
        <LocaleSuggestion />
        <SiteHeader nav={nav} social={socialItems} reviewsHref={reviewsHref} />
        {/*
        `tabIndex={-1}`: bez tego skok na `#tresc` przewija stronę, ale fokus
        zostaje na odnośniku w nagłówku — czytnik ekranu czyta dalej menu,
        czyli dokładnie to, co odnośnik miał pominąć. `<main>` nie jest
        elementem sterującym, więc ujemny indeks czyni go celem skoku, nie
        przystankiem klawisza Tab.
      */}
        <main id="tresc" tabIndex={-1} className="flex-1">
          {children}
        </main>
        {/*
          Potwierdzenie dla ulubionych — jeden komponent na całą stronę
          publiczną, a nie jeden na kartę auta. Serc na siatce floty jest
          jedenaście i jedenaście własnych komunikatów oznaczałoby jedenaście
          żywych regionów, z których czytnik ekranu ogłaszałby losowy.
          Adres listy przychodzi gotowy stąd, bo to układ zna język.
        */}
        <SavedToast
          added={tsaved("toastAdded")}
          removed={tsaved("toastRemoved")}
          listLabel={tsaved("toastLink")}
          listHref={locale === "en" ? "/en/saved" : "/saved"}
        />
        <SiteFooter nav={nav} company={company} />
        <CookieConsent
          labels={{
            title: tc("title"),
            body: tc("body"),
            acceptAll: tc("acceptAll"),
            essential: tc("essential"),
            privacy: tc("privacy"),
          }}
        />
        {/* Public pages only — the admin panel is not measured, and mounting this
          there would send the operator's own sessions to GA as traffic.
          Renders nothing until NEXT_PUBLIC_GA4_ID is set AND consent is given. */}
        <GoogleAnalytics />

        {/* The assistant. Absent from the DOM entirely when switched off in the
          admin panel — not hidden with CSS, not loaded and idle. Its API route
          checks the same flag, so turning it off closes both halves. */}
        {chatbot.enabled && (
          <ChatWidget
            name={chatbot.name}
            locale={chatLocale}
            position={chatbot.position}
            autoOpenSeconds={chatbot.autoOpenSeconds}
            // The greeting menu offers only what the operator has switched on —
            // a button for a capability that is off would be a dead end.
            can={chatbot.can}
            privacyHref={
              locale === "en"
                ? "/en/polityka-prywatnosci"
                : "/polityka-prywatnosci"
            }
          />
        )}
      </div>
    </CurrencyProvider>
  );
}
