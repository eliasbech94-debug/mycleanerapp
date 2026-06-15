import { cn } from "@/lib/utils";
import { HTMLAttributes, forwardRef } from "react";

type BentoSize = "sm" | "md" | "lg" | "wide" | "tall";

const sizeClass: Record<BentoSize, string> = {
  sm: "col-span-1 row-span-1",
  md: "col-span-1 sm:col-span-2 row-span-1",
  lg: "col-span-1 sm:col-span-2 row-span-2",
  wide: "col-span-1 sm:col-span-2 lg:col-span-3 row-span-1",
  tall: "col-span-1 row-span-2",
};

interface GridProps extends HTMLAttributes<HTMLDivElement> {}
export const BentoGrid = forwardRef<HTMLDivElement, GridProps>(
  ({ className, ...rest }, ref) => (
    <div ref={ref} className={cn("grid-bento", className)} {...rest} />
  )
);
BentoGrid.displayName = "BentoGrid";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  size?: BentoSize;
}
export const BentoCard = forwardRef<HTMLDivElement, CardProps>(
  ({ size = "sm", className, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl bg-card border border-border p-6 transition-shadow hover:shadow-lg",
        sizeClass[size],
        className
      )}
      {...rest}
    />
  )
);
BentoCard.displayName = "BentoCard";
