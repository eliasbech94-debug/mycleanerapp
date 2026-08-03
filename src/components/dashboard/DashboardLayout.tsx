import { ReactNode, useCallback, useEffect, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardRole } from "./nav-config";

interface Props {
  role: DashboardRole;
  title?: string;
  headerActions?: ReactNode;
  /**
   * Show the in-dashboard back control. Dashboard start pages leave this off:
   * the global site header already renders a back affordance, and two stacked
   * "Tilbage" controls is redundant UI. Sub-sections opt in.
   */
  showBack?: boolean;
  /** Explicit parent route for back navigation. Falls back to browser history. */
  backTo?: string;
  children: ReactNode;
}

const STORAGE_KEY = "mycleaner.sidebar.open";

/** Read the persisted sidebar preference. Defaults to open on first visit. */
function readStoredOpen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

/**
 * Shared shell for every role dashboard (customer, provider, support, admin,
 * employee).
 *
 * Layout contract:
 * - The global site header is `sticky top-0` and 4rem tall, so this shell is
 *   sized `min-h-[calc(100svh-4rem)]` instead of `min-h-screen`. Using the full
 *   viewport height here pushed the shell 4rem past the fold and desynced the
 *   fixed sidebar panel from the content column.
 * - Desktop uses a grid of `auto` (sidebar) + `minmax(0, 1fr)` (content). The
 *   `minmax(0, ...)` track plus `min-w-0` on every wrapper is what stops wide
 *   children (tables, long unbreakable strings) from forcing the content column
 *   past the viewport edge.
 * - Below `md` the sidebar renders as an off-canvas drawer (Radix Sheet: overlay,
 *   Escape handling and focus trapping included) and takes no layout width.
 */
export const DashboardLayout = ({
  role,
  title,
  headerActions,
  showBack = false,
  backTo,
  children,
}: Props) => {
  const [open, setOpen] = useState(readStoredOpen);

  // Re-sync once on mount so SSR/first paint and the stored preference agree.
  useEffect(() => {
    setOpen(readStoredOpen());
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* storage blocked (private mode) — layout still works, just not persisted */
    }
  }, []);

  return (
    <SidebarProvider
      open={open}
      onOpenChange={handleOpenChange}
      className="min-h-[calc(100svh-4rem)] items-stretch"
    >
      <div className="grid w-full min-w-0 grid-cols-1 bg-muted/30 md:grid-cols-[auto_minmax(0,1fr)]">
        <AppSidebar role={role} />
        <div className="flex min-w-0 flex-col">
          <DashboardHeader
            title={title}
            actions={headerActions}
            showBack={showBack}
            backTo={backTo}
          />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
};
