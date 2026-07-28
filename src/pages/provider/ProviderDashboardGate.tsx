import { useSearchParams } from "react-router-dom";
import ProviderDashboard from "@/pages/ProviderDashboard";
import ProviderDashboardV2 from "@/pages/provider/ProviderDashboardV2";

/**
 * ProviderDashboardGate — default = new v2 dashboard.
 * `?legacy=1` renders the classic dashboard for one sprint as a safety net.
 * Removed in Phase 6.
 */
export default function ProviderDashboardGate() {
  const [params] = useSearchParams();
  if (params.get("legacy") === "1") return <ProviderDashboard />;
  return <ProviderDashboardV2 />;
}
