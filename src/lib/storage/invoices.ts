import "server-only";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getStorage } from "./index";

/**
 * Invoice and receipt scans attached to a cost.
 *
 * A SEPARATE directory and a separate reader from `lib/storage/media`, and the
 * separation is the whole point: `/api/media` is public by design because it
 * serves the hero photograph and the car gallery. An invoice carries a
 * counterparty, an amount and often a registration number. Putting the two in
 * one directory behind one reader means a single UUID guess — or one leaked
 * URL — hands out somebody's accounts.
 *
 * These files are served only by `/api/admin/invoice/[...path]`, which checks
 * the session first.
 */

/** Prefiks klucza w magazynie (lokalnie i w S3). */
const SUBDIR = "invoices";

/** URL prefix of the authenticated reader. */
export const INVOICE_URL_PREFIX = "/api/admin/invoice";

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Accepted types, keyed by the magic bytes that prove them.
 *
 * The browser-supplied MIME type is a hint, not evidence. PDF is here because
 * that is what an invoice actually arrives as; the image types are for a photo
 * of a paper receipt.
 */
const SIGNATURES: {
  ext: string;
  mime: string;
  test: (b: Buffer) => boolean;
}[] = [
  {
    ext: "pdf",
    mime: "application/pdf",
    test: (b) => b.subarray(0, 5).toString("ascii") === "%PDF-",
  },
  {
    ext: "jpg",
    mime: "image/jpeg",
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: "png",
    mime: "image/png",
    test: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    ext: "webp",
    mime: "image/webp",
    test: (b) =>
      b.subarray(0, 4).toString("ascii") === "RIFF" &&
      b.subarray(8, 12).toString("ascii") === "WEBP",
  },
];

export type SaveInvoiceResult =
  | { ok: true; url: string }
  | {
      ok: false;
      error: "too_large" | "empty" | "unsupported_type" | "write_failed";
    };

export async function saveInvoice(file: File): Promise<SaveInvoiceResult> {
  if (!file || file.size === 0) return { ok: false, error: "empty" };
  if (file.size > MAX_BYTES) return { ok: false, error: "too_large" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const match = SIGNATURES.find((s) => s.test(buffer));
  if (!match) return { ok: false, error: "unsupported_type" };

  // Generated name — the client's filename is never used, so it cannot smuggle
  // a path separator or a second extension.
  const filename = `${randomUUID()}.${match.ext}`;
  try {
    await getStorage().put({
      key: `${SUBDIR}/${filename}`,
      body: buffer,
      contentType: match.mime,
      visibility: "private",
    });
  } catch {
    return { ok: false, error: "write_failed" };
  }
  return { ok: true, url: `${INVOICE_URL_PREFIX}/${filename}` };
}

export function mimeForInvoice(filename: string): string | null {
  const ext = path.extname(filename).slice(1).toLowerCase();
  return SIGNATURES.find((s) => s.ext === ext)?.mime ?? null;
}

/**
 * Storage key for a requested invoice, or null if the name is not one we issued.
 * Two checks: the name must match the generated shape, so no separator or dot
 * segment can get through.
 */
export function resolveInvoicePath(segments: string[]): string | null {
  if (segments.length !== 1) return null;
  const name = segments[0];
  if (
    !name ||
    name.startsWith(".") ||
    name.includes("/") ||
    name.includes("\\")
  ) {
    return null;
  }
  if (!/^[a-f0-9-]{36}\.(pdf|jpg|png|webp)$/i.test(name)) return null;

  return `${SUBDIR}/${name}`;
}

export async function deleteInvoice(url: string | null): Promise<void> {
  if (!url || !url.startsWith(`${INVOICE_URL_PREFIX}/`)) return;
  const key = resolveInvoicePath([url.slice(INVOICE_URL_PREFIX.length + 1)]);
  if (!key) return;
  await getStorage().delete(key);
}
