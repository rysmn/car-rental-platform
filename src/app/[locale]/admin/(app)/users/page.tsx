import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { currentAdmin } from "@/lib/auth/guard";
import { listAdmins } from "@/lib/admin/admins";
import { formatDateTimePl } from "@/lib/format";
import { CreateAdminForm, AdminList, OwnPasswordForm } from "./UsersManager";
import type { UiAdmin } from "./constants";

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-line mb-12 border-t pt-8">
      <h2 className="font-heading text-lg font-bold text-ink">{title}</h2>
      {subtitle && <p className="text-silver mt-1 text-sm">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.users" });
  return { title: t("metaTitle") };
}

export default async function UsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Admin.users");

  // The layout already gates the whole panel; this re-check gives the page the
  // live role it needs to decide what to render.
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");

  const isSuperadmin = admin.role === "superadmin";
  const admins: UiAdmin[] = isSuperadmin
    ? (await listAdmins()).map((a) => ({
        id: a.id,
        email: a.email,
        name: a.name,
        role: a.role,
        active: a.active,
        locked: a.locked,
        lastLoginLabel: a.lastLoginAt
          ? formatDateTimePl(a.lastLoginAt)
          : t("neverLoggedIn"),
        createdLabel: formatDateTimePl(a.createdAt),
      }))
    : [];

  return (
    <div className="max-w-4xl">
      <header className="mb-8">
        <h1 className="font-heading text-2xl font-bold text-ink">
          {t("title")}
        </h1>
        <p className="text-silver mt-1 text-sm">{t("intro")}</p>
      </header>

      <Section
        title={t("ownPasswordTitle")}
        subtitle={t("ownPasswordSubtitle")}
      >
        <OwnPasswordForm />
      </Section>

      {isSuperadmin ? (
        <>
          <Section
            title={t("newUserTitle")}
            subtitle={t("newUserSubtitle")}
          >
            <CreateAdminForm />
          </Section>

          <Section
            title={t("accountsTitle", { count: admins.length })}
            subtitle={t("accountsSubtitle")}
          >
            <AdminList admins={admins} currentAdminId={admin.id} />
            <p className="text-ink-faint mt-4 text-xs">
              {t.rich("rolesNote", {
                b: (chunks) => <span className="text-silver">{chunks}</span>,
              })}
            </p>
          </Section>
        </>
      ) : (
        <Section title={t("accountManagement")}>
          <p className="border-line bg-graphite/40 text-silver border p-6 text-sm">
            {t("cannotManage")}
          </p>
        </Section>
      )}
    </div>
  );
}
