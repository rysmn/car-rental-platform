import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { MyReservations } from "@/components/booking/MyReservations";
import { localeAlternates } from "@/lib/seo";
import { getSetting } from "@/lib/admin/settings";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "MyReservations" });
  return {
    title: t("title"),
    description: t("lead"),
    alternates: localeAlternates(locale, "/moje-rezerwacje"),
    // Personal to whoever is looking; there is nothing here for a crawler and
    // it must never surface in search.
    robots: { index: false, follow: false },
  };
}

export default async function MyReservationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("MyReservations");

  /* Kanał kontaktu do komunikatu „zostało mniej niż 24 h" — z ustawień firmy,
     nie z osobnej stałej, żeby zmiana numeru w panelu działała także tutaj. */
  const company = await getSetting("company");
  const telefon =
    company.phones.find((linia) => linia.number)?.number ?? null;

  return (
    <Container className="py-16 md:py-24">
      {/* `as="h1"`: this is the page's own title and there was nothing above
          it — the page had no H1 at all. `SectionHeading` renders the same
          classes for either tag, so only the semantics change. */}
      <SectionHeading
        as="h1"
        eyebrow={t("eyebrow")}
        title={t("title")}
        lead={t("lead")}
      />

      <div className="mt-14">
        <MyReservations
          locale={locale}
          kontaktTelefon={telefon}
          kontaktEmail={company.email || null}
          labels={{
            empty: t("empty"),
            emptyCta: t("empty"),
            browse: t("browse"),
            days: t("days"),
            total: t("total"),
            deposit: t("deposit"),
            mileageIncluded: t("mileageIncluded"),
            extraMileage: t("extraMileage"),
            extraMileageNotRecorded: t("extraMileageNotRecorded"),
            remove: t("remove"),
            loading: t("loading"),
            deviceNote: t("deviceNote"),
            status: {
              pending_verification: t("status.pending_verification"),
              pending: t("status.pending"),
              confirmed: t("status.confirmed"),
              cancelled: t("status.cancelled"),
              no_show: t("status.no_show"),
              completed: t("status.completed"),
              rejected: t("status.rejected"),
            },
          }}
        />
      </div>
    </Container>
  );
}
