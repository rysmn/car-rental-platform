import "server-only";
import sanitizeHtml from "sanitize-html";

/**
 * Sanitises admin-authored legal HTML before it is stored and before it is
 * rendered.
 *
 * The admin panel is trusted, but "trusted" is an account, not a guarantee —
 * a stolen admin session must not be able to plant script into a page every
 * visitor loads. So we allowlist a small formatting vocabulary and drop
 * everything else, including all attributes except link targets.
 *
 * Sanitising on write AND on read is deliberate: rows written before this
 * allowlist existed (or by a future code path that forgets) still render safe.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h2",
    "h3",
    "p",
    "ul",
    "ol",
    "li",
    "strong",
    "em",
    "br",
    "blockquote",
    "a",
  ],
  allowedAttributes: {
    a: ["href", "title"],
  },
  // No javascript:/data: URLs — only real navigable links.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href"],
  // Anything outside the allowlist loses its tag but keeps its text, so an
  // admin never silently loses the words they typed.
  disallowedTagsMode: "discard",
  transformTags: {
    // External links must not hand the opener window to the destination.
    a: sanitizeHtml.simpleTransform("a", {
      rel: "noopener noreferrer",
      target: "_blank",
    }),
    // Editors emit h1 for top-level headings; the page already has one.
    h1: "h2",
  },
};

export function sanitizeLegalHtml(dirty: string): string {
  if (!dirty) return "";
  return sanitizeHtml(dirty, OPTIONS).trim();
}

/** True when the value carries actual content (not just empty markup). */
export function hasContent(html: string): boolean {
  return (
    sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
      .replace(/&nbsp;/g, " ")
      .trim().length > 0
  );
}
