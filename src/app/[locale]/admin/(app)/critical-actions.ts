"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guard";
import {
  oknoDoKiedy,
  OKNO_MS,
  potwierdzTozsamosc,
  zamknijOkno,
} from "@/lib/auth/critical";
import { recordAudit } from "@/lib/auth/audit";

/**
 * Odblokowanie i zablokowanie operacji krytycznych — obsługa kłódki w panelu.
 *
 * Sama zasada i powód, dla którego okno jest krótkie, stoją w
 * `lib/auth/critical.ts`. Tutaj jest wyłącznie wejście dla interfejsu.
 */

export type StanOkna = { otwarteDo: number | null; okresMs: number };

export async function stanOknaKrytycznego(): Promise<StanOkna> {
  const admin = await requireAdmin();
  return { otwarteDo: oknoDoKiedy(admin.id), okresMs: OKNO_MS };
}

export async function odblokujKrytyczne(
  haslo: string,
  kod?: string,
): Promise<{ ok: true; otwarteDo: number } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const wynik = await potwierdzTozsamosc(admin, haslo, kod);
  if (!wynik.ok) return wynik;

  /*
    Do audytu trafia sam FAKT potwierdzenia — bez hasła, bez kodu, bez adresu.
    Wartość tego wpisu polega na tym, że przy każdej usuniętej rezerwacji da
    się później zobaczyć, kto i o której odblokował operacje krytyczne.
  */
  await recordAudit({
    adminId: admin.id,
    action: "admin.critical_unlocked",
    entity: "admin",
    entityId: admin.id,
    after: { minut: Math.round(OKNO_MS / 60_000) },
  });
  revalidatePath("/admin");
  return { ok: true, otwarteDo: wynik.doKiedy };
}

export async function zablokujKrytyczne(): Promise<{ ok: true }> {
  const admin = await requireAdmin();
  zamknijOkno(admin.id);
  await recordAudit({
    adminId: admin.id,
    action: "admin.critical_locked",
    entity: "admin",
    entityId: admin.id,
  });
  revalidatePath("/admin");
  return { ok: true };
}
