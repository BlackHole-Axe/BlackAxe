import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTheme } from "@/contexts/ThemeContext";
import { 
  LayoutDashboard, 
  Cpu, 
  Radar, 
  Bell, 
  Settings, 
  Blocks,
  Server,
  Menu,
  X,
  Zap,
  Activity,
  Sun,
  Moon,
  User,
  Info,
  Bitcoin,
  Copy,
  Check,
  LogOut
} from "lucide-react";
import { Link, useLocation, useRoute } from "wouter";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

interface BlackAxeLayoutProps {
  children: React.ReactNode;
}

const baseNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/miners", label: "Miners", icon: Cpu },
  { href: "/pools-audit", label: "Pools Audit", icon: Server },
  { href: "/scan", label: "Network Scan", icon: Radar },
  { href: "/solo-blocks", label: "Solo Blocks", icon: Blocks },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/about", label: "About", icon: Info },
];

const DONATION_ADDRESS = "bc1qdqqyez86m22mu55gjz4x58nyt59sxsr96t9uax";

export default function BlackAxeLayout({ children }: BlackAxeLayoutProps) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { theme, toggleTheme } = useTheme();
  
  // Fetch unread alerts count from database
  const { data: alerts } = trpc.alerts.list.useQuery({ unreadOnly: true }, {
    refetchInterval: 30000, // Refresh every 30 seconds
  });
  
  const unreadCount = alerts?.length || 0;
  
  // Mark alerts as read when visiting alerts page
  const markAllRead = trpc.alerts.markAllRead.useMutation();
  
  useEffect(() => {
    if (location === "/alerts" && unreadCount > 0) {
      markAllRead.mutate();
    }
  }, [location]);
  
  // Build nav items with dynamic badge
  const navItems = baseNavItems.map(item => ({
    ...item,
    badge: item.href === "/alerts" ? unreadCount : undefined
  }));

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(DONATION_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy address", err);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" />
            <span className="font-bold text-lg">BlackAxe</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 z-50 h-full w-64 bg-sidebar border-r border-sidebar-border transition-transform duration-300",
        "lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo - Styled like the reference image */}
          <div className="p-5 border-b border-sidebar-border/50">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/30">
                  <Zap className="w-6 h-6 text-primary" />
                </div>
                <div className="absolute inset-0 bg-primary/10 blur-lg rounded-lg" />
              </div>
              <div>
                <h1 className="font-bold text-xl text-primary">BlackAxe</h1>
                <p className="text-xs text-muted-foreground">Mining Manager</p>
              </div>
            </Link>
          </div>

          {/* Navigation - Styled like the reference image */}
          <ScrollArea className="flex-1 py-4">
            <nav className="px-3 space-y-1">
              {navItems.map((item) => {
                const isActive = location === item.href || 
                  (item.href !== "/dashboard" && location.startsWith(item.href));
                return (
                  <Link key={item.href} href={item.href}>
                    <div
                      className={cn(
                        "relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300",
                        isActive 
                          ? "bg-primary/10 text-primary border border-primary/30 shadow-[0_0_20px_rgba(0,255,255,0.15)]" 
                          : "text-sidebar-foreground hover:bg-sidebar-accent/30 hover:text-primary border border-transparent"
                      )}
                      onClick={() => setSidebarOpen(false)}
                    >
                      {/* Active indicator glow */}
                      {isActive && (
                        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary/5 to-transparent" />
                      )}
                      <item.icon className={cn(
                        "w-5 h-5 relative z-10",
                        isActive ? "text-primary" : "text-muted-foreground"
                      )} />
                      <span className={cn(
                        "font-medium relative z-10",
                        isActive && "text-primary"
                      )}>{item.label}</span>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="ml-auto relative z-10 bg-destructive text-destructive-foreground text-xs w-5 h-5 flex items-center justify-center rounded-full font-bold animate-pulse">
                          {item.badge}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </nav>
          </ScrollArea>

          {/* Status Indicator */}
          <div className="px-4 py-3 border-t border-sidebar-border/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <div className="relative">
                  <Activity className="w-4 h-4 text-accent" />
                  <div className="absolute inset-0 bg-accent/50 blur-sm rounded-full animate-pulse" />
                </div>
                <span className="text-muted-foreground">System Active</span>
              </div>
              {/* Theme Toggle */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={toggleTheme}
              >
                {theme === "dark" ? (
                  <Sun className="w-4 h-4 text-muted-foreground hover:text-primary" />
                ) : (
                  <Moon className="w-4 h-4 text-muted-foreground hover:text-primary" />
                )}
              </Button>
            </div>
          </div>

          {/* Local User Section - No OAuth */}
          <div className="p-4 border-t border-sidebar-border/50">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center ring-2 ring-primary/20">
                  <User className="w-5 h-5 text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">BlackAxe Admin</p>
                  <p className="text-xs text-muted-foreground">Local System</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => {
                  // Clear session and redirect to login
                  fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
                    .then(() => {
                      window.location.href = '/login';
                    });
                }}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:pl-64 pt-14 lg:pt-0 min-h-screen flex flex-col">
        <div className="p-4 lg:p-6 flex-1">
          {children}
        </div>
        
        {/* Donation Footer */}
        <footer className="p-4 lg:p-6 border-t border-border/50 bg-card/30">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 text-center">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Bitcoin className="w-5 h-5 text-orange-500" />
                <span className="text-sm font-medium">Support BlackAxe Development</span>
              </div>
              <div className="flex items-center gap-2 bg-background/50 rounded-lg px-3 py-2 border border-border/50">
                <code className="text-xs sm:text-sm text-foreground/80 font-mono break-all">
                  {DONATION_ADDRESS}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={copyAddress}
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4 text-muted-foreground hover:text-primary" />
                  )}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Your donations help keep this project alive and free for the community
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
