"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useEurRate } from "@/components/currency/CurrencyProvider";
import { filterHref, type FleetFilterTarget } from "./filterTarget";
import type { BudgetKind } from "@/lib/fleet/filters";

// The same box as the date filter, so the two rows read as one control panel.
const inputCls =
  "field-box w-full min-w-0 rounded-none border border-line bg-surface-1 h-11 px-3 text-sm text-ink outline-none transition-colors focus:border-line-strong";

/**
 * Budget filter above the fleet grid — "od 200 do 400 zł za dobę", or for the
 * whole rental.
 *
 * ## Why it navigates instead of filtering in place
 *
 * Same reason the date filter does: the budget lands in the URL, so "SUV-y do
 * 400 zł na ten weekend" is a link somebody can send to whoever else is paying.
 * The filtering itself happens on the server, through the Pricing Engine, so
 * the page never has to ship a price table for the whole fleet to hide most of
 * it — and so the figure a car is judged by is the figure printed on its card.
 *
 * ## Why the currency is a field here and not the site-wide switch
 *
 * The switch at the top of the page changes what the visitor READS; this
 * changes what they TYPE. They are usually the same choice and this field
 * starts on the site-wide one, but they are not the same fact: a euro budget
 * has to be turned into złoty once, on the server, against the rate the page
 * was rendered with — see `parseBudget`. Guessing which currency "400" meant
 * from a CSS class would be exactly the kind of quiet mistake this project
 * keeps out of prices.
 *
 * With no rate there is no euro option at all, and the whole control reads as
 * złoty — the same rule the price switch follows.
 */
export function FleetBudgetFilter({
  kind,
  min,
  max,
  currency,
  keep = {},
  target = "/fleet",
  hasDates,
  currencyLabel,
  currencyNote,
}: {
  kind: BudgetKind;
  /** As typed, in whole units — this is a form field, not a price. */
  min: string;
  max: string;
  currency: "pln" | "eur";
  /** Filters already in the URL that must survive this one being applied. */
  keep?: Record<string, string>;
  target?: FleetFilterTarget;
  /** A total budget needs a rental length before it can mean anything. */
  hasDates: boolean;
  /** "Waluta" — the label for the copy of the price switch below. */
  currencyLabel: string;
  /** The "prices are indicative" sentence, for that switch's tooltip. */
  currencyNote: string;
}) {
  const t = useTranslations("Fleet");
  const router = useRouter();
  const rate = useEurRate();
  const navOptions = { scroll: target !== "/" };

  const [budgetKind, setBudgetKind] = useState<BudgetKind>(kind);
  const [from, setFrom] = useState(min);
  const [to, setTo] = useState(max);
  const [cur, setCur] = useState<"pln" | "eur">(rate ? currency : "pln");

  const stated = Boolean(from.trim() || to.trim());

  const apply = () => {
    const query: Record<string, string> = { ...keep };
    if (from.trim()) query.min = from.trim();
    if (to.trim()) query.max = to.trim();
    if (stated) {
      query.budget = budgetKind;
      if (cur === "eur") query.cur = "eur";
    }
    router.push(filterHref(target, query), navOptions);
  };

  const clear = () => {
    setFrom("");
    setTo("");
    router.push(filterHref(target, { ...keep }), navOptions);
  };

  const tab = (active: boolean) =>
    `label-tight tap inline-flex h-9 items-center border px-4 text-[11px] transition-colors ${
      active
        ? "border-red bg-red text-white"
        : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
    }`;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
      className="border-line mt-4 border p-5 md:p-6"
    >
      <p className="label-tight text-silver text-[11px]">{t("budgetTitle")}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setBudgetKind("day")}
          aria-pressed={budgetKind === "day"}
          className={tab(budgetKind === "day")}
        >
          {t("budgetPerDay")}
        </button>
        <button
          type="button"
          onClick={() => setBudgetKind("total")}
          aria-pressed={budgetKind === "total"}
          className={tab(budgetKind === "total")}
        >
          {t("budgetTotal")}
        </button>
      </div>

      {/* Not an error and not a disabled control: the visitor may well type the
          budget first and the dates second. It says what will happen. */}
      {budgetKind === "total" && !hasDates && (
        <p className="text-ink-muted mt-3 text-xs">{t("budgetNeedsDates")}</p>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1">
          <span className="label-tight text-silver text-[11px]">
            {t("budgetMin")}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={10}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={`${inputCls} mt-2`}
          />
        </label>

        <label className="block min-w-0 flex-1">
          <span className="label-tight text-silver text-[11px]">
            {t("budgetMax")}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={10}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={`${inputCls} mt-2`}
          />
        </label>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!stated}
            className="label bg-red hover:bg-red-hover inline-flex h-11 shrink-0 items-center px-6 text-xs whitespace-nowrap text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("budgetSubmit")}
          </button>

          {/*
            `Boolean(...)`, nie samo `min || max`.

            Oba pola przychodzą jako ŁAŃCUCHY i puste znaczy „nic nie wpisano".
            `"" && <button/>` nie renderuje przycisku — renderuje pusty łańcuch,
            czyli węzeł tekstowy, którego React po stronie klienta może już nie
            zobaczyć. To jest dokładnie ta różnica, przez którą hydratacja
            wywracała się na `/fleet` raz na kilkanaście wejść i przerysowywała
            całe drzewo (błąd React #418).
          */}
          {Boolean(min || max) && (
            <button
              type="button"
              onClick={clear}
              className="label-tight border-line hover:border-line-strong text-ink-muted hover:text-ink inline-flex h-11 shrink-0 items-center border px-4 text-[11px] whitespace-nowrap transition-colors"
            >
              {t("budgetClear")}
            </button>
          )}
        </div>
      </div>

      <p className="text-ink-faint mt-3 text-xs">{t("budgetNote")}</p>

      {/*
        Druga kopia przełącznika WALUTY WYŚWIETLANIA — nie tego pola wyżej.
        Pole obok kwot mówi, w czym klient PISZE; ten przełącznik decyduje,
        w czym CZYTA ceny na kartach. Na telefonie nagłówkowa kopia siedzi
        w hamburgerze, a nikt nie otwiera menu, żeby sprawdzić, w jakiej
        walucie jest siatka, na którą właśnie patrzy. Od `lg` w górę znika,
        bo tam nagłówkowa jest na ekranie.
      */}
    </form>
  );
}
