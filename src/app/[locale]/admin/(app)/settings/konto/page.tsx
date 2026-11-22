import { setRequestLocale, getTranslations } from "next-intl/server";
import { eq } from "drizzle-orm";
import { Link } from "@/i18n/navigation";
import { getDb, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guard";
import { formatDateTimePl } from "@/lib/format";
import { ProfileForm, PasswordForm } from "./AccountForms";
import { TwoFactorPanel } from "./TwoFactorPanel";
import { ileKodowZostalo } from "@/lib/auth/two-factor";
import { ROLE_LABEL as ROLE_NAZWA } from "@/lib/auth/permissions";
import { pick } from "@/lib/i18n-pick";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.settings.account" });
  return { title: t("metaTitle") };
}

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Admin.settings.account");
  const tc = await getTranslations("Admin.settings.common");

  const admin = await requireAdmin();
  const [row] = await getDb()
    .select({
      email: schema.admins.email,
      name: schema.admins.name,
      phone: schema.admins.phone,
      role: schema.admins.role,
      lastLoginAt: schema.admins.lastLoginAt,
      totpConfirmedAt: schema.admins.totpConfirmedAt,
      createdAt: schema.admins.createdAt,
    })
    .from(schema.admins)
    .where(eq(schema.admins.id, admin.id))
    .limit(1);

  const kodow = row ? await ileKodowZostalo(admin.id) : 0;

  if (!row) {
    // The guard resolved an account that vanished between two queries. Rare,
    // but rendering half a page about a deleted account helps nobody.
    return (
      <p className="text-silver text-sm">{t("loadFailed")}</p>
    );
  }

  /*
    Opisy ról. Same nazwy biorą się z `lib/auth/permissions`, żeby panel i kontrola
    serwerowa nie rozjechały się co do tego, ile jest ról; zdanie o zakresie
    dopisujemy tutaj, bo należy do interfejsu, a nie do mapy uprawnień.
  */
  const ROLE_LABEL: Record<string, string> = {
    superadmin: t("roles.superadmin", { role: pick(ROLE_NAZWA.superadmin, locale) }),
    admin: t("roles.admin", { role: pick(ROLE_NAZWA.admin, locale) }),
    operator: t("roles.operator", { role: pick(ROLE_NAZWA.operator, locale) }),
  };

  return (
    <div className="max-w-3xl">
      <Link
        href="/admin/settings"
        className="-my-2 inline-flex min-h-11 items-center label-tight text-ink-faint hover:text-ink text-[10px]"
      >
        {tc("back")}
      </Link>
      <header className="mt-4 mb-8">
        <h1 className="font-heading text-ink text-2xl font-bold">{t("title")}</h1>
        <p className="text-silver mt-1 text-sm">
          {t("roleSince", {
            role: ROLE_LABEL[row.role] ?? row.role,
            date: formatDateTimePl(row.createdAt),
          })}
        </p>
      </header>

      <section>
        <h2 className="label text-ink text-xs">{t("data.heading")}</h2>
        <div className="mt-4">
          <ProfileForm name={row.name} phone={row.phone} email={row.email} />
        </div>
      </section>

      <section className="border-line mt-12 border-t pt-8">
        <h2 className="label text-ink text-xs">{t("password.heading")}</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">{t("password.note")}</p>
        <PasswordForm />
      </section>

      <section className="border-line mt-12 border-t pt-8">
        <h2 className="label text-ink text-xs">{t("login.heading")}</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-[14rem_1fr]">
          <dt className="text-ink-faint text-xs">{t("login.last")}</dt>
          <dd className="text-silver">
            {row.lastLoginAt
              ? formatDateTimePl(row.lastLoginAt)
              : t("login.noRecord")}
          </dd>
        </dl>

        <div className="mt-6">
          <TwoFactorPanel
            wlaczone={Boolean(row.totpConfirmedAt)}
            kodowZostalo={kodow}
          />
        </div>

        <p className="text-ink-faint mt-4 text-xs leading-relaxed">
          {t.rich("login.recoveryNote", {
            code: (chunks) => <code className="text-silver">{chunks}</code>,
          })}
        </p>
        <p className="text-ink-faint mt-2 text-xs">
          {t.rich("login.history", {
            link: (chunks) => (
              <Link
                href="/admin/audit"
                className="text-silver hover:text-ink tap-area underline underline-offset-2"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      </section>
    </div>
  );
}
