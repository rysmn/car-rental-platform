"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { useCookieConsent } from "@/components/consent/CookieConsent";
import { GA_MEASUREMENT_ID, gaEnabled } from "@/lib/analytics/ga";

/**
 * Google Analytics 4, mounted only after the visitor accepts analytics cookies.
 *
 * Nothing is requested from Google before that click — no gtag.js, no
 * cookieless "consent mode" ping. Consent Mode's default-denied pattern is the
 * common alternative and is defensible, but it still hands Google the
 * visitor's IP and page URL on first paint. Refusing to load at all is the
 * reading of the ePrivacy Directive that the privacy policy on this site
 * actually makes, so it is the one the code has to implement.
 *
 * Two consequences worth knowing before anyone "improves" this:
 *   · Sessions from visitors who decline are invisible. Traffic here will read
 *     lower than the server's own request counts, and that is correct, not a
 *     bug to be worked around.
 *   · Withdrawing consent unmounts the tag but cannot unload a script the
 *     browser has already executed, so a `consent: update → denied` is sent on
 *     the way out to stop gtag writing anything further before a reload.
 */
export function GoogleAnalytics() {
  const consent = useCookieConsent();
  const granted = gaEnabled && consent === "all";
  const pathname = usePathname();
  const configured = useRef(false);

  /*
   * Bootstrap.
   *
   * The whole gtag command sequence is issued here rather than from an inline
   * <Script>, because ORDER MATTERS and an inline script gives no ordering
   * guarantee against React's effects: GA4 discards an event queued ahead of
   * the `config` that names the property. Pushing straight onto `dataLayer`
   * works before gtag.js has downloaded — the array *is* the queue, which is
   * the entire reason Google's own snippet is shaped this way.
   */
  useEffect(() => {
    if (!granted || configured.current) return;

    window.dataLayer = window.dataLayer ?? [];
    if (typeof window.gtag !== "function") {
      window.gtag = function gtag() {
        // Must forward `arguments` itself, not an array copy — gtag.js reads
        // the Arguments object and ignores a plain array.
        // eslint-disable-next-line prefer-rest-params
        window.dataLayer!.push(arguments);
      };
    }

    window.gtag("js", new Date());
    window.gtag("consent", "default", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    // send_page_view:false — the effect below owns every page view, the first
    // one included, so a client-side navigation and a cold load are reported
    // through exactly one code path and the first hit cannot be counted twice.
    window.gtag("config", GA_MEASUREMENT_ID, { send_page_view: false });
    configured.current = true;
  }, [granted]);

  useEffect(() => {
    if (!granted || !configured.current) return;
    window.gtag?.("event", "page_view", {
      // Read at send time rather than rebuilt from `pathname`: this is the URL
      // the visitor is actually on, query string, locale prefix and all.
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [granted, pathname]);

  useEffect(() => {
    if (granted || !configured.current) return;
    window.gtag?.("consent", "update", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    configured.current = false;
  }, [granted]);

  if (!granted) return null;

  return (
    <Script
      id="ga-loader"
      strategy="afterInteractive"
      src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
    />
  );
}
