import { SidebarTrigger } from "@/components/ui/sidebar";
import { ReactNode } from "react";

interface Props {
  title?: string;
  actions?: ReactNode;
}

export const DashboardHeader = ({ title, actions }: Props) => (
  <header className="h-14 flex items-center gap-3 border-b border-border bg-background/80 backdrop-blur px-3 sm:px-4 sticky top-0 z-30">
    <SidebarTrigger />
    {title && (
      <h1 className="text-sm font-medium text-foreground truncate">{title}</h1>
    )}
    {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
  </header>
);
