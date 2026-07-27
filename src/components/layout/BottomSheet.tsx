/**
 * BottomSheet — accessible, mobile-first bottom sheet built on the existing
 * shadcn <Sheet> primitive (Radix Dialog under the hood).
 *
 * Wraps Sheet with side="bottom" defaults, rounded top corners, drag handle,
 * safe-area padding and reduced-motion respect. Focus trap + Escape handling
 * come from Radix Dialog. No new dependencies.
 */
import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type BottomSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Visually hide the title (still read by screen readers). */
  hideTitle?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  hideTitle,
  children,
  footer,
  className,
}: BottomSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        data-testid="bottom-sheet"
        className={cn(
          "border-0 bg-[hsl(var(--mkt-surface))] p-0",
          "rounded-t-[var(--bs-radius)] shadow-[var(--bs-shadow)]",
          "max-h-[92vh] flex flex-col gap-0",
          "motion-safe:duration-300 motion-reduce:duration-0 motion-reduce:!transition-none",
          className,
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex justify-center pt-2 pb-1" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-[hsl(var(--mkt-ink))]/15" />
        </div>
        <SheetHeader className={cn("px-5 pt-2 pb-3 text-left", hideTitle && "sr-only")}>
          <SheetTitle className="type-mobile-title text-[hsl(var(--mkt-ink))]">
            {title}
          </SheetTitle>
          {description ? (
            <SheetDescription className="text-[hsl(var(--mkt-ink-muted))]">
              {description}
            </SheetDescription>
          ) : null}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4 momentum-scroll">
          {children}
        </div>
        {footer ? (
          <div className="border-t border-[hsl(var(--mkt-border))] px-5 py-3">{footer}</div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export default BottomSheet;
