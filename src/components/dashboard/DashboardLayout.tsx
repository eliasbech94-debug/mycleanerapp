import { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardRole } from "./nav-config";

interface Props {
  role: DashboardRole;
  title?: string;
  headerActions?: ReactNode;
  children: ReactNode;
}

export const DashboardLayout = ({ role, title, headerActions, children }: Props) => (
  <SidebarProvider>
    <div className="min-h-screen flex w-full bg-muted/30">
      <AppSidebar role={role} />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardHeader title={title} actions={headerActions} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  </SidebarProvider>
);
