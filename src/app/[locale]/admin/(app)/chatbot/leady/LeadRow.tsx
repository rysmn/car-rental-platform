"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { updateLead, type LeadResult } from "../actions";

const STATUS_VALUES = ["new", "contact", "offer", "reservation", "closed"];

export type LeadView = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  car: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  location: string | null;
  topic: string | null;
  /* What the conversation established, so the operator opens the call knowing
     it. Every one of these is nullable: an older lead has none of them, and a
     blank is honest where an invented default would not be. */
  seats: number | null;
  /** Gotowy wiersz budżetu, ułożony przez `formatBudgetPl`. */
  budget: string | null;
  lang: string | null;
  question: string | null;
  status: string;
  note: string | null;
  createdLabel: string;
  conversationId: string | null;
};

/**
 * One lead, with the two things an operator changes: where it stands and what
 * they noted. Everything else is read-only — a lead is a record of what a
 * customer said, not a form to rewrite.
 */
export function LeadRow({ lead }: { lead: LeadView }) {
  const t = useTranslations("Admin.chatbot");
  const [state, action, pending] = useActionState<LeadResult | null, FormData>(
    updateLead,
    null,
  );
  const [open, setOpen] = useState(false);

  return (
    <div className="border-line/60 border-b px-4 py-4 last:border-0">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-ink-faint w-32 shrink-0 text-xs">
          {lead.createdLabel}
        </span>
        <span className="text-ink min-w-[8rem] text-sm">
          {lead.name ?? "—"}
        </span>
        {lead.phone && (
          <a
            href={`tel:${lead.phone.replace(/\s/g, "")}`}
            className="text-silver tap-area text-xs underline underline-offset-2"
          >
            {lead.phone}
          </a>
        )}
        {lead.email && (
          <a
            href={`mailto:${lead.email}`}
            className="text-silver tap-area text-xs underline underline-offset-2"
          >
            {lead.email}
          </a>
        )}
        {lead.car && <span className="text-ink-faint text-xs">{lead.car}</span>}
        {lead.dateFrom && (
          <span className="text-ink-faint text-xs tabular-nums">
            {lead.dateFrom}
            {lead.dateTo ? ` → ${lead.dateTo}` : ""}
          </span>
        )}
        {lead.location && (
          <span className="text-ink-faint text-xs">{lead.location}</span>
        )}
        {lead.seats !== null && (
          <span className="text-ink-faint text-xs">{t("leads.seats", { count: lead.seats })}</span>
        )}
        {lead.budget !== null && (
          <span className="text-ink-faint text-xs tabular-nums">
            {lead.budget}
          </span>
        )}
        {lead.lang && lead.lang !== "pl" && (
          <span className="label-tight border-line text-ink-faint border px-1.5 text-[10px] uppercase">
            {lead.lang}
          </span>
        )}
        <span className="ml-auto flex items-center gap-3">
          <span className="border-line text-ink-faint border px-2 text-[10px]">
            {t.has(`leadStatus.${lead.status}`)
              ? t(`leadStatus.${lead.status}`)
              : lead.status}
          </span>
          {lead.conversationId && (
            <a
              href={`/admin/chatbot/rozmowy?rozmowa=${lead.conversationId}`}
              className="text-ink-faint hover:text-ink text-xs"
            >
              {t("leads.conversation")}
            </a>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-ink-faint hover:text-ink text-xs"
          >
            {open ? t("leads.closeEdit") : t("leads.edit")}
          </button>
        </span>
      </div>

      {/* The customer's own last message. The single most useful line here: an
          operator who reads it before dialling does not make the customer
          explain themselves a second time. Read from the transcript on the
          server, never posted by the browser. */}
      {lead.question && (
        <p className="text-silver border-line/60 mt-2 border-l-2 pl-3 text-xs italic">
          {t("common.quoted", { text: lead.question })}
        </p>
      )}

      {lead.note && !open && (
        <p className="text-silver mt-2 text-xs">{lead.note}</p>
      )}

      {open && (
        <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={lead.id} />
          <label className="flex flex-col gap-1">
            <span className="label-tight text-ink-faint text-[10px]">
              {t("common.status")}
            </span>
            <select
              name="status"
              defaultValue={lead.status}
              className="border-line-strong bg-surface-1 text-ink h-9 border px-2 text-xs"
            >
              {STATUS_VALUES.map((s) => (
                <option key={s} value={s}>
                  {t(`leadStatus.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[16rem] flex-1 flex-col gap-1">
            <span className="label-tight text-ink-faint text-[10px]">
              {t("leads.staffNote")}
            </span>
            <input
              name="note"
              defaultValue={lead.note ?? ""}
              placeholder={t("leads.notePlaceholder")}
              className="border-line-strong bg-surface-1 text-ink placeholder:text-ink-faint h-9 w-full border px-2 text-xs"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 inline-flex h-9 items-center border px-4 text-xs transition-colors disabled:opacity-50"
          >
            {pending ? t("common.saving") : t("common.save")}
          </button>
          {state?.ok && (
            <span className="text-xs text-emerald-400">{t("common.saved")}</span>
          )}
          {state && !state.ok && (
            <span className="text-red text-xs">{state.error}</span>
          )}
        </form>
      )}
    </div>
  );
}
