import { getTranslations, setRequestLocale } from "next-intl/server";
import { guardPage } from "@/lib/auth/guard";
import { listCustomers } from "@/lib/admin/customers";
import {
  CUSTOMER_FLAG_LABEL,
  CUSTOMER_FLAG_TONE,
} from "@/lib/admin/customer-flags";
import { formatDatePl } from "@/lib/format";
import { pickFrom } from "@/lib/i18n-pick";
import { Link } from "@/i18n/navigation";
import { CustomerForm } from "./CustomerForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.customers" });
  return { title: t("metaTitle") };
}

export default async function CustomersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await guardPage("klienci.podglad");
  const t = await getTranslations("Admin.customers");

  const customers = await listCustomers();

  return (
    <div>
      <h1 className="font-heading text-3xl font-bold">{t("title")}</h1>
      <p className="text-ink-muted mt-2 max-w-2xl text-sm">{t("intro")}</p>

      <div className="mt-8 max-w-3xl">
        <CustomerForm />
      </div>

      <section className="mt-12">
        <h2 className="label text-xs text-ink">
          {t("inDatabase", { count: customers.length })}
        </h2>
        {customers.length === 0 ? (
          <p className="border-line bg-graphite/40 text-silver mt-4 border p-8 text-center text-sm">
            {t("empty")}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-line text-ink-faint border-y">
                  <th className="label-tight py-3 pr-6 text-[10px]">{t("colCustomer")}</th>
                  <th className="label-tight py-3 pr-6 text-[10px]">{t("colPhone")}</th>
                  <th className="label-tight py-3 pr-6 text-[10px]">{t("colEmail")}</th>
                  <th className="label-tight py-3 pr-6 text-[10px]">{t("colRentals")}</th>
                  <th className="label-tight py-3 pr-6 text-[10px]">{t("colDamages")}</th>
                  <th className="label-tight py-3 text-[10px]">{t("colLast")}</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-line border-b">
                    <td className="py-3 pr-6 text-ink">
                      <Link
                        href={{
                          pathname: "/admin/customers/[id]",
                          params: { id: c.id },
                        }}
                        className="tap-area -my-2 inline-block py-2 underline-offset-4 hover:underline"
                      >
                        {c.name}
                      </Link>
                      {c.flag !== "none" && (
                        <span
                          className={`label-tight ml-2 border px-2 py-0.5 text-[10px] ${CUSTOMER_FLAG_TONE[c.flag]}`}
                        >
                          {pickFrom(CUSTOMER_FLAG_LABEL, c.flag, locale)}
                        </span>
                      )}
                      {c.notes && (
                        <span className="text-ink-faint ml-2 text-xs">
                          {c.notes}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-6 whitespace-nowrap">
                      {/* `.tap-area`, nie `.tap`: numer stoi w komórce tabeli,
                          więc powiększenie samego elementu rozepchnęłoby wiersz.
                          Pole trafienia rośnie do 44 px, wygląd zostaje. */}
                      <a
                        href={`tel:${c.phone}`}
                        className="text-silver hover:text-red tap-area transition-colors"
                      >
                        {c.phoneDisplay}
                      </a>
                    </td>
                    <td className="text-silver py-3 pr-6">{c.email ?? "—"}</td>
                    <td className="text-silver py-3 pr-6 tabular-nums">
                      {c.rentals}
                    </td>
                    {/* Otwarte szkody na czerwono, zamknięte szarym: pierwsza
                        liczba mówi „uwaga przy wydaniu", druga tylko „to się
                        kiedyś zdarzyło". */}
                    <td className="py-3 pr-6 tabular-nums">
                      {c.damages === 0 ? (
                        <span className="text-ink-faint">—</span>
                      ) : (
                        <span
                          className={
                            c.damagesOpen > 0 ? "text-red" : "text-silver"
                          }
                        >
                          {c.damagesOpen > 0
                            ? t("damagesWithOpen", {
                                total: c.damages,
                                open: c.damagesOpen,
                              })
                            : c.damages}
                        </span>
                      )}
                    </td>
                    <td className="text-silver py-3 whitespace-nowrap tabular-nums">
                      {c.lastRentalOn ? formatDatePl(c.lastRentalOn) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
