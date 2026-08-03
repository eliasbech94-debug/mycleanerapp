// Table of contents: sticky rail on desktop, collapsible disclosure on mobile.
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { LegalHeading } from "@/lib/legal/markdown";
import { cn } from "@/lib/utils";

function TocList({ headings, onNavigate }: { headings: LegalHeading[]; onNavigate?: () => void }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {headings.map((h) => (
        <li key={h.id} style={{ paddingLeft: (h.level - 2) * 12 }}>
          <a
            href={`#${h.id}`}
            onClick={onNavigate}
            className="block rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {h.text}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function LegalTableOfContents({ headings, className }: { headings: LegalHeading[]; className?: string }) {
  const { t } = useTranslation("legal");
  const [open, setOpen] = useState(false);
  if (!headings.length) return null;
  const label = t("toc.title", "Indhold");

  return (
    <>
      {/* Mobile / tablet */}
      <div className={cn("lg:hidden", className)}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="legal-toc-mobile"
          className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {label}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
        {open && (
          <nav id="legal-toc-mobile" aria-label={label} className="mt-2 rounded-xl border border-border bg-card p-3">
            <TocList headings={headings} onNavigate={() => setOpen(false)} />
          </nav>
        )}
      </div>

      {/* Desktop */}
      <nav aria-label={label} className={cn("hidden lg:block", className)}>
        <div className="sticky top-28">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <TocList headings={headings} />
        </div>
      </nav>
    </>
  );
}
