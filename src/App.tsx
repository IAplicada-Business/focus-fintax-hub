import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Suspense, lazy } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Index from "@/pages/Index";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const UserManagement = lazy(() => import("@/pages/UserManagement"));
const LeadQueue = lazy(() => import("@/pages/LeadQueue"));
const LeadForm = lazy(() => import("@/pages/LeadForm"));
const LeadReport = lazy(() => import("@/pages/LeadReport"));
const Pipeline = lazy(() => import("@/pages/Pipeline"));
const Benchmarks = lazy(() => import("@/pages/Benchmarks"));
const ClientesList = lazy(() => import("@/pages/ClientesList"));
const ClienteDetail = lazy(() => import("@/pages/ClienteDetail"));
const Diagnostico = lazy(() => import("@/pages/Diagnostico"));
const MotorConfig = lazy(() => import("@/pages/MotorConfig"));
const Intimacoes = lazy(() => import("@/pages/Intimacoes"));
const MarketingLayout    = lazy(() => import("@/pages/marketing/MarketingLayout"));
const MarketingOverview  = lazy(() => import("@/pages/marketing/MarketingOverview"));
const MarketingCampanhas = lazy(() => import("@/pages/marketing/Campanhas"));
const MarketingAnuncios  = lazy(() => import("@/pages/marketing/Anuncios"));
const MarketingFormularios = lazy(() => import("@/pages/marketing/Formularios"));
const MarketingLeads     = lazy(() => import("@/pages/marketing/Leads"));
const MarketingLogs      = lazy(() => import("@/pages/marketing/Logs"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

const PageSpinner = () => (
  <div className="min-h-[60vh] flex items-center justify-center">
    <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Login />} />
            <Route path="/diagnostico/:token" element={<Suspense fallback={<PageSpinner />}><Diagnostico /></Suspense>} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Suspense fallback={<PageSpinner />}>
                      <Routes>
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/pipeline" element={<Pipeline />} />
                        <Route path="/leads" element={<LeadQueue />} />
                        <Route path="/leads/novo" element={<LeadForm />} />
                        <Route path="/leads/:id/relatorio" element={<LeadReport />} />
                        <Route path="/clientes" element={<ClientesList />} />
                        <Route path="/clientes/:id" element={<ClienteDetail />} />
                        <Route path="/intimacoes" element={<Intimacoes />} />
                        <Route path="/marketing" element={<MarketingLayout />}>
                          <Route index             element={<MarketingOverview />} />
                          <Route path="campanhas"  element={<MarketingCampanhas />} />
                          <Route path="anuncios"   element={<MarketingAnuncios />} />
                          <Route path="formularios" element={<MarketingFormularios />} />
                          <Route path="leads"      element={<MarketingLeads />} />
                          <Route path="logs"       element={<MarketingLogs />} />
                        </Route>
                        <Route path="/benchmarks" element={<Benchmarks />} />
                        <Route path="/configuracoes/motor" element={<MotorConfig />} />
                        <Route path="/usuarios" element={<UserManagement />} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </Suspense>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
