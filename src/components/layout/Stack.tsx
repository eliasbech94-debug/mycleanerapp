import { cn } from "@/lib/utils";
import { HTMLAttributes, forwardRef } from "react";

type Gap = "xs" | "sm" | "md" | "lg" | "xl";

const gapY: Record<Gap, string> = {
  xs: "space-y-2",
  sm: "space-y-4",
  md: "space-y-6",
  lg: "space-y-8",
  xl: "space-y-12",
};

const gapX: Record<Gap, string> = {
  xs: "gap-2",
  sm: "gap-3",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
};

interface StackProps extends HTMLAttributes<HTMLDivElement> {
  gap?: Gap;
}

export const Stack = forwardRef<HTMLDivElement, StackProps>(
  ({ gap = "md", className, ...rest }, ref) => (
    <div ref={ref} className={cn("flex flex-col", gapY[gap], className)} {...rest} />
  )
);
Stack.displayName = "Stack";

interface ClusterProps extends HTMLAttributes<HTMLDivElement> {
  gap?: Gap;
  wrap?: boolean;
  align?: "start" | "center" | "end" | "baseline";
  justify?: "start" | "center" | "end" | "between";
}

const alignClass = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  baseline: "items-baseline",
} as const;

const justifyClass = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
} as const;

export const Cluster = forwardRef<HTMLDivElement, ClusterProps>(
  ({ gap = "sm", wrap = true, align = "center", justify = "start", className, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex",
        wrap && "flex-wrap",
        gapX[gap],
        alignClass[align],
        justifyClass[justify],
        className
      )}
      {...rest}
    />
  )
);
Cluster.displayName = "Cluster";
