import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardLayout } from "@/components/dashboard";
import { LifeBuoy, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * Employee dashboard — operations-only shell.
 *
 * Support tickets, cases and customer/provider workflows now live in the
 * dedicated Support Panel (`/support/*`) which is role-gated to support
 * and admin. This page is intentionally not connected to live support data
 * to keep the employee (operations) role separate from the support role.
 */
const EmployeeDashboard = () => {
  return (
    <DashboardLayout role="employee" title="Medarbejder Dashboard">
      <div className="mx-auto w-full min-w-0 max-w-[1600px] space-y-4 p-4 sm:p-6 lg:p-8">
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <LifeBuoy className="h-6 w-6 text-primary shrink-0 mt-1" aria-hidden />
              <div className="space-y-2">
                <h2 className="text-lg font-medium">Support-arbejde er flyttet</h2>
                <p className="text-sm text-muted-foreground">
                  Kundesager, provider-opfølgning og samtaler håndteres nu i det
                  dedikerede support-panel. Kun brugere med rollen{" "}
                  <span className="font-mono">support</span> eller{" "}
                  <span className="font-mono">admin</span> har adgang.
                </p>
                <Button asChild size="sm">
                  <Link to="/support">
                    Åbn support-panel <ExternalLink className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Yderligere medarbejder-operationer bliver tilføjet her efterhånden
            som de defineres. Denne side viser ikke længere test- eller
            demodata.
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default EmployeeDashboard;
