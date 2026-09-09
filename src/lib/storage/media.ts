import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { reportAlert } from "@/lib/alerts/record";

/**
 * Persistent media for admin-uploaded images (currently the home hero).
 *
 * Files live OUTSIDE the app bundle, in a directory backed by a Docker volume,
 * so they survive image rebuilds and container recreation — `public/` cannot be
 * used because it is baked into the build. They are served back through
 * /api/media/[...path], which is the only reader of this directory.
 */
/**
 * Resolved lazily rather than at module scope: computing a path with
 * `process.cwd()` during import makes Next's dependency tracer assume the whole
 * project is a runtime dependency and pull it into the standalone output.
 */
export function uploadDir(): string {
  // Deliberately a relative path rather than path.join(process.cwd(), …):
  // Node resolves it against the working directory anyway, and building a path
  // from cwd() here makes Next's tracer pull the entire project into the
  // standalone output. In production UPLOAD_DIR is always set (see compose).
  return process.env.UPLOAD_DIR ?? ".storage/media";
}

/** URL prefix the serve route is mounted at. */
export const MEDIA_URL_PREFIX = "/api/media";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Accepted image types, keyed by the magic bytes that actually prove the type.
 * The browser-supplied MIME type is a hint, not evidence — we check the real
 * signature so a script can't be stored with an .jpg extension.
 */
const SIGNATURES: {
  ext: string;
  mime: string;
  test: (b: Buffer) => boolean;
}[] = [
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

export type SaveResult =
  | { ok: true; url: string; filename: string }
  | {
      ok: false;
      error: "too_large" | "empty" | "unsupported_type" | "write_failed";
    };

/** Validates and stores an uploaded image, returning the URL to serve it from. */
export async function saveImage(file: File): Promise<SaveResult> {
  if (!file || file.size === 0) return { ok: false, error: "empty" };
  if (file.size > MAX_BYTES) return { ok: false, error: "too_large" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const match = SIGNATURES.find((s) => s.test(buffer));
  if (!match) return { ok: false, error: "unsupported_type" };

  // Generated name — the client's filename is never used, so it cannot smuggle
  // path separators or a second extension.
  const filename = `${randomUUID()}.${match.ext}`;

  try {
    await fs.mkdir(uploadDir(), { recursive: true });
    await fs.writeFile(path.join(uploadDir(), filename), buffer);
  } catch (err) {
    /*
     * The only failure here that is ours.
     *
     * `too_large`, `empty` and `unsupported_type` above are the visitor picking
     * the wrong file — an alert for those would be a register full of somebody
     * choosing a PDF. This one is the disk: a full volume, a permission that
     * changed, a mount that vanished. The admin sees "Błąd zapisu" and moves
     * on; without this line nobody else ever learns the gallery stopped
     * accepting photographs.
     *
     * Reported here rather than at the two call sites (fleet and settings) so
     * neither can forget, and so the fingerprint stays one fault, not two.
     */
    reportAlert({
      module: "media",
      severity: "error",
      key: "saveImage:write-failed",
      title: "Nie udało się zapisać wgranego pliku",
      error: err,
      // The generated name, never the visitor's: their filename is untrusted
      // text and the size is all that is diagnostically useful anyway.
      context: { katalog: uploadDir(), plik: filename, bajtow: file.size },
    });
    return { ok: false, error: "write_failed" };
  }

  return { ok: true, url: `${MEDIA_URL_PREFIX}/${filename}`, filename };
}

/** Content type for a stored file, or null if the extension isn't one we serve. */
export function mimeForFilename(filename: string): string | null {
  const ext = path.extname(filename).slice(1).toLowerCase();
  return SIGNATURES.find((s) => s.ext === ext)?.mime ?? null;
}

/**
 * Resolves a requested media path to an absolute file path, or null if it
 * escapes the upload directory. Rejects traversal both by shape (no separators,
 * no dotfiles) and by result (the resolved path must stay inside UPLOAD_DIR).
 */
export function resolveMediaPath(segments: string[]): string | null {
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
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/i.test(name)) return null;

  const resolved = path.resolve(uploadDir(), name);
  const root = path.resolve(uploadDir());
  if (resolved !== path.join(root, name)) return null;

  return resolved;
}

/** Removes a previously stored file. Missing files are not an error. */
export async function deleteImage(url: string): Promise<void> {
  if (!url.startsWith(`${MEDIA_URL_PREFIX}/`)) return;
  const name = url.slice(MEDIA_URL_PREFIX.length + 1);
  const resolved = resolveMediaPath([name]);
  if (!resolved) return;
  await fs.rm(resolved, { force: true });
}
