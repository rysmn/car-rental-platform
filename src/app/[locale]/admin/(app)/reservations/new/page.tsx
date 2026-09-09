import { setRequestLocale } from "next-intl/server";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { guardPage } from "@/lib/auth/guard";
import { Link } from "@/i18n/navigation";
import { NewReservationForm, type Prefill } from "./NewReservationForm";
import { getReservation } from "@/lib/admin/reservations";

export const metadata = { title: "Nowa rezerwacja" };

/**
 * The phone-call page.
 *
 * Everything here is in service of one number: the time between "do you have
 * something for Friday" and a booking that blocks the calendar. The models and
 * locations are loaded up front so the form is one screen with no lookups, and
 * the price is deliberately NOT asked for — it is computed from the same
 * catalogue the public site uses, so a phone booking cannot quietly cost a
 * different amount than the website would have charged.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewReservationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await guardPage("rezerwacje.status");

  // `?kopia=<id>` — „Kopiuj rezerwację" ze strony poprzedniego najmu.
  const sp = await searchParams;
  const kopia = typeof sp.kopia === "string" && UUID_RE.test(sp.kopia) ? sp.kopia : null;

  const db = getDb();
  const [models, locations] = await Promise.all([
    db
      .select({
        id: schema.carModels.id,
        brand: schema.carModels.brand,
        model: schema.carModels.model,
        dailyPriceGrosze: schema.carModels.dailyPriceGrosze,
        depositGrosze: schema.carModels.depositGrosze,
      })
      .from(schema.carModels)
      .where(eq(schema.carModels.published, true))
      .orderBy(asc(schema.carModels.brand), asc(schema.carModels.model)),
    db
      .select({
        id: schema.pickupLocations.id,
        name: schema.pickupLocations.name,
        feeGrosze: schema.pickupLocations.feeGrosze,
      })
      .from(schema.pickupLocations)
      .where(eq(schema.pickupLocations.active, true))
      .orderBy(asc(schema.pickupLocations.sortOrder)),
  ]);

  const source = kopia ? await getReservation(kopia) : null;
  const prefill: Prefill | undefined = source
    ? {
        customerPhone: source.r.customerPhone,
        customerName: source.r.customerName,
        customerEmail: source.r.customerEmail,
        modelId: source.r.carModelId,
        locationId: source.r.pickupLocationId,
        extraDriver: source.r.extraDriver,
        childSeat: source.r.childSeat,
        protectionPackage: source.r.protectionPackage,
        depositVariant: source.r.depositVariant,
      }
    : undefined;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold">Nowa rezerwacja</h1>
          <p className="text-ink-muted mt-2 max-w-2xl text-sm">
            Rezerwacja przyjęta przez telefon. Cena liczy się sama z cennika —
            tak jak na stronie. Adres, data urodzenia i numer prawa jazdy
            uzupełnisz później na stronie rezerwacji, przy podpisaniu umowy.
          </p>
        </div>
        <Link
          href="/admin"
          className="-my-2 inline-flex min-h-11 items-center label-tight text-silver text-[10px] transition-colors hover:text-ink"
        >
          ← Pulpit
        </Link>
      </div>

      <div className="mt-8 max-w-3xl">
        {prefill && (
          <p className="border-line bg-graphite/40 text-silver mb-6 border p-4 text-sm">
            Kopia najmu <span className="font-mono">{source?.r.reference}</span>{" "}
            — klient, auto, miejsce odbioru i dodatki są już wpisane.{" "}
            <strong className="text-ink">Terminu nie kopiujemy</strong>, bo po to
            jest ten telefon.
          </p>
        )}
        <NewReservationForm
          models={models}
          locations={locations}
          prefill={prefill}
        />
      </div>
    </div>
  );
}
