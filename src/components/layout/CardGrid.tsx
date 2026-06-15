import { cn } from "@/lib/utils";
import { HTMLAttributes, forwardRef } from "react";

interface Props extends HTMLAttributes<HTMLDivElement> {
  cols?: 2 | 3 | 4;
}

const colsClass = {
  2: "grid-cards-2",
  3: "grid-cards-3",
  4: "grid-cards-4",
} as const;

export const CardGrid = forwardRef<HTMLDivElement, Props>(
  ({ cols = 3, className, ...rest }, ref) => (
    <div ref={ref} className={cn(colsClass[cols], className)} {...rest} />
  )
);
CardGrid.displayName = "CardGrid";
