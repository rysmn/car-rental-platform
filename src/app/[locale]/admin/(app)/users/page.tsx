import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
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

export default async function UsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

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
          : "nigdy",
        createdLabel: formatDateTimePl(a.createdAt),
      }))
    : [];

  return (
    <div className="max-w-4xl">
      <header className="mb-8">
        <h1 className="font-heading text-2xl font-bold text-ink">
          Użytkownicy
        </h1>
        <p className="text-silver mt-1 text-sm">
          Konta z dostępem do panelu administracyjnego. Rejestracja publiczna
          nie istnieje — konta zakłada się wyłącznie tutaj.
        </p>
      </header>

      <Section
        title="Moje hasło"
        subtitle="Zmiana hasła własnego konta — wymaga podania aktualnego hasła"
      >
        <OwnPasswordForm />
      </Section>

      {isSuperadmin ? (
        <>
          <Section
            title="Nowy użytkownik"
            subtitle="Utworzone konto może zalogować się od razu"
          >
            <CreateAdminForm />
          </Section>

          <Section
            title={`Konta (${admins.length})`}
            subtitle="Edycja danych, roli i hasła, dezaktywacja oraz usuwanie kont"
          >
            <AdminList admins={admins} currentAdminId={admin.id} />
            <p className="text-ink-faint mt-4 text-xs">
              Rola <span className="text-silver">Superadmin</span> daje dostęp
              do tej strony i zarządzania kontami. Rola{" "}
              <span className="text-silver">Administrator</span> daje pełen
              dostęp do reszty panelu, ale nie do kont.
            </p>
          </Section>
        </>
      ) : (
        <Section title="Zarządzanie kontami">
          <p className="border-line bg-graphite/40 text-silver border p-6 text-sm">
            Dodawanie, edycja i usuwanie kont wymaga roli Superadmin.
          </p>
        </Section>
      )}
    </div>
  );
}
