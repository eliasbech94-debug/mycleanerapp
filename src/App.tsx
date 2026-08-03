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
import { Navigate } from "react-router-dom";
import { isDevPreviewEnabled } from "@/lib/appEnv";

/* ------------------------------------------------------------------ *
 * Eager: the landing route and everything that must run before a
 * navigation decision is made.
 *
 * MobileHomeGate is the LCP route for first-time visitors, so it stays in
 * the entry chunk — lazy-loading it would add a network round trip to the
 * one page where it hurts most. NotFound is tiny and is the fallback for
 * every unmatched path.
 *
 * Guards (RoleGuard, UuidGuard, EarlyAccessRouteGuard) and redirect helpers
 * are deliberately eager and sit OUTSIDE the lazy boundary, so redirects and
 * access decisions still resolve before any chunk is requested. Behaviour is
 * therefore unchanged: an unauthorised user is bounced without downloading
 * the protected group.
 * ------------------------------------------------------------------ */
import MobileHomeGate from "./pages/mobile/MobileHomeGate";
import NotFound from "./pages/NotFound";
import { RoleGuard } from "@/components/RoleGuard";
import { UuidGuard, LegacySlugRedirect } from "@/components/routing/UuidGuard";
import PrefixedNavigate from "@/components/routing/PrefixedNavigate";
import EarlyAccessRouteGuard from "@/components/launch/EarlyAccessRouteGuard";

/* ------------------------------------------------------------------ *
 * Lazy route groups. One chunk per audience/feature area.
 * ------------------------------------------------------------------ */
import { lazyFrom } from "@/routes/lazyGroup";
import {
  loadAuth,
  loadPublic,
  loadBooking,
  loadCustomer,
  loadProvider,
  loadSupport,
  loadAdmin,
  loadFinance,
  loadKnowledge,
  loadMaps,
} from "@/routes/groups";

// Auth
const Login = lazyFrom(loadAuth, "Login");
const AuthCallback = lazyFrom(loadAuth, "AuthCallback");
const ResetPassword = lazyFrom(loadAuth, "ResetPassword");
const CustomerRegister = lazyFrom(loadAuth, "CustomerRegister");
const OAuthConsent = lazyFrom(loadAuth, "OAuthConsent");

// Public
const FAQ = lazyFrom(loadPublic, "FAQ");
const Regler = lazyFrom(loadPublic, "Regler");
const Contact = lazyFrom(loadPublic, "Contact");
const SupportCenter = lazyFrom(loadPublic, "SupportCenter");
const PrivacyCenter = lazyFrom(loadPublic, "PrivacyCenter");
const LegalCenter = lazyFrom(loadPublic, "LegalCenter");
const LegalDocumentPage = lazyFrom(loadPublic, "LegalDocumentPage");
const PublicProviderProfile = lazyFrom(loadPublic, "PublicProviderProfile");
const MobileMarketplaceGate = lazyFrom(loadPublic, "MobileMarketplaceGate");
const MobileFoundingCleanerGate = lazyFrom(loadPublic, "MobileFoundingCleanerGate");
const CampaignPage = lazyFrom(loadPublic, "CampaignPage");
const CampaignVerify = lazyFrom(loadPublic, "CampaignVerify");

// Booking
const BookingEntry = lazyFrom(loadBooking, "BookingEntry");
const BookingFlow = lazyFrom(loadBooking, "BookingFlow");
const BookingPlan = lazyFrom(loadBooking, "BookingPlan");
const CreateTask = lazyFrom(loadBooking, "CreateTask");
const MatchingOffers = lazyFrom(loadBooking, "MatchingOffers");

// Customer
const CustomerDashboardV2 = lazyFrom(loadCustomer, "CustomerDashboardV2");
const CustomerProfileV2 = lazyFrom(loadCustomer, "CustomerProfileV2");
const MobileProfileGate = lazyFrom(loadCustomer, "MobileProfileGate");
const MobileInboxGate = lazyFrom(loadCustomer, "MobileInboxGate");
const MobileBookingsGate = lazyFrom(loadCustomer, "MobileBookingsGate");

// Provider
const ProviderDashboardV2 = lazyFrom(loadProvider, "ProviderDashboardV2");
const ProviderProfileV2 = lazyFrom(loadProvider, "ProviderProfileV2");
const ProviderCalendarPage = lazyFrom(loadProvider, "ProviderCalendarPage");
const ProviderOnboarding = lazyFrom(loadProvider, "ProviderOnboarding");
const CareerIdentity = lazyFrom(loadProvider, "CareerIdentity");
const ProviderPricing = lazyFrom(loadProvider, "ProviderPricing");
const ProviderDecisions = lazyFrom(loadProvider, "ProviderDecisions");
const ProviderDisputes = lazyFrom(loadProvider, "ProviderDisputes");
const ProviderReceipts = lazyFrom(loadProvider, "ProviderReceipts");
const ProviderAccounting = lazyFrom(loadProvider, "ProviderAccounting");
const ProviderProfile = lazyFrom(loadProvider, "ProviderProfile");
const IdentityVerificationPage = lazyFrom(loadProvider, "IdentityVerificationPage");

// Support
const SupportHome = lazyFrom(loadSupport, "SupportHome");
const SupportDashboard = lazyFrom(loadSupport, "SupportDashboard");
const SupportInbox = lazyFrom(loadSupport, "SupportInbox");
const SupportCases = lazyFrom(loadSupport, "SupportCases");
const SupportCustomers = lazyFrom(loadSupport, "SupportCustomers");
const SupportProviders = lazyFrom(loadSupport, "SupportProviders");
const SupportBookings = lazyFrom(loadSupport, "SupportBookings");

// Admin
const AdminDashboard = lazyFrom(loadAdmin, "AdminDashboard");
const MissionControl = lazyFrom(loadAdmin, "MissionControl");
const AdminStripe = lazyFrom(loadAdmin, "AdminStripe");
const AdminWebhooks = lazyFrom(loadAdmin, "AdminWebhooks");
const AdminAccessLogs = lazyFrom(loadAdmin, "AdminAccessLogs");
const AdminLiveStatus = lazyFrom(loadAdmin, "AdminLiveStatus");
const AdminDisputes = lazyFrom(loadAdmin, "AdminDisputes");
const AdminOps = lazyFrom(loadAdmin, "AdminOps");
const AdminUsers = lazyFrom(loadAdmin, "AdminUsers");
const AdminProviders = lazyFrom(loadAdmin, "AdminProviders");
const AdminAppeals = lazyFrom(loadAdmin, "AdminAppeals");
const AdminPricing = lazyFrom(loadAdmin, "AdminPricing");
const AdminCampaigns = lazyFrom(loadAdmin, "AdminCampaigns");
const AdminCareerVerification = lazyFrom(loadAdmin, "AdminCareerVerification");
const AdminLegal = lazyFrom(loadAdmin, "AdminLegal");
const AdminDesignSystem = lazyFrom(loadAdmin, "AdminDesignSystem");
const CountryConsole = lazyFrom(loadAdmin, "CountryConsole");
const EmployeeDashboard = lazyFrom(loadAdmin, "EmployeeDashboard");

// Finance
const ProviderFinance = lazyFrom(loadFinance, "ProviderFinance");
const AdminFinance = lazyFrom(loadFinance, "AdminFinance");
const AdminPayments = lazyFrom(loadFinance, "AdminPayments");
const AdminAccountingRules = lazyFrom(loadFinance, "AdminAccountingRules");
const AdminAccountingReports = lazyFrom(loadFinance, "AdminAccountingReports");

// Knowledge
const AdminKnowledge = lazyFrom(loadKnowledge, "AdminKnowledge");

// Maps — isolates mapbox-gl, the single largest dependency.
const FindCleaner = lazyFrom(loadMaps, "FindCleaner");

// Development-only visual previews. Never registered in production.
const ProviderProfilePreview = lazy(() => import("@/dev/ProviderProfilePreview"));
const ProviderAccountingPreview = lazy(() => import("@/dev/ProviderAccountingPreview"));
const MonthlyReportPreview = lazy(() => import("@/dev/MonthlyReportPreview"));

import ScrollToTop from "@/components/ScrollToTop";
import CrispProvider from "@/components/support/CrispProvider";
import RouteLoadingBar from "@/components/RouteLoadingBar";
import ProviderPresenceHeartbeat from "@/components/provider/status/ProviderPresenceHeartbeat";
import DemoControlPanel from "@/components/dev/DemoControlPanel";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { StagingBanner } from "@/components/StagingBanner";
import { installFrontendMonitoring, initSentry } from "@/lib/monitoring";
import { CountryProvider } from "@/i18n/CountryContext";
import { LanguageAccountSync } from "@/i18n/LanguageAccountSync";
import { ActiveMarketProvider } from "@/context/ActiveMarketContext";
import { LocationProvider } from "@/context/LocationContext";
import { AppContextProvider } from "@/context/AppContext";
import { AuthGateProvider } from "@/context/AuthGateContext";
import { LegalUpdateGate } from "./components/legal/LegalUpdateGate";
import WelcomeVideoGate from "@/components/onboarding/WelcomeVideoGate";
import FirstJobCelebrationGate from "@/components/celebration/FirstJobCelebrationGate";
import RoutePrefetcher from "@/components/routing/RoutePrefetcher";
import RouteSuspenseFallback from "@/components/routing/RouteSuspenseFallback";
import EarlyAccessBannerSlot from "@/components/launch/EarlyAccessBannerSlot";



initSentry();
installFrontendMonitoring();

const queryClient = new QueryClient();
// Localised URL prefixes — one per supported market (see SUPPORTED_COUNTRIES).
// Adding a market here is all that is needed for /{{market}}/... URLs to work;
// indexability is decided separately by MarketSeo from server bookability.
const COUNTRY_ROUTE_PREFIXES = ["dk", "gb", "se", "es", "de"] as const;

/**
 * All application routes. Rendered once at "/*" and once under "/:country/*".
 * `path="/*"` in the parent route makes React Router match these against the
 * remainder path, so /dk/faq resolves to /faq inside this tree without
 * duplicating any route definition. Business algorithms untouched.
 */



export function AppRoutes() {
  return (
    // One Suspense boundary for the whole tree. Guards render above it, so
    // access decisions and redirects still resolve before a chunk is fetched.
    <Suspense fallback={<RouteSuspenseFallback />}>
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
      <Route path="/customer/notifications" element={<RoleGuard allow={["customer"]}><PrefixedNavigate to="/profil?tab=inbox" /></RoleGuard>} />
      <Route path="/customer/invoices" element={<RoleGuard allow={["customer"]}><PrefixedNavigate to="/profil?tab=invoices" /></RoleGuard>} />
      <Route path="/customer/addresses" element={<RoleGuard allow={["customer"]}><PrefixedNavigate to="/profil?tab=addresses" /></RoleGuard>} />
      <Route path="/customer/profile" element={<RoleGuard allow={["customer"]}><CustomerProfileV2 /></RoleGuard>} />
      <Route path="/customer/settings" element={<RoleGuard allow={["customer"]}><PrefixedNavigate to="/profil?tab=notifications" /></RoleGuard>} />
      <Route path="/customer/cards" element={<RoleGuard allow={["customer"]}><PrefixedNavigate to="/profil?tab=cards" /></RoleGuard>} />

      {/* Public aliases for well-known short URLs. Pure client-side redirects, no loops. */}
      {/* Customer-facing Support Center — the only place live chat is shown. */}
      <Route path="/help" element={<SupportCenter />} />
      <Route path="/hjaelp" element={<Navigate to="/help" replace />} />
      <Route path="/kundesupport" element={<Navigate to="/help" replace />} />
      <Route path="/contact-support" element={<Navigate to="/help" replace />} />

      <Route path="/house-rules" element={<Navigate to="/regler" replace />} />
      <Route path="/chat" element={<Navigate to="/inbox" replace />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/kontakt" element={<Contact />} />

      {/* Provider aliases. Canonical: /provider-dashboard (dashboard) + /provider/* (sub-pages).
          These keep previously-linked/bookmarked URLs off the 404 page. */}
      <Route path="/provider/register" element={<PrefixedNavigate to="/bliv-cleaner" />} />
      <Route path="/provider" element={<PrefixedNavigate to="/provider-dashboard" />} />
      <Route path="/provider/onboarding" element={<PrefixedNavigate to="/bliv-cleaner" />} />
      <Route path="/provider/documents" element={<PrefixedNavigate to="/bliv-cleaner" />} />
      <Route path="/provider/payouts" element={<PrefixedNavigate to="/provider/finance" />} />
      <Route path="/provider/bookings" element={<PrefixedNavigate to="/provider-dashboard" />} />
      <Route path="/provider/reviews" element={<PrefixedNavigate to="/provider-dashboard" />} />
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
      <Route path="/admin" element={<RoleGuard allow={["admin"]}><MissionControl /></RoleGuard>} />
      <Route path="/admin/legacy" element={<RoleGuard allow={["admin"]}><AdminDashboard /></RoleGuard>} />
      <Route path="/admin/users" element={<RoleGuard allow={["admin"]}><AdminUsers /></RoleGuard>} />
      <Route path="/admin/providers" element={<RoleGuard allow={["admin"]}><AdminProviders /></RoleGuard>} />
      <Route path="/admin/appeals" element={<RoleGuard allow={["admin", "super_admin", "support"]}><AdminAppeals /></RoleGuard>} />
      <Route path="/provider/decisions" element={<RoleGuard allow={["provider", "admin"]}><ProviderDecisions /></RoleGuard>} />
      <Route path="/provider/decisions/:noticeId" element={<RoleGuard allow={["provider", "admin"]}><ProviderDecisions /></RoleGuard>} />
      <Route path="/admin/stripe" element={<RoleGuard allow={["admin"]}><AdminStripe /></RoleGuard>} />
      <Route path="/admin/webhooks" element={<RoleGuard allow={["admin"]}><AdminWebhooks /></RoleGuard>} />
      <Route path="/admin/payments" element={<RoleGuard allow={["admin"]}><AdminPayments /></RoleGuard>} />
      <Route path="/admin/accounting-reports" element={<RoleGuard allow={["admin", "super_admin"]}><AdminAccountingReports /></RoleGuard>} />
      <Route path="/admin/accounting-rules" element={<RoleGuard allow={["admin", "super_admin"]}><AdminAccountingRules /></RoleGuard>} />
      <Route path="/admin/live-status" element={<RoleGuard allow={["admin", "super_admin", "support"]}><AdminLiveStatus /></RoleGuard>} />
      <Route path="/admin/access-logs" element={<RoleGuard allow={["admin"]}><AdminAccessLogs /></RoleGuard>} />
      <Route path="/employee" element={<RoleGuard allow={["employee"]}><EmployeeDashboard /></RoleGuard>} />
      <Route path="/support" element={<RoleGuard allow={["support", "admin"]}><SupportHome /></RoleGuard>} />
      <Route path="/support/dashboard" element={<RoleGuard allow={["support", "admin"]}><SupportDashboard /></RoleGuard>} />
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
      <Route path="/provider/calendar" element={<RoleGuard allow={["provider", "admin"]}><ProviderCalendarPage /></RoleGuard>} />
      
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
      <Route path="/legal" element={<LegalCenter />} />
      <Route path="/legal/:slug" element={<LegalDocumentPage />} />
      <Route path="/admin/legal" element={<RoleGuard allow={["admin", "super_admin"]}><AdminLegal /></RoleGuard>} />
      <Route
        path="/provider/bilag"
        element={<RoleGuard allow={["provider", "admin", "super_admin"]}><ProviderReceipts /></RoleGuard>}
      />
      <Route
        path="/provider/accounting"
        element={<RoleGuard allow={["provider", "admin", "super_admin"]}><ProviderAccounting /></RoleGuard>}
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
      {isDevPreviewEnabled() && (
        <Route
          path="/dev/provider-accounting-preview"
          element={
            <Suspense fallback={null}>
              <ProviderAccountingPreview />
            </Suspense>
          }
        />
      )}
      {isDevPreviewEnabled() && (
        <Route
          path="/dev/monthly-report-preview"
          element={
            <Suspense fallback={null}>
              <MonthlyReportPreview />
            </Suspense>
          }
        />
      )}


        <Route path="/not-found" element={<NotFound />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
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
              <LegalUpdateGate />
              <AppRoutes />
            </CountryProvider>
          }
        />
      ))}
      <Route
        path="/*"
        element={
          <CountryProvider>
            <LegalUpdateGate />
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
            <LanguageAccountSync />
            <ActiveMarketProvider>
              <LocationProvider>
              <AppContextProvider>
                <AuthGateProvider>
                  <ScrollToTop />
                  <RouteLoadingBar />
                  {/* Crisp runs hidden app-wide: identity + context only, no floating bubble. */}
                  <CrispProvider />
                  {/* Warms role/intent route chunks. Renders nothing. */}
                  <RoutePrefetcher />
                  {/* Throttled provider activity heartbeat. Renders nothing. */}
                  <ProviderPresenceHeartbeat />


                  <Header />
                  <EarlyAccessBannerSlot />
                  <RootRouteSwitch />
                  <Footer />
                  <MobileBottomNav />
                  <DemoControlPanel />
                  <WelcomeVideoGate />
                  <FirstJobCelebrationGate />


                </AuthGateProvider>
              </AppContextProvider>
              </LocationProvider>
            </ActiveMarketProvider>
          </AuthProvider>

        </BrowserRouter>
      </TooltipProvider>
    </AppErrorBoundary>
  </QueryClientProvider>
);

export default App;
