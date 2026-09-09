import "server-only";
import { notFound } from "next/navigation";
import { getSetting, type TogglablePage } from "./settings";

/**
 * Renders a 404 when the operator has disabled this page in the admin panel.
 *
 * Hiding the link in the navigation is presentation; this is the actual gate —
 * without it a disabled page would still answer on a direct URL, in sitemaps,
 * and in search results.
 */
export async function requirePageEnabled(page: TogglablePage): Promise<void> {
  const pages = await getSetting("pages");
  if (!pages[page]) notFound();
}
