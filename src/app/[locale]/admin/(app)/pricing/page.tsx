import { setRequestLocale } from "next-intl/server";
import { guardPage } from "@/lib/auth/guard";
import { listPricing } from "@/lib/admin/pricing";
import {
  ModelPriceRow,
  FeeRow,
  LocationRow,
  CancellationPolicyForm,
} from "./PricingForms";
import { getSetting } from "@/lib/admin/settings";

export default async function PricingPage({
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
  await guardPage("ceny.zmien");

  const { locale } = await params;
  setRequestLocale(locale);
  const { models, fees, locations } = await listPricing();
  const cancellation = await getSetting("cancellation");

  return (
    <div className="max-w-4xl">
      <header className="mb-8">
        <h1 className="font-heading text-2xl text-ink">Cennik</h1>
        <p className="text-silver mt-1 text-sm">
          Zmiany dotyczą tylko nowych rezerwacji. Złożone rezerwacje mają
          zapisaną własną wycenę.
        </p>
      </header>

      <Section title="Ceny aut" subtitle="Stawka dobowa, miesięczna i kaucja">
        {models.length === 0 ? (
          <Empty>Brak modeli.</Empty>
        ) : (
          models.map((m) => <ModelPriceRow key={m.id} model={m} />)
        )}
      </Section>

      <Section
        title="Opłaty dodatkowe"
        subtitle="Dopłaty doliczane w kalkulatorze rezerwacji"
      >
        {fees.length === 0 ? (
          <Empty>Brak zdefiniowanych opłat.</Empty>
        ) : (
          fees.map((f) => <FeeRow key={f.id} fee={f} />)
        )}
      </Section>

      <Section
        title="Anulowanie rezerwacji"
        subtitle="Progi godzinowe, opłaty i tolerancja nieodebrania auta"
      >
        <CancellationPolicyForm policy={cancellation} />
      </Section>

      <Section
        title="Miejsca odbioru"
        subtitle="Opłata za odbiór poza siedzibą"
      >
        {locations.length === 0 ? (
          <Empty>Brak lokalizacji.</Empty>
        ) : (
          locations.map((l) => <LocationRow key={l.id} location={l} />)
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <div className="mb-2">
        <h2 className="label text-xs text-ink">{title}</h2>
        <p className="text-ink-faint text-xs">{subtitle}</p>
      </div>
      <div className="border-line bg-graphite/40 border px-5">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-silver py-6 text-center text-sm">{children}</p>;
}
