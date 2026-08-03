import { CalendarX2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Shared skeleton for the calendar shell / views. Keeps layout stable. */
export function CalendarSkeleton({ variant = "grid" }: { variant?: "grid" | "agenda" }) {
  if (variant === "agenda") {
    return (
      <div className="space-y-3" data-testid="calendar-skeleton">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-3" data-testid="calendar-skeleton">
      <Skeleton className="h-10 w-full rounded-xl" />
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-[420px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function CalendarEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  className,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div
      data-testid="calendar-empty"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-10 text-center",
        className,
      )}
    >
      <CalendarX2 className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-semibold text-foreground">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actionLabel && onAction && (
        <Button className="min-h-[44px]" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function CalendarErrorState({
  message = "Kalenderen kunne ikke hentes lige nu.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      data-testid="calendar-error"
      className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-8 text-center"
    >
      <p className="font-medium text-foreground">{message}</p>
      <p className="text-sm text-muted-foreground">
        Tjek din forbindelse og prøv igen. Dine bookinger er ikke ændret.
      </p>
      {onRetry && (
        <Button variant="outline" className="min-h-[44px]" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Prøv igen
        </Button>
      )}
    </div>
  );
}
