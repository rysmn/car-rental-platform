import type { Metadata } from "next";
import { turnstileSiteKey } from "@/lib/security/turnstile";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import { getLocations } from "@/lib/booking/repo";
import { Money } from "@/components/currency/Money";
import { RequestForm } from "@/components/marketing/RequestForm";
import { GoogleLocation } from "@/components/marketing/GoogleLocation";
import { requirePageEnabled } from "@/lib/admin/page-visibility";
import {
  clampDescription,
  infoPageJsonLd,
  jsonLdHtml,
  pageMetadata,
} from "@/lib/seo";
import { getSetting } from "@/lib/admin/settings";
import { googleView } from "@/lib/company/google";
import { serviceHours } from "@/lib/company/service-hours";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Contact" });
  // The description quotes the phone window — from the settings, like every
  // other hour on the site.
  const hours = serviceHours(await getSetting("company"), locale);
  return {
    ...pageMetadata({
      locale,
      path: "/contact",
      title: t("eyebrow"),
      description: t("metaDescription", { phone: hours.phone }),
    }),
  };
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePageEnabled("contact");
  const t = await getTranslations("Contact");
  const locations = await getLocations();
  const company = await getSetting("company");
  const hours = serviceHours(company, locale);

  // Google map and buttons. Every "may this be shown at all" question is
  // answered inside `googleView`, so this page never inspects a URL itself.
  const [google, social] = await Promise.all([
    getSetting("google"),
    getSetting("social"),
  ]);
  const gview = googleView({
    google,
    profileUrl: social.googleBusiness,
    locale,
  });

  /*
    Napisy paska opinii — liczone TUTAJ, nie w komponencie.

    Ocena jest liczbą i musi wyjść jako „5,0" po polsku, a „5.0" po angielsku;
    liczba opinii odmienia się przez przypadki („1 opinia", „2 opinie",
    „12 opinii"). Jedno i drugie umie już `Intl` i słownik ICU next-intl, więc
    komponent dostaje gotowe napisy i nie zna ani formatu liczby, ani polskiej
    odmiany. `null` przechodzi przez tę funkcję nietknięty i znaczy dalej to
    samo: nie znamy tej liczby, więc nie ma czego pokazać.
  */
  const score = gview.reviews?.score ?? null;
  const ratingText = score
    ? new Intl.NumberFormat(locale === "en" ? "en-GB" : "pl-PL", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(score.rating)
    : null;
  const reviewLabels = {
    rating: ratingText,
    count: score ? t("reviewsCount", { count: score.count }) : null,
    title: t("reviewsTitle"),
    readAll: t("readAllReviews"),
    aria: score
      ? t("reviewsAria", { rating: ratingText ?? "", count: score.count })
      : "",
  };

  // Both service lines are WhatsApp numbers that are also reachable by a normal
  // phone call, so each one gets a `tel:` link and a WhatsApp link. `tel:` wants
  // the number in dialable form; wa.me wants the digits-only form we store.
  const phoneLines = company.phones
    .filter((p) => p.number)
    .map((p) => ({
      lang: p.lang,
      number: p.number,
      telHref: `tel:${p.number.replace(/[^\d+]/g, "")}`,
      waHref: p.whatsapp ? `https://wa.me/${p.whatsapp}` : null,
    }));

  const methods: {
    label: string;
    value: string;
    href?: string;
    external?: boolean;
    /** Small print under the value — the schedule needs it, the address does not. */
    note?: string;
  }[] = [
    {
      label: t("email"),
      value: company.email,
      href: company.email ? `mailto:${company.email}` : undefined,
    },
    {
      label: t("address"),
      value: company.address || company.city,
      href: company.mapsUrl || undefined,
      external: true,
    },
    /*
     * Three lines, because there are three different facts and blurring them
     * is what the page used to do: the office takes reservations 08:00–23:00,
     * the phone is answered 07:00–24:00, and a car can change hands at any hour
     * if it was arranged. All three come from `serviceHours`, which the
     * assistant answers from as well, so the page and the chat cannot disagree.
     */
    ...hours.lines.map((line, i) => ({
      label: line.label,
      value: line.value,
      // The note about e-mail after midnight belongs to the last line, where
      // the reader has just been told when the phone stops being answered.
      note:
        i === hours.lines.length - 1
          ? [hours.note, company.hours].filter(Boolean).join(" ")
          : undefined,
    })),
  ];

  /*
    Dane strukturalne strony kontaktowej — bez powtarzania firmy.

    To jedyna strona serwisu, o której wyszukiwarka wprost chciałaby wiedzieć,
    że zawiera dane kontaktowe, a była wśród dwunastu bez żadnego schematu
    (audyt 02.09.2026). `mainEntity` wskazuje przez `@id` na `#organization`
    opisaną raz, na stronie głównej: druga kopia adresu i telefonu to druga
    prawda o tej samej firmie.
  */
  const jsonLd = infoPageJsonLd({
    locale,
    type: "ContactPage",
    href: "/contact",
    name: t("title"),
    description: clampDescription(t("metaDescription", { phone: hours.phone })),
  });

  return (
    <Container className="py-16 md:py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }}
      />
      <div className="max-w-3xl">
        <Reveal>
          <p className="label text-red text-xs">{t("eyebrow")}</p>
          <h1 className="font-heading mt-4 text-4xl font-bold md:text-6xl">
            {t("title")}
          </h1>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="text-ink-muted mt-6 text-base leading-relaxed md:text-lg">
            {t("subtitle")}
          </p>
        </Reveal>
      </div>

      {/* Contact methods */}
      <div className="border-line mt-14 grid gap-px border-y sm:grid-cols-2 lg:grid-cols-4">
        {/* Phone / WhatsApp — both service lines, each callable and on WhatsApp */}
        <Reveal className="border-line py-8 sm:border-r sm:px-8 sm:first:pl-0">
          <p className="label-tight text-ink-faint text-[10px]">
            {t("phoneLabel")}
          </p>
          <div className="mt-3 space-y-3">
            {phoneLines.map((line) => (
              <div key={line.lang}>
                <div className="flex items-center gap-2">
                  <span className="label-tight rounded-pill border-line-strong text-silver border px-2 py-0.5 text-[9px]">
                    {line.lang}
                  </span>
                  <p className="font-heading text-ink text-lg font-bold">
                    {line.number}
                  </p>
                </div>
                {/* Two of the most-tapped links on the site, and they were an
                    18px-tall line of text on a phone. */}
                <div className="flex gap-5 text-[11px]">
                  <a
                    href={line.telHref}
                    className="text-ink-faint hover:text-red tap py-2 transition-colors"
                  >
                    {t("call")}
                  </a>
                  {line.waHref && (
                    <a
                      href={line.waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-ink-faint hover:text-red tap py-2 transition-colors"
                    >
                      {t("whatsapp")}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-ink-faint mt-4 text-[11px] leading-relaxed">
            {t("phoneNote")}
          </p>
        </Reveal>

        {methods.map((m, i) => (
          <Reveal
            key={m.label}
            delay={((i + 1) % 4) * 0.06}
            className="border-line py-8 sm:border-r sm:px-8 sm:first:pl-0 lg:[&:nth-child(4)]:border-r-0"
          >
            <p className="label-tight text-ink-faint text-[10px]">{m.label}</p>
            {m.href ? (
              <a
                href={m.href}
                {...(m.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="font-heading text-ink hover:text-red tap mt-3 block py-1 text-lg font-bold transition-colors sm:py-0"
              >
                {m.value}
              </a>
            ) : (
              <p className="font-heading text-ink mt-3 text-lg font-bold">
                {m.value}
              </p>
            )}
            {m.note && (
              <p className="text-ink-faint mt-4 text-[11px] leading-relaxed">
                {m.note}
              </p>
            )}
          </Reveal>
        ))}
      </div>

      {/* Primary CTAs */}
      <Reveal className="mt-10 flex flex-wrap gap-4">
        {phoneLines[0] && (
          <a
            href={phoneLines[0].telHref}
            className="label bg-red hover:bg-red-hover inline-flex h-14 items-center justify-center px-9 text-sm text-white transition-colors"
          >
            {t("call")}
          </a>
        )}
        {company.email && (
          <a
            href={`mailto:${company.email}`}
            className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 inline-flex h-14 items-center justify-center border px-9 text-sm transition-colors"
          >
            {t("write")}
          </a>
        )}
      </Reveal>

      {/*
        Formularz zapytania — jedyny kanał na tej stronie, który zostawia ślad
        w systemie. Stoi POD telefonem i WhatsAppem świadomie: kto chce
        zadzwonić, dzwoni od razu; formularz jest dla tych, którzy piszą
        wieczorem albo wolą mieć sprawę na piśmie.
      */}
      <div className="mt-20">
        <Reveal>
          <h2 className="label text-ink-faint text-xs">{t("formTitle")}</h2>
          <p className="text-silver mt-3 max-w-xl text-sm">{t("formLead")}</p>
        </Reveal>
        <Reveal className="mt-8">
          <RequestForm
            locale={locale === "en" ? "en" : "pl"}
            privacyHref={
              locale === "en"
                ? "/en/polityka-prywatnosci"
                : "/polityka-prywatnosci"
            }
            labels={{
              formName: t("formName"),
              formPhone: t("formPhone"),
              formEmail: t("formEmail"),
              formContactHint: t("formContactHint"),
              formSubject: t("formSubject"),
              formMessage: t("formMessage"),
              formCar: t("formCar"),
              formDates: t("formDates"),
              formDateFrom: t("formDateFrom"),
              formDateTo: t("formDateTo"),
              formConsent: t("formConsent"),
              formSend: t("formSend"),
              formSending: t("formSending"),
              formDone: t("formDone"),
              formErrContact: t("formErrContact"),
              formErrSubject: t("formErrSubject"),
              formErrMessage: t("formErrMessage"),
              formErrConsent: t("formErrConsent"),
              formErrRate: t("formErrRate"),
              formErrServer: t("formErrServer"),
              formErrTurnstile: t("formErrTurnstile"),
            }}
            turnstileSiteKey={turnstileSiteKey()}
          />
        </Reveal>
      </div>

      {/* Pick-up locations */}
      <div className="mt-20">
        <Reveal>
          <h2 className="label text-ink-faint text-xs">
            {t("locationsTitle")}
          </h2>
        </Reveal>
        {/*
          Hairline grid via gap-px over a bg-line backing, so every cell is a
          self-contained box. This stays even for any number of locations — a
          `divide-x` grid drew misaligned rules whenever the row wrapped (e.g.
          the 4th location dropping under a 3-column layout).
        */}
        <div className="border-line bg-line mt-8 grid gap-px border sm:grid-cols-2 lg:grid-cols-4">
          {locations.map((l, i) => (
            <Reveal
              key={l.slug}
              delay={Math.min(i, 4) * 0.06}
              className="bg-void px-6 py-6"
            >
              <p className="font-heading text-ink text-lg font-bold">
                {locale === "en" ? l.nameEn : l.name}
              </p>
              {l.address && (
                <p className="text-ink-muted mt-2 text-sm">{l.address}</p>
              )}
              {/*
                Dopłata za punkt odbioru — w wybranej walucie, jak każda inna
                cena. To ta sama kwota, którą klient zobaczy w podsumowaniu
                rezerwacji, więc nie ma powodu, żeby na tej stronie była
                w innej walucie niż tam.
              */}
              <p className="label-tight text-red mt-3 text-[11px]">
                {l.feeGrosze > 0 ? (
                  <>
                    +<Money grosze={l.feeGrosze} />
                  </>
                ) : (
                  "—"
                )}
              </p>
            </Reveal>
          ))}
        </div>
      </div>

      {/*
        Mapa i przyciski Google — pod punktami odbioru, bo to ta sama sprawa:
        „gdzie jesteście". Cała sekcja znika, gdy właściciel jej nie włączył
        albo gdy brakuje danych; wtedy strona kończy się tak jak wcześniej.
      */}
      {/*
        Warunek TUTAJ, a nie tylko w komponencie: `<Reveal>` opakowuje dziecko
        własnym elementem z animacją, więc bez tego wyłączona sekcja zostawiała
        na stronie pusty, animowany div.

        Czego to NIE zmienia: same NAPISY „Dodaj opinię" i „Zobacz nas
        w Google" i tak są w źródle strony, bo `NextIntlClientProvider` wysyła
        cały słownik komunikatów — dokładnie tak samo jak „Wysyłanie…"
        z formularza rezerwacji, którego też nikt nie widzi, dopóki nie
        kliknie. To wzorzec całej aplikacji, nie ślad po tej sekcji, i nie ma
        sensu z nim walczyć w jednym miejscu.
      */}
      {(gview.mapSrc ||
        gview.profileHref ||
        gview.reviewHref ||
        gview.reviews) && (
        <Reveal>
          <GoogleLocation
            view={gview}
            labels={{
              title: t("findUsTitle"),
              mapTitle: t("mapTitle"),
              seeOnGoogle: t("seeOnGoogle"),
              addReview: t("addReview"),
              reviews: reviewLabels,
            }}
          />
        </Reveal>
      )}

      <Reveal className="mt-16 text-center">
        <ButtonLink href="/fleet" size="lg">
          {t("book")}
        </ButtonLink>
      </Reveal>
    </Container>
  );
}
