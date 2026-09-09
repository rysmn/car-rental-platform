import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { FEE_DEFAULTS, LOCATION_DEFAULTS, type LocationOption } from "./fees";
import type { Fee, FeeCatalog, FeeUnit } from "./types";

const usingDb = () => Boolean(process.env.DATABASE_URL);

/** Fee catalog — DB (admin-editable) when available, else seed defaults. */
export async function getFeeCatalog(): Promise<FeeCatalog> {
  if (!usingDb()) return FEE_DEFAULTS;

  const rows = await getDb().select().from(schema.fees);
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const pick = (code: string, fallback: Fee): Fee => {
    const r = byCode.get(code);
    return r && r.active
      ? {
          amountGrosze: r.amountGrosze,
          unit: r.unit as FeeUnit,
          capGrosze: r.capGrosze,
        }
      : fallback;
  };
  return {
    extraDriver: pick("extra_driver", FEE_DEFAULTS.extraDriver),
    childSeat: pick("child_seat", FEE_DEFAULTS.childSeat),
    protectionPackage: pick(
      "protection_package",
      FEE_DEFAULTS.protectionPackage,
    ),
    noDeposit: pick("no_deposit", FEE_DEFAULTS.noDeposit),
    afterHours: pick("after_hours", FEE_DEFAULTS.afterHours),
  };
}

/**
 * WSZYSTKIE punkty odbioru, także wyłączone — dla publicznego cennika, który
 * pokazuje punkt zapowiedziany jako „wkrótce". Ta sama tabela, ten sam wiersz,
 * bez filtra `active`; rezerwacja nadal pyta przez `getLocations()` i widzi
 * wyłącznie aktywne.
 */
export async function getAllLocations(): Promise<LocationOption[]> {
  if (!usingDb()) return LOCATION_DEFAULTS;
  const rows = await getDb()
    .select()
    .from(schema.pickupLocations)
    .orderBy(asc(schema.pickupLocations.sortOrder));
  if (rows.length === 0) return LOCATION_DEFAULTS;
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    nameEn: r.nameEn ?? r.name,
    address: r.address,
    feeGrosze: r.feeGrosze,
    sortOrder: r.sortOrder,
    active: r.active,
  }));
}

/** Active pickup locations for the booking form. */
export async function getLocations(): Promise<LocationOption[]> {
  // Także w awaryjnym cenniku: „nieaktywny" znaczy nieaktywny wszędzie, bo
  // inaczej awaria bazy otwierałaby punkt odbioru, którego nie obsługujemy.
  if (!usingDb()) return LOCATION_DEFAULTS.filter((l) => l.active !== false);

  const rows = await getDb()
    .select()
    .from(schema.pickupLocations)
    .where(eq(schema.pickupLocations.active, true))
    .orderBy(asc(schema.pickupLocations.sortOrder));
  if (rows.length === 0)
    return LOCATION_DEFAULTS.filter((l) => l.active !== false);
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    nameEn: r.nameEn ?? r.name,
    address: r.address,
    feeGrosze: r.feeGrosze,
    sortOrder: r.sortOrder,
  }));
}
