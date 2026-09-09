import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { landingLinks } from "@/lib/marketing/landing";
import { siteConfig, type NavItem } from "@/lib/config/site";
import type { CompanySettings } from "@/lib/admin/settings";
import { CookieSettingsButton } from "@/components/consent/CookieSettingsButton";

/** Footer trust strip, in reading order. Keys live under `Footer` in messages. */
const TRUST = [
  "trustInsured",
  "trustSupport",
  "trustAirport",
  "trustFleet",
  "trustAssistance",
] as const;

export function SiteFooter({
  nav,
  company,
}: {
  nav: NavItem[];
  company: CompanySettings;
}) {
  const t = useTranslations("Nav");
  const tf = useTranslations("Footer");
  const tl = useTranslations("Landing");
  const locale = useLocale();
  const year = 2026; // build-time constant; bump via CI/date lib later

  // The search landing pages. They live in the footer, on every page, because a
  // page reachable only from the sitemap is a page Google finds last and trusts
  // least — and because they are genuinely the fastest route to "I want an SUV
  // in Warsaw" for a visitor who arrived on the home page.
  const landing = landingLinks(locale);

  const phones = company.phones
    .filter((line) => line.number)
    .map((line) => ({
      ...line,
      waHref: line.whatsapp ? `https://wa.me/${line.whatsapp}` : null,
    }));

  return (
    <footer className="border-line bg-void border-t">
      {/* Trust strip — the five things every enquiry asks about, stated once
          above the footer proper. A single hairline-ruled row: it has to read
          as a rule across the page, not as another block of links. */}
      <div className="border-line border-b">
        <ul className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-center gap-x-5 gap-y-2.5 px-6 py-3.5 md:gap-x-8 md:px-10">
          {TRUST.map((key) => (
            <li
              key={key}
              className="label-tight text-silver flex items-center gap-2 text-[10px]"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="text-red shrink-0"
              >
                <path
                  d="M4 12.5l5 5L20 6"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {tf(key)}
            </li>
          ))}
        </ul>
      </div>

      <div className="mx-auto grid max-w-[1440px] gap-10 px-6 py-16 md:grid-cols-2 md:px-10 lg:grid-cols-[1.1fr_0.8fr_1.8fr_1fr]">
        <div>
          <p className="font-heading text-ink text-lg font-bold tracking-tight">
            {siteConfig.name}
          </p>
          <p className="label-tight text-red mt-2 text-xs">
            {siteConfig.tagline}
          </p>
          <p className="text-ink-muted mt-6 max-w-xs text-sm">
            {tf("builtWith")}
          </p>
        </div>

        {/* Padding on the links rather than gap between them: the rhythm is
            the same, but each row is a real target instead of a 16px one.
            `.tap` decides by input device, not by width — a finger gets 44px
            whether it is a phone or an iPad in landscape, a mouse keeps the
            tight rhythm at every size. */}
        <nav className="flex flex-col gap-1.5">
          {nav.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="label-tight text-silver hover:text-ink tap py-2 text-xs transition-colors sm:py-1"
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>

        {/* Two columns from `sm` up: a dozen entries stacked single-file would
            make this column twice the height of every other block. */}
        <nav>
          <p className="label text-red text-[10px]">{tl("footerHeading")}</p>
          <div className="mt-2 grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
            {landing.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="label-tight text-silver hover:text-ink tap w-fit py-2 text-xs transition-colors sm:py-1"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>

        <div className="text-ink-muted flex flex-col gap-3 text-sm">
          {/* Both service lines, each tagged with its language and dialable. The
              bottom bar links the same numbers to WhatsApp; here they call. */}
          {phones.map((line) => (
            <a
              key={line.lang}
              href={`tel:${line.number.replace(/[^\d+]/g, "")}`}
              className="hover:text-ink tap flex w-fit items-center gap-2 py-2.5 sm:py-1"
            >
              <span className="label-tight rounded-pill border-line-strong text-silver border px-2 py-0.5 text-[9px]">
                {line.lang}
              </span>
              {line.number}
            </a>
          ))}
          {company.email && (
            <a
              href={`mailto:${company.email}`}
              className="hover:text-ink tap block py-2.5 sm:py-1"
            >
              {company.email}
            </a>
          )}
          {company.mapsUrl && (
            <a
              href={company.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ink tap w-fit py-2.5 sm:py-1"
            >
              {company.address || company.city}
            </a>
          )}
        </div>
      </div>

      <div className="border-line border-t">
        {/*
          MIEJSCE ZAREZERWOWANE NA PŁYWAJĄCY URUCHAMIACZ ASYSTENTA.

          Ten wiersz niesie regulamin, politykę prywatności i ustawienia
          cookie — trzy odnośniki, których nie wolno uczynić niedosiężnymi.
          Uruchamiacz asystenta jest `fixed` w prawym dolnym rogu i zajmuje
          dolne 82 px ekranu (24 px odstępu + 58 px kapsuły na monitorze).

          Zmierzone 04.09.2026 na `/compare`: przy 1440 px ta strona ma
          dokładnie wysokość okna i NIE DA SIĘ jej przewinąć, a „Polityka
          prywatności" i „Ustawienia cookie" leżały w CAŁOŚCI pod kapsułą.
          Nie „częściowo" i nie „do przewinięcia" — trwale nie do kliknięcia.

          96 px dolnego marginesu odsuwa wiersz o 14 px ponad kapsułę. To jest
          czarna przestrzeń na czarnej stronie, więc kosztuje tyle, co nic,
          a rozwiązuje problem dla KAŻDEJ krótkiej strony naraz — zamiast
          przesuwać uruchamiacz, który na innej trasie i tak wylądowałby na
          czymś innym.
        */}
        <div className="text-ink-faint mx-auto flex max-w-[1440px] flex-col gap-4 px-6 pt-6 pb-24 text-xs md:flex-row md:items-center md:justify-between md:px-10">
          <span>
            © {year} {siteConfig.name}. {tf("rights")}
          </span>

          {/*
            Pick-up point — opens Google Maps with a marker at our coordinates.

            Rendered only when there IS a link. The fallback used to be
            `href="#"`, which produced a bordered, hover-styled button that
            looked exactly like the working one and did nothing when tapped —
            on a phone, where "#" also jumps the page to the top. An element
            that cannot do its job does not belong on the page.
          */}
          {company.mapsUrl && (
            <a
              href={company.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="label-tight border-line-strong hover:border-ink hover:text-ink tap inline-flex w-fit items-center gap-2 border px-3 py-2.5 text-[10px] transition-colors sm:py-1.5"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="text-red shrink-0"
              >
                <path
                  d="M12 22s7-5.6 7-12a7 7 0 1 0-14 0c0 6.4 7 12 7 12Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <circle
                  cx="12"
                  cy="10"
                  r="2.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
              </svg>
              {tf("address")}
            </a>
          )}

          {/* Language-specific service lines — both are WhatsApp, so the glyph
              is stated once for the group rather than repeated on every line,
              and each number opens a chat instead of dialling. */}
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="label-tight text-silver flex items-center gap-1.5 text-[10px]">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
                className="shrink-0"
              >
                <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.48-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47s1.06 2.87 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35ZM12.04 21.5h-.01a9.44 9.44 0 0 1-4.8-1.32l-.35-.2-3.57.93.96-3.47-.23-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.24-9.44 9.45-9.44 2.52 0 4.89.99 6.67 2.77a9.37 9.37 0 0 1 2.77 6.68c0 5.2-4.24 9.45-9.45 9.45ZM20.5 3.49A11.8 11.8 0 0 0 12.04 0C5.5 0 .18 5.32.18 11.86c0 2.09.55 4.13 1.59 5.93L.08 24l6.35-1.66a11.85 11.85 0 0 0 5.66 1.44h.01c6.54 0 11.86-5.32 11.86-11.86 0-3.17-1.23-6.15-3.47-8.39Z" />
              </svg>
              WhatsApp
            </span>
            {company.phones.map((line) => (
              <span key={line.lang} className="flex items-center gap-2">
                <span className="label-tight rounded-pill border-line-strong text-silver border px-2 py-0.5 text-[9px]">
                  {line.lang}
                </span>
                {line.number && line.whatsapp ? (
                  <a
                    href={`https://wa.me/${line.whatsapp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`WhatsApp ${line.lang}: ${line.number}`}
                    className="hover:text-ink tap py-2.5 whitespace-nowrap transition-colors sm:py-1.5"
                  >
                    {line.number}
                  </a>
                ) : (
                  <span className="text-ink-faint">{tf("phoneSoon")}</span>
                )}
              </span>
            ))}
          </span>
          <nav className="flex flex-wrap items-center gap-x-5">
            {/*
              Partnerstwo stoi w dolnym rzędzie stopki, obok regulaminu,
              a NIE w głównej nawigacji. Menu na górze prowadzi klienta, który
              chce wynająć auto; partner szuka takiego odnośnika tam, gdzie
              szuka się rzeczy o firmie — na dole. Dokładanie pozycji do menu
              kosztowałoby miejsce na telefonie każdego odwiedzającego, żeby
              obsłużyć nielicznych.
            */}
            <Link
              href="/partnership"
              className="hover:text-ink tap py-2.5 transition-colors sm:py-1.5"
            >
              {tf("partnership")}
            </Link>
            <Link
              href="/regulamin"
              className="hover:text-ink tap py-2.5 transition-colors sm:py-1.5"
            >
              {tf("terms")}
            </Link>
            <Link
              href="/polityka-prywatnosci"
              className="hover:text-ink tap py-2.5 transition-colors sm:py-1.5"
            >
              {tf("privacy")}
            </Link>
            <CookieSettingsButton label={tf("cookies")} />
          </nav>
          {/*
            No number, no row.

            The fallback used to print "NIP: —", which is worse than silence: an
            em dash beside a tax identifier reads as "this company has none"
            rather than "nobody has filled this in yet". The value comes from
            Admin → Ustawienia and is blank there, so until somebody types it
            the line simply does not exist — same rule in both languages and at
            every width, since this is the only place that renders it.

            The LABEL goes through next-intl like every other string here. It
            used to be the literal "NIP:", which is the Polish tax term and
            would have greeted an English visitor untranslated the moment the
            number was filled in. Invisible today only because the value is
            blank — which is exactly why it was worth fixing now, while there
            is nothing on screen to break.
          */}
          {company.nip && (
            <span className="label-tight">
              {tf("taxId")}: {company.nip}
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}
