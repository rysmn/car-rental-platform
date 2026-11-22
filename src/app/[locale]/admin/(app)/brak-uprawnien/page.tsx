import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/guard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.noPermission" });
  return { title: t("metaTitle") };
}

/**
 * Ekran, na który trafia ktoś, kto wszedł tam, gdzie mu nie wolno.
 *
 * Istnieje, bo alternatywą było HTTP 500 z komunikatem „A server error
 * occurred" — czyli coś, co wygląda jak awaria serwisu i tak zostałoby
 * zgłoszone. Odmowa dostępu nie jest awarią i ma o tym mówić.
 *
 * Nie zdradza, CO jest po drugiej stronie. Zdanie „nie masz dostępu do
 * cennika" mówiłoby pracownikowi, że cennik jest w panelu i pod jakim adresem;
 * to nie jest tajemnica, ale nie ma też powodu jej rozgłaszać.
 */
export default async function BrakUprawnienPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Admin.noPermission");
  const admin = await requireAdmin();

  return (
    <div className="max-w-xl py-10">
      <h1 className="font-heading text-ink text-2xl font-bold">
        {t("heading")}
      </h1>
      <p className="text-ink-muted mt-4 text-sm leading-relaxed">
        {t.rich("loggedIn", {
          name: admin.name,
          role: t(`roles.${admin.role}`),
          strong: (chunks) => <strong className="text-ink">{chunks}</strong>,
        })}
      </p>
      <p className="text-ink-muted mt-3 text-sm leading-relaxed">
        {t("hint")}
      </p>
      <Link
        href="/admin"
        className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 mt-8 inline-flex h-10 items-center border px-5 text-xs transition-colors"
      >
        {t("back")}
      </Link>
    </div>
  );
}
