import React from "react";
import BlackAxeLayout from "@/components/BlackAxeLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, HelpCircle, Server, ShieldAlert, Loader2, ShieldCheck } from "lucide-react";

type PoolProfile = { payoutAddress?: string; feePercent?: number };

type PayoutSplit = { address: string; pct: number };

function extractPayoutAddress(user: string | null | undefined): string | null {
  if (!user) return null;
  const t = user.trim();
  if (!t) return null;
  // Many pools use: <address>.<worker>
  const base = t.split(".")[0];
  // Very lightweight BTC address detection (bech32 bc1... or base58 1/3...)
  if (/^bc1[0-9ac-hj-np-z]{11,71}$/i.test(base) || /^[13][a-km-zA-HJ-NP-Z1-9]{25,39}$/.test(base)) {
    return base;
  }
  return null;
}

function parsePayoutSplits(user: string | null | undefined): PayoutSplit[] {
  if (!user) return [];
  const t = user.trim();
  if (!t) return [];

  // Common patterns:
  // 1) <addr>.<worker>
  // 2) <addr>:<pct> or <addr>=<pct> (pct may include %)
  // 3) <addr1>:<pct1>+<addr2>:<pct2> ...
  const base = t.split(".")[0];

  // Split on common delimiters for multiple outputs
  const parts = base.split(/[+;,]/g).map((x) => x.trim()).filter(Boolean);
  const splits: PayoutSplit[] = [];

  for (const p of parts) {
    const m = p.match(/^(bc1[0-9ac-hj-np-z]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,39})\s*[:=]\s*(\d{1,3}(?:\.\d+)?)%?$/i);
    if (m) {
      const address = m[1];
      const pct = Number(m[2]);
      if (Number.isFinite(pct) && pct > 0) splits.push({ address, pct });
      continue;
    }

    // If it's a bare address, treat as 100%
    if (/^bc1[0-9ac-hj-np-z]{11,71}$/i.test(p) || /^[13][a-km-zA-HJ-NP-Z1-9]{25,39}$/.test(p)) {
      splits.push({ address: p, pct: 100 });
    }
  }

  // If we found multiple entries and they don't sum to ~100, normalize when possible.
  if (splits.length > 1) {
    const sum = splits.reduce((a, s) => a + s.pct, 0);
    if (sum > 0 && Math.abs(sum - 100) > 0.01) {
      return splits.map((s) => ({ ...s, pct: (s.pct / sum) * 100 }));
    }
  }

  return splits;
}

// Note: fee and payout split are pool-specific. We derive a best-effort estimate from known pools and
// from the configured username format when possible.
function normalizePoolDisplay(url: string | null | undefined, port: number | null | undefined): string {
  if (!url) return "—";
  const cleaned = url
    .replace(/^stratum\+tcp:\/\//i, "")
    .replace(/^stratum\+ssl:\/\//i, "")
    .replace(/^stratum:\/\//i, "")
    .replace(/^tcp:\/\//i, "")
    .replace(/^ssl:\/\//i, "")
    .trim();
  const hostPort = cleaned.split("/")[0] || cleaned;
  const hasInlinePort = /:\d{2,5}$/.test(hostPort);
  if (hasInlinePort) return hostPort;
  if (port && port > 0) return `${hostPort}:${port}`;
  return hostPort;
}

function guessPoolFeePct(hostPort: string): number | null {
  const h = hostPort.toLowerCase();
  // Best-effort defaults for common solo pools
  if (h.includes("public-pool.io") || h.includes("publicpool")) return 0;
  // Public Pool's commonly advertised port
  if (h.endsWith(":21496")) return 0;
  if (h.includes("solo.ckpool") || h.includes("ckpool")) return 2;
  if (h.includes("ocean.xyz") || h.includes("ocean")) return 2;
  return null;
}

function poolProfileKeyFromDisplay(hostPort: string): string {
  const hp = (hostPort || "").trim();
  if (!hp || hp === "—") return "";
  // IPv6 [::1]:3333
  if (hp.startsWith("[")) {
    const end = hp.indexOf("]");
    if (end > 0) return hp.slice(1, end);
  }
  return hp.split(":")[0];
}

function hostKeyFromHostPort(hostPort: string): string {
  const hp = hostPort.trim();
  if (hp.startsWith("[")) {
    const end = hp.indexOf("]");
    return end > 0 ? hp.slice(1, end) : hp;
  }
  return hp.split(":")[0];
}

function statusBadge(status?: string) {
  const s = (status || "unknown").toLowerCase();
  if (s === "valid") {
    return (
      <Badge className="gap-1">
        <CheckCircle2 className="w-3 h-3" />
        VALID
      </Badge>
    );
  }
  if (s === "internal") {
    return (
      <Badge variant="secondary" className="gap-1">
        <ShieldAlert className="w-3 h-3" />
        INTERNAL
      </Badge>
    );
  }
  if (s === "invalid") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="w-3 h-3" />
        INVALID
      </Badge>
    );
  }
  if (s === "internal") {
    return (
      <Badge variant="secondary" className="gap-1">
        <AlertTriangle className="w-3 h-3" />
        INTERNAL
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <HelpCircle className="w-3 h-3" />
      UNKNOWN
    </Badge>
  );
}

export default function PoolsAudit() {
  const { data: miners, isLoading } = trpc.miners.list.useQuery();
  const utils = trpc.useUtils();
  const verifyPool = trpc.miners.verifyPool.useMutation({
    onSuccess: () => utils.miners.list.invalidate(),
  });
  const { data: userSettings } = trpc.settings.get.useQuery();
  const { data: tipBlocks } = trpc.mempool.recentBlocks.useQuery({ limit: 1 }, { refetchInterval: 30_000 });
  const tip = tipBlocks?.[0];

  const poolProfiles: Record<string, PoolProfile> = (() => {
    try {
      return JSON.parse(userSettings?.poolProfilesJson || "{}");
    } catch {
      return {};
    }
  })();

  const [verifyOpen, setVerifyOpen] = React.useState(false);
  const [verifyTitle, setVerifyTitle] = React.useState<string>("");
  const [verifyData, setVerifyData] = React.useState<any>(null);



  const runDeepVerify = async (minerId: number, poolIndex: 1 | 2 | 3, label: string) => {
    setVerifyTitle(label);
    setVerifyOpen(true);
    setVerifyData(null);
    try {
      const res = await verifyPool.mutateAsync({ minerId, poolIndex });
      setVerifyData(res);
    } catch (e: any) {
      setVerifyData({ ok: false, error: e?.message || "Verification failed" });
    }
  };

  return (
    <BlackAxeLayout>
      <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Pools Audit</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Pool endpoints and payout configuration (best-effort). Fee and payout splits are inferred from common patterns and known pool defaults.
            </p>
          </div>
          <div className="text-left sm:text-right text-xs sm:text-sm">
            <div className="text-muted-foreground">Tip</div>
            <div className="font-mono">
              {tip ? `#${tip.height}  ${tip.hash.slice(0, 8)}…` : "—"}
            </div>
          </div>
        </div>

        <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
          <DialogContent className="sm:max-w-[820px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base sm:text-lg">Deep Verify — {verifyTitle}</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Card>
                    <CardHeader className="py-3 px-3">
                      <CardTitle className="text-xs sm:text-sm">Risk</CardTitle>
                      <CardDescription className="text-xs sm:text-sm">{verifyData.risk?.label} ({verifyData.risk?.score}/100)</CardDescription>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="py-3 px-3">
                      <CardTitle className="text-xs sm:text-sm">Your Share</CardTitle>
                      <CardDescription className="tabular-nums text-xs sm:text-sm">
                        {typeof verifyData.yourSharePct === "number" ? `${verifyData.yourSharePct.toFixed(2)}%` : "—"}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="py-3 px-3">
                      <CardTitle className="text-xs sm:text-sm">Coinbase Fee (est.)</CardTitle>
                      <CardDescription className="tabular-nums text-xs sm:text-sm">
                        {typeof verifyData.yourSharePct === "number" ? `${Math.max(0, 100 - verifyData.yourSharePct).toFixed(2)}%` : "—"}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </div>

                {verifyData.summary ? (
                  <div className="text-xs sm:text-sm text-muted-foreground">{verifyData.summary}</div>
                ) : null}

                <div className="rounded-md border border-border overflow-x-auto">
                  <Table className="min-w-full">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Check</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Detail</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(verifyData.checks || []).map((c: any) => (
                        <TableRow key={c.name}>
                          <TableCell className="font-medium text-xs">{c.name}</TableCell>
                          <TableCell>
                            <Badge variant={c.status === "PASS" ? "default" : c.status === "FAIL" ? "destructive" : "secondary"} className="text-xs">
                              {c.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">{c.detail}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {Array.isArray(verifyData.outputs) && verifyData.outputs.length ? (
                  <div className="rounded-md border border-border overflow-x-auto">
                    <Table className="min-w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">#</TableHead>
                          <TableHead className="text-xs">Recipient</TableHead>
                          <TableHead className="text-right text-xs">Share</TableHead>
                          <TableHead className="text-right text-xs">Sats</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {verifyData.outputs.slice(0, 10).map((o: any, idx: number) => (
                          <TableRow key={`${o?.n ?? 'x'}-${o?.recipient ?? 'r'}-${idx}`}>
                            <TableCell className="text-xs">{o.n}</TableCell>
                            <TableCell className="font-mono text-[10px] sm:text-xs break-all">{o.recipient}</TableCell>
                            <TableCell className="text-right tabular-nums text-xs">
                              {Number.isFinite(Number(o?.sharePct)) ? `${Number(o.sharePct).toFixed(2)}%` : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs">
                              {Number.isFinite(Number(o?.sats)) ? Number(o.sats).toLocaleString() : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-xs sm:text-sm text-destructive">{verifyData.error || "Verification failed"}</div>
            )}

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setVerifyOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>



        <Card className="cyber-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5 text-primary" />
              Pools
            </CardTitle>
            <CardDescription>
              Pool validation runs on the server (hourly) and produces alerts for changes or failures.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden lg:block rounded-md border border-border overflow-x-auto">
                  <Table className="min-w-[1100px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Miner</TableHead>
                        <TableHead>IP</TableHead>
                        <TableHead>Pool 1</TableHead>
                        <TableHead>Pool 2</TableHead>
                        <TableHead>Pool 3</TableHead>
                        <TableHead>Payout</TableHead>
                        <TableHead>Fee</TableHead>
                        <TableHead>Est. Net</TableHead>
                        <TableHead>Last Check</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                    {(miners || []).map((m: any) => {
                      const ps: Record<string, string> = (() => {
                        try { return JSON.parse(m.poolStatus || "{}"); } catch { return {}; }
                      })();
                      const pe: Record<string, string> = (() => {
                        try { return JSON.parse(m.poolError || "{}"); } catch { return {}; }
                      })();
                      const pv: Record<string, any> = (() => {
                        try { return JSON.parse(m.poolVerify || "{}"); } catch { return {}; }
                      })();
                      const rawSplits = [
                        ...parsePayoutSplits(m.poolUser),
                        ...parsePayoutSplits(m.poolUser2),
                        ...parsePayoutSplits(m.poolUser3),
                      ];

                      const pool1Disp = normalizePoolDisplay(m.poolUrl, m.poolPort);
                      const pool2Disp = normalizePoolDisplay(m.poolUrl2, m.poolPort2);
                      const pool3Disp = normalizePoolDisplay(m.poolUrl3, m.poolPort3);

                      const profileKey = poolProfileKeyFromDisplay(pool1Disp);
                      const profile = profileKey ? poolProfiles[profileKey] : undefined;

                      const splits = rawSplits.length
                        ? rawSplits
                        : profile?.payoutAddress
                          ? [{ address: profile.payoutAddress, pct: 100 }]
                          : [];

                      const payoutRisk = (() => {
                        if (!splits.length) return "missing";
                        const uniq = new Set(splits.map((s) => s.address));
                        if (uniq.size > 1) return "multiple";
                        // If explicit pct and not 100, flag
                        if (splits.length === 1 && Math.abs(splits[0].pct - 100) > 0.01) return "split";
                        return null;
                      })();

                      const feeGuess = guessPoolFeePct(pool1Disp);
                      const feePct = profile?.feePercent !== undefined ? profile.feePercent : feeGuess;
                      const netGuess = feePct === null || feePct === undefined ? null : Math.max(0, 100 - feePct);

                      const poolCell = (idx: 1 | 2 | 3) => {
                        const url = idx === 1 ? m.poolUrl : idx === 2 ? m.poolUrl2 : m.poolUrl3;
                        const port = idx === 1 ? m.poolPort : idx === 2 ? m.poolPort2 : m.poolPort3;
                        const user = idx === 1 ? m.poolUser : idx === 2 ? m.poolUser2 : m.poolUser3;
                        const pass = idx === 1 ? m.poolPassword : idx === 2 ? m.poolPassword2 : m.poolPassword3;
                        const status = ps[String(idx)];
                        const err = pe[String(idx)];
                        const v = pv[String(idx)];
                        const riskLabel = (v?.risk?.label as string | undefined) || null;
                        const yourShare = typeof v?.yourSharePct === "number" ? v.yourSharePct : null;
                        const feeFromOutputs = yourShare !== null ? Math.max(0, 100 - yourShare) : null;
                        return (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              {statusBadge(status)}
                              <span className="font-mono text-xs text-muted-foreground">
                                {normalizePoolDisplay(url, port)}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 gap-1 text-[11px] text-muted-foreground">
                              <div className="truncate"><span className="font-medium">User:</span> <span className="font-mono">{user || "—"}</span></div>
                              <div className="truncate"><span className="font-medium">Pass:</span> <span className="font-mono">{pass ? "••••••" : "—"}</span></div>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs text-muted-foreground">
                                {riskLabel ? (
                                  <span className={cn(
                                    "inline-flex items-center gap-1",
                                    riskLabel === "HIGH" ? "text-destructive" : riskLabel === "MEDIUM" ? "text-amber-500" : "text-emerald-500"
                                  )}>
                                    <ShieldCheck className="w-3 h-3" />
                                    {riskLabel}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1">
                                    <HelpCircle className="w-3 h-3" />
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
                                onClick={() => runDeepVerify(m.id, idx, `${m.name} · Pool ${idx}`)}
                                disabled={verifyPool.isPending}
                              >
                                {verifyPool.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
                              </Button>
                            </div>
                            {err ? (
                              <div className={cn("text-xs", status === "internal" ? "text-muted-foreground" : "text-destructive")}>
                                {err}
                              </div>
                            ) : null}
                          </div>
                        );
                      };

                      return (
                        <TableRow key={m.id}>
                          <TableCell className="font-medium">{m.name}</TableCell>
                          <TableCell className="font-mono text-xs">{m.ipAddress}</TableCell>
                          <TableCell>{poolCell(1)}</TableCell>
                          <TableCell>{poolCell(2)}</TableCell>
                          <TableCell>{poolCell(3)}</TableCell>
                          <TableCell className="text-xs">
                            {splits.length ? (
                              <div className="space-y-1">
                                {payoutRisk ? (
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    <ShieldAlert className={cn("w-4 h-4", payoutRisk === "missing" ? "text-destructive" : "text-amber-500")} />
                                    <span>
                                      {payoutRisk === "missing"
                                        ? "No payout address detected"
                                        : payoutRisk === "multiple"
                                          ? "Multiple payout addresses detected"
                                          : "Payout split detected"}
                                    </span>
                                  </div>
                                ) : null}
                                {profile?.payoutAddress && rawSplits.length === 0 ? (
                                  <div className="text-muted-foreground">Override: {profileKey}</div>
                                ) : null}
                                {splits.slice(0, 3).map((s: any) => (
                                  <div key={`${s.address}-${s.pct}`} className="flex items-center justify-between gap-3">
                                    <span className="font-mono truncate max-w-[220px]">{s.address}</span>
                                    <span className="tabular-nums text-muted-foreground">{s.pct.toFixed(0)}%</span>
                                  </div>
                                ))}
                                {splits.length > 3 ? <div className="text-muted-foreground">+{splits.length - 3} more</div> : null}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">
                                Unknown (username-based pools may not include a BTC payout address)
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            <span className="tabular-nums">
                              {feePct === null || feePct === undefined ? "—" : `${Number(feePct).toFixed(1)}%`}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">
                            <span className="tabular-nums">{netGuess === null ? "—" : `${netGuess.toFixed(1)}% to miner`}</span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {m.poolLastCheckedAt ? new Date(m.poolLastCheckedAt).toLocaleString() : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Card View */}
                <div className="lg:hidden space-y-3">
                  {(miners || []).map((m: any) => {
                    const ps: Record<string, string> = (() => {
                      try { return JSON.parse(m.poolStatus || "{}"); } catch { return {}; }
                    })();
                    const pe: Record<string, string> = (() => {
                      try { return JSON.parse(m.poolError || "{}"); } catch { return {}; }
                    })();
                    const pv: Record<string, any> = (() => {
                      try { return JSON.parse(m.poolVerify || "{}"); } catch { return {}; }
                    })();
                    const rawSplits = [
                      ...parsePayoutSplits(m.poolUser),
                      ...parsePayoutSplits(m.poolUser2),
                      ...parsePayoutSplits(m.poolUser3),
                    ];

                    const pool1Disp = normalizePoolDisplay(m.poolUrl, m.poolPort);
                    const pool2Disp = normalizePoolDisplay(m.poolUrl2, m.poolPort2);
                    const pool3Disp = normalizePoolDisplay(m.poolUrl3, m.poolPort3);

                    const profileKey = poolProfileKeyFromDisplay(pool1Disp);
                    const profile = profileKey ? poolProfiles[profileKey] : undefined;

                    const splits = rawSplits.length
                      ? rawSplits
                      : profile?.payoutAddress
                        ? [{ address: profile.payoutAddress, pct: 100 }]
                        : [];

                    const payoutRisk = (() => {
                      if (!splits.length) return "missing";
                      const uniq = new Set(splits.map((s) => s.address));
                      if (uniq.size > 1) return "multiple";
                      if (splits.length === 1 && Math.abs(splits[0].pct - 100) > 0.01) return "split";
                      return null;
                    })();

                    const feeGuess = guessPoolFeePct(pool1Disp);
                    const feePct = profile?.feePercent !== undefined ? profile.feePercent : feeGuess;
                    const netGuess = feePct === null || feePct === undefined ? null : Math.max(0, 100 - feePct);

                    const poolCell = (idx: 1 | 2 | 3) => {
                      const url = idx === 1 ? m.poolUrl : idx === 2 ? m.poolUrl2 : m.poolUrl3;
                      const port = idx === 1 ? m.poolPort : idx === 2 ? m.poolPort2 : m.poolPort3;
                      const user = idx === 1 ? m.poolUser : idx === 2 ? m.poolUser2 : m.poolUser3;
                      const pass = idx === 1 ? m.poolPassword : idx === 2 ? m.poolPassword2 : m.poolPassword3;
                      const status = ps[String(idx)];
                      const err = pe[String(idx)];
                      const v = pv[String(idx)];
                      const riskLabel = (v?.risk?.label as string | undefined) || null;
                      const yourShare = typeof v?.yourSharePct === "number" ? v.yourSharePct : null;
                      const feeFromOutputs = yourShare !== null ? Math.max(0, 100 - yourShare) : null;
                      return (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {statusBadge(status)}
                            <span className="font-mono text-xs text-muted-foreground break-all">
                              {normalizePoolDisplay(url, port)}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 gap-1 text-[11px] text-muted-foreground">
                            <div className="truncate"><span className="font-medium">User:</span> <span className="font-mono">{user || "—"}</span></div>
                            <div className="truncate"><span className="font-medium">Pass:</span> <span className="font-mono">{pass ? "••••••" : "—"}</span></div>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-muted-foreground">
                              {riskLabel ? (
                                <span className={cn(
                                  "inline-flex items-center gap-1",
                                  riskLabel === "HIGH" ? "text-destructive" : riskLabel === "MEDIUM" ? "text-amber-500" : "text-emerald-500"
                                )}>
                                  <ShieldCheck className="w-3 h-3" />
                                  {riskLabel}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1">
                                  <HelpCircle className="w-3 h-3" />
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
                              className="h-7 px-2 text-xs"
                              onClick={() => runDeepVerify(m.id, idx, `${m.name} · Pool ${idx}`)}
                              disabled={verifyPool.isPending}
                            >
                              {verifyPool.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Verify"}
                            </Button>
                          </div>
                          {err ? (
                            <div className={cn("text-xs", status === "internal" ? "text-muted-foreground" : "text-destructive")}>
                              {err}
                            </div>
                          ) : null}
                        </div>
                      );
                    };

                    return (
                      <Card key={m.id} className="p-3 sm:p-4">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate">{m.name}</div>
                              <div className="font-mono text-xs text-muted-foreground">{m.ipAddress}</div>
                            </div>
                          </div>
                          
                          <div className="space-y-3">
                            <div>
                              <div className="font-medium text-xs text-muted-foreground mb-2">Pool 1</div>
                              {poolCell(1)}
                            </div>
                            {(m.poolUrl2 || m.poolUser2) && (
                              <div>
                                <div className="font-medium text-xs text-muted-foreground mb-2">Pool 2</div>
                                {poolCell(2)}
                              </div>
                            )}
                            {(m.poolUrl3 || m.poolUser3) && (
                              <div>
                                <div className="font-medium text-xs text-muted-foreground mb-2">Pool 3</div>
                                {poolCell(3)}
                              </div>
                            )}
                          </div>

                          <div className="pt-2 border-t border-border/50 space-y-2">
                            <div>
                              <div className="text-xs font-medium text-muted-foreground mb-1">Payout</div>
                              {splits.length ? (
                                <div className="space-y-1">
                                  {payoutRisk ? (
                                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                                      <ShieldAlert className={cn("w-3 h-3", payoutRisk === "missing" ? "text-destructive" : "text-amber-500")} />
                                      <span>
                                        {payoutRisk === "missing"
                                          ? "No payout address detected"
                                          : payoutRisk === "multiple"
                                            ? "Multiple payout addresses"
                                            : "Payout split detected"}
                                      </span>
                                    </div>
                                  ) : null}
                                  {splits.slice(0, 2).map((s: any) => (
                                    <div key={`${s.address}-${s.pct}`} className="flex items-center justify-between gap-2 text-xs">
                                      <span className="font-mono truncate">{s.address}</span>
                                      <span className="tabular-nums text-muted-foreground">{s.pct.toFixed(0)}%</span>
                                    </div>
                                  ))}
                                  {splits.length > 2 ? <div className="text-xs text-muted-foreground">+{splits.length - 2} more</div> : null}
                                </div>
                              ) : (
                                <div className="text-xs text-muted-foreground">Unknown</div>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <div className="text-xs font-medium text-muted-foreground">Fee</div>
                                <div className="text-sm tabular-nums">
                                  {feePct === null || feePct === undefined ? "—" : `${Number(feePct).toFixed(1)}%`}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs font-medium text-muted-foreground">Est. Net</div>
                                <div className="text-sm tabular-nums">
                                  {netGuess === null ? "—" : `${netGuess.toFixed(1)}%`}
                                </div>
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Last: {m.poolLastCheckedAt ? new Date(m.poolLastCheckedAt).toLocaleString() : "—"}
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </BlackAxeLayout>
  );
}
