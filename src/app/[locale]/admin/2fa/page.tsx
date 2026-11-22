import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { currentAdmin } from "@/lib/auth/guard";
import { ileKodowZostalo } from "@/lib/auth/two-factor";
import { TwoFactorPanel } from "../(app)/settings/konto/TwoFactorPanel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.twoFactorEnrol" });
  return {
    title: t("enableTitle"),
    robots: { index: false, follow: false },
  };
}

/**
 * Ekran włączenia 2FA dla konta, które go jeszcze nie ma.
 *
 * ## Dlaczego POZA layoutem panelu
 *
 * Layout `(app)` przekierowuje tu każde konto bez drugiego składnika. Gdyby ta
 * strona żyła w środku tamtego layoutu, przekierowanie wpadłoby w pętlę samo na
 * siebie. Stoi więc obok logowania — sąsiaduje z jedynym innym ekranem, na
 * który wchodzi się „jeszcze nie do końca zalogowanym".
 *
 * ## Co tu widać, a czego nie
 *
 * Nie ma menu, nie ma liczb z pulpitu, nie ma niczego z firmy. Konto bez 2FA
 * ma dokładnie jedną rzecz do zrobienia i to jest jedyna rzecz na tym ekranie.
 *
 * ## Jak stąd wyjść bez telefonu
 *
 * Nie da się — i to jest sens słowa „obowiązkowe". Drogą awaryjną jest konsola
 * serwera: `npx tsx scripts/wylacz-2fa.ts <e-mail>`. Kto ma powłokę na tej
 * maszynie, ma i tak bazę i sekrety, więc ta droga niczego nie otwiera; ratuje
 * natomiast przed zamknięciem się przed własnym panelem.
 */
export default async function EnforceTwoFactorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Admin.twoFactorEnrol");

  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");

  /*
    NIE PRZEKIEROWUJEMY konta, które ma już 2FA — i to jest poprawka błędu
    znalezionego testem 27.08.2026, a nie ozdoba.

    Włączenie 2FA idzie przez akcję serwerową. Next po każdej akcji odświeża
    drzewo BIEŻĄCEJ trasy — czyli tej strony. Warunek „ma 2FA → redirect"
    był w tej chwili już prawdziwy, więc przeglądarka wychodziła na `/admin`,
    zabierając ze sobą jedyny ekran, na którym dziesięć KODÓW ZAPASOWYCH
    istnieje w czytelnej postaci. W bazie leżą wyłącznie skróty argon2, więc
    kody przepadały bezpowrotnie: właściciel kończył z obowiązkowym 2FA
    i bez drogi powrotu na wypadek utraty telefonu.

    Zamiast przekierowania strona zostaje i sama się przełącza: dopóki panel
    trzyma nieodhaczone kody, pokazuje je (`TwoFactorPanel` przejmuje wtedy
    cały ekran), a gdy 2FA już działa i kody są zapisane — pokazuje odnośnik
    do panelu. Kształt drzewa jest ten sam przed i po, więc stan komponentu
    klienckiego przeżywa odświeżenie i kody nie znikają.
  */
  const kodow = await ileKodowZostalo(admin.id);

  const wlaczone = admin.twoFactor;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-heading text-ink text-2xl font-bold">
        {wlaczone ? t("enabledTitle") : t("enableTitle")}
      </h1>
      <p className="text-ink-muted mt-3 text-sm leading-relaxed">
        {wlaczone ? t("enabledIntro") : t("enableIntro")}
      </p>
      <p className="text-ink-muted mt-3 text-sm leading-relaxed">
        {wlaczone ? t("enabledHow") : t("enableHow")}
      </p>

      <div className="mt-10">
        <TwoFactorPanel wlaczone={wlaczone} kodowZostalo={kodow} />
      </div>

      {wlaczone ? (
        <p className="text-ink-muted mt-10 text-sm leading-relaxed">
          <Link
            href="/admin"
            className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 inline-flex h-10 items-center border px-5 text-xs transition-colors"
          >
            {t("goToPanel")}
          </Link>
        </p>
      ) : null}

      <p className="text-ink-faint mt-10 text-xs leading-relaxed">
        {t.rich("footer", {
          email: admin.email,
          code: (chunks) => <code className="text-silver">{chunks}</code>,
        })}
      </p>
    </main>
  );
}
