"use client";

import { COOKIE_OPEN_EVENT } from "./CookieConsent";

/** Re-opens the cookie banner from the footer so a choice can be changed. */
export function CookieSettingsButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(COOKIE_OPEN_EVENT))}
      className="hover:text-ink tap py-2.5 text-left transition-colors sm:py-1.5"
    >
      {label}
    </button>
  );
}
