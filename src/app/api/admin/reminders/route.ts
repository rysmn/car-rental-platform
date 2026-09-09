import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { currentAdmin } from "@/lib/auth/guard";
import { runDueReminders, REMINDER_LEAD_DAYS } from "@/lib/admin/reminders";
import { purgeOldChats, RETENTION_DAYS } from "@/lib/chat/repo";
import { expireStaleVerifications } from "@/lib/booking/verification";

/**
 * Runs the expiry reminder job.
 *
 * Two callers, two ways in:
 *   - the daily cron, holding `REMINDERS_SECRET` in an Authorization header;
 *   - a logged-in admin who wants to see what would go out right now.
 *
 * Without `REMINDERS_SECRET` set, the token path is closed entirely rather
 * than open — an unauthenticated endpoint that sends email is a way to have
 * mail sent on your behalf, and "the variable was not configured yet" is
 * exactly when that would happen.
 *
 * The job itself is idempotent (see `lib/admin/reminders`), so a cron that
 * fires twice, or an admin who clicks twice, sends one email and no more.
 */

export const dynamic = "force-dynamic";

/** Constant-time compare, so the endpoint cannot be probed byte by byte. */
function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function authorised(request: Request): Promise<boolean> {
  const secret = process.env.REMINDERS_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (secret && bearer && tokenMatches(bearer, secret)) return true;
  return (await currentAdmin()) !== null;
}

export async function POST(request: Request) {
  if (!(await authorised(request))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const run = await runDueReminders(REMINDER_LEAD_DAYS);

  /**
   * Chat retention, enforced on the same daily tick.
   *
   * Bolted onto this job rather than given its own cron entry on purpose: one
   * more crontab line is one more thing that can be missing on a rebuilt
   * server, and a retention rule that silently stops running is a data
   * protection problem that nobody notices. A failure here must not stop the
   * reminders going out, so it is caught and reported rather than thrown.
   */
  let purged: number | string = 0;
  try {
    purged = await purgeOldChats(RETENTION_DAYS);
  } catch (err) {
    console.error("chat purge failed:", err);
    purged = "błąd";
  }

  /**
   * Wygaszenie niepotwierdzonych zgłoszeń — rozdział 13.4.
   *
   * Doczepione do tego samego zadania z dokładnie tego samego powodu, co
   * czyszczenie rozmów wyżej: jeden wpis w crontabie zamiast dwóch. Reguła,
   * która po odbudowie serwera po cichu przestaje działać, jest gorsza niż
   * reguła, której nie ma — o tej drugiej przynajmniej się wie.
   *
   * Opóźnienie nie kosztuje ani jednego dnia dostępności: `pending_verification`
   * NIE blokuje kalendarza, więc to jest porządek w danych, nie ochrona floty.
   */
  let wygaszone: number | string = 0;
  try {
    wygaszone = await expireStaleVerifications();
  } catch (err) {
    console.error("expire verifications failed:", err);
    wygaszone = "błąd";
  }

  // 200 with `sent: false` and a non-zero `found` is the interesting failure:
  // there was something to say and the mail did not leave. Nothing was marked
  // as sent, so the next run will try again — but the body says so plainly
  // rather than reporting a cheerful success.
  return NextResponse.json({
    leadDays: REMINDER_LEAD_DAYS,
    chatsPurged: purged,
    verificationsExpired: wygaszone,
    chatRetentionDays: RETENTION_DAYS,
    found: run.found,
    sent: run.sent,
    items: run.items.map((i) => ({
      plate: i.plate,
      car: i.carName,
      kind: i.kind,
      date: i.date,
      daysLeft: i.daysLeft,
    })),
  });
}
