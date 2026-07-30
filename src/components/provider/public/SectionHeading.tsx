/**
 * Shared section heading for the public provider profile.
 *
 * Presentation only: an accented icon tile + title (+ optional subtitle and
 * trailing slot) so every major section reads with the same rhythm and the
 * page becomes scannable instead of a stack of identical white cards.
 */
import type { ComponentType, ReactNode } from "react";

type Tone = "blue" | "amber" | "emerald" | "violet";

const TONES: Record<Tone, { tile: string; icon: string; rule: string }> = {
  blue: {
    tile: "bg-[hsl(222_88%_42%/0.10)]",
    icon: "text-[hsl(222_88%_42%)]",
    rule: "bg-[hsl(222_88%_42%/0.25)]",
  },
  amber: {
    tile: "bg-amber-400/15",
    icon: "text-amber-500",
    rule: "bg-amber-400/40",
  },
  emerald: {
    tile: "bg-emerald-500/12",
    icon: "text-emerald-600",
    rule: "bg-emerald-500/30",
  },
  violet: {
    tile: "bg-violet-500/12",
    icon: "text-violet-600",
    rule: "bg-violet-500/30",
  },
};

export type SectionHeadingProps = {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  subtitle?: string;
  tone?: Tone;
  /** Optional trailing content (counts, links, controls). */
  trailing?: ReactNode;
  id?: string;
};

export function SectionHeading({
  icon: Icon,
  title,
  subtitle,
  tone = "blue",
  trailing,
  id,
}: SectionHeadingProps) {
  const t = TONES[tone];
  return (
    <div className="flex items-center gap-3">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${t.tile}`}>
        <Icon className={`h-[18px] w-[18px] ${t.icon}`} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h2
          id={id}
          className="text-xl font-bold tracking-tight text-[hsl(224_72%_18%)] xl:text-2xl"
        >
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 truncate text-sm text-[hsl(224_20%_45%)]">{subtitle}</p>
        )}
      </div>
      <span aria-hidden className={`hidden h-px flex-1 rounded-full sm:block ${t.rule}`} />
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}

export default SectionHeading;
