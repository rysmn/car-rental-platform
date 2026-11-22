import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { guardPage } from "@/lib/auth/guard";
import { Link } from "@/i18n/navigation";
import {
  DAMAGE_STATUS_TONE,
  getDamage,
  listCarChoices,
  listReservationChoices,
  ourCostGrosze,
} from "@/lib/admin/damages";
import { DamageForm } from "../DamageForm";
import { PhotoManager } from "../PhotoManager";
import { formatPln } from "@/lib/format";
import { formatDateTimeLocale, formatIsoDate } from "../../finanse/date-format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.damages" });
  return { title: t("detailTitle") };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DamageDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await guardPage("wydania.prowadz");
  const t = await getTranslations("Admin.damages");

  if (!UUID_RE.test(id)) notFound();
  const [damage, cars, reservations] = await Promise.all([
    getDamage(id),
    listCarChoices(),
    listReservationChoices(),
  ]);
  if (!damage) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/admin/szkody"
        className="label-tight text-ink-faint hover:text-ink -my-2 inline-flex min-h-11 items-center text-[10px] transition-colors"
      >
        {t("detail.back")}
      </Link>

      <header className="mt-4 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-ink text-2xl">{damage.title}</h1>
          <p className="text-silver mt-1 text-sm">
            {damage.car}
            {damage.plate ? ` · ${damage.plate}` : ""} ·{" "}
            {formatIsoDate(damage.occurredOn, locale)}
          </p>
        </div>
        <span
          className={`label-tight border px-2 py-1 text-[10px] ${DAMAGE_STATUS_TONE[damage.status]}`}
        >
          {t(`status.${damage.status}`)}
        </span>
      </header>

      <section className="border-line bg-graphite/40 mb-6 grid gap-4 border p-6 sm:grid-cols-3">
        <Figure
          label={t("detail.repairCost")}
          value={formatPln(damage.repairCostGrosze, locale)}
        />
        <Figure
          label={t("detail.ours")}
          value={formatPln(ourCostGrosze(damage), locale)}
          hint={
            damage.insurer?.trim()
              ? t("detail.oursHintInsurer", { insurer: damage.insurer })
              : t("detail.oursHintNone")
          }
        />
        <Figure
          label={t("detail.rental")}
          value={damage.reference ?? t("detail.noRental")}
          hint={damage.customerName ?? undefined}
          href={
            damage.reservationId
              ? { pathname: "/admin/reservations/[id]" as const, params: { id: damage.reservationId } }
              : undefined
          }
        />
      </section>

      <section className="border-line bg-graphite/40 mb-6 border p-6">
        <h2 className="label-tight text-ink-faint mb-4 text-[10px]">
          {t("detail.photos")}
        </h2>
        <PhotoManager damageId={damage.id} photos={damage.photos} />
      </section>

      <section className="border-line bg-graphite/40 border p-6">
        <h2 className="label-tight text-ink-faint mb-4 text-[10px]">
          {t("detail.case")}
        </h2>
        <DamageForm cars={cars} reservations={reservations} existing={damage} />
      </section>

      <p className="text-ink-faint mt-4 text-[11px]">
        {t("detail.opened", {
          date: formatDateTimeLocale(damage.createdAt, locale),
        })}
        {damage.closedAt
          ? t("detail.closed", {
              date: formatDateTimeLocale(damage.closedAt, locale),
            })
          : ""}
      </p>
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: { pathname: "/admin/reservations/[id]"; params: { id: string } };
}) {
  const body = (
    <>
      <p className="label-tight text-ink-faint text-[10px]">{label}</p>
      <p className="font-heading text-ink mt-1 text-lg tabular-nums">{value}</p>
      {hint && <p className="text-ink-faint mt-1 text-[11px]">{hint}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="hover:bg-ink/5 -m-2 block p-2 transition-colors">
      {body}
    </Link>
  ) : (
    <div>{body}</div>
  );
}
