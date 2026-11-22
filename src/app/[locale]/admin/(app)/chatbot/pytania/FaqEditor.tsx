"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import {
  createFaqDraft,
  saveFaqEntry,
  deleteFaqEntry,
  type LeadResult,
} from "../actions";

/**
 * Writing and approving an answer.
 *
 * The publish button is a separate submit rather than a checkbox, because the
 * difference between "saved" and "live on the site and in the assistant" is the
 * one distinction on this screen that must never be made by accident.
 */
export function AddToFaq({
  question,
  locale,
  existing,
}: {
  question: string;
  locale: string;
  existing: { id: string; status: string } | null;
}) {
  const t = useTranslations("Admin.chatbot");
  const [state, action, pending] = useActionState<LeadResult | null, FormData>(
    createFaqDraft,
    null,
  );

  if (existing) {
    return (
      <span className="text-ink-faint text-xs">
        {existing.status === "published" ? t("questions.faq.inFaq") : t("questions.faq.draft")}
      </span>
    );
  }

  return (
    <form action={action} className="inline">
      <input type="hidden" name="question" value={question} />
      <input type="hidden" name="locale" value={locale} />
      <button
        type="submit"
        disabled={pending || state?.ok === true}
        className="label-tight border-line text-ink-faint hover:border-ink hover:text-ink border px-2 py-1 text-[10px] transition-colors disabled:opacity-50"
      >
        {pending ? "…" : state?.ok ? t("questions.faq.created") : t("questions.faq.addToFaq")}
      </button>
      {state && !state.ok && (
        <span className="text-red ml-2 text-[10px]">{state.error}</span>
      )}
    </form>
  );
}

export function FaqDraftRow({
  id,
  question,
  answer,
  status,
  locale,
}: {
  id: string;
  question: string;
  answer: string;
  status: string;
  locale: string;
}) {
  const [saveState, save, saving] = useActionState<LeadResult | null, FormData>(
    saveFaqEntry,
    null,
  );
  const [delState, del, deleting] = useActionState<LeadResult | null, FormData>(
    deleteFaqEntry,
    null,
  );
  const t = useTranslations("Admin.chatbot");
  const [publish, setPublish] = useState("0");
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="border-line border-b p-4 last:border-0">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <span className="label-tight text-ink-faint text-[10px] uppercase">
          {locale}
        </span>
        <span
          className={`label-tight text-[10px] ${
            status === "published" ? "text-emerald-400" : "text-amber-500"
          }`}
        >
          {status === "published" ? t("questions.faq.published") : t("questions.faq.draftHidden")}
        </span>
      </div>

      <form action={save}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="publish" value={publish} />
        <label className="block">
          <span className="label-tight text-ink-faint text-[10px]">
            {t("questions.faq.question")}
          </span>
          <input
            name="question"
            defaultValue={question}
            className="border-line bg-void text-ink mt-1 block w-full border px-3 py-2 text-sm"
          />
        </label>
        <label className="mt-3 block">
          <span className="label-tight text-ink-faint text-[10px]">
            {t("questions.faq.answer")}
          </span>
          <textarea
            name="answer"
            defaultValue={answer}
            rows={4}
            placeholder={t("questions.faq.answerPlaceholder")}
            className="border-line bg-void text-ink mt-1 block w-full border px-3 py-2 text-sm"
          />
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            onClick={() => setPublish("0")}
            disabled={saving}
            className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 inline-flex h-9 items-center border px-4 text-xs transition-colors disabled:opacity-50"
          >
            {saving ? t("common.saving") : t("questions.faq.saveDraft")}
          </button>
          <button
            type="submit"
            onClick={() => setPublish("1")}
            disabled={saving}
            className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 inline-flex h-9 items-center border px-4 text-xs transition-colors disabled:opacity-50"
          >
            {status === "published"
              ? t("questions.faq.saveKeep")
              : t("questions.faq.publish")}
          </button>
          {saveState?.ok && (
            <span className="text-xs text-emerald-400">{t("common.saved")}</span>
          )}
          {saveState && !saveState.ok && (
            <span className="text-red text-xs">{saveState.error}</span>
          )}
        </div>
      </form>

      <div className="mt-3">
        {confirming ? (
          <form action={del} className="flex items-center gap-3">
            <input type="hidden" name="id" value={id} />
            <span className="text-silver text-xs">{t("questions.faq.deleteConfirm")}</span>
            <button
              type="submit"
              disabled={deleting}
              className="label border-red text-red hover:bg-red hover:text-ink tap inline-flex h-8 items-center border px-3 text-[10px] transition-colors disabled:opacity-50"
            >
              {deleting ? t("questions.faq.deleting") : t("questions.faq.deleteYes")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-ink-faint hover:text-ink text-xs"
            >
              {t("common.cancel")}
            </button>
            {delState && !delState.ok && (
              <span className="text-red text-xs">{delState.error}</span>
            )}
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="label-tight text-ink-faint hover:text-red text-[10px] transition-colors"
          >
            {t("questions.faq.deleteEntry")}
          </button>
        )}
      </div>
    </div>
  );
}
