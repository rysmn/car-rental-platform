"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { deleteModel } from "./actions";

export function DeleteModelButton({ id }: { id: string }) {
  const t = useTranslations("Admin.fleet");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const doDelete = () => {
    setError(null);
    start(async () => {
      const res = await deleteModel(id);
      if (!res.ok) {
        setError(res.error);
        setConfirm(false);
      }
      // success redirects to /admin/fleet
    });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        {confirm ? (
          <>
            <span className="text-silver text-sm">{t("deleteConfirm")}</span>
            <button
              type="button"
              onClick={doDelete}
              disabled={pending}
              className="label border-red text-red hover:bg-red inline-flex h-10 items-center border px-5 text-xs transition-colors hover:text-ink disabled:opacity-50"
            >
              {pending ? t("deleting") : t("deleteYes")}
            </button>
            <button
              type="button"
              onClick={() => setConfirm(false)}
              className="text-ink-faint text-xs hover:text-ink"
            >
              {t("cancel")}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="label border-line-strong text-ink-faint hover:border-red hover:text-red inline-flex h-10 items-center border px-5 text-xs transition-colors"
          >
            {t("deleteModel")}
          </button>
        )}
      </div>
      {error && <p className="text-red mt-3 text-sm">{error}</p>}
    </div>
  );
}
