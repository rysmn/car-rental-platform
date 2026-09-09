"use client";

import { useActionState, useState } from "react";
import { saveDocumentRules, type SaveResult } from "./actions";
import type { RentalRules } from "@/lib/admin/rental-rules";

const labelCls = "label-tight text-[10px] text-ink-faint";

function Feedback({ state }: { state: SaveResult | null }) {
  if (!state) return null;
  if (state.ok)
    return (
      <span className="text-xs text-emerald-400">
        {state.message ?? "Zapisano ✓"}
      </span>
    );
  return <span className="text-red text-xs">{state.error}</span>;
}

/**
 * One switch, with the sentence it will produce shown underneath.
 *
 * Showing the wording matters more here than in an ordinary settings form. The
 * administrator is not toggling a feature, they are deciding what the assistant
 * is allowed to tell a customer — so the exact sentence has to be visible at
 * the moment of deciding, not discoverable afterwards by asking the bot.
 *
 * The "off" line is the part worth reading twice: off does NOT assert the
 * opposite. It means the assistant stops saying anything on the subject and
 * refers the customer to a person.
 */
function RuleToggle({
  name,
  title,
  whenOn,
  whenOff,
  defaultChecked,
  stamp,
  children,
  onChange,
}: {
  name: string;
  title: string;
  whenOn: string;
  whenOff: string;
  defaultChecked: boolean;
  stamp: { updatedAt: string | null; updatedBy: string | null };
  children?: React.ReactNode;
  onChange?: (v: boolean) => void;
}) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <div className="border-line/60 border-b py-4 last:border-0">
      <label className="tap-block flex items-start gap-3">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          onChange={(e) => {
            setOn(e.target.checked);
            onChange?.(e.target.checked);
          }}
          className="mt-1 h-4 w-4 shrink-0"
        />
        <span className="min-w-0">
          <span className="text-ink flex flex-wrap items-center gap-2 text-sm">
            {title}
            <span
              className={`label-tight rounded-pill px-2 py-0.5 text-[9px] ${
                on
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "border-line text-ink-faint border"
              }`}
            >
              {on ? "ON" : "OFF"}
            </span>
          </span>
          <span className="text-ink-faint mt-1 block text-xs">
            {on ? whenOn : whenOff}
          </span>
        </span>
      </label>
      {children}
      {stamp.updatedAt ? (
        <p className="text-ink-faint mt-2 pl-7 text-[10px]">
          Ostatnia zmiana:{" "}
          {new Date(stamp.updatedAt).toLocaleString("pl-PL", {
            dateStyle: "short",
            timeStyle: "short",
          })}
          {stamp.updatedBy ? ` · ${stamp.updatedBy}` : ""}
        </p>
      ) : (
        <p className="text-ink-faint mt-2 pl-7 text-[10px]">
          Nigdy nie zmieniane.
        </p>
      )}
    </div>
  );
}

export function DocumentRulesForm({ rules }: { rules: RentalRules }) {
  const [state, action, pending] = useActionState(saveDocumentRules, null);
  const d = rules.documents;
  const [nonEuOn, setNonEuOn] = useState(d.nonEuLicence.enabled);

  return (
    <form action={action} className="mt-4">
      <RuleToggle
        name="mobywatel"
        title="Akceptujemy mObywatel"
        defaultChecked={d.mobywatel.enabled}
        stamp={d.mobywatel}
        whenOn="Asystent może informować, że dokument tożsamości w aplikacji mObywatel jest akceptowany."
        whenOff="Asystent nie potwierdza akceptacji mObywatela ani jej nie wyklucza — kieruje klienta do pracownika A&A."
      />

      <RuleToggle
        name="cardInDriverName"
        title="Wymagana karta płatnicza na nazwisko kierowcy"
        defaultChecked={d.cardInDriverName.enabled}
        stamp={d.cardInDriverName}
        whenOn="Asystent informuje, że karta płatnicza na imię i nazwisko kierowcy jest wymagana."
        whenOff="Asystent nie twierdzi, że karta na nazwisko kierowcy jest obowiązkowa. Przypadki firmowe — płatnikiem firma, kierowcą pracownik — ustala pracownik A&A."
      />

      <RuleToggle
        name="nonEuLicence"
        title="Akceptujemy prawo jazdy spoza UE"
        defaultChecked={d.nonEuLicence.enabled}
        stamp={d.nonEuLicence}
        onChange={setNonEuOn}
        whenOn="Asystent informuje o akceptacji wraz z warunkami wpisanymi poniżej."
        whenOff="Asystent nie potwierdza samodzielnie akceptacji prawa jazdy spoza UE i kieruje klienta do A&A."
      >
        <div className="mt-3 pl-7">
          <label className={labelCls} htmlFor="nonEuLicenceNotes">
            Dodatkowe warunki / informacje
          </label>
          <textarea
            id="nonEuLicenceNotes"
            name="nonEuLicenceNotes"
            rows={3}
            defaultValue={d.nonEuLicence.notes}
            placeholder="Puste — do uzupełnienia przez właściciela"
            className="border-line-strong bg-surface-1 text-ink placeholder:text-ink-faint mt-1 w-full border px-3 py-2 text-sm"
          />
          <p className="text-ink-faint mt-1 text-[10px]">
            {nonEuOn
              ? "Ta treść zostanie dopisana do odpowiedzi asystenta i do FAQ."
              : "Zapisywane, ale nieużywane, dopóki przełącznik jest wyłączony."}
          </p>
        </div>
      </RuleToggle>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="label-tight border-line-strong text-ink hover:border-ink hover:bg-ink/5 tap inline-flex items-center border px-4 text-[10px] transition-colors disabled:opacity-50"
        >
          {pending ? "Zapisywanie…" : "Zapisz"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
