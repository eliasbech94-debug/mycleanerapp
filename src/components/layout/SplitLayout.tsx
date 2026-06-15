import { cn } from "@/lib/utils";
import { ReactNode } from "react";

type Ratio = "50/50" | "60/40" | "40/60" | "70/30" | "30/70";

const ratioClass: Record<Ratio, string> = {
  "50/50": "lg:grid-cols-2",
  "60/40": "lg:grid-cols-[3fr_2fr]",
  "40/60": "lg:grid-cols-[2fr_3fr]",
  "70/30": "lg:grid-cols-[7fr_3fr]",
  "30/70": "lg:grid-cols-[3fr_7fr]",
};

interface Props {
  left: ReactNode;
  right: ReactNode;
  ratio?: Ratio;
  align?: "start" | "center" | "end";
  reverseOnMobile?: boolean;
  className?: string;
  gap?: "sm" | "md" | "lg";
}

const gapClass = { sm: "gap-6", md: "gap-8 md:gap-12", lg: "gap-12 md:gap-16" };
const alignClass = { start: "items-start", center: "items-center", end: "items-end" };

export const SplitLayout = ({
  left,
  right,
  ratio = "50/50",
  align = "center",
  reverseOnMobile = false,
  gap = "md",
  className,
}: Props) => (
  <div
    className={cn(
      "grid grid-cols-1",
      ratioClass[ratio],
      gapClass[gap],
      alignClass[align],
      className
    )}
  >
    <div className={cn(reverseOnMobile && "order-2 lg:order-1")}>{left}</div>
    <div className={cn(reverseOnMobile && "order-1 lg:order-2")}>{right}</div>
  </div>
);
