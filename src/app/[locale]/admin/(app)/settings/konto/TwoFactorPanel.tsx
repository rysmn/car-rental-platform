"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  odnowKodyZapasowe,
  potwierdz2FA,
  start2FA,
  wylacz2FA,
  wylogujWszedzie,
} from "./two-factor-actions";

const INPUT =
  "w-full max-w-sm rounded-none border border-line bg-surface-1 px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-line-strong";
const BUTTON =
  "label border-line-strong inline-flex h-10 items-center border px-5 text-xs text-ink transition-colors hover:border-ink hover:bg-ink/5 disabled:opacity-50";
const BUTTON_MOCNY =
  "label bg-red hover:bg-red-hover inline-flex h-10 items-center px-5 text-xs text-white transition-colors disabled:opacity-50";

/**
 * Panel 2FA i unieważniania sesji — rozdział 13.6, punkty 1 i 3.
 *
 * ## Kody zapasowe pokazujemy w sposób, którego nie da się przeoczyć
 *
 * To jest jedyny moment, w którym te dziesięć kodów istnieje w czytelnej
 * postaci; w bazie leżą wyłącznie skróty. Dlatego nie ma tu „zamknij" obok
 * listy — jest pole do odhaczenia „zapisałem je", a dopóki nie jest odhaczone,
 * lista zostaje na ekranie. Jedno kliknięcie za dużo jest tańsze niż telefon
 * do serwisu, który zaczyna się od „zgubiłem telefon i nie mam kodów".
 *
 * ## Wszystko wymaga hasła
 *
 * Włączenie, wyłączenie, odnowienie kodów i wylogowanie wszędzie. Porzucona
 * zalogowana sesja nie może wystarczyć do zdjęcia zabezpieczenia — patrz
 * `two-factor-actions.ts`.
 */
export function TwoFactorPanel({
  wlaczone,
  kodowZostalo,
}: {
  wlaczone: boolean;
  kodowZostalo: number;
}) {
  const t = useTranslations("Admin.settings.twoFactor");
  const [pending, startTransition] = useTransition();
  const [blad, setBlad] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Krok włączania: sekret do przepisania i kod QR w postaci adresu.
  const [sekret, setSekret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);

  // Kody zapasowe — widoczne dopóki właściciel nie potwierdzi, że je ma.
  const [kody, setKody] = useState<string[] | null>(null);
  const [zapisane, setZapisane] = useState(false);

  const [haslo, setHaslo] = useState("");
  const [kod, setKod] = useState("");

  const wyczysc = () => {
    setBlad(null);
    setInfo(null);
  };

  const rozpocznij = () =>
    startTransition(async () => {
      wyczysc();
      const r = await start2FA();
      if (!r.ok) return setBlad(r.error);
      setSekret(r.secret);
      setUri(r.uri);
    });

  const potwierdz = () =>
    startTransition(async () => {
      wyczysc();
      const r = await potwierdz2FA(kod, haslo);
      if (!r.ok) return setBlad(r.error);
      setSekret(null);
      setUri(null);
      setKod("");
      setHaslo("");
      setKody(r.kody ?? null);
      setZapisane(false);
      setInfo(r.message ?? null);
    });

  const wylacz = () =>
    startTransition(async () => {
      wyczysc();
      const r = await wylacz2FA(haslo, kod);
      if (!r.ok) return setBlad(r.error);
      setHaslo("");
      setKod("");
      setInfo(r.message ?? null);
    });

  const odnow = () =>
    startTransition(async () => {
      wyczysc();
      const r = await odnowKodyZapasowe(haslo);
      if (!r.ok) return setBlad(r.error);
      setHaslo("");
      setKody(r.kody ?? null);
      setZapisane(false);
      setInfo(r.message ?? null);
    });

  const wyloguj = () =>
    startTransition(async () => {
      wyczysc();
      const r = await wylogujWszedzie(haslo);
      if (!r.ok) return setBlad(r.error);
      setHaslo("");
      setInfo(r.message ?? null);
    });

  /* ── Kody zapasowe: ekran, którego nie da się zamknąć przypadkiem ─────── */
  if (kody && !zapisane) {
    return (
      <div className="border-line-strong border p-5">
        <h3 className="label text-ink text-xs">{t("codes.title")}</h3>
        <p className="text-ink-muted mt-2 text-sm leading-relaxed">
          {t("codes.intro")}
        </p>
        <ul className="border-line mt-4 grid grid-cols-2 gap-2 border p-4 font-mono text-sm">
          {kody.map((k) => (
            <li key={k} className="text-ink tracking-wider">
              {k}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={BUTTON}
            onClick={() => {
              void navigator.clipboard?.writeText(kody.join("\n"));
              setInfo(t("codes.copied"));
            }}
          >
            {t("codes.copy")}
          </button>
          <button
            type="button"
            className={BUTTON}
            onClick={() => window.print()}
          >
            {t("codes.print")}
          </button>
        </div>
        <label className="mt-5 flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            onChange={(e) => setZapisane(e.target.checked)}
          />
          <span className="text-ink-muted">{t("codes.savedCheck")}</span>
        </label>
        {info && <p className="text-ink-faint mt-3 text-xs">{info}</p>}
      </div>
    );
  }

  /*
    Po odhaczeniu „zapisałem kody" konto ma już 2FA, ale właściwość `wlaczone`
    pochodzi z renderu SERWERA sprzed włączenia. Zamiast udawać, że nic się nie
    stało, pokazujemy jedno zdanie i drogę dalej — to jest też jedyne wyjście
    z ekranu wymuszającego 2FA (`/admin/2fa`), na którym nie ma menu.
  */
  if (kody && zapisane) {
    return (
      <div className="border-line border p-5">
        <p className="text-sm text-emerald-400">
          {"🟢 "}
          {t("enabledNow")}
        </p>
        <Link
          href="/admin"
          className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 mt-4 inline-flex h-10 items-center border px-5 text-xs transition-colors"
        >
          {t("goToPanel")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-line border p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="label text-ink text-xs">{t("heading")}</h3>
            <p className="text-silver mt-1 text-sm">
              {wlaczone ? (
                <>
                  {"🟢 "}
                  {t("statusOn", { count: kodowZostalo })}
                  {kodowZostalo <= 2 && (
                    <span className="text-red">{t("renewHint")}</span>
                  )}
                </>
              ) : (
                `⚪ ${t("statusOff")}`
              )}
            </p>
          </div>
          {!wlaczone && !sekret && (
            <button
              type="button"
              className={BUTTON_MOCNY}
              disabled={pending}
              onClick={rozpocznij}
            >
              {t("start")}
            </button>
          )}
        </div>

        {/* ── Krok 1: sekret do zeskanowania ──────────────────────────── */}
        {sekret && uri && (
          <div className="border-line mt-5 border-t pt-5">
            <p className="text-ink-muted text-sm leading-relaxed">
              {t("setup.intro")}
            </p>
            <p className="border-line bg-surface-1 text-ink mt-4 border p-4 font-mono text-sm break-all">
              {sekret}
            </p>
            <details className="mt-3">
              <summary className="text-ink-faint cursor-pointer text-xs">
                {t("setup.otpauth")}
              </summary>
              <p className="text-silver mt-2 font-mono text-[11px] break-all">
                {uri}
              </p>
            </details>
            <div className="mt-5 space-y-3">
              <label className="block">
                <span className="label-tight text-ink-faint text-[10px]">
                  {t("setup.code")}
                </span>
                <input
                  className={`${INPUT} mt-2 tracking-widest`}
                  value={kod}
                  onChange={(e) => setKod(e.target.value)}
                  inputMode="numeric"
                  placeholder="123456"
                />
              </label>
              <label className="block">
                <span className="label-tight text-ink-faint text-[10px]">
                  {t("yourPassword")}
                </span>
                <input
                  type="password"
                  className={`${INPUT} mt-2`}
                  value={haslo}
                  onChange={(e) => setHaslo(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
              <button
                type="button"
                className={BUTTON_MOCNY}
                disabled={pending || !kod || !haslo}
                onClick={potwierdz}
              >
                {t("setup.confirm")}
              </button>
            </div>
          </div>
        )}

        {/* ── Zarządzanie, gdy 2FA już działa ─────────────────────────── */}
        {wlaczone && (
          <div className="border-line mt-5 space-y-3 border-t pt-5">
            <label className="block">
              <span className="label-tight text-ink-faint text-[10px]">
                {t("yourPassword")}
              </span>
              <input
                type="password"
                className={`${INPUT} mt-2`}
                value={haslo}
                onChange={(e) => setHaslo(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className={BUTTON}
                disabled={pending || !haslo}
                onClick={odnow}
              >
                {t("regenerate")}
              </button>
            </div>
            <details className="pt-2">
              <summary className="text-ink-faint cursor-pointer text-xs">
                {t("disable.summary")}
              </summary>
              <div className="mt-3 space-y-3">
                <p className="text-ink-muted text-xs leading-relaxed">
                  {t("disable.note")}
                </p>
                <input
                  className={`${INPUT} tracking-widest`}
                  value={kod}
                  onChange={(e) => setKod(e.target.value)}
                  inputMode="numeric"
                  placeholder={t("codePlaceholder")}
                />
                <button
                  type="button"
                  className={BUTTON}
                  disabled={pending || !haslo || !kod}
                  onClick={wylacz}
                >
                  {t("disable.summary")}
                </button>
              </div>
            </details>
          </div>
        )}
      </div>

      {/* ── Sesje ────────────────────────────────────────────────────── */}
      <div className="border-line border p-5">
        <h3 className="label text-ink text-xs">{t("sessions.heading")}</h3>
        <p className="text-ink-muted mt-2 text-sm leading-relaxed">
          {t("sessions.note")}
        </p>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="label-tight text-ink-faint text-[10px]">
              {t("yourPassword")}
            </span>
            <input
              type="password"
              className={`${INPUT} mt-2`}
              value={haslo}
              onChange={(e) => setHaslo(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button
            type="button"
            className={BUTTON}
            disabled={pending || !haslo}
            onClick={wyloguj}
          >
            {t("sessions.button")}
          </button>
        </div>
      </div>

      {blad && <p className="text-red text-xs">{blad}</p>}
      {info && <p className="text-xs text-emerald-400">{info}</p>}
    </div>
  );
}
