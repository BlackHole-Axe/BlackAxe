import BlackAxeLayout from "@/components/BlackAxeLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { cn, getMinerTypeColor, getMinerTypeBgColor } from "@/lib/utils";
import { 
  Cpu, 
  Thermometer, 
  Zap, 
  Activity, 
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Blocks,
  ArrowUpRight,
  RefreshCw,
  Plus
} from "lucide-react";
import { Link } from "wouter";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
} from "recharts";
import { useState, useMemo, useEffect } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useRefreshIntervalMs } from "@/hooks/useRefreshIntervalMs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Helper function to format time ago
function formatTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  
  if (diff < 60) return `${diff} seconds ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

// Format hashrate with appropriate unit
// Input: hashrate in GH/s from the API
function formatHashrate(hashrate: number): string {
  if (!hashrate || hashrate === 0) return '0';
  // hashrate is in GH/s from the API
  // 1 TH/s = 1000 GH/s
  if (hashrate >= 1000) return `${(hashrate / 1000).toFixed(2)} TH/s`;
  if (hashrate >= 1) return `${hashrate.toFixed(2)} GH/s`;
  if (hashrate >= 0.001) return `${(hashrate * 1000).toFixed(2)} MH/s`;
  return `${(hashrate * 1000000).toFixed(0)} KH/s`;
}

// Format total hashrate for dashboard (sum of all miners)
// Always shows TH/s for consistency (even if small)
function formatTotalHashrate(totalGH: number): string {
  if (!totalGH || totalGH === 0) return '0 TH/s';
  // Convert GH/s to TH/s (divide by 1000)
  // 36.43 GH/s = 0.03643 TH/s
  const th = totalGH / 1000;
  return `${th.toFixed(3)} TH/s`;
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

function StatCard({ 
  title, 
  value, 
  unit, 
  icon: Icon, 
  trend, 
  trendValue,
  color = "primary"
}: {
  title: string;
  value: string | number;
  unit?: string;
  icon: React.ElementType;
  trend?: "up" | "down";
  trendValue?: string;
  color?: "primary" | "accent" | "destructive" | "warning";
}) {
  const colorClasses = {
    primary: "text-primary bg-primary/10",
    accent: "text-accent bg-accent/10",
    destructive: "text-destructive bg-destructive/10",
    warning: "text-neon-orange bg-neon-orange/10",
  };

  return (
    <Card className="cyber-card">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs sm:text-sm text-muted-foreground mb-1 truncate">{title}</p>
            <div className="flex items-baseline gap-1">
              <span className="text-lg sm:text-2xl font-bold font-mono">{value}</span>
              {unit && <span className="text-xs sm:text-sm text-muted-foreground">{unit}</span>}
            </div>
            {trend && trendValue && (
              <div className={`flex items-center gap-1 mt-1 sm:mt-2 text-xs ${
                trend === "up" ? "text-accent" : "text-destructive"
              }`}>
                {trend === "up" ? <TrendingUp className="w-3 h-3 flex-shrink-0" /> : <TrendingDown className="w-3 h-3 flex-shrink-0" />}
                <span className="truncate hidden sm:inline">{trendValue}</span>
              </div>
            )}
          </div>
          <div className={`p-2 sm:p-3 rounded-lg flex-shrink-0 ${colorClasses[color]}`}>
            <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface MinerData {
  id: number;
  name: string;
  minerType: string;
  model: string | null;
  status: string;
  hashrate: number | null;
  temperature: number | null;
  power: number | null;
  bestDifficulty: string | null;
  ipAddress: string;
}

// Get display name for miner type
const minerTypeLabels: Record<string, string> = {
  bitaxe: "Bitaxe",
  nerdqaxe: "NerdQAxe",
  avalon: "Avalon",
  antminer: "Antminer",
  whatsminer: "Whatsminer",
  canaan: "Canaan",
  other: "Miner",
};

/** استخراج نوع الماينر من البيانات (يدعم minerType أو miner_type) */
function getMinerType(miner: MinerData | { minerType?: string; model?: string | null }): string {
  const t = (miner as any).minerType ?? (miner as any).miner_type ?? "";
  const type = typeof t === "string" && t.length > 0 ? t : "other";
  if (type !== "other") return type;
  const model = (miner as any).model;
  if (model != null && typeof model === "string") {
    const m = model.toLowerCase();
    if (m.includes("nerd") || m.includes("qaxe")) return "nerdqaxe";
    if (m.includes("bitaxe") || m.includes("ultra") || m.includes("supra") || m.includes("gamma")) return "bitaxe";
  }
  return type;
}

/** نص العرض: موديل أو اسم النوع المعرّف */
function getMinerTypeDisplay(miner: MinerData | { minerType?: string; model?: string | null }): string {
  const model = (miner as any).model;
  const type = getMinerType(miner);
  if (model != null && String(model).trim()) {
    const m = String(model).trim().toLowerCase();
    if (type === "other" && (m.includes("nerd") || m.includes("qaxe"))) return "NerdQAxe";
    if (type === "other" && (m.includes("bitaxe") || m.includes("ultra") || m.includes("supra") || m.includes("gamma"))) return "Bitaxe";
    return String(model).trim();
  }
  return minerTypeLabels[type] || type || "Miner";
}

function MinerStatusCard({ miner }: { miner: MinerData }) {
  const statusColors = {
    online: "status-badge-online",
    offline: "status-badge-offline",
    warning: "status-badge-warning",
    error: "status-badge-error",
  };

  const statusIcons = {
    online: CheckCircle2,
    offline: XCircle,
    warning: AlertTriangle,
    error: AlertTriangle,
  };

  const StatusIcon = statusIcons[miner.status as keyof typeof statusIcons] || CheckCircle2;
  
  // Get actual type for badge and color
  const actualType = getMinerType(miner);

  return (
    <Link href={`/miners/${miner.id}`}>
      <Card className="cyber-card hover:neon-glow-cyan transition-all duration-300 cursor-pointer">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <Cpu className="w-4 h-4 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm sm:text-base truncate">{miner.name}</span>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-xs font-semibold border",
                      getMinerTypeColor(actualType),
                      getMinerTypeBgColor(actualType)
                    )}
                  >
                    {getMinerTypeDisplay(miner)}
                  </Badge>
                </div>
              </div>
            </div>
            <span className={`status-badge text-xs ${statusColors[miner.status as keyof typeof statusColors]}`}>
              <StatusIcon className="w-3 h-3" />
              <span className="hidden sm:inline">{miner.status}</span>
            </span>
          </div>
          
          <div className="grid grid-cols-4 gap-2 sm:gap-3 text-xs sm:text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Hashrate</p>
              <p className="font-mono font-medium">{miner.hashrate ? formatHashrate(miner.hashrate) : '-'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Temp</p>
              <p className="font-mono font-medium">{miner.temperature ? `${miner.temperature}°C` : '-'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Power</p>
              <p className="font-mono font-medium">{formatPower(miner.power)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Best Share</p>
              <p className="font-mono font-medium text-accent">{formatBestDifficulty(miner.bestDifficulty)}</p>
            </div>
          </div>
          
          {/* IP Address */}
          <div className="mt-2 pt-2 border-t border-border/30">
            <p className="text-xs text-muted-foreground font-mono">{miner.ipAddress}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Dashboard() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const refreshMs = useRefreshIntervalMs(3000);
  const [chartRange, setChartRange] = useState<"10m" | "1h" | "6h" | "24h">("10m");
  const rangeHours = (() => {
    switch (chartRange) {
      case "10m": return 10 / 60;
      case "1h": return 1;
      case "6h": return 6;
      case "24h":
      default: return 24;
    }
  })()
  const chartRangeLabel = (() => {
    switch (chartRange) {
      case "10m": return "10m";
      case "1h": return "1h";
      case "6h": return "6h";
      case "24h":
      default: return "24h";
    }
  })();
;


  // Fetch real miners data from database
  const { data: miners, refetch: refetchMiners, isLoading: minersLoading } = trpc.miners.list.useQuery(
    undefined,
    { refetchInterval: refreshMs }
  );

  // Fetch Solo Blocks from mempool.space
  const { data: recentBlocks, refetch: refetchBlocks } = trpc.mempool.soloBlocks.useQuery(
    { limit: 5 },
    { refetchInterval: 60000 } // Refetch every minute
  );

  // Calculate stats from real miners data
  const stats = useMemo(() => {
    if (!miners || miners.length === 0) {
      return {
        totalMiners: 0,
        onlineMiners: 0,
        offlineMiners: 0,
        warningMiners: 0,
        totalHashrate: 0,
        totalPower: 0,
        avgTemperature: 0,
        totalAccepted: 0,
        totalRejected: 0,
      };
    }

    const onlineMiners = miners.filter(m => m.status === 'online').length;
    const offlineMiners = miners.filter(m => m.status === 'offline').length;
    const warningMiners = miners.filter(m => m.status === 'warning' || m.status === 'error').length;
    
    const totalHashrate = miners.reduce((sum, m) => sum + (m.hashrate || 0), 0);
    const totalPower = miners.reduce((sum, m) => sum + (m.power || 0), 0);
    
    const minersWithTemp = miners.filter(m => m.temperature && m.temperature > 0);
    const avgTemperature = minersWithTemp.length > 0 
      ? minersWithTemp.reduce((sum, m) => sum + (m.temperature || 0), 0) / minersWithTemp.length 
      : 0;
    
    const totalAccepted = miners.reduce((sum, m) => sum + (m.sharesAccepted || 0), 0);
    const totalRejected = miners.reduce((sum, m) => sum + (m.sharesRejected || 0), 0);

    return {
      totalMiners: miners.length,
      onlineMiners,
      offlineMiners,
      warningMiners,
      totalHashrate,
      totalPower,
      avgTemperature,
      totalAccepted,
      totalRejected,
    };
  }, [miners]);

  // Fetch aggregated stats history for all miners
  const { data: allStatsHistory } = trpc.dashboard.statsHistory.useQuery(
    { hours: rangeHours },
    { refetchInterval: refreshMs, enabled: (miners?.length ?? 0) > 0 }
  );

  // Generate chart data for the selected range
  const chartData = useMemo(() => {
    const now = Date.now();
    const rangeMs = rangeHours * 60 * 60 * 1000;
    const fromMs = now - rangeMs;

    // Choose an appropriate bin size
    const binMs = (() => {
      if (chartRange === "10m") return 60 * 1000;       // 1 minute
      if (chartRange === "1h") return 5 * 60 * 1000;    // 5 minutes
      if (chartRange === "6h") return 30 * 60 * 1000;   // 30 minutes
      return 60 * 60 * 1000;                            // 1 hour
    })();

    const binsCount = Math.max(2, Math.min(300, Math.ceil(rangeMs / binMs) + 1));
    const bins = Array.from({ length: binsCount }, (_, i) => fromMs + i * binMs);

    // If no miners, return empty bins
    if (!miners || miners.length === 0) {
      return bins.map((t) => ({
        time: new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        hashrate: null,
        temperature: null,
      }));
    }

    const currentHashrate = miners.reduce((sum, m) => sum + (m.hashrate || 0), 0);
    const onlineMinersWithTemp = miners.filter(m => m.status === 'online' && m.temperature && m.temperature > 0);
    const currentTemp = onlineMinersWithTemp.length > 0
      ? onlineMinersWithTemp.reduce((sum, m) => sum + (m.temperature || 0), 0) / onlineMinersWithTemp.length
      : 0;

    // For each bucket, keep only the LAST reading per miner, then sum
    const minerLastReadings: Record<string, { hashrate: number; temperature: number | null; recordedAt: number }> = {};
    
    (allStatsHistory || []).forEach((stat: any) => {
      const t = stat.recordedAt;
      if (t < fromMs || t > now) return;
      const bucketStart = fromMs + Math.floor((t - fromMs) / binMs) * binMs;
      const key = `${stat.minerId}-${bucketStart}`;
      
      // Keep only the last reading per miner per bucket (highest recordedAt)
      if (!minerLastReadings[key] || stat.recordedAt > minerLastReadings[key].recordedAt) {
        minerLastReadings[key] = {
          hashrate: stat.hashrate || 0,
          temperature: stat.temperature,
          recordedAt: stat.recordedAt
        };
      }
    });

    // Now sum hashrates per bucket (one value per miner per bucket)
    const buckets: Record<number, { hashrateSum: number; tempSum: number; tempCount: number }> = {};
    
    Object.entries(minerLastReadings).forEach(([key, data]) => {
      const bucketTime = parseInt(key.split('-')[1]);
      if (!buckets[bucketTime]) {
        buckets[bucketTime] = { hashrateSum: 0, tempSum: 0, tempCount: 0 };
      }
      
      buckets[bucketTime].hashrateSum += data.hashrate;
      if (data.temperature && data.temperature > 0) {
        buckets[bucketTime].tempSum += data.temperature;
        buckets[bucketTime].tempCount += 1;
      }
    });

    // Build chart data
    const result = bins.map((t) => {
      const b = buckets[t];
      if (!b || b.hashrateSum === 0) {
        return {
          time: new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          hashrate: null,
          temperature: null,
        };
      }

      return {
        time: new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        hashrate: Math.round(b.hashrateSum * 100) / 100,
        temperature: b.tempCount > 0 ? Math.round((b.tempSum / b.tempCount) * 10) / 10 : null,
      };
    }).filter(point => point.hashrate !== null || point.temperature !== null);

    // Add current live Total Hashrate as the last point
    if (currentHashrate > 0) {
      result.push({
        time: new Date(now).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        hashrate: Math.round(currentHashrate * 100) / 100,
        temperature: currentTemp > 0 ? Math.round(currentTemp * 10) / 10 : null,
      });
    }

    return result;
  }, [miners, allStatsHistory, rangeHours, chartRange]);


  // Theme-aware chart colors
  const chartColors = {
    grid: isDark ? 'oklch(0.25 0.03 260)' : 'oklch(0.85 0.01 260)',
    axis: isDark ? 'oklch(0.6 0.02 260)' : 'oklch(0.4 0.02 260)',
    tooltipBg: isDark ? 'oklch(0.12 0.02 260)' : 'oklch(0.98 0.01 260)',
    tooltipBorder: isDark ? 'oklch(0.25 0.03 260)' : 'oklch(0.85 0.01 260)',
    tooltipText: isDark ? 'oklch(0.95 0.01 260)' : 'oklch(0.15 0.02 260)',
  };

  // Polling mutation to refresh miner data from devices
  const refreshMiners = trpc.polling.refreshAll.useMutation({
    onSuccess: () => {
      refetchMiners();
    },
  });

  // Auto-refresh miners at the configured interval (Live Data)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isRefreshing) {
        refreshMiners.mutate();
      }
    }, refreshMs); // user-configured interval

    return () => clearInterval(interval);
  }, [isRefreshing, refreshMs]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // First refresh data from actual miner devices
      await refreshMiners.mutateAsync();
      // Then refetch blocks
      await refetchBlocks();
    } catch (error) {
      console.error('Error refreshing miners:', error);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  return (
    <BlackAxeLayout>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Dashboard</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Monitor your mining operation</p>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            className="self-start sm:self-auto"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            title="Total Hashrate"
            value={stats.totalHashrate > 0 ? formatTotalHashrate(stats.totalHashrate) : '0'}
            icon={Activity}
            color="primary"
          />
          <StatCard
            title="Active Miners"
            value={`${stats.onlineMiners}/${stats.totalMiners}`}
            icon={Cpu}
            color="accent"
          />
          <StatCard
            title="Avg Temperature"
            value={stats.avgTemperature > 0 ? stats.avgTemperature.toFixed(1) : '-'}
            unit={stats.avgTemperature > 0 ? "°C" : ""}
            icon={Thermometer}
            color={stats.avgTemperature > 70 ? "warning" : "primary"}
          />
          <StatCard
            title="Power Usage"
            value={stats.totalPower > 0 ? stats.totalPower.toFixed(2) : '-'}
            unit={stats.totalPower > 0 ? "W" : ""}
            icon={Zap}
            color="accent"
          />
        </div>

        <div className="flex items-center justify-end">
          <Select value={chartRange} onValueChange={setChartRange}>
            <SelectTrigger className="w-[180px]">
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

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          {/* Hashrate Chart */}
          <Card className="cyber-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Hashrate History ({chartRangeLabel})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48 sm:h-64">
                {stats.totalMiners === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <Activity className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p>No miners connected</p>
                      <p className="text-sm">Add miners to see hashrate history</p>
                    </div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="hashrateGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="oklch(0.75 0.18 195)" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="oklch(0.75 0.18 195)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                      <XAxis 
                        dataKey="time" 
                        stroke={chartColors.axis}
                        fontSize={10}
                        tick={{ fontSize: 10 }}
                        interval="preserveStartEnd"
                      />
                      <YAxis 
                        stroke={chartColors.axis}
                        fontSize={10}
                        tick={{ fontSize: 10 }}
                        width={50}
                        domain={[0, (dataMax: number) => Math.round(dataMax * 1.1)]}
                        tickFormatter={(value) => {
                          // value is in GH/s
                          if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)}E`;
                          if (value >= 1000000) return `${(value / 1000000).toFixed(1)}P`;
                          if (value >= 1000) return `${(value / 1000).toFixed(1)}T`;
                          return `${value.toFixed(1)}G`;
                        }}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: chartColors.tooltipBg,
                          border: `1px solid ${chartColors.tooltipBorder}`,
                          color: chartColors.tooltipText,
                          borderRadius: '8px',
                        }}
                        formatter={(value: any) => {
                          const v = Number(value);
                          // v is in GH/s
                          if (v >= 1000000000) return [`${(v / 1000000000).toFixed(2)} EH/s`, 'Hashrate'];
                          if (v >= 1000000) return [`${(v / 1000000).toFixed(2)} PH/s`, 'Hashrate'];
                          if (v >= 1000) return [`${(v / 1000).toFixed(2)} TH/s`, 'Hashrate'];
                          return [`${v.toFixed(2)} GH/s`, 'Hashrate'];
                        }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="hashrate" 
                        stroke="oklch(0.75 0.18 195)" 
                        fillOpacity={1}
                        fill="url(#hashrateGradient)"
                        strokeWidth={2}
                        connectNulls
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Temperature Chart */}
          <Card className="cyber-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Thermometer className="w-5 h-5 text-neon-orange" />
                Temperature History ({chartRangeLabel})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48 sm:h-64">
                {stats.totalMiners === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <Thermometer className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p>No miners connected</p>
                      <p className="text-sm">Add miners to see temperature history</p>
                    </div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="oklch(0.7 0.2 60)" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="oklch(0.7 0.2 60)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                      <XAxis 
                        dataKey="time" 
                        stroke={chartColors.axis}
                        fontSize={10}
                        tick={{ fontSize: 10 }}
                        interval="preserveStartEnd"
                      />
                      <YAxis 
                        stroke={chartColors.axis}
                        fontSize={10}
                        tick={{ fontSize: 10 }}
                        width={35}
                        domain={[0, (dataMax: number) => Math.round(dataMax * 1.1)]}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: chartColors.tooltipBg,
                          border: `1px solid ${chartColors.tooltipBorder}`,
                          color: chartColors.tooltipText,
                          borderRadius: '8px',
                        }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="temperature" 
                        stroke="oklch(0.7 0.2 60)" 
                        fillOpacity={1}
                        fill="url(#tempGradient)"
                        strokeWidth={2}
                        connectNulls
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
          {/* Miners Overview */}
          <div className="lg:col-span-2">
            <Card className="cyber-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-primary" />
                  Active Miners
                </CardTitle>
                <Link href="/miners">
                  <Button variant="ghost" size="sm">
                    View All
                    <ArrowUpRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {minersLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin" />
                    <p>Loading miners...</p>
                  </div>
                ) : miners && miners.length > 0 ? (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {miners.slice(0, 4).map((miner) => (
                      <MinerStatusCard key={miner.id} miner={miner} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Cpu className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium mb-2">No miners connected</p>
                    <p className="text-sm mb-4">Scan your network or add miners manually</p>
                    <div className="flex gap-2 justify-center">
                      <Link href="/scan">
                        <Button variant="outline" size="sm">
                          <Activity className="w-4 h-4 mr-2" />
                          Scan Network
                        </Button>
                      </Link>
                      <Link href="/miners">
                        <Button size="sm">
                          <Plus className="w-4 h-4 mr-2" />
                          Add Miner
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Solo Blocks */}
          <Card className="cyber-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Blocks className="w-5 h-5 text-neon-yellow" />
                Recent Solo Blocks
              </CardTitle>
              <Link href="/solo-blocks">
                <Button variant="ghost" size="sm">
                  View All
                  <ArrowUpRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentBlocks && recentBlocks.length > 0 ? (
                  recentBlocks.slice(0, 5).map((block: { height: number; poolName: string; reward: number; timestamp: number }) => (
                    <div 
                      key={block.height}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50"
                    >
                      <div>
                        <p className="font-medium text-sm">{block.poolName}</p>
                        <p className="text-xs text-muted-foreground">Block #{block.height.toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm text-accent">{block.reward.toFixed(4)} BTC</p>
                        <p className="text-xs text-muted-foreground">{formatTimeAgo(block.timestamp)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-4">
                    <Blocks className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Loading solo blocks...</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Share Statistics */}
        <Card className="cyber-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Share Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Accepted Shares</p>
                <p className="text-2xl font-bold font-mono text-accent">
                  {stats.totalAccepted > 0 ? stats.totalAccepted.toLocaleString() : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Rejected Shares</p>
                <p className="text-2xl font-bold font-mono text-destructive">
                  {stats.totalRejected > 0 ? stats.totalRejected.toLocaleString() : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Acceptance Rate</p>
                <div className="flex items-center gap-3">
                  <Progress 
                    value={stats.totalAccepted > 0 
                      ? (stats.totalAccepted / (stats.totalAccepted + stats.totalRejected)) * 100 
                      : 0
                    } 
                    className="flex-1" 
                  />
                  <span className="text-lg font-mono font-medium">
                    {stats.totalAccepted > 0 
                      ? ((stats.totalAccepted / (stats.totalAccepted + stats.totalRejected)) * 100).toFixed(2)
                      : '-'
                    }%
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </BlackAxeLayout>
  );
}
