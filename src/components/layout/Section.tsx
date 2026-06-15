import { cn } from "@/lib/utils";
import { HTMLAttributes, forwardRef } from "react";
import { PageContainer } from "./PageContainer";

type Padding = "sm" | "md" | "lg" | "xl" | "none";
type Background = "default" | "muted" | "cream" | "teal" | "gradient" | "none";
type Width = "narrow" | "default" | "wide" | "full";

const paddingClass: Record<Padding, string> = {
  none: "",
  sm: "section-sm",
  md: "section-md",
  lg: "section-lg",
  xl: "section-xl",
};

const backgroundClass: Record<Background, string> = {
  none: "",
  default: "bg-background",
  muted: "bg-muted",
  cream: "bg-[hsl(40,40%,93%)]",
  teal: "bg-[hsl(170,75%,14%)] text-white",
  gradient: "gradient-hero text-white",
};

interface Props extends HTMLAttributes<HTMLElement> {
  padding?: Padding;
  background?: Background;
  width?: Width;
  containerClassName?: string;
  as?: "section" | "header" | "footer" | "div";
}

export const Section = forwardRef<HTMLElement, Props>(
  (
    {
      padding = "lg",
      background = "default",
      width = "default",
      containerClassName,
      className,
      children,
      as: Tag = "section",
      ...rest
    },
    ref
  ) => (
    <Tag
      ref={ref as never}
      className={cn(paddingClass[padding], backgroundClass[background], "relative", className)}
      {...rest}
    >
      <PageContainer width={width} className={containerClassName}>
        {children}
      </PageContainer>
    </Tag>
  )
);
Section.displayName = "Section";
