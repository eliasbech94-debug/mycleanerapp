import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import CustomCursor from "@/components/CustomCursor";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import Profile from "./pages/Profile";
import ProviderRegister from "./pages/ProviderRegister";
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

import ProviderDashboard from "./pages/ProviderDashboard";
import ProviderReceipts from "./pages/ProviderReceipts";
import NotFound from "./pages/NotFound";
import FAQ from "./pages/FAQ";
import Regler from "./pages/Regler";
import FindCleaner from "./pages/FindCleaner";
import { ProviderFinance, AdminFinance } from "./pages/finance/FinancePages";
import AdminDisputes from "./pages/AdminDisputes";
import ProviderDisputes from "./pages/ProviderDisputes";
import { RoleGuard } from "@/components/RoleGuard";
import ScrollToTop from "@/components/ScrollToTop";
import RouteLoadingBar from "@/components/RouteLoadingBar";
import PrivacyCenter from "./pages/PrivacyCenter";
import AdminOps from "./pages/AdminOps";
import CountryConsole from "./pages/admin/CountryConsole";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { installFrontendMonitoring, initSentry } from "@/lib/monitoring";
import { CountryProvider, isValidCountryParam } from "@/i18n/CountryContext";

initSentry();
installFrontendMonitoring();

const queryClient = new QueryClient();

/**
 * All application routes. Rendered once at "/*" and once under "/:country/*".
 * `path="/*"` in the parent route makes React Router match these against the
 * remainder path, so /dk/faq resolves to /faq inside this tree without
 * duplicating any route definition. Business algorithms untouched.
 */
function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/profil" element={<Profile />} />
      <Route path="/provider/register" element={<ProviderRegister />} />
      <Route path="/provider/:id" element={<ProviderProfile />} />
      <Route path="/find-cleaner" element={<FindCleaner />} />
      <Route path="/customer/register" element={<CustomerRegister />} />
      <Route path="/task/create" element={<CreateTask />} />
      <Route path="/task/offers" element={<MatchingOffers />} />
      <Route path="/admin" element={<RoleGuard allow={["admin"]}><AdminDashboard /></RoleGuard>} />
      <Route path="/admin/stripe" element={<RoleGuard allow={["admin"]}><AdminStripe /></RoleGuard>} />
      <Route path="/admin/webhooks" element={<RoleGuard allow={["admin", "employee"]}><AdminWebhooks /></RoleGuard>} />
      <Route path="/admin/payments" element={<RoleGuard allow={["admin"]}><AdminPayments /></RoleGuard>} />
      <Route path="/admin/access-logs" element={<RoleGuard allow={["admin"]}><AdminAccessLogs /></RoleGuard>} />
      <Route path="/employee" element={<RoleGuard allow={["admin", "employee"]}><EmployeeDashboard /></RoleGuard>} />
      <Route path="/book" element={<BookingEntry />} />
      <Route path="/book/:id" element={<BookingFlow />} />
      <Route path="/mine-bookinger" element={<MyBookings />} />
      <Route path="/booking/:id/plan" element={<BookingPlan />} />
      <Route path="/provider-dashboard" element={<RoleGuard allow={["provider", "admin"]}><ProviderDashboard /></RoleGuard>} />
      <Route path="/provider/finance" element={<ProviderFinance />} />
      <Route path="/admin/finance" element={<AdminFinance />} />
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
      <Route path="/not-found" element={<NotFound />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

/**
 * Country-scoped tree. Rejects unknown ISO parameter with a localized 404
 * instead of silently falling back to another marketplace — preserves the
 * original path + query in the location so the 404 can offer a fixed URL.
 */
function CountryScopedRoutes() {
  const { country } = useParams<{ country?: string }>();
  if (!isValidCountryParam(country)) {
    // Preserve path + query so we don't drop deep links on redirect.
    const to = { pathname: "/not-found", search: window.location.search };
    return <Navigate to={to} replace state={{ badCountry: country }} />;
  }
  return <AppRoutes />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AppErrorBoundary>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <CustomCursor />
        <BrowserRouter>
          <AuthProvider>
            <ScrollToTop />
            <RouteLoadingBar />
            <Header />
            <Routes>
              <Route
                path="/:country/*"
                element={
                  <CountryProvider>
                    <CountryScopedRoutes />
                  </CountryProvider>
                }
              />
              <Route
                path="/*"
                element={
                  <CountryProvider>
                    <AppRoutes />
                  </CountryProvider>
                }
              />
            </Routes>
            <Footer />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </AppErrorBoundary>
  </QueryClientProvider>
);

export default App;
