import { useState } from "react";
import { DEMO_MODE, DEMO_SCENARIOS } from "@/data/demo";
import { useDemoScenario } from "@/hooks/useDemoScenario";
import { cn } from "@/lib/utils";

/**
 * Floating developer-only control panel.
 *
 * Renders exclusively when DEMO_MODE is enabled (dev / preview builds). It only
 * switches the in-memory fixture scenario — it performs no network calls, no
 * database access and has zero presence in production bundles at runtime.
 */
export default function DemoControlPanel() {
  const { scenarioId, setScenario, scenario } = useDemoScenario();
  const [open, setOpen] = useState(false);

  if (!DEMO_MODE) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[9999] print:hidden">
      {open ? (
        <div
          role="dialog"
          aria-label="Demo scenarier"
          className="w-64 rounded-2xl border border-border bg-popover/95 p-3 text-popover-foreground shadow-xl backdrop-blur"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Demo scenarie
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Luk demo-panel"
              className="rounded-md px-1.5 text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>

          <ul className="space-y-1">
            {DEMO_SCENARIOS.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setScenario(s.id)}
                  aria-pressed={s.id === scenarioId}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                    s.id === scenarioId
                      ? "bg-primary/10 text-foreground ring-1 ring-primary/40"
                      : "hover:bg-muted",
                  )}
                >
                  <span aria-hidden>{s.emoji}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.label}</span>
                    <span className="block text-[11px] leading-tight text-muted-foreground">
                      {s.description}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <p className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
            Kun lokale fixtures — ingen API-kald eller databaseændringer.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Åbn demo-panel (aktivt scenarie: ${scenario.label})`}
          className="flex items-center gap-2 rounded-full border border-border bg-popover/90 px-3 py-2 text-xs font-medium text-popover-foreground shadow-lg backdrop-blur hover:bg-popover"
        >
          <span aria-hidden>{scenario.emoji}</span>
          Demo
        </button>
      )}
    </div>
  );
}
