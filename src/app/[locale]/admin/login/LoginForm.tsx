"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { loginAction, type LoginState } from "./actions";

const inputCls =
  "w-full rounded-none border border-line bg-surface-1 px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-line-strong";

/**
 * Logowanie do panelu — hasło, a przy kontach z 2FA drugi krok na kod.
 *
 * E-mail i hasło zostają w komponencie po pierwszym kroku i wracają w polach
 * ukrytych. Alternatywą byłaby sesja „w połowie zalogowany" po stronie serwera,
 * czyli trzeci stan uwierzytelnienia do utrzymania — patrz `actions.ts`.
 *
 * Pole kodu przyjmuje SZEŚĆ CYFR ALBO KOD ZAPASOWY i mówi o tym wprost.
 * Człowiek, który sięga po kartkę z kodami, właśnie zgubił telefon i nie jest
 * w nastroju na zgadywanie, gdzie wpisać który.
 */
export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );
  const t = useTranslations("Admin.login");
  const [email, setEmail] = useState("");
  const [haslo, setHaslo] = useState("");
  const poleKodu = useRef<HTMLInputElement>(null);

  const krokKodu = state.krok === "kod";

  // Kursor sam w polu kodu — inaczej pierwszą reakcją na drugi krok jest
  // kliknięcie w pole, którego przed chwilą nie było.
  useEffect(() => {
    if (krokKodu) poleKodu.current?.focus();
  }, [krokKodu]);

  return (
    <form action={action} className="space-y-4">
      {krokKodu ? (
        <>
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="password" value={haslo} />
          <label className="block">
            <span className="label-tight text-ink-faint text-[10px]">
              {t("codeLabel")}
            </span>
            <input
              ref={poleKodu}
              name="code"
              type="text"
              required
              inputMode="text"
              autoComplete="one-time-code"
              placeholder="123456"
              className={`${inputCls} mt-2 tracking-widest`}
            />
          </label>
          <p className="text-ink-faint text-[11px] leading-relaxed">
            {t("codeHelp")}
          </p>
          {state.zlyKod && (
            <p className="text-red text-xs">{t("codeWrong")}</p>
          )}
        </>
      ) : (
        <>
          <label className="block">
            <span className="label-tight text-ink-faint text-[10px]">
              {t("email")}
            </span>
            <input
              name="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`${inputCls} mt-2`}
            />
          </label>
          <label className="block">
            <span className="label-tight text-ink-faint text-[10px]">{t("password")}</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={haslo}
              onChange={(e) => setHaslo(e.target.value)}
              className={`${inputCls} mt-2`}
            />
          </label>
          {state.error && (
            <p className="text-red text-xs">{t("invalid")}</p>
          )}
        </>
      )}

      <button
        type="submit"
        disabled={pending}
        className="label bg-red hover:bg-red-hover mt-2 inline-flex h-12 w-full items-center justify-center text-sm text-white transition-colors disabled:opacity-50"
      >
        {pending ? t("signingIn") : krokKodu ? t("confirmCode") : t("signIn")}
      </button>
    </form>
  );
}
