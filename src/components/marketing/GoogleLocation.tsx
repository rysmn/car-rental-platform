import type { GoogleView } from "@/lib/company/google";
import { GoogleReviewBar } from "@/components/marketing/GoogleReviewBar";
import { buttonBase, buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * Both Google buttons, one class list.
 *
 * The look is imported from `Button`, never retyped — see the comment on
 * `buttonBase`. What is added here is only what is specific to this row:
 *
 * `w-full sm:w-auto` — on a phone each button takes the whole column. Side by
 * side these two are 283 px and 198 px of upper-case text; at 360 px there is
 * 312 px of column, so they wrap anyway and a half-width leftover reads like a
 * mistake. Full width also gives the tap target the whole gutter-to-gutter
 * width instead of whatever the longest word happened to earn.
 *
 * `px-6 sm:px-9` — the desktop padding is 36 px a side. On a 320 px screen the
 * column is 272 px and the longer label needs 211 px of it; 36+36 does not fit
 * and the text would push the page sideways. 24 px a side does, with room left.
 *
 * `h-14` (56 px) clears the 44 px touch minimum on its own; `tap` in the base
 * is belt and braces.
 */
const googleButton = cn(
  buttonBase,
  buttonVariants.outline,
  "h-14 w-full px-6 text-center text-sm sm:w-auto sm:px-9",
);

/**
 * The map and the two Google buttons on the contact page.
 *
 * Renders nothing at all when there is nothing to render. Not an empty box, not
 * a grey placeholder, not a disabled button — the whole section disappears,
 * because a visitor who never sees a map does not wonder what is wrong with it,
 * while one who sees an empty frame concludes the site is broken.
 *
 * Every decision about *whether* an element may appear was already made in
 * `googleView`. This file only lays out what survived that, which is why there
 * is not a single `&&` here testing a URL for emptiness: two places deciding
 * the same thing is how they come to disagree.
 */
export function GoogleLocation({
  view,
  labels,
}: {
  view: GoogleView;
  labels: {
    /** Section heading, e.g. "Znajdź nas". */
    title: string;
    /** Accessible title of the map frame. */
    mapTitle: string;
    seeOnGoogle: string;
    addReview: string;
    /** Napisy paska opinii — patrz `GoogleReviewBar`. */
    reviews: {
      rating: string | null;
      count: string | null;
      title: string;
      readAll: string;
      aria: string;
    };
  };
}) {
  const hasButtons = Boolean(view.profileHref || view.reviewHref);
  if (!view.mapSrc && !hasButtons && !view.reviews) return null;

  return (
    <div className="mt-20">
      <h2 className="label text-ink-faint text-xs">{labels.title}</h2>

      {/*
        Pasek opinii NAD mapą, i to jest decyzja, nie przypadek.

        Reputacja jest pierwszym pytaniem odwiedzającego („komu ja właściwie
        oddaję kartę"), a mapa drugim („gdzie po to jechać"). Pasek zajmuje
        jedną linijkę, więc postawiony wyżej niczego nie spycha; postawiony
        POD mapą lądowałby na telefonie tuż nad „DODAJ OPINIĘ" i dwa różne
        działania — czytanie cudzych opinii i wystawianie własnej — stałyby
        obok siebie jak wariant tego samego przycisku.
      */}
      {view.reviews && (
        <GoogleReviewBar reviews={view.reviews} labels={labels.reviews} />
      )}

      {view.mapSrc && (
        /*
          The frame is boxed by an aspect ratio rather than a fixed height, so
          it scales with the column instead of leaving a letterbox on a phone.
          `overflow-hidden` on the wrapper keeps the iframe's own chrome from
          spilling a pixel past the border at any width — the map is the one
          element on this page that comes from another origin and cannot be
          measured before it loads.
        */
        <div className="border-line mt-6 aspect-[16/10] w-full overflow-hidden border sm:aspect-[21/9]">
          <iframe
            src={view.mapSrc}
            title={labels.mapTitle}
            /*
              `lazy`: the map sits well below the fold on every width, and it is
              by far the heaviest thing on the contact page. Loading it on
              arrival would spend the visitor's connection on something they may
              never scroll to.
            */
            loading="lazy"
            /*
              A cross-origin frame gets referrer trimmed to the origin and no
              rights beyond drawing itself: no scripts reaching our page, no
              form submission, no popups, no top-level navigation.
            */
            referrerPolicy="no-referrer-when-downgrade"
            sandbox="allow-scripts allow-same-origin allow-popups"
            className="block h-full w-full border-0"
          />
        </div>
      )}

      {hasButtons && (
        /*
          Column on a phone, row from `sm` up. `flex-wrap` alone put the two
          buttons on one line whenever they fitted and on two when they did
          not, which on the narrow widths meant one full-width-looking button
          above a short one — the same row rendering differently at 375 and
          390 px for no reason a visitor could see.
        */
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
          {view.profileHref && (
            <a
              href={view.profileHref}
              target="_blank"
              rel="noopener noreferrer"
              className={googleButton}
            >
              {labels.seeOnGoogle}
            </a>
          )}
          {view.reviewHref && (
            <a
              href={view.reviewHref}
              target="_blank"
              rel="noopener noreferrer"
              className={googleButton}
            >
              {labels.addReview}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
