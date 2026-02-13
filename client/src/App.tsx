import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Miners from "./pages/Miners";
import MinerDetail from "./pages/MinerDetail";
import NetworkScan from "./pages/NetworkScan";
import Alerts from "./pages/Alerts";
import Settings from "./pages/Settings";
import SoloBlocks from "./pages/SoloBlocks";
import PoolsAudit from "./pages/PoolsAudit";
import About from "./pages/About";
import Login from "./pages/Login";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/miners" component={Miners} />
      <Route path="/miners/:id" component={MinerDetail} />
      <Route path="/scan" component={NetworkScan} />
      <Route path="/alerts" component={Alerts} />
      <Route path="/solo-blocks" component={SoloBlocks} />
      <Route path="/pools-audit" component={PoolsAudit} />
      <Route path="/settings" component={Settings} />
      <Route path="/about" component={About} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable>
        <TooltipProvider>
          <Toaster 
            position="top-right"
            toastOptions={{
              style: {
                background: 'oklch(0.12 0.02 260)',
                border: '1px solid oklch(0.25 0.03 260)',
                color: 'oklch(0.95 0.01 260)',
              },
            }}
          />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
