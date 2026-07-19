/**
 * Support Panel route exports (Phase 3, Stage A).
 *
 * `/support` redirects to `/support/inbox`. Each concrete page uses the
 * shared `SupportLayout` for consistent shell, secondary nav and live
 * counters. All routes are protected by `RoleGuard allow={["support","admin"]}`.
 */
import { Navigate } from "react-router-dom";

export { default as SupportInbox } from "./SupportInbox";
export { default as SupportCases } from "./SupportCases";
export { default as SupportCustomers } from "./SupportCustomers";
export { default as SupportProviders } from "./SupportProviders";
export { default as SupportBookings } from "./SupportBookings";

export const SupportHome = () => <Navigate to="/support/inbox" replace />;
