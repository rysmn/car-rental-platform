import { promises as fs } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/config/site";
import { MEDIA_URL_PREFIX, resolveMediaPath } from "@/lib/storage/media";

/**
 * The social preview card, rendered on demand.
 *
 * Why generated rather than one shipped `cover.jpg`: the site publishes thirty
 * URLs, and until now every one of them shared a single photograph. A link to
 * the nine-seater van page and a link to the wedding page arrived in WhatsApp
 * looking identical, which wastes the one piece of visual real estate a shared
 * link gets. Each page now shows its own headline.
 *
 * Rendered by Satori, which supports **flexbox only** — no grid, no float, and
 * every element with more than one child needs an explicit `display: "flex"`.
 * Layouts that look fine in a browser silently collapse here.
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const BRAND = {
  void: "#000000",
  panel: "#0a0a0a",
  ink: "#ffffff",
  silver: "#e2e2e2",
  faint: "#a5a5a5",
  red: "#ed1c24",
};

/**
 * Absolute path for a site-relative image URL, or null if it is not ours.
 *
 * The `public/` branch resolves against a RELATIVE root rather than
 * `path.join(process.cwd(), …)` — deliberately. Building a path from
 * `process.cwd()` makes Next's dependency tracer conclude the whole project is
 * a runtime dependency and copy it into the standalone output; `lib/storage/
 * media.ts` carries the same note for the same reason. Node resolves the
 * relative root against the working directory either way.
 *
 * Containment is then checked on the RESULT, not on the input. These paths come
 * from an admin-editable field, and normalising a string is not the same as
 * proving where it landed: `/a/../../etc/passwd` survives a prefix-strip and
 * still escapes.
 */
function resolveImageFile(src: string): string | null {
  if (src.startsWith(`${MEDIA_URL_PREFIX}/`)) {
    // Validates the name and confines the result to UPLOAD_DIR.
    return resolveMediaPath([src.slice(MEDIA_URL_PREFIX.length + 1)]);
  }
  if (!src.startsWith("/") || src.startsWith("//")) return null;

  const root = path.resolve("public");
  const resolved = path.resolve(root, `.${path.posix.normalize(src)}`);
  return resolved.startsWith(root + path.sep) ? resolved : null;
}

/**
 * Load a car photograph off disk as a JPEG data URI.
 *
 * Satori cannot fetch a URL for us, so the bytes have to be inlined, and they
 * have to be JPEG or PNG: **Satori cannot decode WebP.** Handing it one does
 * not degrade gracefully — the render throws mid-stream and the scraper
 * receives a truncated image. Most of the fleet is stored as WebP, so
 * everything is transcoded through sharp rather than sniffed and hoped for.
 *
 * The resize is not cosmetic either: the card is 1200×630, and base64 of a
 * full-resolution original is several megabytes held in memory for pixels that
 * are then thrown away.
 *
 * Any failure — missing file, unreadable image, sharp unavailable — returns
 * null and the caller falls back to the text-only card. A card without a
 * photograph is fine; a broken one is not.
 */
async function loadPhoto(sources: string[]): Promise<string | null> {
  for (const src of sources) {
    const file = resolveImageFile(src);
    if (!file) continue;

    try {
      const bytes = await fs.readFile(file);
      const { default: sharp } = await import("sharp");
      const jpeg = await sharp(bytes)
        .rotate() // honour EXIF orientation before the dimensions are fixed
        .resize(OG_WIDTH, OG_HEIGHT, { fit: "cover", position: "centre" })
        .jpeg({ quality: 82 })
        .toBuffer();
      return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    } catch (err) {
      // Try the next photograph rather than giving up on the card: a fleet
      // entry whose first image is corrupt usually has eight more. Logged
      // because the visible symptom — a card that quietly loses its photo — is
      // otherwise indistinguishable from a car with no photo uploaded.
      console.error(`og-card: could not use ${src}:`, err);
      continue;
    }
  }
  return null;
}

export type OgCard = {
  /** Small letter-spaced line above the headline. */
  eyebrow: string;
  /** The headline. Kept to ~70 characters upstream so it stays on three lines. */
  title: string;
  /** Optional strap under the rule — a price, a location, a promise. */
  footnote?: string;
  /**
   * Candidate photographs, site-relative, best first. A list rather than one
   * path so a single unreadable file does not cost the card its image.
   */
  photos?: string[];
};

export async function renderOgCard({
  eyebrow,
  title,
  footnote,
  photos,
}: OgCard): Promise<ImageResponse> {
  const image = await loadPhoto(photos ?? []);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        backgroundColor: BRAND.panel,
        color: BRAND.ink,
        fontFamily: "sans-serif",
      }}
    >
      {image && (
        /* Satori renders to a PNG, not to a DOM: `next/image` has nothing to
             optimise here and `alt` has nobody to read it. */
        /* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */
        <img
          src={image}
          width={OG_WIDTH}
          height={OG_HEIGHT}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      )}
      {/*
        Scrim. With a photo it is what keeps the headline readable over a light
        bonnet or a bright reflection; without one it is the faint vignette that
        stops the card reading as a flat black rectangle.

        Two Satori quirks are load-bearing here, and both fail SILENTLY —
        the symptom of either is white text printed straight onto a photograph:
          · `backgroundImage`, never the `background` shorthand: no gradient is
            parsed out of the shorthand.
          · explicit `width`/`height`, never `inset: 0` alone: an absolutely
            positioned box with no dimensions is laid out at zero size.
      */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundImage: image
            ? "linear-gradient(90deg, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.93) 38%, rgba(0,0,0,0.72) 60%, rgba(0,0,0,0.30) 84%, rgba(0,0,0,0.15) 100%)"
            : `linear-gradient(120deg, ${BRAND.void} 0%, #161616 100%)`,
        }}
      />
      {/* Signal-red spine down the left edge — the one brand mark on the card. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 12,
          backgroundColor: BRAND.red,
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "68px 72px 60px 84px",
          width: image ? "68%" : "100%",
          height: "100%",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 24,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: BRAND.red,
              fontWeight: 700,
            }}
          >
            {siteConfig.name}
          </div>
          <div
            style={{
              marginTop: 10,
              fontSize: 22,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: BRAND.faint,
            }}
          >
            {eyebrow}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: title.length > 46 ? 62 : 76,
            lineHeight: 1.08,
            fontWeight: 700,
            color: BRAND.ink,
          }}
        >
          {title}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              width: 96,
              height: 4,
              backgroundColor: BRAND.red,
              marginBottom: 22,
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              fontSize: 26,
              color: BRAND.silver,
            }}
          >
            <div style={{ display: "flex" }}>{footnote ?? ""}</div>
            <div style={{ display: "flex", color: BRAND.faint }}>
              aacorporation.pl
            </div>
          </div>
        </div>
      </div>
    </div>,
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      headers: {
        // Scrapers re-fetch rarely and cache hard on their side anyway; a day
        // is long enough to keep this off the critical path and short enough
        // that a copy change is picked up on the next share.
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    },
  );
}
