import type { ComponentProps } from "react";
import { Link, type AppHref } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Variant = "primary" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

/**
 * Shape, focus ring and transition — everything a button looks like before it
 * has a colour or a size.
 *
 * Exported, and that is the point. Not every button on this site can be a
 * `<Button>`: a link leaving the site is a plain `<a>`, because `ButtonLink`
 * routes through next-intl's `Link` and only accepts internal hrefs. Those
 * anchors used to carry a hand-copied class list, and on 02.09.2026 one of
 * them cost the site its "Dodaj opinię" button — the copy had
 * `border-line-strong` (a colour) but had dropped `border` (the width), so the
 * element rendered as bare text. On a desktop `hover:border-ink` painted a
 * frame the moment the pointer arrived and nobody noticed; on a phone, where
 * there is no hover, there was never a button to see.
 *
 * A copy can drift. An import cannot.
 */
export const buttonBase =
  "label tap inline-flex items-center justify-center gap-2 rounded-none transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red/60 focus-visible:ring-offset-2 focus-visible:ring-offset-void disabled:pointer-events-none disabled:opacity-50";

export const buttonVariants: Record<Variant, string> = {
  // The one place red is a fill (brand direction).
  primary: "bg-red text-white hover:bg-red-hover",
  outline: "border border-line-strong text-ink hover:border-ink hover:bg-ink/5",
  ghost: "text-silver hover:text-ink",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-[11px]",
  md: "h-11 px-6 text-xs",
  lg: "h-14 px-9 text-sm",
};

type BaseProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: BaseProps & ComponentProps<"button">) {
  return (
    <button
      className={cn(
        buttonBase,
        buttonVariants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

/**
 * `hash` osobno, a nie w `href`.
 *
 * `AppHref` pochodzi z `getPathname`, które zwraca sam adres i dlatego zna
 * wyłącznie `pathname`, `params` i `query`. Kotwica nie należy do adresu
 * w rozumieniu tłumaczenia tras — jest identyfikatorem elementu na stronie,
 * ten sam w obu językach. Trzymanie jej w osobnym polu pozwala zostawić
 * `AppHref` bez zmian i nie rozszczelnia typów tras, a `Link` z next-intl
 * przyjmuje `hash` jako część obiektu `UrlObject`.
 *
 * Po co w ogóle: przycisk „Zarezerwuj" na karcie floty prowadził na GÓRĘ strony
 * auta, czyli — na telefonie — dwa i pół ekranu nad formularz rezerwacji.
 * Nazwa obiecywała ostatni krok, a dawała pierwszy.
 */
export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  href,
  hash,
  children,
}: BaseProps & { href: AppHref; hash?: string }) {
  return (
    <Link
      href={
        hash
          ? // `href` bywa gołym adresem („/fleet") albo obiektem z parametrami
            // trasy dynamicznej. Kotwica dokleja się do obu, bez zgadywania.
            typeof href === "string"
            ? ({ pathname: href, hash } as unknown as AppHref)
            : ({ ...href, hash } as unknown as AppHref)
          : href
      }
      className={cn(
        buttonBase,
        buttonVariants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </Link>
  );
}
