import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface Props {
  message?: string;
  onRetry?: () => void | Promise<void>;
  compact?: boolean;
  className?: string;
}

/**
 * SectionErrorState — friendly Danish error state with retry.
 *
 * Never renders raw backend messages. Announces itself via
 * `role="status" aria-live="polite"` so screen readers hear the failure
 * and the retry outcome.
 */
export function SectionErrorState({
  message = "Vi kunne ikke hente denne sektion.",
  onRetry,
  compact,
  className,
}: Props) {
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    if (!onRetry) return;
    setBusy(true);
    try {
      await onRetry();
    } finally {
      setBusy(false);
    }
  };

  if (compact) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm",
          className,
        )}
      >
        <span className="flex items-center gap-2 text-muted-foreground">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <span>{message}</span>
        </span>
        {onRetry && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handle}
            disabled={busy}
            aria-label="Prøv igen"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="ml-2">Prøv igen</span>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-6 text-center",
        className,
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
        <AlertCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
      </div>
      <div>
        <p className="font-medium text-foreground">Noget gik galt</p>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handle}
          disabled={busy}
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Genindlæser…
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Prøv igen
            </>
          )}
        </Button>
      )}
    </div>
  );
}
