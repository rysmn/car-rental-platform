"use server";

import { revalidatePath } from "next/cache";
import { bramaKrytyczna } from "@/lib/auth/critical";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

import { recordAudit } from "@/lib/auth/audit";
import { adminActionFailed } from "@/lib/alerts/admin";
import { getSetting, setSetting } from "@/lib/admin/settings";
import { cancellationSchema } from "@/lib/booking/cancellation";

export type SaveResult = { ok: true } | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PLN = 1_000_000; // 1M zł ceiling — anything larger is a typo/attack.

/** Parse a złoty amount (accepts "450", "450.50", "450,50") to integer grosze. */
function parseGrosze(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string") return null;
  const normalized = v.replace(/\s/g, "").replace(",", ".");
  if (normalized === "") return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0 || n > MAX_PLN) return null;
  return Math.round(n * 100);
}

/**
 * Stawka za dodatkowy kilometr: puste pole to `null`, zero to BŁĄD.
 *
 * Trzy stany, nie dwa — i właśnie dlatego to nie jest `parseGrosze`. Puste
 * znaczy „właściciel jeszcze nie wycenił tego auta" i ma prawo tak zostać;
 * zero znaczyłoby „nadprzebieg jest darmowy", czego nikt nie chciał powiedzieć,
 * a co strona pokazałaby klientowi jako obietnicę. Baza odrzuca zero
 * ograniczeniem CHECK z migracji 0050; tutaj odrzucamy je wcześniej, żeby
 * właściciel zobaczył komunikat zamiast błędu zapisu.
 *
 * `undefined` w wyniku = wartość niepoprawna. `null` = świadomie puste.
 */
function parseStawkaKm(
  v: FormDataEntryValue | null,
): number | null | undefined {
  if (typeof v !== "string") return undefined;
  const normalized = v.replace(/\s/g, "").replace(",", ".");
  if (normalized === "") return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_PLN) return undefined;
  // Dwa miejsca po przecinku — 4,50 zł/km to 450 groszy, nie 450,0000001.
  return Math.round(n * 100);
}

function parseCount(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string") return null;
  const n = Number(v.trim());
  if (!Number.isInteger(n) || n < 0 || n > 100_000) return null;
  return n;
}

const INVALID: SaveResult = { ok: false, error: "Nieprawidłowe dane." };

export async function updateModelPricing(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  const brama = await bramaKrytyczna("ceny.zmien");
  if (!brama.ok) return { ok: false, error: brama.error };
  const admin = brama.admin;
  const id = String(formData.get("id") ?? "");
  const daily = parseGrosze(formData.get("daily"));
  // Tier rates are optional — blank clears the tier and the model falls back to
  // the base daily rate for that length of rental.
  const tier3to6 = parseGrosze(formData.get("daily3to6"));
  const tier7to13 = parseGrosze(formData.get("daily7to13"));
  const tier14to29 = parseGrosze(formData.get("daily14to29"));
  const monthly = parseGrosze(formData.get("monthly"));
  const deposit = parseGrosze(formData.get("deposit"));
  const kmPerDay = parseCount(formData.get("kmPerDay"));
  const extraMileage = parseStawkaKm(formData.get("extraMileage"));
  if (extraMileage === undefined) {
    return {
      ok: false,
      error:
        "Opłata za dodatkowy kilometr musi być większa od zera. Zostaw pole puste, jeżeli stawka nie jest jeszcze ustalona.",
    };
  }
  if (
    !UUID_RE.test(id) ||
    daily === null ||
    monthly === null ||
    deposit === null ||
    kmPerDay === null
  ) {
    return INVALID;
  }

  const db = getDb();
  try {
    const [before] = await db
      .select({
        dailyPriceGrosze: schema.carModels.dailyPriceGrosze,
        dailyPrice3to6Grosze: schema.carModels.dailyPrice3to6Grosze,
        dailyPrice7to13Grosze: schema.carModels.dailyPrice7to13Grosze,
        dailyPrice14to29Grosze: schema.carModels.dailyPrice14to29Grosze,
        monthlyPriceGrosze: schema.carModels.monthlyPriceGrosze,
        depositGrosze: schema.carModels.depositGrosze,
        kmPerDayLimit: schema.carModels.kmPerDayLimit,
        extraMileageFeeGrosze: schema.carModels.extraMileageFeeGrosze,
      })
      .from(schema.carModels)
      .where(eq(schema.carModels.id, id))
      .limit(1);
    if (!before) return { ok: false, error: "Nie znaleziono modelu." };

    const after = {
      dailyPriceGrosze: daily,
      dailyPrice3to6Grosze: tier3to6,
      dailyPrice7to13Grosze: tier7to13,
      dailyPrice14to29Grosze: tier14to29,
      monthlyPriceGrosze: monthly,
      depositGrosze: deposit,
      kmPerDayLimit: kmPerDay,
      extraMileageFeeGrosze: extraMileage,
    };
    await db
      .update(schema.carModels)
      .set({ ...after, updatedAt: new Date() })
      .where(eq(schema.carModels.id, id));

    await recordAudit({
      adminId: admin.id,
      action: "pricing.model.update",
      entity: "car_model",
      entityId: id,
      before,
      after,
    });
    revalidatePath("/admin/pricing");
    return { ok: true };
  } catch (err) {
    adminActionFailed("updateModelPricing", err);
    return { ok: false, error: "Wystąpił błąd. Spróbuj ponownie." };
  }
}

export async function updateFee(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  const brama = await bramaKrytyczna("ceny.zmien");
  if (!brama.ok) return { ok: false, error: brama.error };
  const admin = brama.admin;
  const id = String(formData.get("id") ?? "");
  const amount = parseGrosze(formData.get("amount"));
  const unitRaw = String(formData.get("unit") ?? "");
  const unit: "per_day" | "per_rental" | null =
    unitRaw === "per_day" || unitRaw === "per_rental" ? unitRaw : null;
  const active = formData.get("active") === "on";
  if (!UUID_RE.test(id) || amount === null || unit === null) return INVALID;

  const db = getDb();
  try {
    const [before] = await db
      .select({
        amountGrosze: schema.fees.amountGrosze,
        unit: schema.fees.unit,
        active: schema.fees.active,
      })
      .from(schema.fees)
      .where(eq(schema.fees.id, id))
      .limit(1);
    if (!before) return { ok: false, error: "Nie znaleziono opłaty." };

    const after = { amountGrosze: amount, unit, active };
    await db
      .update(schema.fees)
      .set({ ...after, updatedAt: new Date() })
      .where(eq(schema.fees.id, id));

    await recordAudit({
      adminId: admin.id,
      action: "pricing.fee.update",
      entity: "fee",
      entityId: id,
      before,
      after,
    });
    revalidatePath("/admin/pricing");
    return { ok: true };
  } catch (err) {
    adminActionFailed("updateFee", err);
    return { ok: false, error: "Wystąpił błąd. Spróbuj ponownie." };
  }
}

export async function updatePickupLocation(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  const brama = await bramaKrytyczna("ceny.zmien");
  if (!brama.ok) return { ok: false, error: brama.error };
  const admin = brama.admin;
  const id = String(formData.get("id") ?? "");
  const fee = parseGrosze(formData.get("fee"));
  const active = formData.get("active") === "on";
  if (!UUID_RE.test(id) || fee === null) return INVALID;

  const db = getDb();
  try {
    const [before] = await db
      .select({
        feeGrosze: schema.pickupLocations.feeGrosze,
        active: schema.pickupLocations.active,
      })
      .from(schema.pickupLocations)
      .where(eq(schema.pickupLocations.id, id))
      .limit(1);
    if (!before) return { ok: false, error: "Nie znaleziono lokalizacji." };

    const after = { feeGrosze: fee, active };
    await db
      .update(schema.pickupLocations)
      .set({ ...after, updatedAt: new Date() })
      .where(eq(schema.pickupLocations.id, id));

    await recordAudit({
      adminId: admin.id,
      action: "pricing.location.update",
      entity: "pickup_location",
      entityId: id,
      before,
      after,
    });
    revalidatePath("/admin/pricing");
    return { ok: true };
  } catch (err) {
    adminActionFailed("updatePickupLocation", err);
    return { ok: false, error: "Wystąpił błąd. Spróbuj ponownie." };
  }
}

/**
 * Polityka anulowania — progi godzinowe i kwoty, w jednym miejscu.
 *
 * Ta sama bramka operacji krytycznych co reszta cennika (`ceny.zmien`) i ten
 * sam ślad w dzienniku: przed/po, kto, kiedy. Zamówienie prosi wprost, żeby nie
 * osłabiać istniejących zabezpieczeń panelu — więc opłata za anulowanie
 * zmienia się dokładnie tak samo jak cena doby.
 *
 * ZMIANA DZIAŁA WYŁĄCZNIE NA PRZYSZŁOŚĆ. Rezerwacje już zawarte niosą własną
 * migawkę zasad w `reservations.quote` i rozliczą się według niej — patrz
 * `politykaRezerwacji`. Panel mówi o tym pod formularzem, żeby nikt nie
 * podnosił kwot w przekonaniu, że dotkną wczorajszych klientów.
 */
export async function updateCancellationPolicy(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  const brama = await bramaKrytyczna("ceny.zmien");
  if (!brama.ok) return { ok: false, error: brama.error };
  const admin = brama.admin;

  const liczba = (nazwa: string): number | null => {
    const v = formData.get(nazwa);
    if (typeof v !== "string") return null;
    const n = Number(v.trim());
    return Number.isInteger(n) && n >= 0 ? n : null;
  };

  const freeHours = liczba("freeHours");
  const lateHours = liczba("lateHours");
  const noShowGraceMinutes = liczba("noShowGraceMinutes");
  const tier1Grosze = parseGrosze(formData.get("tier1"));
  const tier2Grosze = parseGrosze(formData.get("tier2"));
  const noShowGrosze = parseGrosze(formData.get("noShow"));

  if (
    freeHours === null ||
    lateHours === null ||
    noShowGraceMinutes === null ||
    tier1Grosze === null ||
    tier2Grosze === null ||
    noShowGrosze === null
  ) {
    return INVALID;
  }

  const przed = await getSetting("cancellation");
  const po = {
    freeHours,
    lateHours,
    tier1Grosze,
    tier2Grosze,
    noShowGrosze,
    noShowGraceMinutes,
  };

  /*
    Walidacja wzajemna należy do schematu, nie do tego formularza: „drugi próg
    nie wyżej niż bezpłatny" i „bliżej odbioru nie taniej" to reguły polityki,
    a nie tego ekranu. Zod odrzuca jedno i drugie, a my zamieniamy jego
    komunikat na zdanie, które administrator zrozumie bez czytania kodu.
  */
  const sprawdzone = cancellationSchema.safeParse(po);
  if (!sprawdzone.success) {
    return {
      ok: false,
      error:
        sprawdzone.error.issues[0]?.message ??
        "Nieprawidłowe dane polityki anulowania.",
    };
  }

  try {
    await setSetting("cancellation", sprawdzone.data, admin.id);
    await recordAudit({
      adminId: admin.id,
      action: "pricing.cancellation.update",
      entity: "settings",
      entityId: undefined,
      before: przed,
      after: sprawdzone.data,
    });
    revalidatePath("/admin/pricing");
    return { ok: true };
  } catch (err) {
    adminActionFailed("updateCancellationPolicy", err);
    return { ok: false, error: "Wystąpił błąd. Spróbuj ponownie." };
  }
}
