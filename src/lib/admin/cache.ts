import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * Docker build cache, as the panel sees it.
 *
 * Everything here was measured on the host by `scripts/docker-cache-cron.sh`
 * and written into one row. The app container has no Docker socket and mounts
 * only `/app/media`, so it cannot measure any of this itself — and that is a
 * feature, not a gap: a web process that can reach the daemon can delete the
 * database volume, and no button is worth that.
 *
 * The same rule as the rest of the security page applies — **a reading is only
 * as good as it is fresh.** The janitor reports every 15 minutes; anything
 * older than twice that is shown as a report that stopped coming, whatever it
 * says. A stale "52%" is not a comfort, it is a missing witness.
 */

export type CacheState = "ok" | "warn" | "fail" | "stale" | "unknown";

export type CacheStatus = {
  state: CacheState;
  /** Root filesystem usage, percent. */
  diskPercent: number | null;
  /** Free space as `df -h` prints it, e.g. "18G". */
  diskFree: string | null;
  cacheBytes: number | null;
  thresholdPercent: number;
  checkedAt: Date | null;
  ageMinutes: number | null;
  lastCleanupAt: Date | null;
  lastFreedBytes: number | null;
  lastMessage: string | null;
  lastFailed: boolean;
  /** A cleanup asked for from this panel and not yet picked up / finished. */
  requestState: "idle" | "pending" | "running";
  requestedAt: Date | null;
};

/** How often the janitor is expected to report, in minutes. */
export const CACHE_CHECK_EVERY_MINUTES = 15;

/** Above this the operator is alerted; the janitor still cleans only the cache. */
export const CACHE_ALERT_PERCENT = 80;
export const CACHE_CRITICAL_PERCENT = 90;

const MINUTE = 60_000;

/**
 * Docker's own unit convention: 1 GB = 1000³ bytes, not 1024³. Matching it is
 * not pedantry — the operator reads this number next to `docker system df` on
 * the same screen, and two numbers for one cache is one number too many.
 */
export function formatBytesPl(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes >= 1_000_000_000)
    return `${(bytes / 1_000_000_000).toFixed(2).replace(".", ",")} GB`;
  if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} kB`;
  return `${bytes} B`;
}

/** Postgres hands `bigint`-sized values back as text; parse defensively. */
function num(value: string | null): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function getCacheStatus(): Promise<CacheStatus> {
  const empty: CacheStatus = {
    state: "unknown",
    diskPercent: null,
    diskFree: null,
    cacheBytes: null,
    thresholdPercent: 70,
    checkedAt: null,
    ageMinutes: null,
    lastCleanupAt: null,
    lastFreedBytes: null,
    lastMessage: null,
    lastFailed: false,
    requestState: "idle",
    requestedAt: null,
  };

  try {
    const [row] = await getDb()
      .select()
      .from(schema.cacheMaintenance)
      .where(eq(schema.cacheMaintenance.id, 1))
      .limit(1);
    if (!row) return empty;

    const checkedAt = new Date(row.checkedAt);
    const ageMinutes = Math.max(
      0,
      Math.round((Date.now() - checkedAt.getTime()) / MINUTE),
    );
    // `disk_percent` is null only before the very first run: the row is created
    // by the migration, the readings arrive with the first check.
    const measured = row.diskPercent != null;
    const stale = ageMinutes > CACHE_CHECK_EVERY_MINUTES * 2;

    let state: CacheState;
    if (!measured) state = "unknown";
    else if (stale) state = "stale";
    else if (row.diskPercent! >= CACHE_ALERT_PERCENT) state = "fail";
    else if (row.diskPercent! >= row.thresholdPercent) state = "warn";
    else state = "ok";

    return {
      state,
      diskPercent: row.diskPercent,
      diskFree: row.diskFree,
      cacheBytes: num(row.cacheBytes),
      thresholdPercent: row.thresholdPercent,
      checkedAt: measured ? checkedAt : null,
      ageMinutes: measured ? ageMinutes : null,
      lastCleanupAt: row.lastCleanupAt ? new Date(row.lastCleanupAt) : null,
      lastFreedBytes: num(row.lastFreedBytes),
      lastMessage: row.lastMessage,
      lastFailed: row.lastResult === "error",
      requestState: row.requestState,
      requestedAt: row.requestedAt ? new Date(row.requestedAt) : null,
    };
  } catch {
    // Same reasoning as the health checks: this is the page somebody opens when
    // things are going wrong, so it renders "nie wiadomo" rather than a 500.
    return empty;
  }
}
