/**
 * Honest Early Access empty state.
 *
 * Rendered whenever there are zero real, published and approved providers to
 * show. It never invents profiles, reviews, booking counts, distances or
 * online status — production must not fall back to demo fixtures.
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function EarlyAccessEmptyState({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <section
      data-testid="early-access-empty-state"
      aria-labelledby="early-access-heading"
      className={[
        "rounded-3xl border border-dashed border-border bg-card text-center",
        compact ? "p-5" : "p-8 sm:p-12",
        className ?? "",
      ].join(" ")}
    >
      <h2
        id="early-access-heading"
        className={compact ? "text-lg font-semibold" : "text-2xl font-serif sm:text-3xl"}
      >
        🧡 Vi er lige åbnet
      </h2>
      <p
        className={[
          "mx-auto mt-3 max-w-md text-muted-foreground",
          compact ? "text-[13px]" : "text-sm sm:text-base",
        ].join(" ")}
      >
        De første Founding Cleaners er ved at oprette deres profiler. Kom snart tilbage – eller
        bliv en af de første.
      </p>
      <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-3">
        <Button asChild size={compact ? "sm" : "default"}>
          <Link to="/bliv-cleaner">Bliv Founding Cleaner</Link>
        </Button>
        <Button asChild variant="outline" size={compact ? "sm" : "default"}>
          <Link to="/contact?emne=notify">Få besked, når der er cleanere nær dig</Link>
        </Button>
      </div>
    </section>
  );
}

export default EarlyAccessEmptyState;
