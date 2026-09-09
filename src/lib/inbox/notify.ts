import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { notifyNewRequest } from "@/lib/email/notify";
import { summariseAsText, subjectFor, type LeadFacts } from "./summary";

/**
 * Jedno zgłoszenie = JEDEN e-mail do obsługi.
 *
 * DLACZEGO ZASUWKA W BAZIE, A NIE `if` W KODZIE. Wysyłkę uruchamiają dwie
 * niezależne ścieżki (czat i formularz publiczny), obie w `after()`, obie
 * mogące pobiec dwa razy: podwójne kliknięcie, ponowione żądanie, przeglądarka
 * wysyłająca formularz drugi raz po powrocie wstecz. Warunek w pamięci procesu
 * nie broni przed niczym z tej listy — dwa równoległe wywołania sprawdzą
 * „czy już wysłano" zanim którekolwiek zdąży odpowiedzieć „tak".
 *
 * Dlatego prawo do wysłania ZDOBYWA SIĘ, a nie sprawdza:
 *
 *     UPDATE chat_leads SET notified_at = now()
 *      WHERE id = $1 AND notified_at IS NULL
 *   RETURNING id
 *
 * Postgres wykona to atomowo. Wygrywa dokładnie jedno wywołanie — drugie nie
 * trafia w żaden wiersz, dostaje pustą listę i milknie. Bez blokad, bez
 * transakcji rozciągniętej na czas odpowiedzi dostawcy poczty.
 *
 * Cena tego rozwiązania jest świadoma: gdy wysyłka padnie PO zdobyciu zasuwki,
 * powiadomienie przepada i nie zostanie ponowione. To jest właściwa strona
 * błędu — zgłoszenie leży w skrzynce, awaria poczty podnosi alert, a klient nie
 * traci nic. Ponawianie kosztowałoby czasem drugiego maila o tej samej
 * sprawie, czyli dokładnie to, czego ten etap zabrania.
 */
export async function notifyInboxLead(id: string): Promise<boolean> {
  const db = getDb();

  const claimed = await db
    .update(schema.chatLeads)
    .set({ notifiedAt: new Date() })
    .where(and(eq(schema.chatLeads.id, id), isNull(schema.chatLeads.notifiedAt)))
    .returning({ id: schema.chatLeads.id });

  if (claimed.length === 0) return false;

  const [row] = await db
    .select({
      name: schema.chatLeads.name,
      phone: schema.chatLeads.phone,
      email: schema.chatLeads.email,
      subject: schema.chatLeads.subject,
      question: schema.chatLeads.question,
      dateFrom: schema.chatLeads.dateFrom,
      dateTo: schema.chatLeads.dateTo,
      seats: schema.chatLeads.seats,
      budgetGrosze: schema.chatLeads.budgetGrosze,
      budgetMinGrosze: schema.chatLeads.budgetMinGrosze,
      budgetKind: schema.chatLeads.budgetKind,
      budgetCurrency: schema.chatLeads.budgetCurrency,
      budgetPlnPerEur: schema.chatLeads.budgetPlnPerEur,
      locale: schema.chatLeads.locale,
      status: schema.chatLeads.status,
      source: schema.chatLeads.source,
      reason: schema.chatLeads.reason,
      company: schema.chatLeads.company,
      partnerModel: schema.chatLeads.partnerModel,
      investRange: schema.chatLeads.investRange,
      carBrand: schema.carModels.brand,
      carModel: schema.carModels.model,
      locationName: schema.pickupLocations.name,
      reservationRef: schema.reservations.reference,
    })
    .from(schema.chatLeads)
    .leftJoin(
      schema.carModels,
      eq(schema.carModels.id, schema.chatLeads.carModelId),
    )
    .leftJoin(
      schema.pickupLocations,
      eq(schema.pickupLocations.id, schema.chatLeads.locationId),
    )
    .leftJoin(
      schema.reservations,
      eq(schema.reservations.id, schema.chatLeads.reservationId),
    )
    .where(eq(schema.chatLeads.id, id))
    .limit(1);

  if (!row) return false;

  const facts: LeadFacts = {
    name: row.name,
    phone: row.phone,
    email: row.email,
    car: row.carBrand ? `${row.carBrand} ${row.carModel}` : null,
    dateFrom: row.dateFrom ? String(row.dateFrom).slice(0, 10) : null,
    dateTo: row.dateTo ? String(row.dateTo).slice(0, 10) : null,
    location: row.locationName,
    seats: row.seats,
    budgetGrosze: row.budgetGrosze,
    budgetMinGrosze: row.budgetMinGrosze,
    budgetKind: row.budgetKind,
    budgetCurrency: row.budgetCurrency,
    budgetPlnPerEur: row.budgetPlnPerEur,
    locale: row.locale,
    subject: row.subject,
    question: row.question,
    reason: row.reason,
    company: row.company,
    partnerModel: row.partnerModel,
    investRange: row.investRange,
    source: row.source,
    status: row.status,
    reservationRef: row.reservationRef,
  };

  await notifyNewRequest({
    id,
    subject: subjectFor({
      reason: facts.reason,
      car: facts.car,
      subject: facts.subject,
    }),
    summary: summariseAsText(facts),
    name: facts.name,
    phone: facts.phone,
    email: facts.email,
    locale: facts.locale === "en" ? "en" : "pl",
    source: facts.source,
  });

  return true;
}
