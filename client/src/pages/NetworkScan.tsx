import BlackAxeLayout from "@/components/BlackAxeLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { 
  Radar, 
  Wifi, 
  Cpu, 
  Plus, 
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Network,
  Loader2,
  Info
} from "lucide-react";
import { useState } from "react";
import { cn, getMinerTypeColor, getMinerTypeBgColor } from "@/lib/utils";
import { toast } from "sonner";

interface DiscoveredDevice {
  ip: string;
  hostname?: string;
  isMiner: boolean;
  minerType?: string;
  model?: string;
  status?: string;
  hashrate?: number;
  apiPort?: number;
  alreadyAdded?: boolean;
}

const minerTypeLabels: Record<string, string> = {
  bitaxe: "Bitaxe",
  nerdqaxe: "NerdQaxe",
  avalon: "Avalon",
  antminer: "Antminer",
  whatsminer: "Whatsminer",
  canaan: "Canaan",
};

export default function NetworkScan() {
  const [subnet, setSubnet] = useState("192.168.1.0/24");
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanComplete, setScanComplete] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());

  // Get existing miners to check which are already added
  const { data: existingMiners } = trpc.miners.list.useQuery();
  
  // Create a map of IP to miner name for display
  const ipToMinerMap = new Map(
    (existingMiners || []).map(m => [m.ipAddress, m.name])
  );

  const createMiner = trpc.miners.create.useMutation({
    onSuccess: () => {
      toast.success("Miner added successfully");
    },
    onError: (error) => {
      toast.error(`Failed to add miner: ${error.message}`);
    },
  });

  const networkScan = trpc.network.scan.useMutation();

  const handleStartScan = async () => {
    setIsScanning(true);
    setScanProgress(0);
    setScanComplete(false);
    setDiscoveredDevices([]);
    setSelectedDevices(new Set());

    try {
      // Start progress animation
      const progressInterval = setInterval(() => {
        setScanProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 500);

      // Call actual network scan API
      const result = await networkScan.mutateAsync({ subnet });
      
      clearInterval(progressInterval);
      setScanProgress(100);

      if (result.success && result.devices) {
        // Mark devices that are already added
        const existingIps = new Set(existingMiners?.map(m => m.ipAddress) || []);
        const devicesWithStatus = result.devices.map(device => ({
          ...device,
          alreadyAdded: existingIps.has(device.ip),
        }));
        setDiscoveredDevices(devicesWithStatus);
        
        const minerCount = devicesWithStatus.filter(d => d.isMiner).length;
        toast.success(`Scan complete! Found ${minerCount} mining device${minerCount !== 1 ? 's' : ''}.`);
      } else {
        toast.info("Scan complete. No devices found on this subnet.");
      }
    } catch (error) {
      toast.error("Network scan failed. Make sure you're connected to the network.");
    } finally {
      setIsScanning(false);
      setScanComplete(true);
    }
  };

  const handleToggleDevice = (ip: string) => {
    const newSelected = new Set(selectedDevices);
    if (newSelected.has(ip)) {
      newSelected.delete(ip);
    } else {
      newSelected.add(ip);
    }
    setSelectedDevices(newSelected);
  };

  const handleSelectAllMiners = () => {
    const minerIps = discoveredDevices
      .filter(d => d.isMiner && !d.alreadyAdded)
      .map(d => d.ip);
    setSelectedDevices(new Set(minerIps));
  };

  const handleAddSelected = async () => {
    if (selectedDevices.size === 0) {
      toast.error("Please select at least one device to add");
      return;
    }

    const devicesToAdd = discoveredDevices.filter(d => selectedDevices.has(d.ip) && d.isMiner);
    
    let successCount = 0;
    for (const device of devicesToAdd) {
      try {
        await createMiner.mutateAsync({
          name: device.hostname || `Miner-${device.ip.split('.').pop()}`,
          minerType: (device.minerType as any) || "other",
          ipAddress: device.ip,
          model: device.model,
          apiPort: device.apiPort,
        });
        successCount++;
      } catch (error) {
        console.error(`Failed to add ${device.ip}:`, error);
      }
    }

    if (successCount > 0) {
      toast.success(`Added ${successCount} device${successCount !== 1 ? 's' : ''} to your miners`);
      
      // Mark devices as added
      setDiscoveredDevices(prev => prev.map(d => 
        selectedDevices.has(d.ip) ? { ...d, alreadyAdded: true } : d
      ));
    }
    setSelectedDevices(new Set());
  };

  const miners = discoveredDevices.filter(d => d.isMiner);
  const nonMiners = discoveredDevices.filter(d => !d.isMiner);

  return (
    <BlackAxeLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Network Scan</h1>
          <p className="text-muted-foreground">Discover mining devices on your local network</p>
        </div>

        {/* Info Card */}
        <Card className="cyber-card border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium mb-1">How Network Scan Works</p>
                <p className="text-muted-foreground">
                  BlackAxe will scan your local network for mining devices. For best results, 
                  make sure your mining devices are powered on and connected to the same network.
                  Supported devices: Bitaxe, NerdQaxe, Avalon Nano, Antminer, and other CGMiner-compatible devices.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Scan Configuration */}
        <Card className="cyber-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Network className="w-5 h-5 text-primary" />
              Scan Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Network Subnet</Label>
                <Input
                  value={subnet}
                  onChange={(e) => setSubnet(e.target.value)}
                  placeholder="192.168.1.0/24"
                  disabled={isScanning}
                />
                <p className="text-xs text-muted-foreground">
                  Enter your local network subnet (e.g., 192.168.1.0/24)
                </p>
              </div>
              <div className="flex items-end">
                <Button 
                  onClick={handleStartScan} 
                  disabled={isScanning}
                  className="w-full sm:w-auto"
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Radar className="w-4 h-4 mr-2" />
                      Start Scan
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Scan Progress */}
            {(isScanning || scanComplete) && (
              <div className="space-y-2 pt-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {isScanning ? "Scanning network..." : "Scan complete"}
                  </span>
                  <span className="font-mono">{scanProgress}%</span>
                </div>
                <Progress value={scanProgress} className="h-2" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Discovered Devices */}
        {scanComplete && (
          <>
            {miners.length > 0 ? (
              <Card className="cyber-card">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Cpu className="w-5 h-5 text-accent" />
                      Mining Devices Found ({miners.length})
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={handleSelectAllMiners}
                        disabled={miners.filter(m => !m.alreadyAdded).length === 0}
                      >
                        Select All New
                      </Button>
                      <Button 
                        size="sm"
                        onClick={handleAddSelected}
                        disabled={selectedDevices.size === 0}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Selected ({selectedDevices.size})
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {miners.map((device) => (
                      <div
                        key={device.ip}
                        className={cn(
                          "flex items-center gap-4 p-4 rounded-lg border transition-all",
                          device.alreadyAdded 
                            ? "bg-muted/20 border-border/50 opacity-60" 
                            : selectedDevices.has(device.ip)
                              ? "bg-primary/10 border-primary/50"
                              : "bg-card border-border hover:border-primary/30"
                        )}
                      >
                        {!device.alreadyAdded && (
                          <Checkbox
                            checked={selectedDevices.has(device.ip)}
                            onCheckedChange={() => handleToggleDevice(device.ip)}
                          />
                        )}
                        
                        <div className={cn(
                          "w-3 h-3 rounded-full",
                          device.status === "online" ? "bg-status-online pulse-online" : "bg-status-offline"
                        )} />
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">
                              {device.alreadyAdded && ipToMinerMap.has(device.ip)
                                ? ipToMinerMap.get(device.ip)
                                : (device.hostname || device.ip)}
                            </span>
                            {device.model && (
                              <Badge 
                                variant="outline" 
                                className={cn(
                                  "text-xs font-semibold border",
                                  device.minerType ? getMinerTypeColor(device.minerType) : "",
                                  device.minerType ? getMinerTypeBgColor(device.minerType) : ""
                                )}
                              >
                                {device.model}
                              </Badge>
                            )}
                            {device.alreadyAdded && (
                              <Badge className="bg-accent/20 text-accent text-xs">
                                Already Added
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                            <span>{device.ip}</span>
                          </div>
                        </div>
                        
                        {device.hashrate !== undefined && device.hashrate > 0 && (
                          <div className="text-right">
                            <p className="font-mono font-medium text-accent">
                              {device.hashrate >= 1 
                                ? `${device.hashrate.toFixed(2)} GH/s`
                                : `${(device.hashrate * 1000).toFixed(0)} MH/s`
                              }
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="cyber-card">
                <CardContent className="py-12 text-center">
                  <Cpu className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
                  <h3 className="text-lg font-medium mb-2">No Mining Devices Found</h3>
                  <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                    Make sure your mining devices are powered on and connected to the same network. 
                    You can also try a different subnet or add miners manually.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Other Devices */}
            {nonMiners.length > 0 && (
              <Card className="cyber-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Wifi className="w-5 h-5 text-muted-foreground" />
                    Other Network Devices ({nonMiners.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {nonMiners.map((device) => (
                      <div
                        key={device.ip}
                        className="flex items-center gap-4 p-3 rounded-lg bg-muted/20 border border-border/30"
                      >
                        <XCircle className="w-4 h-4 text-muted-foreground" />
                        <div className="flex-1">
                          <span className="text-sm">{device.hostname || 'Unknown Device'}</span>
                          <span className="text-xs text-muted-foreground ml-2">{device.ip}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">Not a Miner</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Empty State - Before Scan */}
        {!scanComplete && !isScanning && (
          <Card className="cyber-card">
            <CardContent className="py-12 text-center">
              <Radar className="w-16 h-16 mx-auto mb-4 text-primary opacity-50" />
              <h3 className="text-lg font-medium mb-2">Ready to Scan</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Click "Start Scan" to discover mining devices on your network. 
                BlackAxe will automatically detect Bitaxe, NerdQaxe, Avalon, and other compatible miners.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </BlackAxeLayout>
  );
}
