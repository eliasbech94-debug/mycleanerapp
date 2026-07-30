// Side-by-side diff viewer used before publishing a legal document version.
import { useMemo } from "react";
import { diffLines, diffStats, type DiffLine } from "@/lib/legal/diff";
import { cn } from "@/lib/utils";

function Column({ lines, side }: { lines: DiffLine[]; side: "old" | "new" }) {
  const visible = lines.filter((l) => (side === "old" ? l.type !== "added" : l.type !== "removed"));
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-muted/30 p-3 font-mono text-[12px] leading-5">
      {visible.map((l, i) => (
        <div
          key={`${side}-${i}`}
          className={cn(
            "whitespace-pre-wrap px-2 py-0.5",
            l.type === "removed" && "bg-destructive/10 text-destructive",
            l.type === "added" && "bg-primary/10 text-primary",
          )}
        >
          {l.text || "\u00a0"}
        </div>
      ))}
    </div>
  );
}

export function LegalDiffViewer({ oldText, newText }: { oldText: string; newText: string }) {
  const lines = useMemo(() => diffLines(oldText, newText), [oldText, newText]);
  const stats = useMemo(() => diffStats(lines), [lines]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-primary">+{stats.added}</span>{" "}
        <span className="font-medium text-destructive">−{stats.removed}</span> linjer ændret
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <section aria-label="Nuværende version">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nuværende version</h3>
          <Column lines={lines} side="old" />
        </section>
        <section aria-label="Ny version">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ny version</h3>
          <Column lines={lines} side="new" />
        </section>
      </div>
    </div>
  );
}
