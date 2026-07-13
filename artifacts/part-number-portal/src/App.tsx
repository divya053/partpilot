import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, Redirect } from 'wouter';
import { Loader2 } from 'lucide-react';

import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import Builder from "@/pages/builder";
import Library from "@/pages/library";
import PartDetail from "@/pages/part-detail";
import Segments from "@/pages/segments";
import Users from "@/pages/users";
import Login from "@/pages/login";
import { AuthProvider, useAuth, type Capability } from "@/lib/auth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function Guard({ capability, children }: { capability: Capability; children: React.ReactNode }) {
  const { can } = useAuth();
  if (!can(capability)) return <Redirect to="/" />;
  return <>{children}</>;
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/login"><Redirect to="/" /></Route>
        <Route path="/" component={Dashboard} />
        <Route path="/builder">
          <Guard capability="create"><Builder /></Guard>
        </Route>
        <Route path="/library" component={Library} />
        <Route path="/library/:id" component={PartDetail} />
        <Route path="/segments" component={Segments} />
        <Route path="/users">
          <Guard capability="manageUsers"><Users /></Guard>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function Gate() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sidebar text-sidebar-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Router />
    </WouterRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
