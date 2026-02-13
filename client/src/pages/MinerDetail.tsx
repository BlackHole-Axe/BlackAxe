import BlackAxeLayout from "@/components/BlackAxeLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { useRefreshIntervalMs } from "@/hooks/useRefreshIntervalMs";
import { useLocation } from "wouter";
import { 
  ArrowLeft,
  Cpu, 
  Thermometer,
  Zap,
  Activity,
  Fan,
  Settings,
  Power,
  RefreshCw,
  Save,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Wifi,
  Clock,
  Hash,
  Server,
  Gauge,
  TrendingUp,
  Target,
  Trophy,
  History,
  Bell,
  Shield,
  BarChart3,
  Trash2,
  FileText,
  Download,
  Copy,
  Terminal,
  Info,
  AlertCircle,
  Loader2
} from "lucide-react";
import { Link, useParams } from "wouter";
import { useState, useEffect, useMemo } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { cn, getMinerTypeColor, getMinerTypeBgColor } from "@/lib/utils";
import { toast } from "sonner";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Format uptime to readable format
function formatUptime(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '-';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

// Format hashrate with appropriate unit
// Input is in GH/s from the API
function formatHashrate(hashrate: number | null): string {
  if (!hashrate) return '-';
  if (hashrate >= 1000000) return `${(hashrate / 1000000).toFixed(2)} PH/s`;
  if (hashrate >= 1000) return `${(hashrate / 1000).toFixed(2)} TH/s`;
  if (hashrate >= 1) return `${hashrate.toFixed(2)} GH/s`;
  if (hashrate >= 0.001) return `${(hashrate * 1000).toFixed(2)} MH/s`;
  return `${(hashrate * 1000000).toFixed(0)} KH/s`;
}

// Format Best Share/Difficulty with appropriate unit (like NerdQAxe: 821M, 5.07G)
function formatBestDifficulty(difficulty: number | string | null): string {
  if (!difficulty) return '-';
  
  // If already formatted (contains letter suffix), return as-is
  if (typeof difficulty === 'string' && /[KMGTP]$/i.test(difficulty)) {
    return difficulty;
  }
  
  const num = typeof difficulty === 'string' ? parseFloat(difficulty) : difficulty;
  if (isNaN(num) || num === 0) return '-';
  
  // Format with appropriate suffix
  if (num >= 1e15) return `${(num / 1e15).toFixed(2)}P`;
  if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}G`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(0)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toFixed(0);
}

// Format power to 2 decimal places
function formatPower(power: number | null): string {
  if (!power) return '-';
  return `${power.toFixed(2)}W`;
}

function splitPoolUrlPort(url: string, port: number | null | undefined): { url: string; port: string } {
  if (!url) {
    return { url: "", port: port ? String(port) : "" };
  }
  if (port && port > 0) {
    return { url, port: String(port) };
  }
  // Try to infer :port from url
  const cleaned = url
    .replace(/^stratum\+tcp:\/\//i, "")
    .replace(/^stratum\+ssl:\/\//i, "")
    .replace(/^stratum:\/\//i, "")
    .replace(/^tcp:\/\//i, "")
    .replace(/^ssl:\/\//i, "");
  const hostPort = cleaned.split("/")[0];
  const m = hostPort.match(/:(\d{2,5})$/);
  return { url, port: m ? m[1] : "" };
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (diffHours > 0) {
    return `${diffHours}h ${diffMins}m ago`;
  }
  return `${diffMins}m ago`;
}

const minerTypeLabels: Record<string, string> = {
  bitaxe: "Bitaxe",
  nerdqaxe: "NerdQaxe",
  avalon: "Avalon",
  antminer: "Antminer",
  whatsminer: "Whatsminer",
  canaan: "Canaan",
  other: "Other",
};

export default function MinerDetail() {
  const params = useParams();
  const minerId = parseInt(params.id || "0");
  const [, navigate] = useLocation();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Theme-aware chart colors
  const chartColors = {
    grid: isDark ? 'oklch(0.25 0.03 260)' : 'oklch(0.85 0.01 260)',
    axis: isDark ? 'oklch(0.6 0.02 260)' : 'oklch(0.4 0.02 260)',
    tooltipBg: isDark ? 'oklch(0.12 0.02 260)' : 'oklch(0.98 0.01 260)',
    tooltipBorder: isDark ? 'oklch(0.25 0.03 260)' : 'oklch(0.85 0.01 260)',
    tooltipText: isDark ? 'oklch(0.95 0.01 260)' : 'oklch(0.15 0.02 260)',
  };

  const refreshMs = useRefreshIntervalMs(3000);
  const utils = trpc.useUtils();

  // Local UI state
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [logFilter, setLogFilter] = useState<string>("all");
  const [chartRange, setChartRange] = useState<"10m" | "1h" | "6h" | "24h">("10m");

  // Deep pool verification dialog state
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyTitle, setVerifyTitle] = useState<string>("");
  const [verifyData, setVerifyData] = useState<any>(null);

  const rangeHours = (() => {
    switch (chartRange) {
      case "10m":
        return 10 / 60;
      case "1h":
        return 1;
      case "6h":
        return 6;
      case "24h":
      default:
        return 24;
    }
  })();

  // Fetch miner data from database
  const { data: miner, isLoading, refetch } = trpc.miners.get.useQuery(
    { id: minerId },
    { enabled: minerId > 0, refetchInterval: refreshMs }
  );

  // Fetch miner logs
  const { data: logs, refetch: refetchLogs } = trpc.logs.list.useQuery(
    { minerId, limit: 100 },
    { enabled: minerId > 0 }
  );

  // Fetch miner stats history for charts
  const { data: statsHistoryData } = trpc.stats.history.useQuery(
    { minerId, hours: rangeHours },
    { enabled: minerId > 0, refetchInterval: refreshMs }
  );

  // Mutations
  const updateMiner = trpc.miners.update.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Settings saved successfully");
    },
    onError: (error) => {
      toast.error(`Failed to save settings: ${error.message}`);
    },
  });

  const deleteMiner = trpc.miners.delete.useMutation({
    onSuccess: () => {
      toast.success("Miner deleted successfully");
      navigate("/miners");
    },
    onError: (error) => {
      toast.error(`Failed to delete miner: ${error.message}`);
    },
  });

  const clearLogs = trpc.logs.clear.useMutation({
    onSuccess: () => {
      refetchLogs();
      toast.success("Logs cleared");
    },
  });

  const verifyPool = trpc.miners.verifyPool.useMutation({
    onSuccess: () => {
      utils.miners.get.invalidate({ id: minerId });
      utils.miners.list.invalidate();
    },
  });

  const runDeepVerify = async (poolIndex: 1 | 2 | 3) => {
    if (!miner) return;
    setVerifyTitle(`${miner.name} · Pool ${poolIndex}`);
    setVerifyOpen(true);
    setVerifyData(null);
    try {
      const res = await verifyPool.mutateAsync({ minerId, poolIndex });
      setVerifyData(res);
    } catch (e: any) {
      setVerifyData({ ok: false, error: e?.message || "Verification failed" });
    }
  };

  // Polling mutation to refresh miner data from device
  const refreshMiner = trpc.polling.refreshOne.useMutation({
    onSuccess: (result) => {
      refetch();
      void result;
    },
    onError: (error) => {
      // Avoid noisy toast spam; errors will be visible in status and logs.
      console.warn("Refresh failed:", error);
    },
  });

  // Silent auto-refresh (no toast spam)
  const refreshMinerSilent = trpc.polling.refreshOne.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  // Auto-refresh from device based on user refresh interval
  useEffect(() => {
    if (minerId <= 0) return;
    const interval = setInterval(() => {
      if (!refreshMinerSilent.isPending) refreshMinerSilent.mutate({ minerId });
    }, refreshMs);
    return () => clearInterval(interval);
  }, [minerId, refreshMs]);

  // Transform stats history for charts (binned + forward-filled for stable visuals)
  const statsHistory = useMemo(() => {
    const raw = (statsHistoryData || []) as Array<{ timestamp: number; hashrate: number | null; temperature: number | null; power: number | null }>;
    if (!raw.length) return [] as Array<{ time: string; hashrate: number | null; temperature: number | null; power: number | null }>;

    const now = Date.now();
    const rangeMs = rangeHours * 60 * 60 * 1000;
    const fromMs = now - rangeMs;

    const binMs = (() => {
      if (chartRange === "10m") return 60 * 1000;
      if (chartRange === "1h") return 5 * 60 * 1000;
      if (chartRange === "6h") return 30 * 60 * 1000;
      return 60 * 60 * 1000;
    })();

    const binsCount = Math.max(2, Math.min(300, Math.ceil(rangeMs / binMs) + 1));
    const bins = Array.from({ length: binsCount }, (_, i) => fromMs + i * binMs);

    const buckets: Record<number, { hashrateSum: number; tempSum: number; powerSum: number; count: number }> = {};
    for (const stat of raw) {
      const t = stat.timestamp;
      if (t < fromMs || t > now) continue;
      const bucketStart = fromMs + Math.floor((t - fromMs) / binMs) * binMs;
      if (!buckets[bucketStart]) buckets[bucketStart] = { hashrateSum: 0, tempSum: 0, powerSum: 0, count: 0 };
      buckets[bucketStart].hashrateSum += stat.hashrate ?? 0;
      buckets[bucketStart].tempSum += stat.temperature ?? 0;
      buckets[bucketStart].powerSum += stat.power ?? 0;
      buckets[bucketStart].count += 1;
    }

    // Only include points with actual data
    return bins.map((t) => {
      const b = buckets[t];
      const hashrate = b && b.count ? Math.round((b.hashrateSum / b.count) * 100) / 100 : null;
      const temperature = b && b.count ? Math.round((b.tempSum / b.count) * 10) / 10 : null;
      const power = b && b.count ? Math.round((b.powerSum / b.count) * 10) / 10 : null;
      return {
        time: new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        hashrate,
        temperature,
        power,
      };
    }).filter(point => point.hashrate !== null || point.temperature !== null || point.power !== null);
  }, [statsHistoryData, rangeHours, chartRange]);

  // Editable settings (3 pools)
  const [pools, setPools] = useState([
    { url: "", port: "", user: "", pass: "" },
    { url: "", port: "", user: "", pass: "" },
    { url: "", port: "", user: "", pass: "" },
  ]);

  const setPoolField = (index: number, field: 'url' | 'port' | 'user' | 'pass', value: string) => {
    setPools((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };

  // Update local state when miner data loads
  useEffect(() => {
    if (miner) {
      const p1 = splitPoolUrlPort(miner.poolUrl || "", (miner as any).poolPort ?? null);
      const p2 = splitPoolUrlPort((miner as any).poolUrl2 || "", (miner as any).poolPort2 ?? null);
      const p3 = splitPoolUrlPort((miner as any).poolUrl3 || "", (miner as any).poolPort3 ?? null);
      setPools([
        { url: p1.url, port: p1.port, user: miner.poolUser || "", pass: miner.poolPassword || "" },
        { url: p2.url, port: p2.port, user: (miner as any).poolUser2 || "", pass: (miner as any).poolPassword2 || "" },
        { url: p3.url, port: p3.port, user: (miner as any).poolUser3 || "", pass: (miner as any).poolPassword3 || "" },
      ]);
    }
  }, [miner]);

  const statusConfig = {
    online: { color: "status-badge-online", icon: CheckCircle2, label: "Online" },
    offline: { color: "status-badge-offline", icon: XCircle, label: "Offline" },
    warning: { color: "status-badge-warning", icon: AlertTriangle, label: "Warning" },
    error: { color: "status-badge-error", icon: AlertTriangle, label: "Error" },
  };

  if (isLoading) {
    return (
      <BlackAxeLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading miner details...</p>
          </div>
        </div>
      </BlackAxeLayout>
    );
  }

  if (!miner) {
    return (
      <BlackAxeLayout>
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <Cpu className="w-16 h-16 mb-4 text-muted-foreground opacity-30" />
          <h2 className="text-xl font-medium mb-2">Miner Not Found</h2>
          <p className="text-muted-foreground mb-4">The requested miner could not be found.</p>
          <Link href="/miners">
            <Button>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Miners
            </Button>
          </Link>
        </div>
      </BlackAxeLayout>
    );
  }

  const status = statusConfig[miner.status as keyof typeof statusConfig] || statusConfig.offline;
  const StatusIcon = status.icon;

  const poolStatus: Record<string, string> = (() => {
    try { return JSON.parse((miner as any).poolStatus || "{}"); } catch { return {}; }
  })();
  const poolErrors: Record<string, string> = (() => {
    try { return JSON.parse((miner as any).poolError || "{}"); } catch { return {}; }
  })();
  const poolVerify: Record<string, any> = (() => {
    try { return JSON.parse((miner as any).poolVerify || "{}"); } catch { return {}; }
  })();

  const chartRangeLabel = (() => {
    switch (chartRange) {
      case "10m": return "10m";
      case "1h": return "1h";
      case "6h": return "6h";
      case "24h":
      default: return "24h";
    }
  })();

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      await updateMiner.mutateAsync({
        id: minerId,
        poolUrl: pools[0].url,
        poolPort: pools[0].port ? parseInt(pools[0].port, 10) : undefined,
        poolUser: pools[0].user,
        poolPassword: pools[0].pass,
        poolUrl2: pools[1].url,
        poolPort2: pools[1].port ? parseInt(pools[1].port, 10) : undefined,
        poolUser2: pools[1].user,
        poolPassword2: pools[1].pass,
        poolUrl3: pools[2].url,
        poolPort3: pools[2].port ? parseInt(pools[2].port, 10) : undefined,
        poolUser3: pools[2].user,
        poolPassword3: pools[2].pass,
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteMiner = async () => {
    await deleteMiner.mutateAsync({ id: minerId });
  };

  // Logs functions
  const filteredLogs = logFilter === "all" 
    ? (logs || [])
    : (logs || []).filter(log => log.logLevel === logFilter);

  const handleCopyLogs = () => {
    const logText = filteredLogs.map(log => 
      `[${new Date(log.createdAt).toLocaleString()}] [${(log.logLevel || 'info').toUpperCase()}] [${log.source || 'system'}] ${log.message}`
    ).join("\n");
    navigator.clipboard.writeText(logText);
    toast.success("Logs copied to clipboard");
  };

  const handleDownloadLogs = () => {
    const logText = filteredLogs.map(log => 
      `[${new Date(log.createdAt).toLocaleString()}] [${(log.logLevel || 'info').toUpperCase()}] [${log.source || 'system'}] ${log.message}`
    ).join("\n");
    const blob = new Blob([logText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${miner.name}-logs-${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Logs downloaded");
  };

  const handleClearLogs = () => {
    clearLogs.mutate({ minerId });
  };

  const getLogLevelIcon = (level: string) => {
    switch (level) {
      case "debug": return <Terminal className="w-4 h-4 text-muted-foreground" />;
      case "info": return <Info className="w-4 h-4 text-primary" />;
      case "warning": return <AlertTriangle className="w-4 h-4 text-status-warning" />;
      case "error": return <AlertCircle className="w-4 h-4 text-destructive" />;
      case "critical": return <AlertCircle className="w-4 h-4 text-destructive animate-pulse" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case "debug": return "text-muted-foreground";
      case "info": return "text-primary";
      case "warning": return "text-status-warning";
      case "error": return "text-destructive";
      case "critical": return "text-destructive font-bold";
      default: return "";
    }
  };

  const acceptanceRate = miner.sharesAccepted && miner.sharesRejected !== null
    ? (miner.sharesAccepted / (miner.sharesAccepted + miner.sharesRejected)) * 100
    : 0;

  return (
    <BlackAxeLayout>
      <div className="space-y-6">
        <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
          <DialogContent className="sm:max-w-[820px]">
            <DialogHeader>
              <DialogTitle>Deep Verify — {verifyTitle}</DialogTitle>
              <DialogDescription>
                Connects to the pool stratum endpoint, waits for a mining.notify, parses the coinbase transaction outputs, and checks whether the configured recipient is paid.
              </DialogDescription>
            </DialogHeader>

            {!verifyData ? (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Verifying...
              </div>
            ) : verifyData.ok ? (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-3">
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Risk</CardTitle>
                      <CardDescription>{verifyData.risk?.label} ({verifyData.risk?.score}/100)</CardDescription>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Your Share</CardTitle>
                      <CardDescription className="tabular-nums">
                        {typeof verifyData.yourSharePct === "number" ? `${verifyData.yourSharePct.toFixed(2)}%` : "—"}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Coinbase Fee (est.)</CardTitle>
                      <CardDescription className="tabular-nums">
                        {typeof verifyData.yourSharePct === "number" ? `${Math.max(0, 100 - verifyData.yourSharePct).toFixed(2)}%` : "—"}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </div>

                {verifyData.summary ? <div className="text-sm text-muted-foreground">{verifyData.summary}</div> : null}

                <div className="rounded-md border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Check</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Detail</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(verifyData.checks || []).map((c: any) => (
                        <TableRow key={c.name}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell>
                            <Badge variant={c.status === "PASS" ? "default" : c.status === "FAIL" ? "destructive" : "secondary"}>
                              {c.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{c.detail}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {Array.isArray(verifyData.outputs) && verifyData.outputs.length ? (
                  <div className="rounded-md border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Recipient</TableHead>
                          <TableHead className="text-right">Share</TableHead>
                          <TableHead className="text-right">Sats</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {verifyData.outputs.slice(0, 10).map((o: any) => (
                          <TableRow key={o.n}>
                            <TableCell>{o.n}</TableCell>
                            <TableCell className="font-mono text-xs">{o.recipient}</TableCell>
                            <TableCell className="text-right tabular-nums">{Number(o.sharePct).toFixed(2)}%</TableCell>
                            <TableCell className="text-right tabular-nums">{o.sats}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-sm text-destructive">{verifyData.error || "Verification failed"}</div>
            )}

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setVerifyOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/miners">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{miner.name}</h1>
                <span className={`status-badge ${status.color}`}>
                  <StatusIcon className="w-3 h-3" />
                  {status.label}
                </span>
              </div>
              <p className="text-muted-foreground">
                {miner.model || minerTypeLabels[miner.minerType]} • {miner.ipAddress}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={() => refreshMiner.mutate({ minerId })}
              disabled={refreshMiner.isPending}
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", refreshMiner.isPending && "animate-spin")} />
              {refreshMiner.isPending ? "Refreshing..." : "Refresh from Device"}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Miner</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete {miner.name}? This action cannot be undone.
                    All historical data and logs for this device will be permanently removed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleDeleteMiner}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={deleteMiner.isPending}
                  >
                    {deleteMiner.isPending ? "Deleting..." : "Delete Miner"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <Card className="cyber-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Activity className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Hashrate</p>
                  <p className="text-xl font-bold font-mono">{formatHashrate(miner.hashrate)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="cyber-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg",
                  miner.temperature && miner.temperature > 70 ? "bg-status-warning/10" : "bg-accent/10"
                )}>
                  <Thermometer className={cn("w-5 h-5",
                    miner.temperature && miner.temperature > 70 ? "text-status-warning" : "text-accent"
                  )} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Temperature</p>
                  <p className="text-xl font-bold font-mono">{miner.temperature ? `${miner.temperature}°C` : '-'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="cyber-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-neon-purple/10">
                  <Fan className="w-5 h-5 text-neon-purple" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Fan Speed</p>
                  <p className="text-xl font-bold font-mono">{miner.fanSpeed ? `${miner.fanSpeed}%` : '-'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="cyber-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-neon-yellow/10">
                  <Zap className="w-5 h-5 text-neon-yellow" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Power</p>
                  <p className="text-xl font-bold font-mono">{formatPower(miner.power)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="cyber-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/10">
                  <Target className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Shares</p>
                  <p className="text-xl font-bold font-mono text-accent">
                    {miner.sharesAccepted ? miner.sharesAccepted.toLocaleString() : '-'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="cyber-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/10">
                  <Trophy className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Best Share</p>
                  <p className="text-xl font-bold font-mono text-accent">{formatBestDifficulty(miner.bestDifficulty)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Uptime Card */}
        <Card className="cyber-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10">
                  <Clock className="w-5 h-5 text-cyan-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Uptime</p>
                  <p className="text-2xl font-bold font-mono text-cyan-400">{formatUptime(miner.uptimeSeconds)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Last Seen</p>
                <p className="text-sm font-mono">{miner.lastSeen ? new Date(miner.lastSeen).toLocaleString() : '-'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-card border border-border flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="charts">Charts</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="pool">Pool Config</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Device Info */}
              <Card className="cyber-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-primary" />
                    Device Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Type</p>
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-medium border",
                          getMinerTypeColor(miner.minerType),
                          getMinerTypeBgColor(miner.minerType)
                        )}
                      >
                        {minerTypeLabels[miner.minerType] || miner.minerType}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Model</p>
                      <p className="font-medium">{miner.model || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">IP Address</p>
                      <p className="font-mono">{miner.ipAddress}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">MAC Address</p>
                      <p className="font-mono text-sm">{miner.macAddress || '-'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Mining Statistics */}
              <Card className="cyber-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Hash className="w-5 h-5 text-accent" />
                    Mining Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Accepted Shares</p>
                      <p className="text-2xl font-bold text-accent font-mono">
                        {miner.sharesAccepted ? miner.sharesAccepted.toLocaleString() : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Rejected Shares</p>
                      <p className="text-2xl font-bold text-destructive font-mono">
                        {miner.sharesRejected !== null ? miner.sharesRejected : '-'}
                      </p>
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Acceptance Rate</p>
                    <div className="flex items-center gap-3">
                      <Progress value={acceptanceRate} className="flex-1" />
                      <span className="font-mono font-medium">
                        {acceptanceRate > 0 ? `${acceptanceRate.toFixed(2)}%` : '-'}
                      </span>
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground mb-3">Best Difficulty</p>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center p-3 rounded-lg bg-muted/30">
                        <p className="text-xs text-muted-foreground mb-1">Current Session</p>
                        <p className="text-lg font-bold text-accent font-mono">{formatBestDifficulty(miner.bestDifficulty)}</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/30">
                        <p className="text-xs text-muted-foreground mb-1">All-Time</p>
                        <p className="text-lg font-bold text-primary font-mono">{formatBestDifficulty((miner as any).bestDifficultyAllTime || miner.bestDifficulty)}</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/30">
                        <p className="text-xs text-muted-foreground mb-1">Previous Session</p>
                        <p className="text-lg font-bold text-muted-foreground font-mono">{formatBestDifficulty((miner as any).bestDifficultyPrevSession) || '-'}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Pool Information */}
            <Card className="cyber-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Server className="w-5 h-5 text-primary" />
                  Pool Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[0,1,2].map((i) => {
                  const p = pools[i];
                  const s = poolStatus[String(i+1)];
                  const e = poolErrors[String(i+1)];
                  return (
                    <div key={i} className="p-4 rounded-lg border border-border bg-muted/10">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">Pool {i+1}</div>
                        <Badge variant={s === 'valid' ? 'default' : s === 'invalid' ? 'destructive' : 'secondary'}>
                          {s ? s.toUpperCase() : 'UNKNOWN'}
                        </Badge>
                      </div>
                      <div className="mt-2 grid sm:grid-cols-3 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">URL</p>
                          <p className="font-mono text-xs break-all">{p.url || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Port</p>
                          <p className="font-mono text-xs">{p.port || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">User/Worker</p>
                          <p className="font-mono text-xs break-all">{p.user || '-'}</p>
                        </div>
                      </div>
                      {e ? <p className="mt-2 text-xs text-destructive">{e}</p> : null}
                      {(miner as any).poolLastCheckedAt ? (
                        <p className="mt-2 text-xs text-muted-foreground">Last checked: {new Date((miner as any).poolLastCheckedAt).toLocaleString()}</p>
                      ) : null}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Charts Tab */}
          <TabsContent value="charts" className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                Select time range
              </div>
              <Select value={chartRange} onValueChange={setChartRange}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10m">Last 10 minutes</SelectItem>
                  <SelectItem value="1h">Last 1 hour</SelectItem>
                  <SelectItem value="6h">Last 6 hours</SelectItem>
                  <SelectItem value="24h">Last 24 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Hashrate Chart */}
            <Card className="cyber-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="w-5 h-5 text-accent" />
                  Hashrate History ({chartRangeLabel})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={statsHistory}>
                      <defs>
                        <linearGradient id="hashrateGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00ff9d" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#00ff9d" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                      <XAxis 
                        dataKey="time" 
                        stroke={chartColors.axis}
                        tick={{ fill: chartColors.axis, fontSize: 12 }}
                      />
                      <YAxis 
                        stroke={chartColors.axis}
                        tick={{ fill: chartColors.axis, fontSize: 12 }}
                        tickFormatter={(value) => {
                          // value is in GH/s
                          if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)}E`;
                          if (value >= 1000000) return `${(value / 1000000).toFixed(1)}P`;
                          if (value >= 1000) return `${(value / 1000).toFixed(1)}T`;
                          return `${value.toFixed(1)}G`;
                        }}
                        domain={[0, (dataMax: number) => Math.round(dataMax * 1.1)]}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: chartColors.tooltipBg, 
                          border: `1px solid ${chartColors.tooltipBorder}`,
                          borderRadius: '8px'
                        }}
                        labelStyle={{ color: chartColors.tooltipText }}
                        formatter={(value: number) => {
                          // value is in GH/s
                          if (value >= 1000000000) return [`${(value / 1000000000).toFixed(2)} EH/s`, 'Hashrate'];
                          if (value >= 1000000) return [`${(value / 1000000).toFixed(2)} PH/s`, 'Hashrate'];
                          if (value >= 1000) return [`${(value / 1000).toFixed(2)} TH/s`, 'Hashrate'];
                          return [`${value.toFixed(2)} GH/s`, 'Hashrate'];
                        }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="hashrate" 
                        stroke="#00ff9d" 
                        fill="url(#hashrateGradient)"
                        strokeWidth={2}
                        connectNulls
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Temperature Chart */}
            <Card className="cyber-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Thermometer className="w-5 h-5 text-orange-500" />
                  Temperature History ({chartRangeLabel})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={statsHistory}>
                      <defs>
                        <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                      <XAxis 
                        dataKey="time" 
                        stroke={chartColors.axis}
                        tick={{ fill: chartColors.axis, fontSize: 12 }}
                      />
                      <YAxis 
                        stroke={chartColors.axis}
                        tick={{ fill: chartColors.axis, fontSize: 12 }}
                        domain={[0, (dataMax: number) => Math.round(dataMax * 1.1)]}
                        tickFormatter={(value) => `${value}°C`}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: chartColors.tooltipBg, 
                          border: `1px solid ${chartColors.tooltipBorder}`,
                          borderRadius: '8px'
                        }}
                        labelStyle={{ color: chartColors.tooltipText }}
                        formatter={(value: number) => [`${value.toFixed(1)}°C`, 'Temperature']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="temperature" 
                        stroke="#f97316" 
                        fill="url(#tempGradient)"
                        strokeWidth={2}
                        connectNulls
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Power Chart */}
            <Card className="cyber-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-500" />
                  Power Usage History ({chartRangeLabel})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={statsHistory}>
                      <defs>
                        <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#eab308" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#eab308" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                      <XAxis 
                        dataKey="time" 
                        stroke={chartColors.axis}
                        tick={{ fill: chartColors.axis, fontSize: 12 }}
                      />
                      <YAxis 
                        stroke={chartColors.axis}
                        tick={{ fill: chartColors.axis, fontSize: 12 }}
                        tickFormatter={(value) => `${value}W`}
                        domain={[0, (dataMax: number) => Math.round(dataMax * 1.1)]}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: chartColors.tooltipBg, 
                          border: `1px solid ${chartColors.tooltipBorder}`,
                          borderRadius: '8px'
                        }}
                        labelStyle={{ color: chartColors.tooltipText }}
                        formatter={(value: number) => [`${value.toFixed(2)}W`, 'Power']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="power" 
                        stroke="#eab308" 
                        fill="url(#powerGradient)"
                        strokeWidth={2}
                        connectNulls
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value="logs" className="space-y-6">
            <Card className="cyber-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary" />
                    Device Logs
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <select
                      value={logFilter}
                      onChange={(e) => setLogFilter(e.target.value)}
                      className="px-3 py-1 rounded-md border border-border bg-background text-sm"
                    >
                      <option value="all">All Levels</option>
                      <option value="debug">Debug</option>
                      <option value="info">Info</option>
                      <option value="warning">Warning</option>
                      <option value="error">Error</option>
                      <option value="critical">Critical</option>
                    </select>
                    <Button variant="outline" size="sm" onClick={handleCopyLogs}>
                      <Copy className="w-4 h-4 mr-2" />
                      Copy
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDownloadLogs}>
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Clear
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Clear Logs</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to clear all logs for this device? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleClearLogs}>Clear Logs</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px] rounded-md border border-border bg-muted/20 p-4">
                  {filteredLogs.length > 0 ? (
                    <div className="space-y-2 font-mono text-sm">
                      {filteredLogs.map((log) => (
                        <div 
                          key={log.id}
                          className={cn(
                            "flex items-start gap-3 p-2 rounded hover:bg-muted/30",
                            log.logLevel === "critical" && "bg-destructive/10"
                          )}
                        >
                          {getLogLevelIcon(log.logLevel || 'info')}
                          <span className="text-muted-foreground text-xs min-w-[140px]">
                            {new Date(log.createdAt).toLocaleString()}
                          </span>
                          <Badge variant="outline" className={cn("text-xs min-w-[60px]", getLogLevelColor(log.logLevel || 'info'))}>
                            {log.logLevel}
                          </Badge>
                          <span className="text-muted-foreground text-xs min-w-[60px]">
                            [{log.source || 'system'}]
                          </span>
                          <span className={cn("flex-1", getLogLevelColor(log.logLevel || 'info'))}>
                            {log.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <div className="text-center">
                        <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
                        <p>No logs available</p>
                        <p className="text-sm">Logs will appear here when the device is active</p>
                      </div>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pool Config Tab */}
          <TabsContent value="pool" className="space-y-6">
            <Card className="cyber-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Server className="w-5 h-5 text-primary" />
                  Pool Configuration
                </CardTitle>
                <CardDescription>
                  Configure up to 3 pools. Changes are saved locally and will be used for validation and monitoring.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-6">
                  {[0, 1, 2].map((i) => {
                    const s = poolStatus[String(i + 1)];
                    const e = poolErrors[String(i + 1)];
                    return (
                      <div key={i} className="p-4 rounded-lg border border-border bg-muted/10">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium">Pool {i + 1}</div>
                          <Badge variant={s === 'valid' ? 'default' : s === 'invalid' ? 'destructive' : 'secondary'}>
                            {s ? s.toUpperCase() : 'UNKNOWN'}
                          </Badge>
                        </div>

                        <div className="mt-4 grid sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Pool URL</Label>
                            <Input
                              value={pools[i].url}
                              onChange={(e) => setPoolField(i, 'url', e.target.value)}
                              placeholder="stratum+tcp://solo.ckpool.org"
                              disabled={!isEditing}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Port</Label>
                            <Input
                              value={pools[i].port}
                              onChange={(e) => setPoolField(i, 'port', e.target.value.replace(/[^0-9]/g, ''))}
                              placeholder="3333"
                              disabled={!isEditing}
                              inputMode="numeric"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>User / Worker</Label>
                            <Input
                              value={pools[i].user}
                              onChange={(e) => setPoolField(i, 'user', e.target.value)}
                              placeholder="bc1q..."
                              disabled={!isEditing}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Password</Label>
                            <Input
                              type="password"
                              value={pools[i].pass}
                              onChange={(e) => setPoolField(i, 'pass', e.target.value)}
                              placeholder="x"
                              disabled={!isEditing}
                            />
                          </div>
                        </div>

                        {e ? <p className="mt-3 text-xs text-destructive">{e}</p> : null}

                        {/* Deep verification (Stratum + coinbase outputs) */}
                        {(() => {
                          const v = poolVerify[String(i + 1)];
                          const riskLabel = (v?.risk?.label as string | undefined) || null;
                          const yourShare = typeof v?.yourSharePct === "number" ? v.yourSharePct : null;
                          const feeFromOutputs = yourShare !== null ? Math.max(0, 100 - yourShare) : null;
                          return (
                            <div className="mt-3 flex items-center justify-between gap-2">
                              <div className="text-xs text-muted-foreground">
                                {riskLabel ? (
                                  <span className={cn(
                                    "inline-flex items-center gap-1",
                                    riskLabel === "HIGH" ? "text-destructive" : riskLabel === "MEDIUM" ? "text-amber-500" : "text-emerald-500"
                                  )}>
                                    <Shield className="w-3 h-3" />
                                    {riskLabel}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1">
                                    <Info className="w-3 h-3" />
                                    Not verified
                                  </span>
                                )}
                                {yourShare !== null ? (
                                  <span className="ml-2 tabular-nums">You {yourShare.toFixed(1)}% · Fee {feeFromOutputs?.toFixed(1)}%</span>
                                ) : null}
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2"
                                onClick={() => runDeepVerify((i + 1) as 1 | 2 | 3)}
                                disabled={verifyPool.isPending}
                              >
                                {verifyPool.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
                              </Button>
                            </div>
                          );
                        })()}
                        {(miner as any).poolLastCheckedAt ? (
                          <p className="mt-2 text-xs text-muted-foreground">Last checked: {new Date((miner as any).poolLastCheckedAt).toLocaleString()}</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end gap-2">
                  {isEditing ? (
                    <>
                      <Button variant="outline" onClick={() => setIsEditing(false)} disabled={isSaving}>
                        Cancel
                      </Button>
                      <Button onClick={handleSaveSettings} disabled={isSaving}>
                        {isSaving ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4 mr-2" />
                            Save Changes
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <Button onClick={() => setIsEditing(true)}>
                      <Settings className="w-4 h-4 mr-2" />
                      Edit Configuration
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="cyber-card">
              <CardHeader>
                <CardTitle className="text-lg">Popular Solo Mining Pools</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg border border-border bg-muted/20">
                    <p className="font-medium">Solo CKPool</p>
                    <p className="text-sm text-muted-foreground font-mono">stratum+tcp://solo.ckpool.org:3333</p>
                  </div>
                  <div className="p-4 rounded-lg border border-border bg-muted/20">
                    <p className="font-medium">Public Pool</p>
                    <p className="text-sm text-muted-foreground font-mono">stratum+tcp://public-pool.io:21496</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </BlackAxeLayout>
  );
}
