import BlackAxeLayout from "@/components/BlackAxeLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { cn, getMinerTypeColor, getMinerTypeBgColor } from "@/lib/utils";
import { useRefreshIntervalMs } from "@/hooks/useRefreshIntervalMs";
import { 
  Cpu, 
  Search, 
  Filter, 
  Plus, 
  MoreVertical,
  Thermometer,
  Zap,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Settings,
  Trash2,
  Power,
  RefreshCw,
  Grid,
  List,
  Radar
} from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo, useEffect } from "react";

const minerTypeLabels: Record<string, string> = {
  bitaxe: "Bitaxe",
  nerdqaxe: "NerdQAxe",
  avalon: "Avalon",
  antminer: "Antminer",
  whatsminer: "Whatsminer",
  canaan: "Canaan",
  other: "Miner",
};

interface MinerData {
  id: number;
  name: string;
  minerType: string;
  model: string | null;
  status: string;
  hashrate: number | null;
  temperature: number | null;
  power: number | null;
  fanSpeed: number | null;
  sharesAccepted: number | null;
  sharesRejected: number | null;
  poolUrl: string | null;
  ipAddress: string;
  bestDifficulty: string | null;
  uptimeSeconds: number | null;
}

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

/** نص العرض: موديل أو اسم النوع المعرّف (Bitaxe / NerdQAxe من الموديل إن كان النوع other) */
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

const statusConfig = {
  online: { 
    color: "status-badge-online", 
    icon: CheckCircle2, 
    label: "Online",
    pulse: "pulse-online"
  },
  offline: { 
    color: "status-badge-offline", 
    icon: XCircle, 
    label: "Offline",
    pulse: ""
  },
  warning: { 
    color: "status-badge-warning", 
    icon: AlertTriangle, 
    label: "Warning",
    pulse: "pulse-warning"
  },
  error: { 
    color: "status-badge-error", 
    icon: AlertTriangle, 
    label: "Error",
    pulse: "pulse-error"
  },
};

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

function MinerCard({ miner, viewMode, onDelete }: { miner: MinerData; viewMode: "grid" | "list"; onDelete: (id: number) => void }) {
  const status = statusConfig[miner.status as keyof typeof statusConfig] || statusConfig.offline;
  const StatusIcon = status.icon;

  if (viewMode === "list") {
    return (
      <Link href={`/miners/${miner.id}`}>
        <Card className="cyber-card hover:neon-glow-cyan transition-all duration-300 cursor-pointer">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              {/* Status Indicator */}
              <div className={cn("w-3 h-3 rounded-full", status.pulse, 
                miner.status === "online" ? "bg-status-online" :
                miner.status === "warning" ? "bg-status-warning" :
                miner.status === "error" ? "bg-status-error" : "bg-status-offline"
              )} />
              
              {/* Name & Type */}
              <div className="min-w-[180px] flex items-center gap-2 flex-wrap">
                <p className="font-medium">{miner.name}</p>
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-xs font-semibold border",
                    getMinerTypeColor(getMinerType(miner)),
                    getMinerTypeBgColor(getMinerType(miner))
                  )}
                >
                  {getMinerTypeDisplay(miner)}
                </Badge>
              </div>

              {/* Metrics */}
              <div className="flex-1 grid grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Hashrate</p>
                  <p className="font-mono font-medium">{formatHashrate(miner.hashrate)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Temp</p>
                  <p className={cn("font-mono font-medium", 
                    miner.temperature && miner.temperature > 70 ? "text-status-warning" : 
                    miner.temperature && miner.temperature > 80 ? "text-status-error" : ""
                  )}>{miner.temperature ? `${miner.temperature}°C` : '-'}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Power</p>
                  <p className="font-mono font-medium">{formatPower(miner.power)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Best Share</p>
                  <p className="font-mono font-medium text-accent">{formatBestDifficulty(miner.bestDifficulty)}</p>
                </div>
              </div>

              {/* Actions */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/miners/${miner.id}`}>
                      <Settings className="w-4 h-4 mr-2" />
                      Configure
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    className="text-destructive"
                    onClick={(e) => {
                      e.preventDefault();
                      onDelete(miner.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardContent>
        </Card>
      </Link>
    );
  }

  return (
    <Link href={`/miners/${miner.id}`}>
      <Card className="cyber-card hover:neon-glow-cyan transition-all duration-300 cursor-pointer h-full">
        <CardContent className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className={cn("w-3 h-3 rounded-full", status.pulse,
                miner.status === "online" ? "bg-status-online" :
                miner.status === "warning" ? "bg-status-warning" :
                miner.status === "error" ? "bg-status-error" : "bg-status-offline"
              )} />
              <p className="font-medium">{miner.name}</p>
              <Badge 
                variant="outline" 
                className={cn(
                  "text-xs font-semibold border",
                  getMinerTypeColor(getMinerType(miner)),
                  getMinerTypeBgColor(getMinerType(miner))
                )}
              >
                {getMinerTypeDisplay(miner)}
              </Badge>
            </div>
          </div>

          {/* Hashrate Display */}
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-1">Hashrate</p>
            <p className="hashrate-display">{formatHashrate(miner.hashrate)}</p>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Thermometer className={cn("w-4 h-4",
                miner.temperature && miner.temperature > 70 ? "text-status-warning" : 
                miner.temperature && miner.temperature > 80 ? "text-status-error" : "text-muted-foreground"
              )} />
              <span className="text-sm font-mono">{miner.temperature ? `${miner.temperature}°C` : '-'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-mono">{formatPower(miner.power)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-mono">
                {miner.sharesAccepted ? `${miner.sharesAccepted} shares` : '-'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Best:</span>
              <span className="text-sm font-mono text-accent">{formatBestDifficulty(miner.bestDifficulty)}</span>
            </div>
          </div>

          {/* Uptime */}
          <div className="flex items-center justify-between text-xs mb-3">
            <span className="text-muted-foreground">Uptime:</span>
            <span className="font-mono text-cyan-400">{formatUptime(miner.uptimeSeconds)}</span>
          </div>

          {/* IP Address */}
          <div className="pt-3 border-t border-border/50">
            <p className="text-xs text-muted-foreground font-mono">
              {miner.ipAddress}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Miners() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const refreshMs = useRefreshIntervalMs(3000);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [minerToDelete, setMinerToDelete] = useState<number | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newMiner, setNewMiner] = useState({
    name: "",
    minerType: "bitaxe",
    ipAddress: "",
    model: "",
  });

  // Fetch real miners from database
  const { data: miners, isLoading, refetch } = trpc.miners.list.useQuery(
    undefined,
    { refetchInterval: refreshMs }
  );

  const deleteMiner = trpc.miners.delete.useMutation({
    onSuccess: () => {
      refetch();
      setDeleteDialogOpen(false);
      setMinerToDelete(null);
    },
  });

  const createMiner = trpc.miners.create.useMutation({
    onSuccess: async () => {
      await refetch();
      // Auto-refresh to get data from the new miner
      setTimeout(() => {
        refreshMiners.mutate();
      }, 500);
      setAddDialogOpen(false);
      setNewMiner({ name: "", minerType: "bitaxe", ipAddress: "", model: "" });
    },
  });

  // Polling mutation to refresh miner data
  const refreshMiners = trpc.polling.refreshAll.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auto-refresh miners every 10 seconds (Live Data)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isRefreshing) {
        refreshMiners.mutate();
      }
    }, refreshMs); // user-configured interval

    return () => clearInterval(interval);
  }, [isRefreshing, refreshMs]);

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    try {
      await refreshMiners.mutateAsync();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filter miners
  const filteredMiners = useMemo(() => {
    if (!miners) return [];
    
    return miners.filter((miner) => {
      const matchesSearch = miner.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           miner.ipAddress.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || miner.status === statusFilter;
      const matchesType = typeFilter === "all" || getMinerType(miner) === typeFilter;
      
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [miners, searchQuery, statusFilter, typeFilter]);

  const handleDeleteClick = (id: number) => {
    setMinerToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (minerToDelete) {
      deleteMiner.mutate({ id: minerToDelete });
    }
  };

  const handleAddMiner = () => {
    if (newMiner.name && newMiner.ipAddress) {
      createMiner.mutate({
        name: newMiner.name,
        minerType: newMiner.minerType as any,
        ipAddress: newMiner.ipAddress,
        model: newMiner.model || undefined,
      });
    }
  };

  return (
    <BlackAxeLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Miners</h1>
            <p className="text-muted-foreground">Manage your mining devices</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={handleRefreshAll}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", isRefreshing && "animate-spin")} />
              {isRefreshing ? "Refreshing..." : "Refresh All"}
            </Button>
            <Link href="/scan">
              <Button variant="outline">
                <Radar className="w-4 h-4 mr-2" />
                Scan Network
              </Button>
            </Link>
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Miner
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search miners..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="bitaxe">Bitaxe</SelectItem>
                <SelectItem value="nerdqaxe">NerdQaxe</SelectItem>
                <SelectItem value="avalon">Avalon</SelectItem>
                <SelectItem value="antminer">Antminer</SelectItem>
                <SelectItem value="whatsminer">Whatsminer</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex border rounded-md">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setViewMode("grid")}
              >
                <Grid className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setViewMode("list")}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Miners List */}
        {isLoading ? (
          <div className="text-center py-12">
            <RefreshCw className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading miners...</p>
          </div>
        ) : filteredMiners.length > 0 ? (
          <div className={cn(
            viewMode === "grid" 
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              : "space-y-3"
          )}>
            {filteredMiners.map((miner) => (
              <MinerCard 
                key={miner.id} 
                miner={miner} 
                viewMode={viewMode}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
        ) : (
          <Card className="cyber-card">
            <CardContent className="py-12 text-center">
              <Cpu className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
              <h3 className="text-lg font-medium mb-2">No miners found</h3>
              <p className="text-muted-foreground mb-4">
                {miners && miners.length === 0 
                  ? "Get started by scanning your network or adding a miner manually"
                  : "No miners match your current filters"
                }
              </p>
              {miners && miners.length === 0 && (
                <div className="flex gap-2 justify-center">
                  <Link href="/scan">
                    <Button variant="outline">
                      <Radar className="w-4 h-4 mr-2" />
                      Scan Network
                    </Button>
                  </Link>
                  <Button onClick={() => setAddDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Miner
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Miner</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this miner? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDelete} disabled={deleteMiner.isPending}>
                {deleteMiner.isPending ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Miner Dialog */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Miner</DialogTitle>
              <DialogDescription>
                Enter the details of your mining device
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Bitaxe-001"
                  value={newMiner.name}
                  onChange={(e) => setNewMiner({ ...newMiner, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ip">IP Address</Label>
                <Input
                  id="ip"
                  placeholder="e.g., 192.168.1.100"
                  value={newMiner.ipAddress}
                  onChange={(e) => setNewMiner({ ...newMiner, ipAddress: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Miner Type</Label>
                <Select 
                  value={newMiner.minerType} 
                  onValueChange={(value) => setNewMiner({ ...newMiner, minerType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bitaxe">Bitaxe</SelectItem>
                    <SelectItem value="nerdqaxe">NerdQaxe</SelectItem>
                    <SelectItem value="avalon">Avalon</SelectItem>
                    <SelectItem value="antminer">Antminer</SelectItem>
                    <SelectItem value="whatsminer">Whatsminer</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Model (Optional)</Label>
                <Input
                  id="model"
                  placeholder="e.g., Gamma 601"
                  value={newMiner.model}
                  onChange={(e) => setNewMiner({ ...newMiner, model: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleAddMiner} 
                disabled={!newMiner.name || !newMiner.ipAddress || createMiner.isPending}
              >
                {createMiner.isPending ? "Adding..." : "Add Miner"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </BlackAxeLayout>
  );
}
