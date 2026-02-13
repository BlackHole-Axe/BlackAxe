import BlackAxeLayout from "@/components/BlackAxeLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { 
  Blocks, 
  ExternalLink, 
  RefreshCw,
  Trophy,
  Clock,
  Hash,
  Coins,
  Star,
  Loader2,
  Cpu,
  Zap
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

// Helper function to format time ago
function formatTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  
  if (diff < 60) return `${diff} seconds ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} days ago`;
  return `${Math.floor(diff / 2592000)} months ago`;
}

// Format difficulty to human readable
function formatDifficulty(difficulty: number): string {
  if (difficulty >= 1e12) return `${(difficulty / 1e12).toFixed(2)}T`;
  if (difficulty >= 1e9) return `${(difficulty / 1e9).toFixed(2)}G`;
  if (difficulty >= 1e6) return `${(difficulty / 1e6).toFixed(2)}M`;
  return difficulty.toFixed(2);
}

// Solo Pool colors - all known solo mining pools
const soloPoolColors: Record<string, string> = {
  // CKPool Solo
  "Solo CK": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "solo.ckpool": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "ckpool": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  // Public Pool
  "public-pool": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "Public Pool": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  // Generic Solo
  "Solo Miner": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "default": "bg-primary/20 text-primary border-primary/30",
};

interface SoloBlockData {
  height: number;
  hash: string;
  timestamp: number;
  size: number;
  weight: number;
  txCount: number;
  difficulty: number;
  nonce: number;
  reward: number;
  poolName: string;
  poolSlug: string;
  isSolo?: boolean;
  minerName?: string; // If found by your miner
}

function SoloBlockCard({ block, isYourBlock = false }: { block: SoloBlockData; isYourBlock?: boolean }) {
  const poolColor = soloPoolColors[block.poolName] || soloPoolColors["default"];
  
  return (
    <Card className={cn(
      "cyber-card hover:neon-glow-cyan transition-all duration-300",
      isYourBlock && "ring-2 ring-accent neon-glow-green"
    )}>
      <CardContent className="p-4">
        {/* Your Block Badge */}
        {isYourBlock && (
          <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-accent/10 border border-accent/30">
            <Trophy className="w-4 h-4 text-accent" />
            <span className="text-sm font-bold text-accent">Your Miner Found This Block!</span>
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              isYourBlock ? "bg-accent/20" : "bg-yellow-500/10"
            )}>
              <Trophy className={cn(
                "w-5 h-5",
                isYourBlock ? "text-accent" : "text-yellow-500"
              )} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold font-mono">#{block.height.toLocaleString()}</span>
                <Star className="w-4 h-4 text-yellow-500" />
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTimeAgo(block.timestamp)}
              </p>
            </div>
          </div>
          <Badge className={cn("border", poolColor)}>
            {block.poolName}
          </Badge>
        </div>

        {/* If your miner found it, show miner details */}
        {isYourBlock && block.minerName && (
          <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-card/50">
            <Cpu className="w-4 h-4 text-primary" />
            <span className="text-sm">Found by: <span className="font-bold text-primary">{block.minerName}</span></span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Coins className="w-3 h-3" />
              Reward
            </p>
            <p className="font-mono font-bold text-accent">{block.reward.toFixed(4)} BTC</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Hash className="w-3 h-3" />
              Difficulty
            </p>
            <p className="font-mono">{formatDifficulty(block.difficulty)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <p className="text-xs text-muted-foreground">Transactions</p>
            <p className="font-mono">{block.txCount?.toLocaleString() || "N/A"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Size</p>
            <p className="font-mono">{block.size ? `${(block.size / 1000000).toFixed(2)} MB` : "N/A"}</p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-border/50">
          <p className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
            {block.hash?.substring(0, 20) || "Loading..."}...
          </p>
          <Button variant="ghost" size="sm" asChild>
            <a href={`https://mempool.space/block/${block.hash}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SoloBlocks() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch Solo Blocks only from mempool.space
  const { data: blocks, refetch, isLoading } = trpc.mempool.soloBlocks.useQuery(
    { limit: 20 },
    { refetchInterval: 30000 } // Refetch every 30 seconds
  );

  // Fetch blockchain stats
  const { data: stats } = trpc.mempool.stats.useQuery(undefined, {
    refetchInterval: 60000
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  // Mock: Check if any block was found by your miners (you can implement real logic later)
  const yourMinerAddresses: string[] = []; // Add your miner addresses here

  return (
    <BlackAxeLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Trophy className="w-7 h-7 text-yellow-500" />
              Solo Blocks
            </h1>
            <p className="text-muted-foreground">Recent blocks found by solo miners (ckpool, public-pool)</p>
          </div>
          <Button 
            variant="outline" 
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", (isRefreshing || isLoading) && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="cyber-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/10">
                  <Trophy className="w-5 h-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">My Solo Blocks</p>
                  <p className="font-mono font-bold text-lg text-yellow-500">
                    0
                  </p>
                  <p className="text-[10px] text-muted-foreground">Your discovered blocks</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="cyber-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Blocks className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Current Height</p>
                  <p className="font-mono font-bold text-lg">
                    {stats?.currentHeight?.toLocaleString() || "Loading..."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="cyber-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/10">
                  <Hash className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Network Hashrate</p>
                  <p className="font-mono font-bold text-lg">
                    {stats?.currentHashrate 
                      ? `${(stats.currentHashrate / 1e18).toFixed(2)} EH/s`
                      : "Loading..."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="cyber-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-secondary/10">
                  <Zap className="w-5 h-5 text-secondary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Network Solo Blocks</p>
                  <p className="font-mono font-bold text-lg">
                    {blocks?.length || 0}
                  </p>
                  <p className="text-[10px] text-muted-foreground">From all solo pools</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Info Banner */}
        <Card className="cyber-card border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Star className="w-5 h-5 text-yellow-500 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-500">Solo Mining Blocks</p>
                <p className="text-sm text-muted-foreground">
                  These blocks were found by individual solo miners using pools like solo.ckpool.org and public-pool.io. 
                  Solo mining means the miner receives the entire block reward (~3.125 BTC) when they find a block.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Blocks Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : blocks && blocks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {blocks.map((block) => (
              <SoloBlockCard 
                key={block.height} 
                block={block}
                isYourBlock={false} // Implement real check later
              />
            ))}
          </div>
        ) : (
          <Card className="cyber-card">
            <CardContent className="p-8 text-center">
              <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No Solo Blocks Found</h3>
              <p className="text-muted-foreground">
                Solo blocks are rare! Check back later or try refreshing.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Your Blocks Section - Placeholder for when you find a block */}
        <Card className="cyber-card border-accent/30">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-accent/10">
                <Cpu className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h3 className="font-bold">Your Block Discoveries</h3>
                <p className="text-sm text-muted-foreground">Blocks found by your miners will appear here</p>
              </div>
            </div>
            <div className="text-center py-8 border border-dashed border-border/50 rounded-lg">
              <Trophy className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No blocks found by your miners yet</p>
              <p className="text-xs text-muted-foreground mt-1">Keep mining! Your lucky block could be next.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </BlackAxeLayout>
  );
}
