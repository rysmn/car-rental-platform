"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
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
        <h3 className="label text-ink text-xs">Kody zapasowe — zapisz je TERAZ</h3>
        <p className="text-ink-muted mt-2 text-sm leading-relaxed">
          To jedyny raz, kiedy je widzisz. W bazie leżą tylko skróty — nikt,
          łącznie z nami, nie odczyta ich później. Każdy kod działa raz i wpisuje
          się go zamiast kodu z aplikacji, gdy nie masz telefonu.
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
              setInfo("Skopiowane do schowka.");
            }}
          >
            Kopiuj
          </button>
          <button
            type="button"
            className={BUTTON}
            onClick={() => window.print()}
          >
            Drukuj
          </button>
        </div>
        <label className="mt-5 flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            onChange={(e) => setZapisane(e.target.checked)}
          />
          <span className="text-ink-muted">
            Zapisałem kody w bezpiecznym miejscu poza tym komputerem.
          </span>
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
          🟢 2FA włączone. Przy następnym logowaniu panel poprosi o kod
          z aplikacji.
        </p>
        <Link
          href="/admin"
          className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 mt-4 inline-flex h-10 items-center border px-5 text-xs transition-colors"
        >
          Przejdź do panelu
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-line border p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="label text-ink text-xs">
              Logowanie dwuskładnikowe (2FA)
            </h3>
            <p className="text-silver mt-1 text-sm">
              {wlaczone ? (
                <>
                  🟢 Włączone · kodów zapasowych: {kodowZostalo}
                  {kodowZostalo <= 2 && (
                    <span className="text-red"> — odnów je</span>
                  )}
                </>
              ) : (
                "⚪ Wyłączone"
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
              Włącz 2FA
            </button>
          )}
        </div>

        {/* ── Krok 1: sekret do zeskanowania ──────────────────────────── */}
        {sekret && uri && (
          <div className="border-line mt-5 border-t pt-5">
            <p className="text-ink-muted text-sm leading-relaxed">
              Otwórz aplikację uwierzytelniającą (Google Authenticator, Aegis,
              1Password, Authy) i dodaj konto ręcznie, wpisując poniższy klucz.
              Potem przepisz sześć cyfr, które pokaże aplikacja.
            </p>
            <p className="border-line bg-surface-1 text-ink mt-4 border p-4 font-mono text-sm break-all">
              {sekret}
            </p>
            <details className="mt-3">
              <summary className="text-ink-faint cursor-pointer text-xs">
                Adres otpauth:// (dla aplikacji, które go przyjmują)
              </summary>
              <p className="text-silver mt-2 font-mono text-[11px] break-all">
                {uri}
              </p>
            </details>
            <div className="mt-5 space-y-3">
              <label className="block">
                <span className="label-tight text-ink-faint text-[10px]">
                  Kod z aplikacji
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
                  Twoje hasło
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
                Potwierdź i włącz
              </button>
            </div>
          </div>
        )}

        {/* ── Zarządzanie, gdy 2FA już działa ─────────────────────────── */}
        {wlaczone && (
          <div className="border-line mt-5 space-y-3 border-t pt-5">
            <label className="block">
              <span className="label-tight text-ink-faint text-[10px]">
                Twoje hasło
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
                Nowe kody zapasowe
              </button>
            </div>
            <details className="pt-2">
              <summary className="text-ink-faint cursor-pointer text-xs">
                Wyłącz 2FA
              </summary>
              <div className="mt-3 space-y-3">
                <p className="text-ink-muted text-xs leading-relaxed">
                  Wyłączenie wymaga hasła ORAZ aktualnego kodu — dwóch
                  składników do zdjęcia dwóch składników. Kody zapasowe zostaną
                  skasowane.
                </p>
                <input
                  className={`${INPUT} tracking-widest`}
                  value={kod}
                  onChange={(e) => setKod(e.target.value)}
                  inputMode="numeric"
                  placeholder="Kod z aplikacji"
                />
                <button
                  type="button"
                  className={BUTTON}
                  disabled={pending || !haslo || !kod}
                  onClick={wylacz}
                >
                  Wyłącz 2FA
                </button>
              </div>
            </details>
          </div>
        )}
      </div>

      {/* ── Sesje ────────────────────────────────────────────────────── */}
      <div className="border-line border p-5">
        <h3 className="label text-ink text-xs">Wyloguj ze wszystkich urządzeń</h3>
        <p className="text-ink-muted mt-2 text-sm leading-relaxed">
          Unieważnia KAŻDĄ otwartą sesję tego konta — także tę. Użyj tego, gdy
          zostawiłeś panel zalogowany na cudzym komputerze albo gdy podejrzewasz,
          że ktoś zna Twoje hasło.
        </p>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="label-tight text-ink-faint text-[10px]">
              Twoje hasło
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
            Wyloguj wszędzie
          </button>
        </div>
      </div>

      {blad && <p className="text-red text-xs">{blad}</p>}
      {info && <p className="text-xs text-emerald-400">{info}</p>}
    </div>
  );
}
