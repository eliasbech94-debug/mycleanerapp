import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  title: string;
  description?: string;
  action?: ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyState?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/**
 * SectionCard — titled card wrapper. Handles `loading` skeleton and
 * `empty` state fallback so page-level components stay declarative.
 */
export const SectionCard = ({
  title,
  description,
  action,
  loading,
  empty,
  emptyState,
  children,
  className,
  bodyClassName,
}: Props) => (
  <section
    className={cn(
      "rounded-2xl border border-border bg-card overflow-hidden",
      className,
    )}
  >
    <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5 sm:py-4">
      <div className="min-w-0">
        <h2 className="font-display text-lg text-foreground">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
    <div className={cn("p-4 sm:p-5", bodyClassName)}>
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-2/3" />
        </div>
      ) : empty ? (
        emptyState
      ) : (
        children
      )}
    </div>
  </section>
);
