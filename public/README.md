# Static assets

Image and logo files were **not** included in this repository because their
usage rights could not be confirmed for public redistribution (brand marks and
vehicle photography). The application runs without them; the affected `<Image>`
elements simply render nothing.

To restore visuals, drop your own files at these paths:

| Path                                  | Used by                                   |
| ------------------------------------- | ----------------------------------------- |
| `public/brand/aa-logo-dark.png`       | Header, admin panel, organisation JSON-LD |
| `public/brand/aa-logo-dark-alpha.png` | Transparent header logo                   |
| `public/brand/aa-logo-color-light-alpha.png` | Light-theme header logo            |
| `public/brand/aa-logo-mono-black.png` | Light-theme admin logo                    |
| `public/hero/<car>.jpg`               | Home page hero fallback                   |
| `public/fleet/<car-slug>.jpg`         | Fleet card and detail photos              |
| `public/og/cover.jpg`                 | Default Open Graph / social card          |

Fleet image paths are declared in `src/lib/fleet/data.ts`, the hero fallback in
`src/lib/admin/settings.ts`, and the Open Graph cover in `src/lib/seo.ts`.

App icons (`src/app/icon.png`, `apple-icon.png`, `favicon.ico`) were removed for
the same reason. Next.js generates the routes automatically once you add them
back.
