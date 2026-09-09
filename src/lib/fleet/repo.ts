import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { CarModel } from "@/lib/db/schema";
import { FLEET, type FleetModelSeed } from "./data";
import { resolveSegments } from "./segments";
import { toDriverClass } from "./driver-class";
import type { FleetCar } from "./types";

// A slug must match this exact shape before it ever reaches a query (fail closed).
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function fromSeed(m: FleetModelSeed): FleetCar {
  return {
    id: "",
    slug: m.slug,
    brand: m.brand,
    model: m.model,
    year: m.year,
    category: m.category,
    seats: m.seats,
    gearbox: m.gearbox,
    fuel: m.fuel,
    kmPerDayLimit: m.kmPerDayLimit,
    // Ziarno w repozytorium nie zna stawek właściciela — zna je baza. `null`
    // jest tu prawdą, a nie brakiem do uzupełnienia liczbą.
    extraMileageFeeGrosze: null,
    dailyPriceGrosze: m.dailyPriceGrosze,
    dailyPrice3to6Grosze: m.dailyPrice3to6Grosze ?? null,
    dailyPrice7to13Grosze: m.dailyPrice7to13Grosze ?? null,
    dailyPrice14to29Grosze: m.dailyPrice14to29Grosze ?? null,
    monthlyPriceGrosze: m.monthlyPriceGrosze,
    depositGrosze: m.depositGrosze,
    descriptionPl: m.descriptionPl,
    descriptionEn: m.descriptionEn,
    images: m.images,
    // The bundled seed predates equipment and has none to report.
    features: [],
    // The seed carries no hand-picked classes, so only the derived ones apply.
    segments: resolveSegments(m),
    driverClass: m.driverClass ?? null,
    unitCount: m.units.length,
    availableCount: m.units.filter((u) => u.status === "available").length,
  };
}

function fromRow(m: CarModel, units: { status: string }[]): FleetCar {
  return {
    id: m.id,
    slug: m.slug,
    brand: m.brand,
    model: m.model,
    year: m.year,
    category: m.category,
    seats: m.seats,
    gearbox: m.gearbox,
    fuel: m.fuel,
    kmPerDayLimit: m.kmPerDayLimit,
    extraMileageFeeGrosze: m.extraMileageFeeGrosze,
    dailyPriceGrosze: m.dailyPriceGrosze,
    dailyPrice3to6Grosze: m.dailyPrice3to6Grosze ?? null,
    dailyPrice7to13Grosze: m.dailyPrice7to13Grosze ?? null,
    dailyPrice14to29Grosze: m.dailyPrice14to29Grosze ?? null,
    monthlyPriceGrosze: m.monthlyPriceGrosze,
    depositGrosze: m.depositGrosze,
    descriptionPl: m.descriptionPl,
    descriptionEn: m.descriptionEn,
    images: m.images,
    features: m.features ?? [],
    segments: resolveSegments(m),
    driverClass: toDriverClass(m.driverClass),
    unitCount: units.length,
    availableCount: units.filter((u) => u.status === "available").length,
  };
}

const usingDb = () => Boolean(process.env.DATABASE_URL);

/** Published fleet, sorted for display. */
export async function getFleet(): Promise<FleetCar[]> {
  if (!usingDb()) {
    return [...FLEET].sort((a, b) => a.sortOrder - b.sortOrder).map(fromSeed);
  }

  const db = getDb();
  const models = await db
    .select()
    .from(schema.carModels)
    .where(eq(schema.carModels.published, true))
    .orderBy(asc(schema.carModels.sortOrder));
  const units = await db
    .select({ modelId: schema.cars.modelId, status: schema.cars.status })
    .from(schema.cars);

  return models.map((m) =>
    fromRow(
      m,
      units.filter((u) => u.modelId === m.id),
    ),
  );
}

/** A single published listing by slug, or null (unknown/unpublished/invalid slug). */
export async function getCarModelBySlug(
  slug: string,
): Promise<FleetCar | null> {
  if (!SLUG_RE.test(slug) || slug.length > 64) return null;

  if (!usingDb()) {
    const m = FLEET.find((x) => x.slug === slug);
    return m ? fromSeed(m) : null;
  }

  const db = getDb();
  const [m] = await db
    .select()
    .from(schema.carModels)
    .where(
      and(
        eq(schema.carModels.slug, slug),
        eq(schema.carModels.published, true),
      ),
    )
    .limit(1);
  if (!m) return null;

  const units = await db
    .select({ status: schema.cars.status })
    .from(schema.cars)
    .where(eq(schema.cars.modelId, m.id));
  return fromRow(m, units);
}

/**
 * Slugs for the sitemap, each with the date its listing last changed.
 *
 * `updatedAt` is what makes `<lastmod>` a fact rather than noise: a sitemap
 * that stamps "changed just now" on every URL at every fetch trains Google to
 * ignore the field entirely, and then a genuinely updated price or photo takes
 * as long to be recrawled as an untouched page. The seed fallback has no
 * timestamps and returns null, which the sitemap renders as no `<lastmod>` at
 * all — an absent date is honest, an invented one is not.
 */
export async function getFleetSitemapEntries(): Promise<
  { slug: string; updatedAt: Date | null }[]
> {
  if (!usingDb()) {
    return [...FLEET]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((m) => ({ slug: m.slug, updatedAt: null }));
  }

  const db = getDb();
  const rows = await db
    .select({
      slug: schema.carModels.slug,
      updatedAt: schema.carModels.updatedAt,
    })
    .from(schema.carModels)
    .where(eq(schema.carModels.published, true))
    .orderBy(asc(schema.carModels.sortOrder));

  return rows.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt ?? null }));
}
