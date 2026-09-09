/**
 * Google Analytics 4 — configuration and the typed way to send an event.
 *
 * Deliberately hand-rolled rather than `@next/third-parties`: that package
 * injects gtag.js unconditionally on mount, and the one thing this integration
 * must do is NOT contact Google until the visitor has accepted analytics
 * cookies. The tag is mounted by `components/analytics/GoogleAnalytics`, which
 * is gated on `useCookieConsent() === "all"`.
 */

/**
 * The GA4 measurement ID ("G-XXXXXXXXXX"), or "" when analytics is switched
 * off — which is the state of every environment that has not set it.
 *
 * Read through `process.env.NEXT_PUBLIC_GA4_ID` as a literal, not via a computed
 * key: Next inlines `NEXT_PUBLIC_*` at build time by textual substitution, and
 * `process.env[name]` is not substituted, so it would be `undefined` in the
 * browser.
 */
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA4_ID ?? "";

/** Whether analytics is configured at all. Consent is a separate question. */
export const gaEnabled = /^G-[A-Z0-9]+$/i.test(GA_MEASUREMENT_ID);

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Send one GA4 event.
 *
 * A no-op when the tag was never loaded — which is the normal state for a
 * visitor who declined analytics, so callers do not have to check consent
 * before reporting something. That is the point: business code says "a booking
 * was submitted" and this decides whether anyone is listening.
 */
export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || typeof window.gtag !== "function")
    return;
  window.gtag("event", name, params ?? {});
}
