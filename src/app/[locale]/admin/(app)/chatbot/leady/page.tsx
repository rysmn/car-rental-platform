import { getTranslations, setRequestLocale } from "next-intl/server";
import { listLeads } from "@/lib/chat/repo";
import { formatDateTimePl } from "@/lib/format";
import { formatBudgetPl } from "@/lib/inbox/summary";
import { ChatbotTabs } from "../ChatbotTabs";
import { LeadRow, type LeadView } from "./LeadRow";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.chatbot" });
  return { title: t("leads.metaTitle") };
}

export default async function LeadsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Admin.chatbot");

  const rows = await listLeads(200);
  const leads: LeadView[] = rows.map((l) => ({
    id: l.id,
    name: l.name,
    phone: l.phone,
    email: l.email,
    car: l.carBrand ? `${l.carBrand} ${l.carModel}` : null,
    dateFrom: l.dateFrom ? String(l.dateFrom).slice(0, 10) : null,
    dateTo: l.dateTo ? String(l.dateTo).slice(0, 10) : null,
    location: l.locationName,
    topic: l.topic,
    seats: l.seats,
    // Ten sam wiersz co w Skrzynce i w mailu — jedna funkcja układa go dla
    // wszystkich trzech, więc „za całość" nie może gdzieś zniknąć.
    budget: formatBudgetPl(l, locale),
    lang: l.leadLocale,
    question: l.question,
    status: l.status,
    note: l.note,
    // Formatted on the server: the value depends on the timezone, and letting
    // the browser format it would make the server render and the hydration
    // disagree.
    createdLabel: formatDateTimePl(l.createdAt),
    conversationId: l.conversationId,
  }));

  const open = leads.filter((l) => l.status !== "closed").length;

  return (
    <div className="max-w-5xl">
      <header className="mb-6">
        <h1 className="font-heading text-ink text-2xl font-bold">{t("leads.title")}</h1>
        <p className="text-silver mt-1 text-sm">
          {t("leads.subtitle")}
        </p>
      </header>

      <ChatbotTabs active="/admin/chatbot/leady" />

      {leads.length === 0 ? (
        <p className="border-line text-silver border px-5 py-8 text-center text-sm">
          {t("leads.empty")}
        </p>
      ) : (
        <>
          <p className="text-ink-faint mb-4 text-xs">
            {t("leads.count", { count: leads.length, open })}
          </p>
          <div className="border-line border">
            {leads.map((l) => (
              <LeadRow key={l.id} lead={l} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
