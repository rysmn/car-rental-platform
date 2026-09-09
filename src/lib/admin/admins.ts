import "server-only";
import { asc, count, eq, and } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * Admin accounts as shown in the panel. The password hash is never selected —
 * it must not travel to a client component, not even by accident.
 */
export async function listAdmins() {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.admins.id,
      email: schema.admins.email,
      name: schema.admins.name,
      role: schema.admins.role,
      active: schema.admins.active,
      failedAttempts: schema.admins.failedAttempts,
      lockedUntil: schema.admins.lockedUntil,
      lastLoginAt: schema.admins.lastLoginAt,
      createdAt: schema.admins.createdAt,
    })
    .from(schema.admins)
    .orderBy(asc(schema.admins.createdAt));

  // Resolved here rather than at render time: the lockout is a comparison
  // against "now", and a React component must stay pure.
  const now = Date.now();
  return rows.map((r) => ({
    ...r,
    locked: r.lockedUntil !== null && r.lockedUntil.getTime() > now,
  }));
}

export type AdminRow = Awaited<ReturnType<typeof listAdmins>>[number];

/**
 * How many accounts can still manage the panel. Deleting, deactivating or
 * demoting the last one would lock everybody out of account management with no
 * way back in short of the CLI, so every such action checks this first.
 */
export async function countActiveSuperadmins(): Promise<number> {
  const db = getDb();
  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.admins)
    .where(
      and(eq(schema.admins.role, "superadmin"), eq(schema.admins.active, true)),
    );
  return total;
}
