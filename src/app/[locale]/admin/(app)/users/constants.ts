import type { AdminRole } from "@/lib/auth/permissions";
/**
 * Values shared by the server actions, the page and the client component.
 * They cannot live in `actions.ts` — a `"use server"` module may only export
 * async functions — nor in `@/lib/admin/admins`, which is `server-only`.
 */

/** Same floor as the `admin:create` CLI, so both routes agree on what is acceptable. */
export const MIN_PASSWORD_LENGTH = 10;

/**
 * A row as the client component renders it. Timestamps arrive pre-formatted and
 * the lockout is pre-resolved on the server: both depend on the local clock and
 * timezone, which would otherwise differ between the server render and hydration.
 */
export type UiAdmin = {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  active: boolean;
  locked: boolean;
  lastLoginLabel: string;
  createdLabel: string;
};
