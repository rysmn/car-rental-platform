import { Reveal } from "@/components/motion/Reveal";

/** Shared section header: red eyebrow label + heading + optional lead paragraph. */
export function SectionHeading({
  eyebrow,
  title,
  lead,
  as: Tag = "h2",
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  as?: "h1" | "h2";
}) {
  return (
    <Reveal>
      {eyebrow ? <p className="label text-red text-xs">{eyebrow}</p> : null}
      <Tag className="font-heading mt-4 max-w-3xl text-3xl font-bold md:text-5xl">
        {title}
      </Tag>
      {lead ? (
        <p className="text-ink-muted mt-6 max-w-2xl text-base leading-relaxed md:text-lg">
          {lead}
        </p>
      ) : null}
    </Reveal>
  );
}
