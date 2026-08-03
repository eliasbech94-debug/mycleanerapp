import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  description: string;
  className?: string;
}

/**
 * ComingSoonCard — honest stub for features whose backend does not yet
 * exist. Never renders fake data. Reserves layout space so the surface
 * can slot the real feature in later without a redesign.
 */
export const ComingSoonCard = ({ title, description, className }: Props) => (
  <div
    className={cn(
      "relative overflow-hidden rounded-2xl border border-dashed border-border bg-muted/30 p-5",
      className,
    )}
  >
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
      >
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-display text-base text-foreground">{title}</p>
          <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Kommer snart
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  </div>
);
