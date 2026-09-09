"use server";

import { revalidatePath } from "next/cache";
import { bramaKrytyczna } from "@/lib/auth/critical";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

import { recordAudit } from "@/lib/auth/audit";
import { adminActionFailed } from "@/lib/alerts/admin";

/**
 * The one thing this page can set in motion, and the shape of the fence
 * around it.
 *
 * What the button does NOT do: run a command. Nothing in this container can
 * reach the Docker daemon — no socket is mounted, deliberately — so a click
 * writes a request into `cache_maintenance` and stops there. A cron job on the
 * host picks it up within a minute, and that host script contains exactly one
 * destructive line, `docker builder prune -a -f`, hardcoded and never built
 * from anything a request carries. So the worst a compromised session can
 * achieve here is: the build cache gets deleted, which is the same thing an
 * honest click achieves, and which production does not depend on.
 *
 * The fence, layer by layer:
 *   · CSRF          — Next.js compares Origin against Host on every action POST
 *   · authorization — superadmin only; a plain admin has no infrastructure role
 *   · rate limit    — one conditional UPDATE, below, is the whole mechanism
 *   · concurrency   — flock on the host, so two pickups cannot prune at once
 *   · audit         — who asked, and when, in the same log as every other act
 */

export type CacheActionResult =
  { ok: true; message: string } | { ok: false; error: string };

/** How long a caller must wait before asking again. */
const COOLDOWN_MINUTES = 2;

export async function requestCacheCleanup(): Promise<CacheActionResult> {
  // Infrastructure, not content: only a full-rights account. Re-read from the
  // database by requireSuperadmin, never trusted from the session snapshot.
  const brama = await bramaKrytyczna("bezpieczenstwo.zmien");
  if (!brama.ok) return { ok: false, error: brama.error };
  const admin = brama.admin;

  try {
    // Rate limit and double-click guard in a single statement, on purpose. Two
    // clicks land as two POSTs racing each other; a read-then-write in the app
    // would let both pass. Here Postgres decides: the row moves out of `idle`
    // once, the second caller matches nothing and is told to wait.
    const rows = (await getDb().execute(sql`
      UPDATE cache_maintenance
         SET request_state = 'pending',
             requested_at  = now(),
             requested_by  = ${admin.id}
       WHERE id = 1
         AND request_state = 'idle'
         AND (requested_at IS NULL
              OR requested_at < now() - (${COOLDOWN_MINUTES} || ' minutes')::interval)
      RETURNING id
    `)) as unknown as { id: number }[];

    const claimed = (Array.isArray(rows) ? rows : []).length > 0;
    if (!claimed) {
      return {
        ok: false,
        error:
          "Czyszczenie już zostało zlecone albo właśnie trwa. Odśwież stronę za chwilę.",
      };
    }

    await recordAudit({
      adminId: admin.id,
      action: "system.cache.prune.request",
      entity: "cache_maintenance",
      entityId: "1",
      before: null,
      after: { requested: true },
    });

    revalidatePath("/admin/settings/bezpieczenstwo");
    return {
      ok: true,
      message:
        "Zlecono czyszczenie build cache. Serwer wykona je w ciągu minuty — odśwież stronę.",
    };
  } catch (err) {
    adminActionFailed("requestCacheCleanup", err);
    return { ok: false, error: "Nie udało się zlecić czyszczenia." };
  }
}
