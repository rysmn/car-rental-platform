import { cn } from "@/lib/utils";

/** Page gutter + max width. Wide, cinematic — content breathes on large screens. */
export function Container({
  className,
  children,
  bleedOnPhone,
}: {
  className?: string;
  children: React.ReactNode;
  /**
   * Drops the phone gutter entirely, so photography and full-width rows run
   * edge to edge on a handset. Written as a prop rather than a `px-0` override
   * from the caller because `cn` only joins strings — two competing `px-*`
   * utilities would be resolved by stylesheet order, not by call order.
   */
  bleedOnPhone?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1440px] md:px-10",
        bleedOnPhone ? "px-0" : "px-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
