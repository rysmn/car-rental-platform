import { setRequestLocale } from "next-intl/server";
import { eq } from "drizzle-orm";
import { Link } from "@/i18n/navigation";
import { getDb, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guard";
import { formatDateTimePl } from "@/lib/format";
import { ProfileForm, PasswordForm } from "./AccountForms";
import { TwoFactorPanel } from "./TwoFactorPanel";
import { ileKodowZostalo } from "@/lib/auth/two-factor";
import { ROLE_LABEL as ROLE_NAZWA } from "@/lib/auth/permissions";

export const metadata = { title: "Moje konto" };

/*
  Opisy ról. Same nazwy biorą się z `lib/auth/permissions`, żeby panel i kontrola
  serwerowa nie rozjechały się co do tego, ile jest ról; zdanie o zakresie
  dopisujemy tutaj, bo należy do interfejsu, a nie do mapy uprawnień.
*/
const ROLE_LABEL: Record<string, string> = {
  superadmin: `${ROLE_NAZWA.superadmin} — pełne uprawnienia`,
  admin: `${ROLE_NAZWA.admin} — bez kont i bezpieczeństwa`,
  operator: `${ROLE_NAZWA.operator} — obsługa bieżąca`,
};

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

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
      <p className="text-silver text-sm">
        Nie udało się wczytać konta. Zaloguj się ponownie.
      </p>
    );
  }

  return (
    <div className="max-w-3xl">
      <Link
        href="/admin/settings"
        className="-my-2 inline-flex min-h-11 items-center label-tight text-ink-faint hover:text-ink text-[10px]"
      >
        ← Ustawienia
      </Link>
      <header className="mt-4 mb-8">
        <h1 className="font-heading text-ink text-2xl font-bold">Moje konto</h1>
        <p className="text-silver mt-1 text-sm">
          {ROLE_LABEL[row.role] ?? row.role} · konto od{" "}
          {formatDateTimePl(row.createdAt)}
        </p>
      </header>

      <section>
        <h2 className="label text-ink text-xs">Dane</h2>
        <div className="mt-4">
          <ProfileForm name={row.name} phone={row.phone} email={row.email} />
        </div>
      </section>

      <section className="border-line mt-12 border-t pt-8">
        <h2 className="label text-ink text-xs">Hasło</h2>
        <p className="text-ink-faint mt-1 mb-4 text-xs">
          Zmiana hasła zeruje też licznik nieudanych prób, więc odblokowuje
          konto zablokowane po serii błędnych logowań.
        </p>
        <PasswordForm />
      </section>

      <section className="border-line mt-12 border-t pt-8">
        <h2 className="label text-ink text-xs">Logowanie</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-[14rem_1fr]">
          <dt className="text-ink-faint text-xs">Ostatnie logowanie</dt>
          <dd className="text-silver">
            {row.lastLoginAt
              ? formatDateTimePl(row.lastLoginAt)
              : "brak zapisu"}
          </dd>
        </dl>

        <div className="mt-6">
          <TwoFactorPanel
            wlaczone={Boolean(row.totpConfirmedAt)}
            kodowZostalo={kodow}
          />
        </div>

        <p className="text-ink-faint mt-4 text-xs leading-relaxed">
          Zgubiony telefon RAZEM z kartką kodów zapasowych to jedyna sytuacja,
          w której 2FA trzeba zdjąć z konsoli serwera:{" "}
          <code className="text-silver">npx tsx scripts/wylacz-2fa.ts</code>.
          Kto ma powłokę na serwerze, ma i tak bazę i sekrety — ta droga niczego
          nie otwiera, a ratuje przed zamknięciem się przed własnym panelem.
        </p>
        <p className="text-ink-faint mt-2 text-xs">
          Pełna historia Twoich działań:{" "}
          <Link
            href="/admin/audit"
            className="text-silver hover:text-ink tap-area underline underline-offset-2"
          >
            Dziennik zdarzeń
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
