import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  loading?: boolean;
  className?: string;
}

/**
 * StatCard — compact metric tile. Uses semantic tokens only; never
 * hardcodes colors. Shows a skeleton until `loading` clears.
 */
export const StatCard = ({ label, value, hint, icon: Icon, loading, className }: Props) => (
  <div
    className={cn(
      "rounded-2xl border border-border bg-card p-4 sm:p-5 transition-shadow hover:shadow-sm",
      className,
    )}
  >
    <div className="flex items-start justify-between gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      {Icon && (
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"
        >
          <Icon className="h-4 w-4" />
        </span>
      )}
    </div>
    {loading ? (
      <Skeleton className="mt-3 h-8 w-24" />
    ) : (
      <div className="mt-2 font-display text-2xl sm:text-3xl leading-tight text-foreground">
        {value}
      </div>
    )}
    {hint && !loading && (
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    )}
  </div>
);
