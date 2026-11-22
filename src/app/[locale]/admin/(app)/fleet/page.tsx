import { getTranslations, setRequestLocale } from "next-intl/server";
import { pick } from "@/lib/i18n-pick";
import { guardPage } from "@/lib/auth/guard";
import { Link } from "@/i18n/navigation";
import { listFleet } from "@/lib/admin/fleet";
import { CATEGORY_LABEL, type Category } from "@/lib/admin/fleet-options";
import { formatPln } from "@/lib/format";

export default async function FleetPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  /*
    Kontrola uprawnień przy renderze strony — obok kontroli w każdej akcji,
    nie zamiast niej. Bez tego pracownik wpisujący adres z ręki zobaczyłby
    treść sekcji, której nie wolno mu oglądać, i dopiero pierwszy przycisk
    powiedziałby mu „nie wolno".
  */
  await guardPage("flota.podglad");

  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Admin.fleet");
  const models = await listFleet();

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-ink text-2xl">{t("title")}</h1>
          <p className="text-silver mt-1 text-sm">
            {t("modelCount", { count: models.length })}
          </p>
        </div>
        <Link
          href="/admin/fleet/new"
          className="label bg-red hover:bg-red-hover inline-flex h-11 items-center px-6 text-xs text-white transition-colors"
        >
          {t("addModel")}
        </Link>
      </header>

      {models.length === 0 ? (
        <p className="border-line bg-graphite/40 text-silver border p-10 text-center text-sm">
          {t("empty")}
        </p>
      ) : (
        <div className="border-line overflow-x-auto border">
          <table className="w-full min-w-3xl border-collapse text-sm">
            <thead>
              <tr className="border-line bg-graphite/60 border-b text-left">
                <th className="label-tight text-ink-faint px-4 py-3 text-[10px] font-normal">
                  {t("colModel")}
                </th>
                <th className="label-tight text-ink-faint px-4 py-3 text-[10px] font-normal">
                  {t("colYear")}
                </th>
                <th className="label-tight text-ink-faint px-4 py-3 text-[10px] font-normal">
                  {t("colSegment")}
                </th>
                <th className="label-tight text-ink-faint px-4 py-3 text-right text-[10px] font-normal">
                  {t("colPrice")}
                </th>
                <th className="label-tight text-ink-faint px-4 py-3 text-[10px] font-normal">
                  {t("colUnits")}
                </th>
                <th className="label-tight text-ink-faint px-4 py-3 text-[10px] font-normal">
                  {t("colStatus")}
                </th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr
                  key={m.id}
                  className="border-line/60 hover:bg-ink/5 border-b transition-colors last:border-0"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={{
                        pathname: "/admin/fleet/[id]",
                        params: { id: m.id },
                      }}
                      className="text-ink tap-area -my-2 inline-block py-2 underline-offset-4 hover:underline"
                    >
                      {m.brand} {m.model}
                    </Link>
                    <span className="text-ink-faint ml-2 font-mono text-xs">
                      {m.slug}
                    </span>
                  </td>
                  <td className="text-silver px-4 py-3">{m.year}</td>
                  <td className="text-silver px-4 py-3">
                    {CATEGORY_LABEL[m.category as Category] ? pick(CATEGORY_LABEL[m.category as Category], locale) : m.category}
                  </td>
                  <td className="text-ink px-4 py-3 text-right">
                    {formatPln(m.dailyPriceGrosze, locale)}
                  </td>
                  <td className="text-silver px-4 py-3">
                    {/* Wolne DZIŚ, nie „ze sprawnym statusem". Auto wydane
                        klientowi liczyło się dotąd jako dostępne, więc kolumna
                        pokazywała stan floty, którego nie było. */}
                    <span className="text-ink">{m.units.freeToday}</span>
                    <span className="text-ink-faint">
                      {" "}
                      {t("freeTodayOf", { total: m.units.total })}
                    </span>
                    {m.units.reservedToday > 0 && (
                      <span
                        className="label-tight border-line text-ink-faint ml-2 border px-2 py-0.5 text-[10px]"
                        title={t("reservedTitle")}
                      >
                        {t("reservedBadge", { count: m.units.reservedToday })}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {m.published ? (
                      <span className="label-tight border-line text-silver border px-2 py-1 text-[10px]">
                        {t("published")}
                      </span>
                    ) : (
                      <span className="label-tight border-line text-ink-faint border px-2 py-1 text-[10px]">
                        {t("hidden")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
