import { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  greeting: string;
  name: string | null;
  subtitle?: string;
  completion?: number | null;
  loading?: boolean;
  actions?: ReactNode;
  className?: string;
}

/**
 * WelcomeHeader — greeting block with optional profile-completion ring.
 * `completion` is a 0..100 integer or null when unknown.
 */
export const WelcomeHeader = ({
  greeting,
  name,
  subtitle,
  completion,
  loading,
  actions,
  className,
}: Props) => {
  const pct = typeof completion === "number" ? Math.max(0, Math.min(100, completion)) : null;
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {greeting}
        </p>
        {loading ? (
          <Skeleton className="mt-2 h-8 w-56" />
        ) : (
          <h1 className="mt-1 font-display text-2xl sm:text-3xl text-foreground">
            {name ? `Hej ${name} 👋` : "Velkommen tilbage 👋"}
          </h1>
        )}
        {subtitle && !loading && (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-4">
        {pct !== null && pct < 100 && (
          <div className="min-w-[160px]">
            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
              <span>Profil</span>
              <span>{pct}%</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
        {actions}
      </div>
    </div>
  );
};
