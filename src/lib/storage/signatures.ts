import "server-only";
import { randomUUID } from "node:crypto";
import { getStorage } from "./index";

/**
 * Customer signatures from the handover protocols.
 *
 * A third directory, beside `media` (public by design — it serves the hero
 * photograph) and `invoices` (admin-only). A signature is personal data and
 * evidence at the same time: it identifies a named person and it is the thing
 * that makes a protocol worth anything in a dispute. It belongs behind the
 * session check, and it must not sit in the same folder as anything served
 * without one.
 *
 * Written from a data URL rather than an upload, because that is what a canvas
 * produces on a phone. The base64 is decoded here and the PNG magic bytes are
 * checked before anything reaches the disk — a string that claims to be a PNG
 * is not evidence that it is one.
 */

const SUBDIR = "signatures";

/** URL prefix of the authenticated reader. */
export const SIGNATURE_URL_PREFIX = "/api/admin/podpis";

/**
 * 300 KB. A finger-drawn line on a 600×200 canvas is 5–30 KB; anything an
 * order of magnitude past that is a photograph somebody pasted in, and a
 * signature field is not a place to store photographs.
 */
const MAX_BYTES = 300 * 1024;

const DATA_URL_RE = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/;

export type SaveSignatureResult =
  | { ok: true; url: string }
  | { ok: false; error: "empty" | "too_large" | "not_png" | "write_failed" };

export async function saveSignature(
  dataUrl: string,
): Promise<SaveSignatureResult> {
  const trimmed = (dataUrl ?? "").trim();
  if (!trimmed) return { ok: false, error: "empty" };

  const match = DATA_URL_RE.exec(trimmed);
  if (!match) return { ok: false, error: "not_png" };

  const buffer = Buffer.from(match[1], "base64");
  if (buffer.length === 0) return { ok: false, error: "empty" };
  if (buffer.length > MAX_BYTES) return { ok: false, error: "too_large" };

  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  if (!isPng) return { ok: false, error: "not_png" };

  const filename = `${randomUUID()}.png`;
  try {
    await getStorage().put({
      key: `${SUBDIR}/${filename}`,
      body: buffer,
      contentType: "image/png",
      visibility: "private",
    });
  } catch {
    return { ok: false, error: "write_failed" };
  }
  return { ok: true, url: `${SIGNATURE_URL_PREFIX}/${filename}` };
}

/**
 * Storage key for a requested signature, or null if the name is not one we issued.
 */
export function resolveSignaturePath(segments: string[]): string | null {
  if (segments.length !== 1) return null;
  const name = segments[0];
  if (!name || name.startsWith(".") || name.includes("/") || name.includes("\\")) {
    return null;
  }
  if (!/^[a-f0-9-]{36}\.png$/i.test(name)) return null;

  return `${SUBDIR}/${name}`;
}

export async function deleteSignature(url: string | null): Promise<void> {
  if (!url || !url.startsWith(`${SIGNATURE_URL_PREFIX}/`)) return;
  const key = resolveSignaturePath([url.slice(SIGNATURE_URL_PREFIX.length + 1)]);
  if (!key) return;
  await getStorage().delete(key);
}
