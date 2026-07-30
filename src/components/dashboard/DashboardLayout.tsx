import { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardRole } from "./nav-config";
import { ProviderFeatureRoadmap } from "@/components/provider/ProviderFeatureRoadmap";

interface Props {
  role: DashboardRole;
  title?: string;
  headerActions?: ReactNode;
  children: ReactNode;
}

export const DashboardLayout = ({ role, title, headerActions, children }: Props) => {
  // Temporary route-level safeguard for the legacy dashboard composition.
  // The roadmap must never appear on other provider pages that reuse this layout.
  const showProviderRoadmap = role === "provider" && title === "Provider dashboard";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-muted/30">
        <AppSidebar role={role} />
        <div className="flex-1 flex flex-col min-w-0">
          <DashboardHeader title={title} actions={headerActions} />
          <main className="flex-1 min-w-0">
            {children}
            {showProviderRoadmap && <ProviderFeatureRoadmap />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};
