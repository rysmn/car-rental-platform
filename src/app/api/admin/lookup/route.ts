import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { currentAdmin } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { findCustomerByPhone } from "@/lib/admin/customers";
import { getFeeCatalog } from "@/lib/booking/repo";
import { computeQuote, rentalDays } from "@/lib/booking/pricing";
import { eq } from "drizzle-orm";
import { schema } from "@/lib/db";
import { getSetting } from "@/lib/admin/settings";
import {
  okresPytania,
  zajetoscBloku,
  zajetoscRezerwacji,
} from "@/lib/booking/bufor";

/**
 * The two lookups the booking form does while the operator is still typing.
 *
 * `?phone=` finds a returning customer; `?from=&to=` lists the models that
 * actually have a free unit for those dates. Both are behind the admin
 * session — a phone number is personal data, and free-fleet counts tell an
 * outsider exactly when the yard is empty.
 *
 * Availability here is advisory: it fills the dropdown. The booking itself is
 * still allocated inside a transaction against the same conditions, because
 * between this call and the save somebody else can take the last car.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await currentAdmin())) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const phone = url.searchParams.get("phone");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (phone) {
    const customer = await findCustomerByPhone(phone);
    return NextResponse.json({ customer });
  }

  // Checked BEFORE the availability branch below: a quote request carries
  // `from` and `to` as well, and matching the wrong branch first returned a
  // list of models to a caller that was asking the price.
  //
  // A live, AUTHORITATIVE quote for whatever is selected right now. Computed
  // by the same function that will price the booking on save, rather than
  // reimplementing the tier ladder in the browser — an operator quoting one
  // number down the phone while the system charges another is worse than
  // showing no number at all.
  const quoteFor = url.searchParams.get("quote");
  if (quoteFor && from && to) {
    const db = getDb();
    const [model] = await db
      .select()
      .from(schema.carModels)
      .where(eq(schema.carModels.id, quoteFor))
      .limit(1);
    const locationId = url.searchParams.get("locationId") ?? "";
    const [loc] = locationId
      ? await db
          .select()
          .from(schema.pickupLocations)
          .where(eq(schema.pickupLocations.id, locationId))
          .limit(1)
      : [];
    if (!model || !loc) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const days = rentalDays(
      new Date(`${from}T00:00:00Z`),
      new Date(`${to}T00:00:00Z`),
    );
    const quote = computeQuote({
      dailyPriceGrosze: model.dailyPriceGrosze,
      dailyPrice3to6Grosze: model.dailyPrice3to6Grosze ?? null,
      dailyPrice7to13Grosze: model.dailyPrice7to13Grosze ?? null,
      dailyPrice14to29Grosze: model.dailyPrice14to29Grosze ?? null,
      monthlyPriceGrosze: model.monthlyPriceGrosze,
      depositGrosze: model.depositGrosze,
      kmPerDayLimit: model.kmPerDayLimit,
      extraMileageFeeGrosze: model.extraMileageFeeGrosze,
      cancellationPolicy: await getSetting("cancellation"),
      days,
      locationFeeGrosze: loc.feeGrosze,
      extras: {
        extraDriver: url.searchParams.get("extraDriver") === "1",
        childSeat: url.searchParams.get("childSeat") === "1",
        protectionPackage: url.searchParams.get("protectionPackage") === "1",
      },
      depositVariant:
        url.searchParams.get("depositVariant") === "no_deposit"
          ? "no_deposit"
          : "with_deposit",
      fees: await getFeeCatalog(),
    });

    return NextResponse.json({ days, quote });
  }

  if (
    from &&
    to &&
    /^\d{4}-\d{2}-\d{2}$/.test(from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(to)
  ) {
    const rows = (await getDb().execute(sql`
      SELECT cm.id,
             cm.brand || ' ' || cm.model AS name,
             cm.daily_price_grosze AS daily,
             COUNT(c.id) FILTER (
               WHERE c.status = 'available'
                 AND NOT EXISTS (
                   SELECT 1 FROM reservations r
                   WHERE r.car_id = c.id AND r.status IN ('confirmed','completed')
                     AND ${zajetoscRezerwacji("r")} && ${okresPytania(from, to)})
                 AND NOT EXISTS (
                   SELECT 1 FROM availability_blocks ab
                   WHERE ab.car_id = c.id
                     AND ${zajetoscBloku("ab")} && ${okresPytania(from, to)})
             ) AS free
      FROM car_models cm
      LEFT JOIN cars c ON c.model_id = cm.id
      WHERE cm.published = true
      GROUP BY cm.id, cm.brand, cm.model, cm.daily_price_grosze
      ORDER BY cm.brand, cm.model
    `)) as unknown as
      Record<string, unknown>[] | { rows?: Record<string, unknown>[] };
    const list = Array.isArray(rows) ? rows : (rows.rows ?? []);

    return NextResponse.json({
      models: list.map((m) => ({
        id: String(m.id),
        name: String(m.name),
        dailyPriceGrosze: Number(m.daily) || 0,
        free: Number(m.free) || 0,
      })),
    });
  }

  return NextResponse.json({ error: "bad_request" }, { status: 400 });
}
