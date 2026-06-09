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
import Profile from "./pages/Profile";
import ProviderRegister from "./pages/ProviderRegister";
import ProviderProfile from "./pages/ProviderProfile";
import CustomerRegister from "./pages/CustomerRegister";
import CreateTask from "./pages/CreateTask";
import MatchingOffers from "./pages/MatchingOffers";
import AdminDashboard from "./pages/AdminDashboard";
import EmployeeDashboard from "./pages/EmployeeDashboard";
import BookingFlow from "./pages/BookingFlow";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <CustomCursor />
      <BrowserRouter>
        <AuthProvider>
          <Header />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/profil" element={<Profile />} />
            <Route path="/provider/register" element={<ProviderRegister />} />
            <Route path="/provider/:id" element={<ProviderProfile />} />
            <Route path="/customer/register" element={<CustomerRegister />} />
            <Route path="/task/create" element={<CreateTask />} />
            <Route path="/task/offers" element={<MatchingOffers />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/employee" element={<EmployeeDashboard />} />
            <Route path="/book/:id" element={<BookingFlow />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <Footer />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
