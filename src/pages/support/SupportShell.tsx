import { ReactNode } from "react";
import { DashboardLayout } from "@/components/dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

interface Props {
  title: string;
  description?: string;
  children?: ReactNode;
}

/**
 * Shared shell for /support/* routes. Phase 1 provides stubs; the unified
 * support inbox and case tools ship in Phase 2. RoleGuard on the router
 * ensures only support/admin/super_admin reach these pages.
 */
export function SupportShell({ title, description, children }: Props) {
  return (
    <DashboardLayout role="support" title={title}>
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-serif">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
        {children ?? (
          <Card>
            <CardContent className="p-8 flex items-center gap-4 text-muted-foreground">
              <Construction className="h-6 w-6 text-primary shrink-0" />
              <div>
                <div className="font-medium text-foreground">Kommer i Phase 2</div>
                <p className="text-sm">
                  Support-panelet og det samlede beskedsystem bygges i næste fase.
                  Rollen, rettighederne og navigationen er klar.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

export const SupportHome = () => <SupportShell title="Support" description="Dagligt overblik over åbne sager." />;
export const SupportInbox = () => <SupportShell title="Support-indbakke" description="Samlede samtaler fra kunder og providers." />;
export const SupportCases = () => <SupportShell title="Sager" description="Aktive, ventende og afsluttede support-sager." />;
export const SupportCustomers = () => <SupportShell title="Kunder" description="Support-sikker kundesøgning (navn, telefon, land)." />;
export const SupportProviders = () => <SupportShell title="Providers" description="Support-sikker provideroversigt." />;
export const SupportBookings = () => <SupportShell title="Bookinger" description="Se bookinger relevante for support." />;
