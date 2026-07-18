import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
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
            <Route
              path="/admin"
              element={
                <RoleGuard allow={["admin"]}>
                  <AdminDashboard />
                </RoleGuard>
              }
            />
            <Route
              path="/admin/stripe"
              element={
                <RoleGuard allow={["admin"]}>
                  <AdminStripe />
                </RoleGuard>
              }
            />
            <Route
              path="/admin/webhooks"
              element={
                <RoleGuard allow={["admin", "employee"]}>
                  <AdminWebhooks />
                </RoleGuard>
              }
            />
            <Route
              path="/admin/payments"
              element={
                <RoleGuard allow={["admin"]}>
                  <AdminPayments />
                </RoleGuard>
              }
            />
            <Route
              path="/admin/access-logs"
              element={
                <RoleGuard allow={["admin"]}>
                  <AdminAccessLogs />
                </RoleGuard>
              }
            />
            <Route
              path="/employee"
              element={
                <RoleGuard allow={["admin", "employee"]}>
                  <EmployeeDashboard />
                </RoleGuard>
              }
            />
            <Route path="/book/:id" element={<BookingFlow />} />
            <Route path="/mine-bookinger" element={<MyBookings />} />
            <Route path="/booking/:id/plan" element={<BookingPlan />} />

            <Route
              path="/provider-dashboard"
              element={
                <RoleGuard allow={["provider", "admin"]}>
                  <ProviderDashboard />
                </RoleGuard>
              }
            />

            <Route path="/provider/finance" element={<ProviderFinance />} />
            <Route path="/admin/finance" element={<AdminFinance />} />
            <Route path="/admin/disputes" element={<RoleGuard allow={["admin"]}><AdminDisputes /></RoleGuard>} />
            <Route path="/provider/disputes" element={<RoleGuard allow={["provider", "admin"]}><ProviderDisputes /></RoleGuard>} />
            <Route path="/provider/disputes/:id" element={<RoleGuard allow={["provider", "admin"]}><ProviderDisputes /></RoleGuard>} />




            <Route path="/privatliv" element={<PrivacyCenter />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/regler" element={<Regler />} />
            <Route
              path="/provider/bilag"
              element={<RoleGuard allow={["provider", "admin", "super_admin"]}><ProviderReceipts /></RoleGuard>}
            />

            <Route path="*" element={<NotFound />} />
          </Routes>

          <Footer />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
