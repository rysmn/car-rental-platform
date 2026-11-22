"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  odblokujKrytyczne,
  zablokujKrytyczne,
} from "@/app/[locale]/admin/(app)/critical-actions";

/**
 * Kłódka operacji krytycznych — jeden przełącznik na cały panel.
 *
 * ## Dlaczego jeden przełącznik, a nie okienko przy każdym przycisku
 *
 * Operacji krytycznych jest kilkanaście i mieszkają w ośmiu różnych ekranach.
 * Okno „podaj hasło" doklejone do każdej z nich to kilkanaście miejsc, w których
 * można je pominąć przy dodawaniu kolejnej funkcji — a pominięte, nie zostawia
 * po sobie żadnego śladu. Jedno okno na konto, sprawdzane po stronie SERWERA
 * w `requireCritical`, ma odwrotną własność: nowa operacja krytyczna dostaje
 * ochronę przez dopisanie uprawnienia do jednej listy.
 *
 * ## Co to naprawdę chroni
 *
 * Porzucony, zalogowany panel. Sesja żyje osiem godzin; przez ten czas każdy,
 * kto usiądzie przy tym komputerze, mógł do tej pory skasować auto albo zmienić
 * cennik jednym kliknięciem. Teraz musi znać hasło — a przy koncie z 2FA także
 * mieć telefon.
 *
 * Odliczanie jest widoczne, żeby stan „odblokowane" nigdy nie był
 * niespodzianką.
 */
export function CriticalLock({
  otwarteDo,
  okresMs,
  ma2FA,
}: {
  otwarteDo: number | null;
  okresMs: number;
  ma2FA: boolean;
}) {
  const [doKiedy, setDoKiedy] = useState<number | null>(otwarteDo);
  const [zostalo, setZostalo] = useState<number>(0);
  const [otwarty, setOtwarty] = useState(false);
  const [haslo, setHaslo] = useState("");
  const [kod, setKod] = useState("");
  const [blad, setBlad] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const t = useTranslations("Admin.components");

  // Odliczanie liczone w efekcie, nie przy renderze: `Date.now()` w ciele
  // komponentu daje wynik zależny od chwili renderowania, a to jest dokładnie
  // ten rodzaj nieczystości, przez który wartość potrafi „skoczyć" przy
  // przypadkowym przerysowaniu.
  useEffect(() => {
    if (!doKiedy) return;
    /*
      Pierwsze odliczenie idzie przez `setTimeout(…, 0)`, a nie wprost w ciele
      efektu. Wywołanie `setState` synchronicznie w efekcie uruchamia kaskadę
      przerysowań — reguła `react-hooks/set-state-in-effect` słusznie tego
      pilnuje. Wartość pojawia się o jedną klatkę później, czego przy zegarze
      liczonym w minutach nie widać.
    */
    const tik = () => {
      const ile = Math.max(0, doKiedy - Date.now());
      setZostalo(ile);
      if (ile === 0) setDoKiedy(null);
    };
    const pierwszy = setTimeout(tik, 0);
    const id = setInterval(tik, 1000);
    return () => {
      clearTimeout(pierwszy);
      clearInterval(id);
    };
  }, [doKiedy]);

  const odblokuj = () =>
    startTransition(async () => {
      setBlad(null);
      const r = await odblokujKrytyczne(haslo, kod || undefined);
      if (!r.ok) return setBlad(r.error);
      setDoKiedy(r.otwarteDo);
      setHaslo("");
      setKod("");
      setOtwarty(false);
    });

  const zablokuj = () =>
    startTransition(async () => {
      await zablokujKrytyczne();
      setDoKiedy(null);
    });

  const minuty = Math.floor(zostalo / 60_000);
  const sekundy = Math.floor((zostalo % 60_000) / 1000);

  if (doKiedy && zostalo > 0) {
    return (
      <div className="mt-3 border border-amber-500/40 bg-amber-500/5 p-3">
        <p className="text-[10px] text-amber-500">
          {t("critical.unlockedBanner", {
            time: `${minuty}:${String(sekundy).padStart(2, "0")}`,
          })}
        </p>
        <button
          type="button"
          onClick={zablokuj}
          disabled={pending}
          className="label-tight text-ink-faint hover:text-ink mt-2 text-[10px] underline underline-offset-2"
        >
          {t("critical.lockNow")}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      {!otwarty ? (
        <button
          type="button"
          onClick={() => setOtwarty(true)}
          className="label-tight text-ink-faint hover:text-ink text-[10px]"
          title={t("critical.titleHint")}
        >
          {t("critical.unlockButton")}
        </button>
      ) : (
        <div className="border-line border p-3">
          <p className="text-ink-faint text-[10px] leading-relaxed">
            {t("critical.explain", { minutes: Math.round(okresMs / 60_000) })}
          </p>
          <input
            type="password"
            value={haslo}
            onChange={(e) => setHaslo(e.target.value)}
            placeholder={t("critical.password")}
            autoComplete="current-password"
            className="border-line bg-surface-1 text-ink mt-2 w-full border px-2 py-1.5 text-xs outline-none"
          />
          {ma2FA && (
            <input
              value={kod}
              onChange={(e) => setKod(e.target.value)}
              placeholder={t("critical.twoFactorCode")}
              inputMode="numeric"
              className="border-line bg-surface-1 text-ink mt-2 w-full border px-2 py-1.5 text-xs tracking-widest outline-none"
            />
          )}
          {blad && <p className="text-red mt-2 text-[10px]">{blad}</p>}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={odblokuj}
              disabled={pending || !haslo || (ma2FA && !kod)}
              className="label-tight border-line-strong text-ink hover:border-ink inline-flex h-8 items-center border px-3 text-[10px] disabled:opacity-50"
            >
              {t("critical.unlock")}
            </button>
            <button
              type="button"
              onClick={() => {
                setOtwarty(false);
                setBlad(null);
              }}
              className="label-tight text-ink-faint hover:text-ink text-[10px]"
            >
              {t("critical.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
