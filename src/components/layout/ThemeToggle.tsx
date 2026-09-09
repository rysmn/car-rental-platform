"use client";

import { useSyncExternalStore } from "react";

export const THEME_KEY = "aa-theme";
export type Theme = "dark" | "light";

/**
 * Runs before first paint (injected into <head>) so the stored theme is applied
 * to <html> synchronously — otherwise a light-mode visitor sees a black flash.
 * Kept as a plain string because it must execute before React hydrates.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`;

function SunIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.6" />
      {[
        [12, 2, 12, 4.4],
        [12, 19.6, 12, 22],
        [2, 12, 4.4, 12],
        [19.6, 12, 22, 12],
        [4.9, 4.9, 6.6, 6.6],
        [17.4, 17.4, 19.1, 19.1],
        [4.9, 19.1, 6.6, 17.4],
        [17.4, 6.6, 19.1, 4.9],
      ].map(([x1, y1, x2, y2]) => (
        <line
          key={`${x1}-${y1}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20.5 14.3A8.6 8.6 0 0 1 9.7 3.5a8.6 8.6 0 1 0 10.8 10.8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/*
 * The active theme lives on <html data-theme>, written by THEME_INIT_SCRIPT
 * before React ever runs. That makes it external state, so the toggle
 * subscribes to it rather than copying it into React state from an effect —
 * copying would mean rendering once with a wrong value and then correcting it.
 */
const listeners = new Set<() => void>();

/*
 * Eksportowane, bo motyw przestał dotyczyć wyłącznie tego przycisku: zdjęcie
 * startowe auta też od niego zależy (`lib/fleet/zdjecie-motywu.ts`). Drugi
 * taki store obok tego znaczyłby dwa zbiory słuchaczy, z których jeden nie
 * dowiaduje się o przełączeniu — czyli przycisk zmienia motyw, a galeria
 * zostaje przy starym zdjęciu do najbliższego odświeżenia.
 *
 * Sam obraz przełącza CSS, nie ten store; JavaScript pyta o motyw tylko tam,
 * gdzie musi się zgodzić z ekranem PO kliknięciu — w pełnoekranowej galerii.
 */
export function subscribeTheme(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function getThemeSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

// The server cannot know the visitor's stored choice, so it reports null and
// the component renders a placeholder until hydration reads the real value.
export const getThemeServerSnapshot = (): Theme | null => null;

const subscribe = subscribeTheme;
const getTheme = getThemeSnapshot;
const getServerTheme = getThemeServerSnapshot;

export function ThemeToggle({
  className,
  labels,
}: {
  className?: string;
  labels: { light: string; dark: string };
}) {
  const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme);

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* private mode — the choice just won't persist across visits */
    }
    listeners.forEach((notify) => notify());
  };

  // Until the effect resolves, render a same-sized placeholder so the header
  // doesn't shift once hydration completes. Same 40×40 as the button below —
  // the icon is 17px, the target a thumb can hit is not.
  if (theme === null) {
    return <span className={className} style={{ width: 40, height: 40 }} />;
  }

  const goingLight = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={goingLight ? labels.light : labels.dark}
      title={goingLight ? labels.light : labels.dark}
      // The icon stays 17px; the button around it is 40×40 so a thumb has
      // something to aim at. Measured at 17×17 on a phone before this.
      // 36px wide below 380px, 40 from there up — the header row does not fit
      // three 40px boxes plus the mark on a 320px screen. Height never changes.
      className={`text-silver hover:text-ink inline-flex h-10 w-9 items-center justify-center transition-colors min-[430px]:w-10 ${className ?? ""}`}
    >
      {goingLight ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
