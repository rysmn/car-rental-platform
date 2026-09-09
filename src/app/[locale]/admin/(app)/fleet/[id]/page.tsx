import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getModelWithUnits } from "@/lib/admin/fleet";
import { listModelBlocks } from "@/lib/admin/availability";
import { listExpensesByModel } from "@/lib/admin/expenses";
import { listRecurringByModel } from "@/lib/admin/recurring";
import { DAMAGE_STATUS_LABEL, listDamages } from "@/lib/admin/damages";
import { ModelForm } from "../ModelForm";
import { UnitRow, AddUnit } from "../UnitManager";
import { ImageManager } from "../ImageManager";
import { BlockManager } from "../BlockManager";
import { FeatureManager } from "../FeatureManager";
import { DeleteModelButton } from "../DeleteModelButton";
import { updateModel } from "../actions";
import { DeadlineManager } from "../DeadlineManager";
import { listDeadlines } from "@/lib/admin/deadlines";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditModelPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  if (!UUID_RE.test(id)) notFound();
  const data = await getModelWithUnits(id);
  if (!data) notFound();
  const { model, units } = data;
  // One query for every unit's costs rather than one per unit — the page can
  // hold half a dozen cars.
  const [blocks, expenses, recurring, deadlineRows, allDamages] =
    await Promise.all([
      listModelBlocks(model.id),
      listExpensesByModel(model.id),
      listRecurringByModel(model.id),
      Promise.all(units.map((u) => listDeadlines(u.id))),
      listDamages(),
    ]);
  // Otwarte szkody tego modelu. Filtrowane po egzemplarzach strony, nie
  // zapytaniem na auto — flota ma kilkanaście sztuk, a N zapytań na stronę
  // wraca w każdym rachunku wydajności jako pierwsze.
  const unitIds = new Set(units.map((u) => u.id));
  const openDamages = allDamages.filter(
    (d) => d.status !== "closed" && unitIds.has(d.carId),
  );
  const deadlines = Object.fromEntries(
    units.map((u, i) => [u.id, deadlineRows[i] ?? []]),
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-4xl">
      <Link
        href="/admin/fleet"
        className="-my-2 inline-flex min-h-11 items-center label-tight text-ink-faint text-[10px] transition-colors hover:text-ink"
      >
        ← Flota
      </Link>
      <h1 className="font-heading mt-4 mb-8 text-2xl text-ink">
        {model.brand} {model.model}
      </h1>

      <ModelForm action={updateModel} model={model} />

      <ImageManager modelId={model.id} images={model.images ?? []} />

      <FeatureManager modelId={model.id} features={model.features ?? []} />

      <section className="mt-14">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="label text-xs text-ink">Egzemplarze</h2>
            <p className="text-ink-faint text-xs">
              Fizyczne auta tego modelu — rezerwacje dotyczą konkretnego
              egzemplarza.
            </p>
          </div>
        </div>

        <div className="border-line bg-graphite/40 border px-5">
          {units.length === 0 ? (
            <p className="text-silver py-6 text-center text-sm">
              Brak egzemplarzy. Dodaj pierwszy poniżej.
            </p>
          ) : (
            units.map((u) => (
              <div key={u.id} className="flex flex-col gap-3">
                <UnitRow
                  unit={u}
                  expenses={expenses[u.id] ?? []}
                  recurring={recurring[u.id] ?? []}
                  damages={openDamages
                    .filter((d) => d.carId === u.id)
                    .map((d) => ({
                      id: d.id,
                      title: d.title,
                      statusLabel: DAMAGE_STATUS_LABEL[d.status],
                    }))}
                />
                {/* Dated obligations for THIS unit. Anything added here shows
                    up in ALERTY on its date — that is the whole wiring. */}
                <DeadlineManager
                  carId={u.id}
                  plate={u.plate}
                  today={today}
                  deadlines={(deadlines[u.id] ?? []).map((d) => ({
                    id: d.id,
                    kind: d.kind,
                    title: d.title,
                    dueOn: String(d.dueOn).slice(0, 10),
                    amountGrosze: d.amountGrosze,
                    note: d.note,
                    doneAt: d.doneAt ? String(d.doneAt) : null,
                  }))}
                />
              </div>
            ))
          )}
        </div>

        <div className="mt-4">
          <AddUnit modelId={model.id} />
        </div>
      </section>

      <BlockManager
        modelId={model.id}
        units={units.map((u) => ({ id: u.id, plate: u.plate }))}
        blocks={blocks}
      />

      <section className="border-line mt-14 border-t pt-8">
        <h2 className="label text-red mb-1 text-xs">Strefa niebezpieczna</h2>
        <p className="text-ink-faint mb-4 text-xs">
          Usunięcie jest możliwe tylko, gdy model nie ma egzemplarzy ani
          rezerwacji. W innym wypadku ukryj model, odznaczając „Opublikowany”.
        </p>
        <DeleteModelButton id={model.id} />
      </section>
    </div>
  );
}
