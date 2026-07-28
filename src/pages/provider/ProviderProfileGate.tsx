import { useSearchParams } from "react-router-dom";
import ProviderProfilePage from "@/pages/provider/ProviderProfile";
import ProviderProfileV2 from "@/pages/provider/ProviderProfileV2";

/**
 * ProviderProfileGate — default = new v2 profile.
 * `?legacy=1` renders the classic 16-tab editor as a safety net
 * and as the deep-edit target for section "Redigér" links.
 * Removed in Phase 6.
 */
export default function ProviderProfileGate() {
  const [params] = useSearchParams();
  if (params.get("legacy") === "1") return <ProviderProfilePage />;
  return <ProviderProfileV2 />;
}
