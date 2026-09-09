"use client";

import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { Link } from "@/i18n/navigation";

/** Na serwerze `useLayoutEffect` ostrzega i nie ma czego układać. */
const useEfektUkladu =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

// localStorage + cookie key holding the visitor's choice ("all" | "essential").
// The choice record itself is strictly necessary, so it is allowed without consent.
// This banner is the gate for analytics: `useCookieConsent()` below is the only
// supported way to read it, and Google Analytics is not loaded — not even the
// gtag.js tag itself — until it returns "all".
const KEY = "aa-cookie-consent";
export const COOKIE_OPEN_EVENT = "aa:cookie-open";

/** Atrybut na `<html>`, którym skrypt z `<head>` włącza pasek zgód. */
const ATRYBUT = "data-zgody";

/**
 * Decyzja „czy pytamy o zgody", podjęta PRZED pierwszym malowaniem.
 *
 * ## Co to naprawia (06.09.2026)
 *
 * Pasek zgód jest `fixed`, więc sam niczego nie spychał — ale uruchamiacz
 * asystenta stoi NAD nim i mierzy jego wysokość. Pasek montował się dopiero po
 * hydratacji, czyli o jedną klatkę za późno, i uruchamiacz podskakiwał wtedy
 * o 176 px: `layout-shift` 0,0312, ostatnia pozycja CLS strony głównej po
 * naprawie paska językowego.
 *
 * Wysokości paska nie da się przewidzieć, ale JEGO OBECNOŚCI owszem: odpowiedź
 * klienta leży w `localStorage` i w ciasteczku, a oba są dostępne
 * synchronicznie w `<head>`. Pasek jedzie więc z serwera schowany, a ten
 * skrypt włącza go przed pierwszym malowaniem — tak samo jak motyw, waluta
 * i propozycja języka. Uruchamiacz mierzy wtedy stan ostateczny i nigdzie
 * już nie skacze.
 *
 * Awaryjnie (brak skryptu, wyjątek) atrybut nie powstaje i paska nie ma —
 * a wtedy React pokazuje go po hydratacji, dokładnie jak dotąd. Zgoda nigdy
 * nie zostaje domniemana: brak paska to brak zgody na analitykę, bo o tym
 * decyduje wyłącznie zapisany wybór, czytany osobno przez `useCookieConsent`.
 */
export const COOKIE_INIT_SCRIPT = `(function(){try{
var v=null;try{v=localStorage.getItem('${KEY}')}catch(x){}
if(!v){var m=document.cookie.match(/(?:^|; )${KEY}=([^;]*)/);v=m?m[1]:null}
if(v!=='all'&&v!=='essential')document.documentElement.setAttribute('${ATRYBUT}','pytamy')
}catch(x){}})()`;

type Choice = "all" | "essential";

export type ConsentLabels = {
  title: string;
  body: string;
  acceptAll: string;
  essential: string;
  privacy: string;
};

/*
 * Whether the banner shows depends on two things React does not own: the choice
 * stored in localStorage, and the global "reopen" event the footer link fires.
 * Both are read through a store rather than copied into state from an effect —
 * an effect would render the banner hidden and then flash it in.
 */
let reopened = false;
const listeners = new Set<() => void>();
const notifyAll = () => listeners.forEach((notify) => notify());

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onOpen = () => {
    reopened = true;
    notifyAll();
  };
  window.addEventListener(COOKIE_OPEN_EVENT, onOpen);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener(COOKIE_OPEN_EVENT, onOpen);
  };
}

function storedChoice(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Visible until the visitor has answered — or again once they reopen it. */
const isVisible = () => reopened || storedChoice() === null;

/**
 * The visitor's current choice, live.
 *
 * Shares the store the banner itself uses, so accepting or withdrawing consent
 * re-renders every consumer in the same tick — analytics starts and stops with
 * the click rather than on the next page load. Returns `null` on the server and
 * before an answer, which every consumer must treat as "not consented".
 */
export function useCookieConsent(): Choice | null {
  const value = useSyncExternalStore(
    subscribe,
    storedChoice,
    () => null as string | null,
  );
  return value === "all" || value === "essential" ? value : null;
}

/*
  Serwer nie zna odpowiedzi klienta, więc renderuje pasek ZAWSZE — schowany
  przez `globals.css`, a włączany atrybutem, który ustawia `COOKIE_INIT_SCRIPT`
  jeszcze przed pierwszym malowaniem. `true` w migawce serwerowej znaczy więc
  „narysuj znacznik", a nie „pokaż pasek": o widoczności decyduje wyłącznie
  atrybut na `<html>`.
*/
const isVisibleOnServer = () => true;

export function CookieConsent({ labels }: { labels: ConsentLabels }) {
  const visible = useSyncExternalStore(subscribe, isVisible, isVisibleOnServer);

  /*
    Atrybut i React muszą mówić to samo. Skrypt z `<head>` załatwia pierwsze
    malowanie; ten efekt układu — każdy następny stan: kliknięcie „Akceptuję",
    ponowne otwarcie z odnośnika w stopce i nawigację miękką, przy której
    skrypt z nagłówka już nie biegnie. `useLayoutEffect`, bo uruchamiacz
    asystenta mierzy ten pasek i musi zobaczyć stan ostateczny w tej samej
    klatce.
  */
  useEfektUkladu(() => {
    const html = document.documentElement;
    if (visible) html.setAttribute(ATRYBUT, "pytamy");
    else html.removeAttribute(ATRYBUT);
  }, [visible]);

  const choose = (value: Choice) => {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* private mode — fall back to the cookie only */
    }
    document.cookie = `${KEY}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    reopened = false;
    notifyAll();
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={labels.title}
      // Marked so the chat launcher can measure this banner and sit above it.
      // Without that, the banner covers the launcher on every width and a
      // first-time visitor cannot open the assistant until they answer cookies.
      data-consent-banner=""
      className="border-line bg-void/95 fixed inset-x-0 bottom-0 z-50 border-t backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between md:px-10">
        <div className="max-w-2xl">
          <p className="font-heading text-ink text-sm font-bold">
            {labels.title}
          </p>
          <p className="text-ink-muted mt-1 text-xs leading-relaxed">
            {labels.body}{" "}
            <Link
              href="/polityka-prywatnosci"
              className="text-silver hover:text-ink underline underline-offset-2"
            >
              {labels.privacy}
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={() => choose("essential")}
            className="label border-line-strong text-ink hover:border-ink hover:bg-ink/5 inline-flex h-11 items-center border px-5 text-xs transition-colors"
          >
            {labels.essential}
          </button>
          <button
            type="button"
            onClick={() => choose("all")}
            className="label bg-red hover:bg-red-hover inline-flex h-11 items-center px-6 text-xs text-white transition-colors"
          >
            {labels.acceptAll}
          </button>
        </div>
      </div>
    </div>
  );
}
