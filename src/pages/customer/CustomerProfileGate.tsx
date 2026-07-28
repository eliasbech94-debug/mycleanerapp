import { useSearchParams } from "react-router-dom";
import Profile from "@/pages/Profile";
import CustomerProfileV2 from "@/pages/customer/CustomerProfileV2";

/**
 * CustomerProfileGate — default = new v2 overview.
 * `?legacy=1` renders the classic tabbed editor (`Profile.tsx`)
 * as the safety net and deep-edit target for section "Redigér" links.
 * Removed in Phase 6.
 */
export default function CustomerProfileGate() {
  const [params] = useSearchParams();
  if (params.get("legacy") === "1") return <Profile />;
  return <CustomerProfileV2 />;
}
