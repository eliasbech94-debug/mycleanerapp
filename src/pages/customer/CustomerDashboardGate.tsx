import { useSearchParams } from "react-router-dom";
import CustomerDashboard from "@/pages/CustomerDashboard";
import CustomerDashboardV2 from "@/pages/customer/CustomerDashboardV2";

/**
 * CustomerDashboardGate — default = new v2 dashboard.
 * `?legacy=1` renders the old dashboard for one sprint as a safety net.
 * Removed in Phase 6.
 */
export default function CustomerDashboardGate() {
  const [params] = useSearchParams();
  if (params.get("legacy") === "1") return <CustomerDashboard />;
  return <CustomerDashboardV2 />;
}
