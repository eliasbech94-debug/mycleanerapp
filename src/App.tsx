import { ProviderFeatureRoadmap as PR46Roadmap } from "@/components/provider/__pr46_ProviderFeatureRoadmap";
import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Header from "@/components/layout/Header";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import Footer from "@/components/layout/Footer";
import CustomCursor from "@/components/CustomCursor";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import MobileHomeGate from "./pages/mobile/MobileHomeGate";
import MobileMarketplaceGate from "./pages/mobile/MobileMarketplaceGate";
import MobileBookingsGate from "./pages/mobile/MobileBookingsGate";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import ResetPassword from "./pages/ResetPassword";
import CustomerDashboardV2 from "./pages/customer/CustomerDashboardV2";
import CustomerProfileV2 from "./pages/customer/CustomerProfileV2";
import { Navigate } from "react-router-dom";
import MobileProfileGate from "./pages/mobile/MobileProfileGate";
import MobileInboxGate from "./pages/mobile/MobileInboxGate";
import FoundingCleaner from "./pages/FoundingCleaner";
import MobileFoundingCleanerGate from "./pages/mobile/MobileFoundingCleanerGate";
import ProviderProfile from "./pages/ProviderProfile";
import CustomerRegister from "./pages/CustomerRegister";
import CreateTask from "./pages/CreateTask";
import MatchingOffers from "./pages/MatchingOffers";
import AdminDashboard from "./pages/AdminDashboard";
import AdminStripe from "./pages/AdminStripe";
import AdminWebhooks from "./pages/AdminWebhooks";
import AdminPayments from "./pages/AdminPayments";
import AdminAccessLogs from "./pages/AdminAccessLogs";
import EmployeeDashboard from "./pages/EmployeeDashboard";
import BookingFlow from "./pages/BookingFlow";
import BookingEntry from "./pages/BookingEntry";
import MyBookings from "./pages/MyBookings";
import BookingPlan from "./pages/BookingPlan";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminProviders from "./pages/admin/AdminProviders";
import {
  SupportHome, SupportInbox, SupportCases,
  SupportCustomers, SupportProviders, SupportBookings,
} from "./pages/support/SupportShell";

import ProviderDashboardV2 from "./pages/provider/ProviderDashboardV2";
import ProviderProfileV2 from "./pages/provider/ProviderProfileV2";
import ProviderReceipts from "./pages/ProviderReceipts";
import NotFound from "./pages/NotFound";
import { isDevPreviewEnabled } from "@/lib/appEnv";

// Development-only visual preview. Lazy so it never lands in the prod entry
// bundle, and the route below is not registered at all in production.
const ProviderProfilePreview = lazy(() => import("@/dev/ProviderProfilePreview"));
import FAQ from "./pages/FAQ";
import Regler from "./pages/Regler";
import FindCleaner from "./pages/FindCleaner";
import Marketplace from "./pages/Marketplace";
import PublicProviderProfile from "./pages/PublicProviderProfile";
import { ProviderFinance, AdminFinance } from "./pages/finance/FinancePages";
import AdminDisputes from "./pages/AdminDisputes";
import ProviderDisputes from "./pages/ProviderDisputes";
import { RoleGuard } from "@/components/RoleGuard";
import CampaignPage from "./pages/campaigns/CampaignPage";
import CampaignVerify from "./pages/campaigns/CampaignVerify";
import AdminCampaigns from "./pages/admin/AdminCampaigns";
import AdminDesignSystem from "./pages/admin/AdminDesignSystem";
import { UuidGuard, LegacySlugRedirect } from "@/components/routing/UuidGuard";
import ScrollToTop from "@/components/ScrollToTop";
import RouteLoadingBar from "@/components/RouteLoadingBar";
import PrivacyCenter from "./pages/PrivacyCenter";
import AdminOps from "./pages/AdminOps";
import CountryConsole from "./pages/admin/CountryConsole";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { StagingBanner } from "@/components/StagingBanner";
import { installFrontendMonitoring, initSentry } from "@/lib/monitoring";
import OAuthConsent from "./pages/OAuthConsent";
import { CountryProvider } from "@/i18n/CountryContext";
import { ActiveMarketProvider } from "@/context/ActiveMarketContext";
import { AppContextProvider } from "@/context/AppContext";
import { AuthGateProvider } from "@/context/AuthGateContext";
import IdentityVerificationPage from "./pages/identity/IdentityVerificationPage";
import ProviderOnboarding from "./pages/provider/ProviderOnboarding";
import Contact from "./pages/Contact";
import CareerIdentity from "./pages/provider/CareerIdentity";
import ProviderPricing from "./pages/provider/ProviderPricing";
import AdminPricing from "./pages/admin/AdminPricing";
import AdminKnowledge from "./pages/admin/AdminKnowledge";
import AdminCareerVerification from "./pages/admin/AdminCareerVerification";
import EarlyAccessRouteGuard from "@/components/launch/EarlyAccessRouteGuard";
import EarlyAccessBannerSlot from "@/components/launch/EarlyAccessBannerSlot";



initSentry();
installFrontendMonitoring();

const queryClient = new QueryClient();
const COUNTRY_ROUTE_PREFIXES = ["dk", "gb", "se", "es"] as const;

/**
 * All application routes. Rendered once at "/*" and once under "/:country/*".
 * `path="/*"` in the parent route makes React Router match these against the
 * remainder path, so /dk/faq resolves to /faq inside this tree without
 * duplicating any route definition. Business algorithms untouched.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<MobileHomeGate />} />
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/profil" element={<MobileProfileGate />} />
      <Route path="/inbox" element={<MobileInboxGate />} />
      <Route path="/inbox/:id" element={<MobileInboxGate />} />
      <Route path="/verify-identity" element={<RoleGuard allow={["provider", "admin"]}><IdentityVerificationPage /></RoleGuard>} />
      <Route path="/bliv-cleaner" element={<ProviderOnboarding />} />
      <Route path="/provider/profile" element={<RoleGuard allow={["provider", "admin"]}><ProviderProfileV2 /></RoleGuard>} />
      <Route path="/provider/career" element={<RoleGuard allow={["provider", "admin"]}><CareerIdentity /></RoleGuard>} />

      <Route path="/customer" element={<RoleGuard allow={["customer"]}><CustomerDashboardV2 /></RoleGuard>} />
      <Route path="/customer/bookings" element={<RoleGuard allow={["customer"]}><MobileBookingsGate /></RoleGuard>} />
      <Route path="/customer/notifications" element={<RoleGuard allow={["customer"]}><Navigate to="/profil?tab=inbox" replace /></RoleGuard>} />
      <Route path="/customer/invoices" element={<RoleGuard allow={["customer"]}><Navigate to="/profil?tab=invoices" replace /></RoleGuard>} />
      <Route path="/customer/addresses" element={<RoleGuard allow={["customer"]}><Navigate to="/profil?tab=addresses" replace /></RoleGuard>} />
      <Route path="/customer/profile" element={<RoleGuard allow={["customer"]}><CustomerProfileV2 /></RoleGuard>} />
      <Route path="/customer/settings" element={<RoleGuard allow={["customer"]}><Navigate to="/profil?tab=notifications" replace /></RoleGuard>} />
      <Route path="/customer/cards" element={<RoleGuard allow={["customer"]}><Navigate to="/profil?tab=cards" replace /></RoleGuard>} />
      {/* Public aliases for well-known short URLs. Pure client-side redirects, no loops. */}
      <Route path="/help" element={<Navigate to="/faq" replace />} />
      <Route path="/house-rules" element={<Navigate to="/regler" replace />} />
      <Route path="/chat" element={<Navigate to="/inbox" replace />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/provider/register" element={<Navigate to="/bliv-cleaner" replace />} />
      <Route path="/founding-cleaner" element={<MobileFoundingCleanerGate />} />
      {/* UUID-guarded internal provider route. Non-UUID falls through to NotFound. */}
      <Route path="/provider/:id" element={<UuidGuard param="id"><ProviderProfile /></UuidGuard>} />
      <Route path="/find-cleaner" element={<FindCleaner />} />
      <Route path="/marketplace" element={<MobileMarketplaceGate />} />
      {/* Canonical public provider URL. `/c/:slug` is kept as a legacy alias and client-redirects. */}
      <Route path="/p/:slug" element={<PublicProviderProfile />} />
      <Route path="/c/:slug" element={<LegacySlugRedirect />} />
      <Route path="/customer/register" element={<CustomerRegister />} />
      <Route path="/task/create" element={<CreateTask />} />
      <Route path="/task/offers" element={<MatchingOffers />} />
      <Route path="/admin" element={<RoleGuard allow={["admin"]}><AdminDashboard /></RoleGuard>} />
      <Route path="/admin/users" element={<RoleGuard allow={["admin"]}><AdminUsers /></RoleGuard>} />
      <Route path="/admin/providers" element={<RoleGuard allow={["admin"]}><AdminProviders /></RoleGuard>} />
      <Route path="/admin/stripe" element={<RoleGuard allow={["admin"]}><AdminStripe /></RoleGuard>} />
      <Route path="/admin/webhooks" element={<RoleGuard allow={["admin"]}><AdminWebhooks /></RoleGuard>} />
      <Route path="/admin/payments" element={<RoleGuard allow={["admin"]}><AdminPayments /></RoleGuard>} />
      <Route path="/admin/access-logs" element={<RoleGuard allow={["admin"]}><AdminAccessLogs /></RoleGuard>} />
      <Route path="/employee" element={<RoleGuard allow={["employee"]}><EmployeeDashboard /></RoleGuard>} />
      <Route path="/support" element={<RoleGuard allow={["support", "admin"]}><SupportHome /></RoleGuard>} />
      <Route path="/support/inbox" element={<RoleGuard allow={["support", "admin"]}><SupportInbox /></RoleGuard>} />
      <Route path="/support/inbox/:conversationId" element={<RoleGuard allow={["support", "admin"]}><SupportInbox /></RoleGuard>} />
      <Route path="/support/cases" element={<RoleGuard allow={["support", "admin"]}><SupportCases /></RoleGuard>} />
      <Route path="/support/customers" element={<RoleGuard allow={["support", "admin"]}><SupportCustomers /></RoleGuard>} />
      <Route path="/support/providers" element={<RoleGuard allow={["support", "admin"]}><SupportProviders /></RoleGuard>} />
      <Route path="/support/bookings" element={<RoleGuard allow={["support", "admin"]}><SupportBookings /></RoleGuard>} />
      <Route path="/book" element={<EarlyAccessRouteGuard><BookingEntry /></EarlyAccessRouteGuard>} />
      <Route path="/book/:id" element={<EarlyAccessRouteGuard><BookingFlow /></EarlyAccessRouteGuard>} />
      <Route path="/mine-bookinger" element={<MobileBookingsGate />} />
      <Route path="/booking/:id/plan" element={<BookingPlan />} />
      <Route path="/provider-dashboard" element={<RoleGuard allow={["provider", "admin"]}><ProviderDashboardV2 /></RoleGuard>} />
      <Route path="/provider" element={<RoleGuard allow={["provider", "admin"]}><ProviderDashboardV2 /></RoleGuard>} />
      <Route path="/provider/pricing" element={<RoleGuard allow={["provider", "admin"]}><ProviderPricing /></RoleGuard>} />
      <Route path="/admin/pricing" element={<RoleGuard allow={["admin"]}><AdminPricing /></RoleGuard>} />
      <Route path="/provider/finance" element={<RoleGuard allow={["provider", "admin"]}><ProviderFinance /></RoleGuard>} />
      <Route path="/admin/finance" element={<RoleGuard allow={["admin"]}><AdminFinance /></RoleGuard>} />
      <Route path="/admin/disputes" element={<RoleGuard allow={["admin"]}><AdminDisputes /></RoleGuard>} />
      <Route path="/provider/disputes" element={<RoleGuard allow={["provider", "admin"]}><ProviderDisputes /></RoleGuard>} />
      <Route path="/provider/disputes/:id" element={<RoleGuard allow={["provider", "admin"]}><ProviderDisputes /></RoleGuard>} />
      <Route path="/privatliv" element={<PrivacyCenter />} />
      <Route path="/admin/ops" element={<RoleGuard allow={["admin"]}><AdminOps /></RoleGuard>} />
      <Route path="/admin/countries" element={<RoleGuard allow={["admin"]}><CountryConsole /></RoleGuard>} />
      <Route path="/faq" element={<FAQ />} />
      <Route path="/regler" element={<Regler />} />
      <Route
        path="/provider/bilag"
        element={<RoleGuard allow={["provider", "admin", "super_admin"]}><ProviderReceipts /></RoleGuard>}
      />
      <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
      <Route path="/campaigns/verify" element={<CampaignVerify />} />
      <Route path="/campaigns/:slug" element={<CampaignPage />} />
      <Route path="/admin/campaigns" element={<RoleGuard allow={["admin"]}><AdminCampaigns /></RoleGuard>} />
      <Route path="/admin/knowledge" element={<RoleGuard allow={["admin"]}><AdminKnowledge /></RoleGuard>} />
      <Route path="/admin/career-verification" element={<RoleGuard allow={["admin"]}><AdminCareerVerification /></RoleGuard>} />
      <Route path="/admin/design-system" element={<RoleGuard allow={["admin"]}><AdminDesignSystem /></RoleGuard>} />
      {isDevPreviewEnabled() && (
        <Route
          path="/dev/provider-profile-preview"
          element={
            <Suspense fallback={null}>
              <ProviderProfilePreview />
            </Suspense>
          }
        />
      )}
      <Route path="/dev/pr46-roadmap" element={<PR46Roadmap />} />

      <Route path="/not-found" element={<NotFound />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export function RootRouteSwitch() {
  return (
    <Routes>
      {COUNTRY_ROUTE_PREFIXES.map((country) => (
        <Route
          key={country}
          path={`/${country}/*`}
          element={
            <CountryProvider>
              <AppRoutes />
            </CountryProvider>
          }
        />
      ))}
      <Route
        path="/*"
        element={
          <CountryProvider>
            <AppRoutes />
          </CountryProvider>
        }
      />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AppErrorBoundary>
      <TooltipProvider>
        <StagingBanner />
        <Toaster />
        <Sonner />
        <CustomCursor />
        <BrowserRouter>
          <AuthProvider>
            <ActiveMarketProvider>
              <AppContextProvider>
                <AuthGateProvider>
                  <ScrollToTop />
                  <RouteLoadingBar />
                  <Header />
                  <EarlyAccessBannerSlot />
                  <RootRouteSwitch />
                  <Footer />
                  <MobileBottomNav />
                </AuthGateProvider>
              </AppContextProvider>
            </ActiveMarketProvider>
          </AuthProvider>

        </BrowserRouter>
      </TooltipProvider>
    </AppErrorBoundary>
  </QueryClientProvider>
);

export default App;
