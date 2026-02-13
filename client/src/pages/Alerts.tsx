import BlackAxeLayout from "@/components/BlackAxeLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { 
  Bell, 
  AlertTriangle, 
  Thermometer,
  Activity,
  Zap,
  WifiOff,
  CheckCircle2,
  Trash2,
  Check,
  Blocks,
  Filter,
  X,
  Loader2,
  Info
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const alertTypeConfig: Record<string, { icon: React.ElementType; color: string }> = {
  high_temperature: { icon: Thermometer, color: "text-status-error" },
  low_hashrate: { icon: Activity, color: "text-status-warning" },
  device_offline: { icon: WifiOff, color: "text-status-offline" },
  power_warning: { icon: Zap, color: "text-neon-yellow" },
  block_found: { icon: Blocks, color: "text-neon-green" },
  overclock_warning: { icon: AlertTriangle, color: "text-status-warning" },
  fan_failure: { icon: AlertTriangle, color: "text-status-error" },
  share_rejection: { icon: X, color: "text-status-warning" },
  voltage_warning: { icon: Zap, color: "text-status-warning" },
  connection_lost: { icon: WifiOff, color: "text-status-error" },
};

const severityConfig: Record<string, { badge: string; bg: string }> = {
  critical: { badge: "bg-status-error text-white", bg: "border-status-error/30 bg-status-error/5" },
  warning: { badge: "bg-status-warning text-black", bg: "border-status-warning/30 bg-status-warning/5" },
  info: { badge: "bg-primary text-primary-foreground", bg: "border-primary/30 bg-primary/5" },
};

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

interface Alert {
  id: number;
  alertType: string;
  severity: string;
  title: string;
  message: string | null;
  minerId: number | null;
  minerName?: string | null;
  isRead: number | boolean;
  isAcknowledged: number | boolean;
  createdAt: number | Date;
}

function AlertCard({ 
  alert, 
  onMarkRead, 
  onAcknowledge, 
  onDelete 
}: { 
  alert: Alert;
  onMarkRead: (id: number) => void;
  onAcknowledge: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const typeConfig = alertTypeConfig[alert.alertType] || { icon: AlertTriangle, color: "text-muted-foreground" };
  const severity = severityConfig[alert.severity] || severityConfig.info;
  const Icon = typeConfig.icon;

  return (
    <Card className={cn(
      "cyber-card transition-all duration-200",
      !alert.isRead && "ring-1 ring-primary/50",
      severity.bg
    )}>
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Icon */}
          <div className={cn("p-2 rounded-lg bg-card h-fit", typeConfig.color)}>
            <Icon className="w-5 h-5" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className={cn("font-medium", !alert.isRead && "text-foreground")}>
                  {alert.title}
                </h3>
                <Badge className={cn("text-xs", severity.badge)}>
                  {alert.severity}
                </Badge>
                {!alert.isRead && (
                  <Badge variant="outline" className="text-xs bg-primary/10 text-primary">
                    New
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {formatTimeAgo(alert.createdAt.toString())}
              </span>
            </div>
            
            <p className="text-sm text-muted-foreground mb-3">{alert.message}</p>
            
            <div className="flex items-center justify-between">
              {alert.minerName && (
                <Badge variant="outline" className="text-xs">
                  {alert.minerName}
                </Badge>
              )}
              
              <div className="flex items-center gap-2">
                {!alert.isRead && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => onMarkRead(alert.id)}
                  >
                    <Check className="w-4 h-4 mr-1" />
                    Mark Read
                  </Button>
                )}
                {!alert.isAcknowledged && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => onAcknowledge(alert.id)}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    Acknowledge
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onDelete(alert.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Alerts() {
  const [filter, setFilter] = useState<"all" | "unread" | "critical">("all");

  // Fetch alerts from database
  const { data: alerts, isLoading, refetch } = trpc.alerts.list.useQuery(undefined, {
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Auto-mark all alerts as read when page loads
  const markAllReadMutation = trpc.alerts.markAllRead.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  useEffect(() => {
    // When alerts are loaded and there are unread ones, mark them as read
    if (alerts && alerts.some(a => !a.isRead)) {
      markAllReadMutation.mutate();
    }
  }, [alerts?.length]);

  // Mutations
  const markRead = trpc.alerts.markRead.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Alert marked as read");
    },
  });

  const acknowledge = trpc.alerts.acknowledge.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Alert acknowledged");
    },
  });

  const deleteAlert = trpc.alerts.delete.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Alert deleted");
    },
  });

  const markAllRead = trpc.alerts.markAllRead.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("All alerts marked as read");
    },
  });

  const clearAll = trpc.alerts.clearAll.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("All alerts cleared");
    },
  });

  const handleMarkRead = (id: number) => {
    markRead.mutate({ id });
  };

  const handleAcknowledge = (id: number) => {
    acknowledge.mutate({ id });
  };

  const handleDelete = (id: number) => {
    deleteAlert.mutate({ id });
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate();
  };

  const handleClearAll = () => {
    clearAll.mutate();
  };

  const alertList = alerts || [];
  
  const filteredAlerts = alertList.filter(alert => {
    if (filter === "unread") return !alert.isRead;
    if (filter === "critical") return alert.severity === "critical";
    return true;
  });

  const unreadCount = alertList.filter(a => !a.isRead).length;
  const criticalCount = alertList.filter(a => a.severity === "critical" && !a.isAcknowledged).length;

  if (isLoading) {
    return (
      <BlackAxeLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading alerts...</p>
          </div>
        </div>
      </BlackAxeLayout>
    );
  }

  return (
    <BlackAxeLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              Alerts
              {unreadCount > 0 && (
                <Badge className="bg-destructive">{unreadCount}</Badge>
              )}
            </h1>
            <p className="text-muted-foreground">Monitor critical events and notifications</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleMarkAllRead} disabled={unreadCount === 0}>
              <Check className="w-4 h-4 mr-2" />
              Mark All Read
            </Button>
            <Button variant="outline" onClick={handleClearAll} disabled={alertList.length === 0}>
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="cyber-card">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold">{alertList.length}</p>
              <p className="text-xs text-muted-foreground">Total Alerts</p>
            </CardContent>
          </Card>
          <Card className="cyber-card">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-primary">{unreadCount}</p>
              <p className="text-xs text-muted-foreground">Unread</p>
            </CardContent>
          </Card>
          <Card className="cyber-card">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-destructive">{criticalCount}</p>
              <p className="text-xs text-muted-foreground">Critical</p>
            </CardContent>
          </Card>
        </div>

        {/* Filter Tabs */}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">Unread ({unreadCount})</TabsTrigger>
            <TabsTrigger value="critical">Critical ({criticalCount})</TabsTrigger>
          </TabsList>

          <TabsContent value={filter} className="mt-6">
            {filteredAlerts.length > 0 ? (
              <div className="space-y-4">
                {filteredAlerts.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={{...alert, minerName: null} as Alert}
                    onMarkRead={handleMarkRead}
                    onAcknowledge={handleAcknowledge}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            ) : (
              <Card className="cyber-card">
                <CardContent className="py-12 text-center">
                  <Bell className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
                  <h3 className="text-lg font-medium mb-2">No Alerts</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    {filter === "all" 
                      ? "You're all caught up! No alerts to display."
                      : filter === "unread"
                        ? "No unread alerts. Great job staying on top of things!"
                        : "No critical alerts at the moment."
                    }
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Info Card */}
        <Card className="cyber-card border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium mb-1">About Alerts</p>
                <p className="text-muted-foreground">
                  BlackAxe monitors your mining devices and generates alerts for important events like 
                  high temperatures, offline devices, low hashrate, and block discoveries. 
                  Configure alert thresholds in Settings to customize notifications.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </BlackAxeLayout>
  );
}
