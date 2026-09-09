import "server-only";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * What the security page knows, and how it knows it.
 *
 * The app runs in a container mounting only `/app/media`. Backups, the TLS
 * certificate and the host's disk are all outside it, so none of them can be
 * checked from here. The cron scripts that CAN see them write a row into
 * `system_health`; this module reads those rows and decides how much to believe
 * them.
 *
 * The rule that makes the page trustworthy: **a report is only as good as it is
 * fresh.** Every check declares how often it is expected to run, and a report
 * older than twice that interval is downgraded to `stale` regardless of what it
 * says. Otherwise a monitor that died in March would keep the page green until
 * somebody noticed by other means — which is precisely the failure this page is
 * supposed to catch.
 */

export type HealthState = "ok" | "warn" | "fail" | "stale" | "unknown";

export type HealthCheck = {
  key: string;
  label: string;
  /** What this check answers, in the operator's language. */
  description: string;
  state: HealthState;
  /** The reporting script's own sentence, when there is one. */
  detail: string | null;
  checkedAt: Date | null;
  /** How stale the report is, in minutes; null when nothing ever reported. */
  ageMinutes: number | null;
  /** How often it should report, in minutes — shown when it has gone quiet. */
  expectedEveryMinutes: number;
};

/**
 * The checks the page shows, in the order it shows them, with how often each
 * is expected to report.
 *
 * Listed here rather than derived from the table so a check that has NEVER run
 * still appears — as "nie wiadomo". A page that only renders rows it found
 * would silently omit the backup line on the day backups stopped being
 * recorded, which reads as reassurance.
 */
const CHECKS: {
  key: string;
  label: string;
  description: string;
  everyMinutes: number;
}[] = [
  {
    key: "backup",
    label: "Kopia bazy",
    description: "Nocna kopia z weryfikacją, 14 dni wstecz + niedziele",
    everyMinutes: 24 * 60,
  },
  {
    key: "backup_offsite",
    label: "Kopia poza serwerem",
    description:
      "Ta sama kopia wysyłana mailem, żeby przetrwała utratę serwera",
    everyMinutes: 24 * 60,
  },
  {
    key: "monitor",
    label: "Monitoring",
    description: "Sprawdza dostępność, błędy i logowania co 15 minut",
    everyMinutes: 15,
  },
  {
    key: "app",
    label: "Strona",
    description: "Czy witryna odpowiada poprawnie",
    everyMinutes: 15,
  },
  {
    key: "api",
    label: "API",
    description: "Warstwa tras /api — sprawdzana osobno od renderowania stron",
    everyMinutes: 15,
  },
  {
    key: "db",
    label: "Baza danych",
    description: "Połączenia, długie zapytania, oczekujące blokady, rozmiar",
    everyMinutes: 15,
  },
  {
    key: "reservations",
    label: "Rezerwacje",
    description:
      "Flota się otwiera, tabela rezerwacji czytelna, blokada terminu wolna",
    everyMinutes: 15,
  },
  {
    key: "email",
    label: "E-mail",
    description: "Czy potwierdzenia rezerwacji mają czym wyjść",
    everyMinutes: 15,
  },
  {
    key: "cpu",
    label: "CPU",
    description: "Obciążenie procesora względem liczby rdzeni",
    everyMinutes: 15,
  },
  {
    key: "ram",
    label: "RAM",
    description: "Pamięć dostępna dla aplikacji oraz zużycie swapa",
    everyMinutes: 15,
  },
  {
    key: "disk",
    label: "Dysk",
    description: "Pełny dysk zatrzymuje bazę i kopie w tej samej chwili",
    everyMinutes: 15,
  },
  {
    key: "docker",
    label: "Docker",
    description: "Trzy kontenery produkcyjne: stan, restarty, zdrowie bazy",
    everyMinutes: 15,
  },
  {
    key: "docker_cache",
    label: "Docker build cache",
    description:
      "Pilnuje, żeby cache budowania nie zapełnił dysku — szczegóły niżej",
    everyMinutes: 15,
  },
  {
    key: "cert",
    label: "Certyfikat HTTPS",
    description: "Odnawiany automatycznie — ta linia pilnuje, że nadal działa",
    everyMinutes: 15,
  },
];

const MINUTE = 60_000;

/** Downgrade anything that has gone quiet: a stale "ok" is not an "ok". */
function resolve(
  reported: { status: string; detail: string | null; checkedAt: Date } | null,
  everyMinutes: number,
): Pick<HealthCheck, "state" | "detail" | "checkedAt" | "ageMinutes"> {
  if (!reported) {
    return {
      state: "unknown",
      detail: null,
      checkedAt: null,
      ageMinutes: null,
    };
  }
  const ageMinutes = Math.max(
    0,
    Math.round((Date.now() - reported.checkedAt.getTime()) / MINUTE),
  );
  // Twice the expected interval, not once: a cron that fires at :00 and a page
  // opened at :14 is not a fault, and a page that cried wolf every quarter hour
  // would be closed and never opened again.
  const stale = ageMinutes > everyMinutes * 2;
  const state: HealthState = stale
    ? "stale"
    : reported.status === "ok" ||
        reported.status === "warn" ||
        reported.status === "fail"
      ? reported.status
      : "unknown";
  return {
    state,
    detail: reported.detail,
    checkedAt: reported.checkedAt,
    ageMinutes,
  };
}

export async function getHealthChecks(): Promise<HealthCheck[]> {
  let reported = new Map<
    string,
    { status: string; detail: string | null; checkedAt: Date }
  >();

  try {
    const rows = await getDb().select().from(schema.systemHealth);
    reported = new Map(
      rows.map((r) => [
        r.checkKey,
        {
          status: r.status as string,
          detail: r.detail,
          checkedAt: new Date(r.checkedAt),
        },
      ]),
    );
  } catch {
    // An unreachable table is itself an "everything unknown" answer, and the
    // page renders that honestly. It must not be a 500 — this is the page
    // somebody opens precisely when things are going wrong.
  }

  return CHECKS.map((c) => ({
    key: c.key,
    label: c.label,
    description: c.description,
    expectedEveryMinutes: c.everyMinutes,
    ...resolve(reported.get(c.key) ?? null, c.everyMinutes),
  }));
}

/* ── Login activity, straight from the audit log ──────────────────────────── */

export type LoginActivity = {
  failedLastHour: number;
  failedLastDay: number;
  successLastDay: number;
  /** Most recent failed attempt, for "ostatnie podejrzane logowanie". */
  lastFailureAt: Date | null;
  lastFailureIp: string | null;
};

/**
 * Read from `audit_log` rather than from a counter, so this cannot drift away
 * from the record an investigation would actually rely on.
 */
export async function getLoginActivity(): Promise<LoginActivity> {
  try {
    const rows = (await getDb().execute(sql`
      SELECT
        COUNT(*) FILTER (
          WHERE action = 'login.fail' AND created_at > now() - interval '1 hour'
        )::int AS failed_hour,
        COUNT(*) FILTER (
          WHERE action = 'login.fail' AND created_at > now() - interval '1 day'
        )::int AS failed_day,
        COUNT(*) FILTER (
          WHERE action = 'login.success' AND created_at > now() - interval '1 day'
        )::int AS success_day,
        MAX(created_at) FILTER (WHERE action = 'login.fail') AS last_fail_at,
        (
          SELECT ip FROM audit_log
          WHERE action = 'login.fail'
          ORDER BY created_at DESC LIMIT 1
        ) AS last_fail_ip
      FROM audit_log
    `)) as unknown as {
      failed_hour: number;
      failed_day: number;
      success_day: number;
      last_fail_at: string | Date | null;
      last_fail_ip: string | null;
    }[];
    const r = (Array.isArray(rows) ? rows : [])[0];
    return {
      failedLastHour: Number(r?.failed_hour ?? 0) || 0,
      failedLastDay: Number(r?.failed_day ?? 0) || 0,
      successLastDay: Number(r?.success_day ?? 0) || 0,
      lastFailureAt: r?.last_fail_at ? new Date(r.last_fail_at) : null,
      lastFailureIp: r?.last_fail_ip ?? null,
    };
  } catch {
    return {
      failedLastHour: 0,
      failedLastDay: 0,
      successLastDay: 0,
      lastFailureAt: null,
      lastFailureIp: null,
    };
  }
}

/* ── Accounts ─────────────────────────────────────────────────────────────── */

export type AccountSummary = {
  total: number;
  active: number;
  /** Accounts currently locked out by the brute-force counter. */
  locked: number;
  withTwoFactor: number;
  superadmins: number;
};

export async function getAccountSummary(): Promise<AccountSummary> {
  try {
    const rows = (await getDb().execute(sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE active)::int AS active,
             COUNT(*) FILTER (WHERE locked_until > now())::int AS locked,
             -- totp_confirmed_at, nie totp_secret: od rozdziału 13.6 sekret
             -- może istnieć w trakcie rejestracji, a 2FA zaczyna działać dopiero
             -- po sprawdzeniu pierwszego kodu. Liczenie po samym sekrecie
             -- pokazywałoby ochronę, której jeszcze nie ma.
             COUNT(*) FILTER (WHERE totp_confirmed_at IS NOT NULL)::int AS with_2fa,
             COUNT(*) FILTER (WHERE role = 'superadmin')::int AS superadmins
      FROM admins
    `)) as unknown as {
      total: number;
      active: number;
      locked: number;
      with_2fa: number;
      superadmins: number;
    }[];
    const r = (Array.isArray(rows) ? rows : [])[0];
    return {
      total: Number(r?.total ?? 0) || 0,
      active: Number(r?.active ?? 0) || 0,
      locked: Number(r?.locked ?? 0) || 0,
      withTwoFactor: Number(r?.with_2fa ?? 0) || 0,
      superadmins: Number(r?.superadmins ?? 0) || 0,
    };
  } catch {
    return {
      total: 0,
      active: 0,
      locked: 0,
      withTwoFactor: 0,
      superadmins: 0,
    };
  }
}
