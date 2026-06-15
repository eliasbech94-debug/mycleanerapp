import { cn } from "@/lib/utils";
import { HTMLAttributes, forwardRef } from "react";

type Width = "narrow" | "default" | "wide" | "full";

const widthClass: Record<Width, string> = {
  narrow: "container-narrow",
  default: "container-default",
  wide: "container-wide",
  full: "container-full",
};

interface Props extends HTMLAttributes<HTMLDivElement> {
  width?: Width;
}

export const PageContainer = forwardRef<HTMLDivElement, Props>(
  ({ width = "default", className, ...rest }, ref) => (
    <div ref={ref} className={cn(widthClass[width], className)} {...rest} />
  )
);
PageContainer.displayName = "PageContainer";
